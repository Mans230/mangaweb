import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, adminQuery } from "./middleware";
import { scraperForUrl } from "./scrapers";
import { importLatest, importSeries, refreshAll, refreshChapters } from "./services/importer";
import {
  EN_SOURCE_KEYS,
  enImportStatus,
  purgeAdultManga,
  startEnBulkImport,
} from "./services/enImport";

export const importRouter = createRouter({
  /**
   * استيراد سلسلة من رابطها: يكشف المصدر من hostname ثم يجلب البيانات فعلياً.
   * hostname غير معروف → BAD_REQUEST (الواجهة تسجّل طلباً يدوياً كما كانت).
   */
  importByUrl: adminQuery
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      const scraper = scraperForUrl(input.url);
      if (!scraper) {
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

  /**
   * استيراد جماعي لكتالوج مصدر إنجليزي (mangadex/asurascans/vortexscans)
   * في الخلفية حتى target سلسلة. يرجع فوراً بحالة المهمة.
   */
  startEnImport: adminQuery
    .input(
      z.object({
        sourceKey: z.enum(EN_SOURCE_KEYS),
        target: z.number().int().min(10).max(1200).default(400),
      }),
    )
    .mutation(({ input }) => {
      const res = startEnBulkImport(input.sourceKey, input.target);
      if (!res.ok) {
        const messages = {
          unknown_source: "مصدر غير معروف",
          disabled: `المصدر ${input.sourceKey} معطّل حالياً`,
          already_running: `مهمة استيراد ${input.sourceKey} تعمل حالياً — انتظر اكتمالها`,
        } as const;
        throw new TRPCError({
          code: res.reason === "already_running" ? "CONFLICT" : "BAD_REQUEST",
          message: messages[res.reason ?? "unknown_source"],
        });
      }
      return { started: true, state: res.state };
    }),

  /** حالة مهام الاستيراد الجماعي الإنجليزي (تقدّم/عدادات لكل مصدر) */
  enImportStatus: adminQuery.query(() => enImportStatus()),

  /**
   * تطهير كل المانجا +18 (كل المصادر — سياسة الموقع آمن للعائلة الآن):
   * يحذف المانجا مع الفصول وكل الصفوف التابعة ويحدّث عدّادات المصادر.
   */
  purgeAdult: adminQuery.mutation(async () => {
    try {
      const res = await purgeAdultManga();
      console.log(`[import] purgeAdult: حُذفت ${res.deleted} مانجا +18`);
      return res;
    } catch (e) {
      console.error(`[import] purgeAdult فشل: ${(e as Error).message}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `فشل تطهير المحتوى +18: ${(e as Error).message}`,
      });
    }
  }),
});
