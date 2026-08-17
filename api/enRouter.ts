import { z } from "zod";
import { asc, count, desc, eq, gte, sql } from "drizzle-orm";
import { chapters, manga, sources } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery } from "./middleware";
import { enSourceFilter } from "./services/enImport";

/** حقول بطاقة المانجا (نفس شكل manga.mostViewed الذي تتوقعه الواجهة) */
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

/** استعلام بطاقات مانجا إنجليزية: join manga→sources مع فلتر مصادر EN */
function enCards() {
  return getDb()
    .select(cardSelect)
    .from(manga)
    .innerJoin(sources, eq(manga.sourceId, sources.id))
    .where(enSourceFilter());
}

export const enRouter = createRouter({
  /** الأكثر رواجاً — isTrending ثم المشاهدات (نفس نمط manga.popular) */
  trending: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(24) }))
    .query(async ({ input }) => {
      return enCards()
        .orderBy(
          desc(manga.isTrending),
          desc(manga.viewCount),
          desc(manga.chapterCount),
          desc(manga.id),
        )
        .limit(input.limit);
    }),

  /**
   * آخر التحديثات — بطاقة واحدة لكل مانجا مع أحدث فصل لها
   * (نفس نمط manga.latestGrouped: جلب فصول حديثة ثم تجميع في JS).
   */
  justUpdated: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(24) }))
    .query(async ({ input }) => {
      const rows = await getDb()
        .select({ chapter: chapters, manga: cardSelect })
        .from(chapters)
        .innerJoin(manga, eq(chapters.mangaId, manga.id))
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(enSourceFilter())
        .orderBy(
          desc(sql`COALESCE(${chapters.publishedAt}, ${chapters.createdAt})`),
          desc(chapters.id),
        )
        .limit(160);

      const seen = new Set<number>();
      const items: (typeof cardSelect & {
        latestChapter: typeof chapters.$inferSelect;
      })[] = [];
      for (const r of rows) {
        if (seen.has(r.manga.id)) continue;
        seen.add(r.manga.id);
        items.push({ ...r.manga, latestChapter: r.chapter });
        if (items.length >= input.limit) break;
      }
      return items;
    }),

  /** الأكثر شعبية — التقييم ثم عدد المقيّمين (نمط manga.list sort=rating) */
  popular: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(24) }))
    .query(async ({ input }) => {
      return enCards()
        .orderBy(desc(manga.rating), desc(manga.ratingCount), desc(manga.id))
        .limit(input.limit);
    }),

  /** أحدث الإضافات للموقع */
  newReleases: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(24) }))
    .query(async ({ input }) => {
      return enCards()
        .orderBy(desc(manga.createdAt), desc(manga.id))
        .limit(input.limit);
    }),

  /** الأعلى تقييماً — بشرط حد أدنى من الفصول (10) حتى لا تطغى السلاسل الجديدة */
  topRated: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      return getDb()
        .select(cardSelect)
        .from(manga)
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(sql`${enSourceFilter()} AND ${gte(manga.chapterCount, 10)}`)
        .orderBy(desc(manga.rating), desc(manga.ratingCount), desc(manga.id))
        .limit(input.limit);
    }),

  /** جواهر مخفية — تقييم مرتفع (>=4) مع مشاهدات منخفضة */
  hiddenGems: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(12) }))
    .query(async ({ input }) => {
      return getDb()
        .select(cardSelect)
        .from(manga)
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(
          sql`${enSourceFilter()} AND ${gte(manga.rating, 4)} AND ${gte(manga.chapterCount, 5)}`,
        )
        .orderBy(asc(manga.viewCount), desc(manga.rating), asc(manga.id))
        .limit(input.limit);
    }),

  /** اختيار عشوائي — مانجا واحدة (ORDER BY RAND()) */
  randomPick: publicQuery.query(async () => {
    const rows = await enCards().orderBy(sql`RAND()`).limit(1);
    return rows[0] ?? null;
  }),

  /** قسم الواجهة العربية الواحد — أحدث المانجا الإنجليزية تحديثاً */
  homeSection: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(12) }))
    .query(async ({ input }) => {
      return enCards()
        .orderBy(desc(manga.updatedAt), desc(manga.id))
        .limit(input.limit);
    }),

  /** إحصاءات القسم الإنجليزي: الإجمالي + عدد كل مصدر */
  stats: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({ name: sources.name, count: count() })
      .from(manga)
      .innerJoin(sources, eq(manga.sourceId, sources.id))
      .where(enSourceFilter())
      .groupBy(sources.name);
    const total = rows.reduce((acc, r) => acc + Number(r.count), 0);
    return {
      total,
      sources: rows.map((r) => ({ name: r.name, count: Number(r.count) })),
    };
  }),
});
