import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, notInArray, or, sql } from "drizzle-orm";
import {
  chapters,
  favorites,
  follows,
  manga,
  readingProgress,
  sources,
} from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { arabicSourceFilter } from "./services/enImport";
import { getSetting, SETTING_HOME_GEMS_IDS, SETTING_HOME_TOP_IDS } from "./lib/siteSettings";

/** شكل بطاقة المانجا الموحد (مطابق manga.mostViewed) */
const cardSelect = {
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
};

/** طابع الفصل الزمني الموحد — publishedAt وإلا createdAt */
const chapterTs = sql`COALESCE(${chapters.publishedAt}, ${chapters.createdAt})`;

type CalendarItem = {
  mangaId: number;
  slug: string;
  title: string;
  coverUrl: string | null;
  chapterId: number;
  number: number;
  publishedAt: Date;
  sourceName: string;
};

function toCalendarItem(r: {
  chapter: typeof chapters.$inferSelect;
  manga: typeof manga.$inferSelect;
  source: typeof sources.$inferSelect;
}): CalendarItem {
  return {
    mangaId: Number(r.manga.id),
    slug: r.manga.slug,
    title: r.manga.title,
    coverUrl: r.manga.coverUrl,
    chapterId: Number(r.chapter.id),
    number: r.chapter.number,
    publishedAt: r.chapter.publishedAt ?? r.chapter.createdAt,
    sourceName: r.source.name,
  };
}

/** كل المانجا المرتبطة بالمستخدم: مفضلة + متابَعة + سجل قراءة */
async function userMangaIds(
  db: ReturnType<typeof getDb>,
  userId: number,
): Promise<number[]> {
  const [favIds, folIds, progIds] = await Promise.all([
    db
      .select({ mangaId: favorites.mangaId })
      .from(favorites)
      .where(eq(favorites.userId, userId)),
    db.select({ mangaId: follows.mangaId }).from(follows).where(eq(follows.userId, userId)),
    db
      .select({ mangaId: readingProgress.mangaId })
      .from(readingProgress)
      .where(eq(readingProgress.userId, userId)),
  ]);
  return [...new Set([...favIds, ...folIds, ...progIds].map((r) => Number(r.mangaId)))];
}

/** قائمة منسّقة من الأدمن (بترتيبها) أو null إن لم تُضبط */
async function curatedSection(key: string, limit: number) {
  const raw = await getSetting(key, "");
  if (!raw) return null;
  let ids: number[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) ids = parsed.filter((n) => Number.isInteger(n));
  } catch {
    return null;
  }
  ids = ids.slice(0, limit);
  if (!ids.length) return null;
  const rows = await getDb()
    .select(cardSelect)
    .from(manga)
    .innerJoin(sources, eq(manga.sourceId, sources.id))
    // استبعاد أي معرّف من مصدر إنجليزي تسرّب للقائمة العربية
    .where(and(inArray(manga.id, ids), arabicSourceFilter()));
  const byId = new Map(rows.map((r) => [r.id, r]));
  // حافظ على ترتيب الأدمن
  return ids.map((id) => byId.get(id)).filter((r): r is (typeof rows)[number] => !!r);
}

export const recommendRouter = createRouter({
  /** ترشيحات "لك" — أعلى 3 تصنيفات من مفضلة المستخدم وسجل قراءته */
  forYou: authedQuery
    .input(z.object({ limit: z.number().int().min(1).max(24).default(12) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);

      const [favRows, progRows] = await Promise.all([
        db
          .select({ mangaId: favorites.mangaId, genres: manga.genres })
          .from(favorites)
          .innerJoin(manga, eq(favorites.mangaId, manga.id))
          .where(eq(favorites.userId, userId))
          .limit(100),
        db
          .select({ mangaId: readingProgress.mangaId, genres: manga.genres })
          .from(readingProgress)
          .innerJoin(manga, eq(readingProgress.mangaId, manga.id))
          .where(eq(readingProgress.userId, userId))
          .limit(100),
      ]);

      const owned = new Set<number>();
      const genreCount = new Map<string, number>();
      for (const r of [...favRows, ...progRows]) {
        owned.add(Number(r.mangaId));
        for (const g of r.genres ?? []) {
          genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
        }
      }
      const topGenres = [...genreCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([g]) => g);

      if (!topGenres.length) {
        // بلا سجل قراءة — الأشهر العام كنقطة بداية
        const items = await db
          .select(cardSelect)
          .from(manga)
          .innerJoin(sources, eq(manga.sourceId, sources.id))
          .where(arabicSourceFilter())
          .orderBy(desc(manga.isTrending), desc(manga.viewCount), desc(manga.id))
          .limit(input.limit);
        return { items, fallback: true as const };
      }

      const genreCond = or(
        ...topGenres.map(
          (g) => sql`JSON_CONTAINS(${manga.genres}, JSON_QUOTE(${g}))`,
        ),
      )!;
      const conditions = [genreCond, arabicSourceFilter()];
      if (owned.size) {
        conditions.push(notInArray(manga.id, [...owned]));
      }

      const items = await db
        .select(cardSelect)
        .from(manga)
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(and(...conditions))
        .orderBy(
          desc(manga.rating),
          desc(manga.ratingCount),
          desc(manga.viewCount),
          desc(manga.id),
        )
        .limit(input.limit);
      return { items, fallback: false as const };
    }),

  /** تقويم الإصدارات — فصول آخر N يوم مجمّعة باليوم (UTC) */
  calendar: publicQuery
    .input(
      z
        .object({
          days: z.number().int().min(1).max(14).default(7),
          libraryOnly: z.boolean().default(false),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const dayCount = input?.days ?? 7;
      const since = new Date(Date.now() - dayCount * 24 * 60 * 60 * 1000);

      const conditions = [gte(chapterTs, since), arabicSourceFilter()];
      const userId = ctx.user ? Number(ctx.user.id) : null;
      if (input?.libraryOnly && userId) {
        const ids = await userMangaIds(db, userId);
        if (!ids.length) return { days: [] };
        conditions.push(inArray(manga.id, ids));
      }

      const rows = await db
        .select({ chapter: chapters, manga: manga, source: sources })
        .from(chapters)
        .innerJoin(manga, eq(chapters.mangaId, manga.id))
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(and(...conditions))
        .orderBy(desc(chapterTs), desc(chapters.id))
        .limit(100);

      const grouped = new Map<string, CalendarItem[]>();
      for (const r of rows) {
        const item = toCalendarItem(r);
        const date = item.publishedAt.toISOString().slice(0, 10);
        const arr = grouped.get(date);
        if (arr) arr.push(item);
        else grouped.set(date, [item]);
      }
      const out = [...grouped.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([date, items]) => ({ date, items }));
      return { days: out };
    }),

  /** آخر فصول المانجا المتابَعة (Follow & Notify) — فصل واحد لكل مانجا */
  following: authedQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const folRows = await db
        .select({ mangaId: follows.mangaId })
        .from(follows)
        .where(eq(follows.userId, userId));
      const ids = [...new Set(folRows.map((r) => Number(r.mangaId)))];
      if (!ids.length) return { items: [] as CalendarItem[] };

      const rows = await db
        .select({ chapter: chapters, manga: manga, source: sources })
        .from(chapters)
        .innerJoin(manga, eq(chapters.mangaId, manga.id))
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(inArray(manga.id, ids))
        .orderBy(desc(chapterTs), desc(chapters.id))
        .limit(200);

      const seen = new Set<number>();
      const items: CalendarItem[] = [];
      for (const r of rows) {
        const mid = Number(r.manga.id);
        if (seen.has(mid)) continue;
        seen.add(mid);
        items.push(toCalendarItem(r));
        if (items.length >= input.limit) break;
      }
      return { items };
    }),

  /** اختيار عشوائي — يرجع slug مانجا واحدة لها فصول (ORDER BY RAND()) */
  randomPick: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({ slug: manga.slug })
      .from(manga)
      .where(and(sql`${manga.chapterCount} > 0`, arabicSourceFilter()))
      .orderBy(sql`RAND()`)
      .limit(1);
    return rows[0]?.slug ?? null;
  }),

  /** توب 10 هذا الأسبوع (عربي) — قائمة الأدمن إن وُجدت، وإلا الرائج + الأكثر مشاهدة */
  topWeek: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(20).default(10) }))
    .query(async ({ input }) => {
      const curated = await curatedSection(SETTING_HOME_TOP_IDS, input.limit);
      if (curated) return curated;
      return getDb()
        .select(cardSelect)
        .from(manga)
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(arabicSourceFilter())
        .orderBy(
          desc(manga.isTrending),
          desc(manga.siteViewCount),
          desc(manga.viewCount),
          desc(manga.id),
        )
        .limit(input.limit);
    }),

  /** جواهر مخفية (عربي) — قائمة الأدمن إن وُجدت، وإلا تقييم مرتفع ومشاهدات منخفضة */
  hiddenGems: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(12) }))
    .query(async ({ input }) => {
      const curated = await curatedSection(SETTING_HOME_GEMS_IDS, input.limit);
      if (curated) return curated;
      return getDb()
        .select(cardSelect)
        .from(manga)
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(
          and(
            arabicSourceFilter(),
            gte(manga.rating, 4),
            gte(manga.chapterCount, 5),
          ),
        )
        .orderBy(asc(manga.viewCount), desc(manga.rating), asc(manga.id))
        .limit(input.limit);
    }),
});
