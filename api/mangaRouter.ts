import { z } from "zod";
import { and, count, desc, eq, gte, like, lte, ne, sql } from "drizzle-orm";
import {
  chapters,
  favorites,
  follows,
  manga,
  readingProgress,
  sources,
} from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery } from "./middleware";
import { getScraper } from "./scrapers";
import { TRPCError } from "@trpc/server";

/** كاش صفحات الفصول في الذاكرة — روابط بعض المصادر موقّعة وتنتهي (TTL 20 دقيقة) */
const PAGES_TTL_MS = 20 * 60 * 1000;
const pagesCache = new Map<number, { pages: string[]; at: number }>();

const listInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(20),
  search: z.string().trim().min(1).optional(),
  genre: z.string().trim().min(1).optional(),
  status: z.enum(["ongoing", "completed"]).optional(),
  minChapters: z.number().int().min(0).optional(),
  maxChapters: z.number().int().min(0).optional(),
  sort: z.enum(["popular", "latest", "rating"]).default("popular"),
});

export const mangaRouter = createRouter({
  list: publicQuery.input(listInput).query(async ({ input }) => {
    const db = getDb();
    const conditions = [];
    if (input.search) {
      conditions.push(like(manga.title, `%${input.search}%`));
    }
    if (input.genre) {
      conditions.push(
        sql`JSON_CONTAINS(${manga.genres}, JSON_QUOTE(${input.genre}))`,
      );
    }
    if (input.status) {
      conditions.push(eq(manga.status, input.status));
    }
    if (input.minChapters !== undefined) {
      conditions.push(gte(manga.chapterCount, input.minChapters));
    }
    if (input.maxChapters !== undefined) {
      conditions.push(lte(manga.chapterCount, input.maxChapters));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const orderBy =
      input.sort === "latest"
        ? [desc(manga.updatedAt), desc(manga.id)]
        : input.sort === "rating"
          ? [desc(manga.rating), desc(manga.ratingCount), desc(manga.id)]
          : [desc(manga.viewCount), desc(manga.chapterCount), desc(manga.id)];

    const [items, [{ total }]] = await Promise.all([
      db
        .select()
        .from(manga)
        .where(where)
        .orderBy(...orderBy)
        .limit(input.limit)
        .offset((input.page - 1) * input.limit),
      db.select({ total: count() }).from(manga).where(where),
    ]);

    return {
      items,
      total,
      page: input.page,
      limit: input.limit,
      totalPages: Math.ceil(total / input.limit),
    };
  }),

  getBySlug: publicQuery
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db
        .select({ manga: manga, source: sources })
        .from(manga)
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(eq(manga.slug, input.slug))
        .limit(1);
      if (!row) return null;

      const chapterRows = await db
        .select()
        .from(chapters)
        .where(eq(chapters.mangaId, row.manga.id))
        .orderBy(desc(chapters.number));

      let userState: {
        isFavorite: boolean;
        isFollowing: boolean;
        progress: (typeof readingProgress.$inferSelect & {
          chapter: typeof chapters.$inferSelect | null;
        }) | null;
      } = { isFavorite: false, isFollowing: false, progress: null };

      if (ctx.user) {
        const userId = ctx.user.id;
        const mangaId = row.manga.id;
        const [fav, fol, [prog]] = await Promise.all([
          db.query.favorites.findFirst({
            where: and(eq(favorites.userId, userId), eq(favorites.mangaId, mangaId)),
          }),
          db.query.follows.findFirst({
            where: and(eq(follows.userId, userId), eq(follows.mangaId, mangaId)),
          }),
          db
            .select({ progress: readingProgress, chapter: chapters })
            .from(readingProgress)
            .leftJoin(chapters, eq(readingProgress.chapterId, chapters.id))
            .where(
              and(
                eq(readingProgress.userId, userId),
                eq(readingProgress.mangaId, mangaId),
              ),
            )
            .limit(1),
        ]);
        userState = {
          isFavorite: !!fav,
          isFollowing: !!fol,
          progress: prog ? { ...prog.progress, chapter: prog.chapter } : null,
        };
      }

      return { ...row.manga, source: row.source, chapters: chapterRows, userState };
    }),

  /** صفحات فصل حقيقية من المصدر (روابط خام — الواجهة تمررها عبر /api/img) */
  getChapterPages: publicQuery
    .input(z.object({ chapterId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const cached = pagesCache.get(input.chapterId);
      if (cached && Date.now() - cached.at < PAGES_TTL_MS) {
        return { pages: cached.pages };
      }

      const db = getDb();
      const [row] = await db
        .select({ chapter: chapters, manga: manga, source: sources })
        .from(chapters)
        .innerJoin(manga, eq(chapters.mangaId, manga.id))
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(eq(chapters.id, input.chapterId))
        .limit(1);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الفصل غير موجود" });
      }
      if (!row.chapter.url) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "لا يوجد رابط مصدر لهذا الفصل",
        });
      }
      const scraper = getScraper(row.source.name);
      if (!scraper || !scraper.enabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `المصدر ${row.source.name} غير متاح حالياً`,
        });
      }
      const pages = await scraper.getPages(row.chapter.url);
      if (!pages.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "تعذّر جلب صفحات هذا الفصل من المصدر",
        });
      }
      pagesCache.set(input.chapterId, { pages, at: Date.now() });
      if (pages.length !== row.chapter.pageCount) {
        await db
          .update(chapters)
          .set({ pageCount: pages.length })
          .where(eq(chapters.id, input.chapterId));
      }
      return { pages };
    }),

  latest: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      const rows = await getDb()
        .select({ chapter: chapters, manga: manga, source: sources })
        .from(chapters)
        .innerJoin(manga, eq(chapters.mangaId, manga.id))
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .orderBy(desc(chapters.publishedAt), desc(chapters.createdAt))
        .limit(input.limit);
      return rows.map((r) => ({
        ...r.chapter,
        manga: { ...r.manga, source: r.source },
      }));
    }),

  popular: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      const rows = await getDb()
        .select({ manga: manga, source: sources })
        .from(manga)
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .orderBy(
          desc(manga.isTrending),
          desc(manga.viewCount),
          desc(manga.chapterCount),
          desc(manga.id),
        )
        .limit(input.limit);
      return rows.map((r) => ({ ...r.manga, source: r.source }));
    }),

  /** إحصاءات عامة حقيقية من قاعدة البيانات لشريط الأرقام في الرئيسية */
  publicStats: publicQuery.query(async () => {
    const db = getDb();
    const [[m], [c], [s]] = await Promise.all([
      db.select({ total: count() }).from(manga),
      db.select({ total: count() }).from(chapters),
      db.select({ total: count() }).from(sources),
    ]);
    return {
      mangaCount: m.total,
      chapterCount: c.total,
      sourceCount: s.total,
    };
  }),

  /** قائمة المصادر العامة (للفلاتر وشريط المصادر) */
  sources: publicQuery.query(() =>
    getDb()
      .select({
        id: sources.id,
        name: sources.name,
        baseUrl: sources.baseUrl,
        status: sources.status,
        mangaCount: sources.mangaCount,
      })
      .from(sources)
      .orderBy(desc(sources.mangaCount)),
  ),

  similar: publicQuery
    .input(
      z.object({
        slug: z.string().min(1),
        limit: z.number().int().min(1).max(20).default(6),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const base = await db.query.manga.findFirst({
        where: eq(manga.slug, input.slug),
      });
      if (!base) return [];

      const baseGenres = new Set(base.genres ?? []);
      const candidates = await getDb()
        .select({ manga: manga, source: sources })
        .from(manga)
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(and(ne(manga.id, base.id), eq(manga.type, base.type)))
        .orderBy(desc(manga.viewCount))
        .limit(60);

      return candidates
        .map((c) => ({
          manga: { ...c.manga, source: c.source },
          overlap: (c.manga.genres ?? []).filter((g) => baseGenres.has(g))
            .length,
        }))
        .sort((a, b) => b.overlap - a.overlap)
        .slice(0, input.limit)
        .map((x) => x.manga);
    }),
});
