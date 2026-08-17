import { z } from "zod";
import { and, count, desc, eq, gte, isNotNull, isNull, like, lte, ne, sql } from "drizzle-orm";
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
import { arabicSourceFilter } from "./services/enImport";
import {
  getSetting,
  SETTING_UI_HIDE_COMMUNITIES,
  SETTING_UI_HIDE_REELS,
  SETTING_COMMUNITY_GROUP_URL,
} from "./lib/siteSettings";
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
    // استبعاد مصادر EN من التصفح العربي — تظهر في /en فقط
    conditions.push(arabicSourceFilter());
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
      /** fallback: آخر صفحات مخزنة في القاعدة إن وُجدت (القارئ لا يموت مع المصدر) */
      const stored = Array.isArray(row.chapter.cachedPages)
        ? row.chapter.cachedPages.filter(
            (u): u is string => typeof u === "string" && !!u,
          )
        : [];
      const fromCache = () => {
        pagesCache.set(input.chapterId, { pages: stored, at: Date.now() });
        return { pages: stored, cached: true as const };
      };

      const scraper = getScraper(row.source.name);
      if (!scraper || !scraper.enabled) {
        if (stored.length) return fromCache();
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `المصدر ${row.source.name} غير متاح حالياً`,
        });
      }
      let pages: string[];
      try {
        pages = await scraper.getPages(row.chapter.url);
      } catch (e) {
        // circuit breaker / 429 / أي خطأ — ارجع بالنسخة المخزنة إن سبق جلب الفصل
        if (stored.length) {
          console.warn(
            `[manga] getPages لايف فشل للفصل ${input.chapterId}: ${(e as Error).message} — استخدام النسخة المخزنة`,
          );
          return fromCache();
        }
        console.error(
          `[manga] getPages فشل للفصل ${input.chapterId} (${row.source.name} ${row.chapter.url}):`,
          (e as Error).stack || e,
        );
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `تعذّر جلب صفحات هذا الفصل من المصدر (${(e as Error).message})`,
        });
      }
      if (!pages.length) {
        if (stored.length) return fromCache();
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "تعذّر جلب صفحات هذا الفصل من المصدر",
        });
      }
      pagesCache.set(input.chapterId, { pages, at: Date.now() });
      // خزّن الصفحات في القاعدة عند كل جلب ناجح (تُحدَّث تلقائياً عند إعادة الجلب)
      await db
        .update(chapters)
        .set({
          cachedPages: pages,
          pagesCachedAt: new Date(),
          ...(pages.length !== row.chapter.pageCount
            ? { pageCount: pages.length }
            : {}),
        })
        .where(eq(chapters.id, input.chapterId));
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
        .where(arabicSourceFilter())
        .orderBy(
          desc(sql`COALESCE(${chapters.publishedAt}, ${chapters.createdAt})`),
          desc(chapters.id),
        )
        .limit(input.limit);
      return rows.map((r) => ({
        ...r.chapter,
        manga: { ...r.manga, source: r.source },
      }));
    }),

  /**
   * آخر الفصول مجمّعة لكل مانجا — بطاقة واحدة لكل مانجا مع أحدث 4 فصول لها.
   * يجلب ~80 فصلاً حديثاً ثم يجمّعها في JS مع الحفاظ على الترتيب الزمني.
   */
  latestGrouped: publicQuery
    .input(
      z.object({ limit: z.number().int().min(1).max(20).default(8) }).optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 8;
      const rows = await getDb()
        .select({ chapter: chapters, manga: manga, source: sources })
        .from(chapters)
        .innerJoin(manga, eq(chapters.mangaId, manga.id))
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(arabicSourceFilter())
        .orderBy(
          desc(sql`COALESCE(${chapters.publishedAt}, ${chapters.createdAt})`),
          desc(chapters.id),
        )
        .limit(80);

      const grouped = new Map<
        number,
        {
          manga: typeof manga.$inferSelect & { source: typeof sources.$inferSelect };
          chapters: (typeof chapters.$inferSelect)[];
        }
      >();
      for (const r of rows) {
        let g = grouped.get(r.manga.id);
        if (!g) {
          g = { manga: { ...r.manga, source: r.source }, chapters: [] };
          grouped.set(r.manga.id, g);
        }
        if (g.chapters.length < 4) g.chapters.push(r.chapter);
      }
      return [...grouped.values()].slice(0, limit);
    }),

  popular: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      const rows = await getDb()
        .select({ manga: manga, source: sources })
        .from(manga)
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(arabicSourceFilter())
        .orderBy(
          desc(manga.isTrending),
          desc(manga.viewCount),
          desc(manga.chapterCount),
          desc(manga.id),
        )
        .limit(input.limit);
      return rows.map((r) => ({ ...r.manga, source: r.source }));
    }),

  /** المانجا المثبّتة من الأدمن (featuredAt) — سلايدر الواجهة يعرضها أولاً */
  featured: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(20).default(10) }))
    .query(async ({ input }) => {
      const rows = await getDb()
        .select({ manga: manga, source: sources })
        .from(manga)
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(and(isNotNull(manga.featuredAt), isNull(manga.hiddenAt), arabicSourceFilter()))
        .orderBy(desc(manga.featuredAt))
        .limit(input.limit);
      return rows.map((r) => ({ ...r.manga, source: r.source }));
    }),

  /** مفاتيح إظهار/إخفاء أقسام الواجهة — عامة (بلا حساسية) حتى تخفي الواجهة الروابط */
  uiToggles: publicQuery.query(async () => {
    const [hideCommunities, hideReels, communityGroupUrl] = await Promise.all([
      getSetting(SETTING_UI_HIDE_COMMUNITIES, "0"),
      getSetting(SETTING_UI_HIDE_REELS, "0"),
      getSetting(SETTING_COMMUNITY_GROUP_URL, ""),
    ]);
    return {
      hideCommunities: hideCommunities === "1",
      hideReels: hideReels === "1",
      communityGroupUrl: communityGroupUrl ?? "",
    };
  }),

  /** الأكثر مشاهدة — ترتيب viewCount تنازلياً، حقول البطاقات الأساسية */
  mostViewed: publicQuery
    .input(
      z.object({ limit: z.number().int().min(1).max(50).default(10) }),
    )
    .query(async ({ input }) => {
      const rows = await getDb()
        .select({
          id: manga.id,
          slug: manga.slug,
          title: manga.title,
          coverUrl: manga.coverUrl,
          type: manga.type,
          status: manga.status,
          genres: manga.genres,
          rating: manga.rating,
          viewCount: manga.viewCount,
          siteViewCount: manga.siteViewCount,
          chapterCount: manga.chapterCount,
          source: { id: sources.id, name: sources.name },
        })
        .from(manga)
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(arabicSourceFilter())
        .orderBy(desc(manga.siteViewCount), desc(manga.id))
        .limit(input.limit);
      return rows;
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
