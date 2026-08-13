import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, adminQuery } from "./middleware";
import { scraperForUrl } from "./scrapers";
import { importLatest, importSeries, refreshAll, refreshChapters } from "./services/importer";

export const importRouter = createRouter({
  /**
   * استيراد سلسلة من رابطها: يكشف المصدر من hostname ثم يجلب البيانات فعلياً.
   * hostname غير معروف → BAD_REQUEST (الواجهة تسجّل طلباً يدوياً كما كانت).
   */
  importByUrl: adminQuery
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      const scraper = scraperForUrl(input.url);
      if (!scrapr) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "مصدر غير معروف لهذا الرابط",
        });
      }
      if (!scraper.enabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `المصدر ${scraper.name} معطّل حالياً`,
        });
      }
      try {
        const res = await importSeries(scraper.name, input.url);
        return {
          manga: res.manga,
          chaptersAdded: res.chaptersAdded,
          duplicate: res.duplicate,
          created: res.created,
          source: scraper.name,
        };
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `فشل الاستيراد من ${scraper.name}: ${(e as Error).message}`,
        });
      }
    }),

  importLatest: adminQuery
    .input(
      z.object({
        sourceKey: z.string().trim().min(1),
        limit: z.number().int().min(1).max(200).default(12),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await importLatest(input.sourceKey, input.limit);
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: (e as Error).message,
        });
      }
    }),

  refreshManga: adminQuery
    .input(z.object({ mangaId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        return await refreshChapters(input.mangaId);
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: (e as Error).message,
        });
      }
    }),

  refreshAll: adminQuery.mutation(() => refreshAll()),
});
