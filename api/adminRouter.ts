import { z } from "zod";
import { and, count, desc, eq, gt, like, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  bannedIps,
  chapters,
  comments,
  communities,
  communityCreateRequests,
  communityInvites,
  communityMembers,
  communityRoles,
  favorites,
  follows,
  manga,
  errorLogs,
  failedLogins,
  ratings,
  readingProgress,
  reports,
  requests,
  scrapeJobs,
  sources,
  supportTickets,
  users,
} from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, adminQuery } from "./middleware";
import {
  getSetting,
  setSetting,
  getBranding,
  parseBranding,
  invalidateSettingsCache,
  DEFAULT_BRANDING,
  SETTING_BRANDING,
  SETTING_SCRAPE_BLACKOUT,
  SETTING_COMMUNITY_MANGA_ENABLED,
  SETTING_COMMUNITY_USER_ENABLED,
  SETTING_UI_HIDE_COMMUNITIES,
  SETTING_UI_HIDE_REELS,
  SETTING_COMMUNITY_GROUP_URL,
  SETTING_UI_HIDE_STORE,
  SETTING_CTA_TELEGRAM,
  homeSectionKey,
} from "./lib/siteSettings";
import { generateInviteCode, uniqueSlug } from "./communitiesRouter";
import { enabledScrapers } from "./scrapers";
import {
  fixMissingCovers,
  importSeries,
  normalizeTitle,
  refreshChapters,
} from "./services/importer";
import { arabicSourceFilter, enSourceFilter } from "./services/enImport";
import { invalidateIpBanCache } from "./lib/ipBan";
import { adminLogs, updateRequests } from "@db/schema";
import { getScraper } from "./scrapers";
import { logAdminAction } from "./lib/adminLog";
import { recordSourceHealth } from "./lib/sourceHealth";
import { rateLimitSnapshot } from "./lib/rateLimit";
import {
  startJob,
  finishJob,
  inBlackout,
  MAX_SCRAPE_ATTEMPTS,
  retryBackoffMs,
} from "./lib/scrapeJobs";
import { clearPagesCache } from "./mangaRouter";
import { SETTING_BANNED_WORDS, bannedWords } from "./lib/wordFilter";

export const SETTING_MAINTENANCE_MODE = "maintenance_mode";
export const SETTING_MAINTENANCE_MESSAGE = "maintenance_message";

/** علم module-scope يمنع تشغيل triggerScrape مرتين بالتزامن */
let scrapeRunning = false;
/** علم module-scope يمنع تزامن مهمتي fixMetadata */
let fixMetadataRunning = false;

/**
 * يشغّل سكراب مصدر واحد مع تسجيل سجل الدورة (scrape_jobs) وصحّة المصدر،
 * وعند الفشل يجدول إعادة محاولة أُسّية. يُستدعى من الدورات اليدوية ومن إعادة المحاولة.
 */
async function scrapeOneSource(
  name: string,
  trigger: "manual" | "scheduled" | "retry",
  attempt: number,
  opts?: { limit?: number; maxPages?: number },
): Promise<void> {
  const { importCatalog } = await import("./services/importer");
  const jobId = await startJob(name, trigger, attempt);
  try {
    const r = await importCatalog(name, opts ?? {});
    console.log(
      `[scrape] ${name} (${trigger} #${attempt}): استُوردت ${r.imported}، تخطّى ${r.skipped}، فشلت ${r.failed}`,
    );
    await finishJob(jobId, true, { imported: r.imported, failed: r.failed });
    await recordSourceHealth(name, true);
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[scrape] فشل ${name} (${trigger} #${attempt}): ${msg}`);
    await finishJob(jobId, false, {}, msg);
    await recordSourceHealth(name, false, msg);
    if (attempt < MAX_SCRAPE_ATTEMPTS) scheduleScrapeRetry(name, attempt + 1, opts);
  }
}

/** يجدول إعادة محاولة سكراب مصدر بعد تأخير أُسّي — يحترم قفل التزامن ونافذة الحظر */
function scheduleScrapeRetry(
  name: string,
  attempt: number,
  opts?: { limit?: number; maxPages?: number },
): void {
  setTimeout(() => {
    void (async () => {
      // دورة أخرى تعمل الآن — أعد الجدولة بدل التصادم
      if (scrapeRunning) return scheduleScrapeRetry(name, attempt, opts);
      if (await inBlackout()) {
        const jobId = await startJob(name, "retry", attempt);
        await finishJob(jobId, false, {}, "أُلغيت: نافذة حظر السكراب");
        return;
      }
      scrapeRunning = true;
      try {
        await scrapeOneSource(name, "retry", attempt, opts);
      } finally {
        scrapeRunning = false;
      }
    })();
  }, retryBackoffMs(attempt));
}

/** لون HEX صالح (#rgb أو #rrggbb) أو نص فارغ = رجوع للافتراضي */
const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "لون HEX غير صالح")
  .or(z.literal(""));

const sourceStatusEnum = z.enum(["active", "paused", "blocked"]);
const requestStatusEnum = z.enum(["pending", "added", "rejected"]);

export const adminRouter = createRouter({
  stats: adminQuery.query(async () => {
    const db = getDb();
    const [[m], [c], [u], [r], [rp], [ot]] = await Promise.all([
      db.select({ total: count() }).from(manga),
      db.select({ total: count() }).from(chapters),
      db.select({ total: count() }).from(users),
      db.select({ total: count() }).from(requests),
      db
        .select({ total: count() })
        .from(requests)
        .where(eq(requests.status, "pending")),
      db
        .select({ total: count() })
        .from(supportTickets)
        .where(eq(supportTickets.status, "open")),
    ]);
    return {
      manga: m.total,
      chapters: c.total,
      users: u.total,
      requests: r.total,
      pendingRequests: rp.total,
      openTickets: ot.total,
    };
  }),

  listManga: adminQuery
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
        search: z.string().trim().min(1).optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = input.search
        ? like(manga.title, `%${input.search}%`)
        : undefined;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({ manga: manga, source: sources })
          .from(manga)
          .innerJoin(sources, eq(manga.sourceId, sources.id))
          .where(where)
          .orderBy(desc(manga.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(manga).where(where),
      ]);
      return {
        items: rows.map((r) => ({ ...r.manga, source: r.source })),
        total,
        page: input.page,
        limit: input.limit,
      };
    }),

  addMangaByUrl: adminQuery
    .input(
      z.object({
        url: z.string().url(),
        title: z.string().trim().max(500).optional(),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      let hostname = "";
      try {
        hostname = new URL(input.url).hostname.replace(/^www\./, "");
      } catch {
        hostname = "";
      }
      // طابق الرابط مع سكرابر مفعّل حسب دومينه (يشمل كل المصادر، مش جدول sources فقط)
      const scraper = hostname
        ? enabledScrapers().find((s) => {
            try {
              return new URL(s.baseUrl).hostname.replace(/^www\./, "") === hostname;
            } catch {
              return false;
            }
          })
        : undefined;

      // مصدر مطابق ومفعّل → استيراد فوري فعلي
      if (scraper) {
        try {
          const { importSeries } = await import("./services/importer");
          const res = await importSeries(scraper.name, input.url);
          await logAdminAction(ctx.user.id, "manga.addByUrl", {
            meta: { url: input.url, source: scraper.name, mangaId: res.manga.id },
          });
          return {
            imported: true as const,
            mangaId: res.manga.id,
            slug: res.manga.slug,
            title: res.manga.title,
            chaptersAdded: res.chaptersAdded,
            source: scraper.name,
          };
        } catch (e) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `فشل الاستيراد من ${scraper.name}: ${(e as Error).message}`,
          });
        }
      }

      // مصدر غير مدعوم/معطّل → سجّله كطلب يدوي (السلوك القديم)
      const [{ id }] = await db
        .insert(requests)
        .values({
          userId: ctx.user.id,
          title: input.title ?? input.url,
          sourceUrl: input.url,
          note: input.note ?? `admin import (unsupported source, pending)`,
        })
        .$returningId();

      return { imported: false as const, requestId: id, source: null };
    }),

  listSources: adminQuery.query(() => getDb().select().from(sources)),

  updateSourceStatus: adminQuery
    .input(
      z.object({ id: z.number().int().positive(), status: sourceStatusEnum }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(sources)
        .set({ status: input.status })
        .where(eq(sources.id, input.id));
      return { success: true };
    }),

  /** ضبط أولوية المصدر و/أو السكراب التلقائي (يدوي مقابل تلقائي) */
  updateSourceConfig: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        priority: z.number().int().min(0).max(100).optional(),
        autoScrape: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const patch: Partial<{ priority: number; autoScrape: boolean }> = {};
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.autoScrape !== undefined) patch.autoScrape = input.autoScrape;
      if (Object.keys(patch).length === 0) return { success: true };
      await db.update(sources).set(patch).where(eq(sources.id, input.id));
      await logAdminAction(ctx.user.id, "source.config", { meta: input });
      return { success: true };
    }),

  mergeDuplicates: adminQuery
    .input(
      z.object({
        primaryId: z.number().int().positive(),
        duplicateId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.primaryId === input.duplicateId) {
        throw new Error("primaryId and duplicateId must differ");
      }
      const db = getDb();
      const [primary, duplicate] = await Promise.all([
        db.query.manga.findFirst({ where: eq(manga.id, input.primaryId) }),
        db.query.manga.findFirst({ where: eq(manga.id, input.duplicateId) }),
      ]);
      if (!primary || !duplicate) {
        throw new Error("manga not found");
      }

      await db.transaction(async (tx) => {
        // Move chapters
        await tx
          .update(chapters)
          .set({ mangaId: primary.id })
          .where(eq(chapters.mangaId, duplicate.id));

        // Move per-user rows, deduplicating on (userId, mangaId)
        const userTables = [favorites, follows, ratings, readingProgress];
        for (const table of userTables) {
          const dupRows = await tx
            .select()
            .from(table)
            .where(eq(table.mangaId, duplicate.id));
          for (const row of dupRows) {
            const [conflict] = await tx
              .select()
              .from(table)
              .where(
                and(eq(table.mangaId, primary.id), eq(table.userId, row.userId)),
              )
              .limit(1);
            if (conflict) {
              await tx.delete(table).where(eq(table.id, row.id));
            } else {
              await tx
                .update(table)
                .set({ mangaId: primary.id })
                .where(eq(table.id, row.id));
            }
          }
        }

        // Move comments (no uniqueness constraint)
        await tx
          .update(comments)
          .set({ mangaId: primary.id })
          .where(eq(comments.mangaId, duplicate.id));

        // Remove the duplicate entry
        await tx.delete(manga).where(eq(manga.id, duplicate.id));

        // Refresh the primary chapter count
        const [{ total }] = await tx
          .select({ total: count() })
          .from(chapters)
          .where(eq(chapters.mangaId, primary.id));
        await tx
          .update(manga)
          .set({ chapterCount: total })
          .where(eq(manga.id, primary.id));
      });

      return { success: true, primaryId: primary.id };
    }),

  /** حذف مانجا وكل البيانات التابعة لها داخل transaction */
  deleteManga: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.query.manga.findFirst({
        where: eq(manga.id, input.id),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المانجا غير موجودة" });
      }
      await db.transaction(async (tx) => {
        await tx
          .delete(readingProgress)
          .where(eq(readingProgress.mangaId, input.id));
        await tx.delete(comments).where(eq(comments.mangaId, input.id));
        await tx.delete(ratings).where(eq(ratings.mangaId, input.id));
        await tx.delete(favorites).where(eq(favorites.mangaId, input.id));
        await tx.delete(follows).where(eq(follows.mangaId, input.id));
        await tx.delete(chapters).where(eq(chapters.mangaId, input.id));
        await tx.delete(manga).where(eq(manga.id, input.id));
      });
      // حدّث عدّاد المصدر
      const [{ total: srcTotal }] = await db
        .select({ total: count() })
        .from(manga)
        .where(eq(manga.sourceId, existing.sourceId));
      await db
        .update(sources)
        .set({ mangaCount: srcTotal })
        .where(eq(sources.id, existing.sourceId));
      return { success: true };
    }),

  /** تحديث جزئي لبيانات مانجا */
  updateManga: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().trim().min(1).max(500).optional(),
        coverUrl: z.string().trim().max(2000).optional(),
        description: z.string().max(10000).optional(),
        status: z.enum(["ongoing", "completed"]).optional(),
        isTrending: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.query.manga.findFirst({
        where: eq(manga.id, input.id),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المانجا غير موجودة" });
      }
      const patch: Partial<typeof manga.$inferInsert> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.coverUrl !== undefined) patch.coverUrl = input.coverUrl;
      if (input.description !== undefined) patch.description = input.description;
      if (input.status !== undefined) patch.status = input.status;
      if (input.isTrending !== undefined) patch.isTrending = input.isTrending;
      if (Object.keys(patch).length) {
        await db.update(manga).set(patch).where(eq(manga.id, input.id));
      }
      const updated = await db.query.manga.findFirst({
        where: eq(manga.id, input.id),
      });
      return updated!;
    }),

  /** حظر / فك حظر مستخدم — لا يمكن للأدمن حظر نفسه */
  banUser: adminQuery
    .input(z.object({ userId: z.number().int().positive(), banned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === Number(ctx.user.id)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "لا يمكنك حظر حسابك الخاص",
        });
      }
      const db = getDb();
      const target = await db.query.users.findFirst({
        where: eq(users.id, input.userId),
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
      }
      await db
        .update(users)
        .set({ bannedAt: input.banned ? new Date() : null })
        .where(eq(users.id, input.userId));
      return { success: true, banned: input.banned };
    }),

  banIp: adminQuery
    .input(
      z.object({
        ip: z.string().trim().min(3).max(45),
        reason: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .insert(bannedIps)
        .values({ ip: input.ip, reason: input.reason ?? null })
        .onDuplicateKeyUpdate({ set: { reason: input.reason ?? null } });
      invalidateIpBanCache();
      await logAdminAction(ctx.user.id, "security.ban_ip", {
        meta: { ip: input.ip, reason: input.reason },
      });
      return { success: true };
    }),

  unbanIp: adminQuery
    .input(z.object({ ip: z.string().trim().min(3).max(45) }))
    .mutation(async ({ ctx, input }) => {
      await getDb().delete(bannedIps).where(eq(bannedIps.ip, input.ip));
      invalidateIpBanCache();
      await logAdminAction(ctx.user.id, "security.unban_ip", { meta: { ip: input.ip } });
      return { success: true };
    }),

  listBans: adminQuery.query(() =>
    getDb().select().from(bannedIps).orderBy(desc(bannedIps.createdAt)),
  ),

  /** آخر محاولات الدخول الفاشلة (مع الصفحات) */
  listFailedLogins: adminQuery
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(failedLogins)
          .orderBy(desc(failedLogins.id))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(failedLogins),
      ]);
      return { items: rows, total, page: input.page, limit: input.limit };
    }),

  /** أكثر عناوين IP فشلاً خلال آخر 24 ساعة */
  failedLoginStats: adminQuery.query(async () => {
    const db = getDb();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await db
      .select({ ip: failedLogins.ip, attempts: count() })
      .from(failedLogins)
      .where(gt(failedLogins.createdAt, since))
      .groupBy(failedLogins.ip)
      .orderBy(desc(count()))
      .limit(10);
    return { since, top: rows };
  }),

  /** لقطة حالة تحديد المعدل في الذاكرة (لهذه العملية) */
  rateLimitStatus: adminQuery.query(() => rateLimitSnapshot()),

  listComments: adminQuery
    .input(
      z.object({
        mangaId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = input.mangaId
        ? eq(comments.mangaId, input.mangaId)
        : undefined;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            comment: comments,
            user: { id: users.id, name: users.name },
            manga: { id: manga.id, title: manga.title },
          })
          .from(comments)
          .innerJoin(users, eq(comments.userId, users.id))
          .innerJoin(manga, eq(comments.mangaId, manga.id))
          .where(where)
          .orderBy(desc(comments.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ total: count() }).from(comments).where(where),
      ]);
      return {
        items: rows.map((r) => ({ ...r.comment, user: r.user, manga: r.manga })),
        total,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  deleteComment: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await getDb().delete(comments).where(eq(comments.id, input.id));
      return { success: true };
    }),

  /**
   * استيراد بالاسم: بحث متوازٍ في كل المصادر المفعّلة، اختيار أفضل تطابق
   * (تطبيع العنوان)، ثم الاستيراد بنفس منطق importByUrl.
   */
  addMangaByName: adminQuery
    .input(z.object({ name: z.string().trim().min(1).max(300) }))
    .mutation(async ({ input }) => {
      const normQuery = normalizeTitle(input.name);
      const results = await Promise.all(
        enabledScrapers().map(async (s) => {
          try {
            const items = await s.search(input.name);
            return { source: s.name, items };
          } catch (e) {
            console.warn(
              `[admin] بحث ${s.name} عن "${input.name}" فشل: ${(e as Error).message}`,
            );
            return { source: s.name, items: [] };
          }
        }),
      );

      // أفضل تطابق: تطابق تام مُطبَّع أولاً، ثم احتواء، ثم أول نتيجة
      let best: { source: string; title: string; url: string } | null = null;
      let fallback: { source: string; title: string; url: string } | null = null;
      for (const r of results) {
        for (const it of r.items) {
          if (!it.url) continue;
          const cand = { source: r.source, title: it.title, url: it.url };
          if (!fallback) fallback = cand;
          const norm = normalizeTitle(it.title ?? "");
          if (norm === normQuery) {
            best = cand;
            break;
          }
          if (!best && (norm.includes(normQuery) || normQuery.includes(norm))) {
            best = cand;
          }
        }
        if (best && normalizeTitle(best.title) === normQuery) break;
      }
      const pick = best ?? fallback;
      if (!pick) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `لا نتائج عن "${input.name}" في أي مصدر مفعّل`,
        });
      }

      try {
        const res = await importSeries(pick.source, pick.url);
        return {
          imported: !res.duplicate,
          title: res.manga.title,
          slug: res.manga.slug,
          source: pick.source,
          duplicate: res.duplicate,
        };
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `فشل الاستيراد من ${pick.source}: ${(e as Error).message}`,
        });
      }
    }),

  listUsers: adminQuery
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const [items, [{ total }]] = await Promise.all([
        db
          .select()
          .from(users)
          .orderBy(desc(users.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(users),
      ]);
      return { items, total, page: input.page, limit: input.limit };
    }),

  listRequests: adminQuery
    .input(
      z.object({
        status: requestStatusEnum.optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = input.status
        ? eq(requests.status, input.status)
        : undefined;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            request: requests,
            user: { id: users.id, name: users.name, email: users.email },
          })
          .from(requests)
          .leftJoin(users, eq(requests.userId, users.id))
          .where(where)
          .orderBy(desc(requests.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(requests).where(where),
      ]);
      return {
        items: rows.map((r) => ({ ...r.request, user: r.user })),
        total,
        page: input.page,
        limit: input.limit,
      };
    }),

  updateRequestStatus: adminQuery
    .input(
      z.object({ id: z.number().int().positive(), status: requestStatusEnum }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(requests)
        .set({ status: input.status })
        .where(eq(requests.id, input.id));
      return { success: true };
    }),

  /**
   * إصلاح الأغلفة المفقودة: دفعة صغيرة (افتراضي 20) من المانجا بلا coverUrl،
   * تعيد جلب الغلاف من المصدر وتُحدّث فصولها. لا توليد أغلفة AI إطلاقاً.
   */
  fixMissingCovers: adminQuery
    .input(
      z.object({ limit: z.number().int().min(1).max(100).default(20) }),
    )
    .mutation(async ({ input }) => {
      return fixMissingCovers(input.limit);
    }),

  // ================= مجتمعات المستخدمين (إدارة الموقع) =================

  /** طلبات إنشاء المجتمعات مع بيانات مقدم الطلب */
  listCommunityCreateRequests: adminQuery
    .input(
      z.object({
        status: z.enum(["pending", "approved", "rejected"]).default("pending"),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = eq(communityCreateRequests.status, input.status);
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            request: communityCreateRequests,
            user: {
              id: users.id,
              name: users.name,
              username: users.username,
              avatarUrl: users.avatarUrl,
            },
          })
          .from(communityCreateRequests)
          .innerJoin(users, eq(communityCreateRequests.userId, users.id))
          .where(where)
          .orderBy(desc(communityCreateRequests.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(communityCreateRequests).where(where),
      ]);
      return {
        items: rows.map((r) => ({ ...r.request, user: r.user })),
        total,
        page: input.page,
        limit: input.limit,
      };
    }),

  /**
   * الموافقة على طلب إنشاء مجتمع: ينشئ المجتمع + عضوية المالك
   * + دور "مشرف" الافتراضي + رابط الدعوة الأول.
   */
  approveCreateRequest: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const request = await db.query.communityCreateRequests.findFirst({
        where: eq(communityCreateRequests.id, input.id),
      });
      if (!request || request.status !== "pending") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "الطلب غير موجود أو تمت معالجته مسبقاً",
        });
      }
      const [{ owned }] = await db
        .select({ owned: count() })
        .from(communities)
        .where(eq(communities.ownerId, request.userId));
      if (owned >= 3) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "المستخدم وصل للحد الأقصى من المجتمعات المملوكة (3)",
        });
      }
      const payload = request.payload;
      const slug = await uniqueSlug(db, payload.name);
      const [{ id: communityId }] = await db
        .insert(communities)
        .values({
          slug,
          name: payload.name,
          description: payload.description ?? null,
          imageUrl: payload.imageUrl ?? null,
          color: payload.color ?? null,
          isPrivate: payload.isPrivate,
          ownerId: request.userId,
          mangaId: payload.mangaId ?? null,
        })
        .$returningId();
      // الدور الافتراضي "مشرف" بصلاحيات إشراف
      await db.insert(communityRoles).values({
        communityId,
        name: "مشرف",
        canModerate: true,
      });
      await db
        .insert(communityMembers)
        .values({ communityId, userId: request.userId });
      await db
        .insert(communityInvites)
        .values({ communityId, code: generateInviteCode() });
      await db
        .update(communityCreateRequests)
        .set({ status: "approved" })
        .where(eq(communityCreateRequests.id, request.id));
      return { success: true, communityId, slug };
    }),

  /** رفض طلب إنشاء مجتمع — السبب إلزامي ويظهر للمستخدم */
  rejectCreateRequest: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        reason: z.string().trim().min(1, "سبب الرفض مطلوب").max(2000),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const request = await db.query.communityCreateRequests.findFirst({
        where: eq(communityCreateRequests.id, input.id),
      });
      if (!request || request.status !== "pending") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "الطلب غير موجود أو تمت معالجته مسبقاً",
        });
      }
      await db
        .update(communityCreateRequests)
        .set({ status: "rejected", rejectReason: input.reason })
        .where(eq(communityCreateRequests.id, request.id));
      return { success: true };
    }),

  /** مفاتيح تفعيل/تعطيل مجتمعات المستخدمين ومجتمعات المانجا */
  setCommunityToggles: adminQuery
    .input(
      z.object({
        user: z.boolean().optional(),
        manga: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.user !== undefined) {
        await setSetting(SETTING_COMMUNITY_USER_ENABLED, input.user ? "1" : "0");
      }
      if (input.manga !== undefined) {
        await setSetting(
          SETTING_COMMUNITY_MANGA_ENABLED,
          input.manga ? "1" : "0",
        );
      }
      return { success: true };
    }),

  getCommunityToggles: adminQuery.query(async () => {
    const [user, mangaEnabled] = await Promise.all([
      getSetting(SETTING_COMMUNITY_USER_ENABLED, "1"),
      getSetting(SETTING_COMMUNITY_MANGA_ENABLED, "1"),
    ]);
    return { user: user === "1", manga: mangaEnabled === "1" };
  }),

  /** مفاتيح إخفاء أقسام الواجهة (المجتمعات/الريلز) — قراءة */
  getUiToggles: adminQuery.query(async () => {
    const [hideCommunities, hideReels, communityGroupUrl, hideStore, ctaRaw] =
      await Promise.all([
        getSetting(SETTING_UI_HIDE_COMMUNITIES, "0"),
        getSetting(SETTING_UI_HIDE_REELS, "0"),
        getSetting(SETTING_COMMUNITY_GROUP_URL, ""),
        getSetting(SETTING_UI_HIDE_STORE, "0"),
        getSetting(SETTING_CTA_TELEGRAM, ""),
      ]);
    let telegramCta: Record<string, unknown> = {};
    if (ctaRaw) {
      try {
        telegramCta = JSON.parse(ctaRaw);
      } catch {
        /* تجاهل */
      }
    }
    return {
      hideCommunities: hideCommunities === "1",
      hideReels: hideReels === "1",
      hideStore: hideStore === "1",
      communityGroupUrl: communityGroupUrl ?? "",
      telegramCta,
    };
  }),

  /** تعديل مفاتيح إخفاء أقسام الواجهة — يُخفي الروابط والصفحات فوراً */
  setUiToggles: adminQuery
    .input(
      z.object({
        hideCommunities: z.boolean().optional(),
        hideReels: z.boolean().optional(),
        hideStore: z.boolean().optional(),
        communityGroupUrl: z.string().trim().max(500).optional(),
        telegramCta: z
          .object({
            title: z.string().trim().max(120).optional(),
            body: z.string().trim().max(240).optional(),
            button: z.string().trim().max(60).optional(),
            url: z.string().trim().url().max(300).optional().or(z.literal("")),
            fontScale: z.number().min(0.8).max(1.6).optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.hideCommunities !== undefined) {
        await setSetting(SETTING_UI_HIDE_COMMUNITIES, input.hideCommunities ? "1" : "0");
      }
      if (input.hideReels !== undefined) {
        await setSetting(SETTING_UI_HIDE_REELS, input.hideReels ? "1" : "0");
      }
      if (input.hideStore !== undefined) {
        await setSetting(SETTING_UI_HIDE_STORE, input.hideStore ? "1" : "0");
      }
      if (input.communityGroupUrl !== undefined) {
        await setSetting(SETTING_COMMUNITY_GROUP_URL, input.communityGroupUrl);
      }
      if (input.telegramCta !== undefined) {
        await setSetting(SETTING_CTA_TELEGRAM, JSON.stringify(input.telegramCta));
      }
      await logAdminAction(ctx.user.id, "settings.ui_toggles", { meta: input });
      return { success: true };
    }),

  /** الهوية البصرية (الثيم/العلامة) — قراءة القيم الحالية للوحة التخصيص */
  getBranding: adminQuery.query(() => getBranding()),

  /** حفظ الهوية البصرية — يُطبَّق فوراً على كل الواجهة (متغيّرات CSS + CSS مخصّص + فافيكون) */
  setBranding: adminQuery
    .input(
      z.object({
        colors: z
          .object({
            primary: hexColor,
            primarySoft: hexColor,
            accent: hexColor,
            accent2: hexColor,
            primaryInk: hexColor,
          })
          .partial()
          .optional(),
        siteName: z.string().trim().max(120).optional(),
        siteDescription: z.string().trim().max(300).optional(),
        logoUrl: z.string().trim().max(500).url().optional().or(z.literal("")),
        faviconEmoji: z.string().trim().max(8).optional(),
        customCss: z.string().max(20000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // ندمج فوق القيم الحالية حتى لا يمحو حفظ جزئي بقيةَ الحقول
      const current = await getBranding();
      const next = {
        ...current,
        ...input,
        colors: { ...current.colors, ...(input.colors ?? {}) },
      };
      await setSetting(SETTING_BRANDING, JSON.stringify(next));
      await logAdminAction(ctx.user.id, "settings.branding", { meta: input });
      return { success: true };
    }),

  /** إعادة الهوية البصرية إلى الافتراضي */
  resetBranding: adminQuery.mutation(async ({ ctx }) => {
    await setSetting(SETTING_BRANDING, JSON.stringify(DEFAULT_BRANDING));
    await logAdminAction(ctx.user.id, "settings.branding_reset", {});
    return parseBranding(JSON.stringify(DEFAULT_BRANDING));
  }),

  // ================= صحّة النظام (سجل الأخطاء + الكاش) =================

  /** أخطاء الخادم/العميل مُجمّعة حسب البصمة، مع فلتر الحالة والصفحات */
  errorLogs: adminQuery
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(30),
        status: z.enum(["all", "open", "resolved", "ignored"]).default("open"),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where =
        input.status === "all"
          ? undefined
          : eq(errorLogs.status, input.status);
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(errorLogs)
          .where(where)
          .orderBy(desc(errorLogs.lastSeenAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(errorLogs).where(where),
      ]);
      return { items: rows, total, page: input.page, limit: input.limit };
    }),

  /** إحصاء الأخطاء حسب الحالة — لشارات تبويبات الفلتر */
  errorLogStats: adminQuery.query(async () => {
    const rows = await getDb()
      .select({ status: errorLogs.status, c: count() })
      .from(errorLogs)
      .groupBy(errorLogs.status);
    const stats = { open: 0, resolved: 0, ignored: 0, total: 0 };
    for (const r of rows) {
      const n = Number(r.c);
      stats.total += n;
      if (r.status === "open") stats.open += n;
      else if (r.status === "resolved") stats.resolved += n;
      else if (r.status === "ignored") stats.ignored += n;
    }
    return stats;
  }),

  /** تغيير حالة خطأ (open/resolved/ignored) */
  updateErrorStatus: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["open", "resolved", "ignored"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db
        .select({ id: errorLogs.id })
        .from(errorLogs)
        .where(eq(errorLogs.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(errorLogs)
        .set({ status: input.status })
        .where(eq(errorLogs.id, input.id));
      await logAdminAction(ctx.user.id, "system.update_error_status", {
        targetType: "error_log",
        targetId: input.id,
        meta: { status: input.status },
      });
      return { success: true };
    }),

  /** مسح كل سجل الأخطاء */
  clearErrorLogs: adminQuery.mutation(async ({ ctx }) => {
    await getDb().delete(errorLogs);
    await logAdminAction(ctx.user.id, "system.clear_error_logs", {});
    return { success: true };
  }),

  /** مسح كاشات الخادم في الذاكرة (صفحات الفصول + إعدادات الموقع) — «purge» بضغطة */
  purgeCaches: adminQuery.mutation(async ({ ctx }) => {
    const pages = clearPagesCache();
    invalidateSettingsCache();
    await logAdminAction(ctx.user.id, "system.purge_caches", { meta: { pages } });
    return { success: true, pagesCleared: pages };
  }),

  /** ضبط قائمة قسم الرئيسية (جواهر مخفية / توب10) يدوياً بمعرّفات مانجا — لكل لغة */
  setHomeSection: adminQuery
    .input(
      z.object({
        section: z.enum(["gems", "top"]),
        lang: z.enum(["ar", "en"]).default("ar"),
        ids: z.array(z.number().int().positive()).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await setSetting(homeSectionKey(input.section, input.lang), JSON.stringify(input.ids));
      await logAdminAction(ctx.user.id, "settings.home_section", { meta: input });
      return { success: true, count: input.ids.length };
    }),

  /** اختيار عشوائي (اختياري حسب التصنيف) لقسم الرئيسية — يحترم لغة المصدر */
  randomizeHomeSection: adminQuery
    .input(
      z.object({
        section: z.enum(["gems", "top"]),
        lang: z.enum(["ar", "en"]).default("ar"),
        count: z.number().int().min(1).max(20).default(10),
        genre: z.string().trim().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // فلتر لغة المصدر: العربية تستبعد EN، والإنجليزية تقتصر على EN فقط
      const langFilter = input.lang === "en" ? enSourceFilter() : arabicSourceFilter();
      const conds = [sql`${manga.chapterCount} > 0`, langFilter];
      if (input.genre) {
        conds.push(sql`JSON_CONTAINS(${manga.genres}, JSON_QUOTE(${input.genre}))`);
      }
      const rows = await db
        .select({ id: manga.id })
        .from(manga)
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(and(...conds))
        .orderBy(sql`RAND()`)
        .limit(input.count);
      const ids = rows.map((r) => r.id);
      await setSetting(homeSectionKey(input.section, input.lang), JSON.stringify(ids));
      await logAdminAction(ctx.user.id, "settings.home_section_random", { meta: { ...input, ids } });
      return { success: true, count: ids.length };
    }),

  /** مسح القائمة المنسّقة (رجوع للمنطق التلقائي) — لكل لغة */
  clearHomeSection: adminQuery
    .input(
      z.object({
        section: z.enum(["gems", "top"]),
        lang: z.enum(["ar", "en"]).default("ar"),
      }),
    )
    .mutation(async ({ input }) => {
      await setSetting(homeSectionKey(input.section, input.lang), "");
      return { success: true };
    }),

  /** أرشفة/إلغاء أرشفة مجتمع — الأرشفة تجعله للقراءة فقط */
  setCommunityArchived: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        archived: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const community = await db.query.communities.findFirst({
        where: eq(communities.id, input.id),
        columns: { id: true },
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المجتمع غير موجود" });
      }
      await db
        .update(communities)
        .set({ archivedAt: input.archived ? new Date() : null })
        .where(eq(communities.id, community.id));
      return { success: true };
    }),

  /** حذف مجتمع نهائياً — أدمن الموقع فقط (لا يوجد نقل ملكية) */
  deleteCommunity: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const community = await db.query.communities.findFirst({
        where: eq(communities.id, input.id),
        columns: { id: true },
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المجتمع غير موجود" });
      }
      await db.delete(communities).where(eq(communities.id, community.id));
      return { success: true };
    }),

  // ================= إدارة الفصول =================

  /** فصول مانجا (الأحدث رقماً أولاً) */
  listChapters: adminQuery
    .input(
      z.object({
        mangaId: z.number().int().positive(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = eq(chapters.mangaId, input.mangaId);
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(chapters)
          .where(where)
          .orderBy(desc(chapters.number))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(chapters).where(where),
      ]);
      return { items: rows, total, page: input.page, limit: input.limit };
    }),

  hideChapter: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(chapters)
        .set({ hiddenAt: new Date() })
        .where(eq(chapters.id, input.id));
      await logAdminAction(ctx.user.id, "chapter.hide", {
        targetType: "chapter",
        targetId: input.id,
      });
      return { success: true };
    }),

  unhideChapter: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(chapters)
        .set({ hiddenAt: null })
        .where(eq(chapters.id, input.id));
      await logAdminAction(ctx.user.id, "chapter.unhide", {
        targetType: "chapter",
        targetId: input.id,
      });
      return { success: true };
    }),

  deleteChapter: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const chapter = await db.query.chapters.findFirst({
        where: eq(chapters.id, input.id),
      });
      if (!chapter) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الفصل غير موجود" });
      }
      await db.delete(chapters).where(eq(chapters.id, input.id));
      const [{ total }] = await db
        .select({ total: count() })
        .from(chapters)
        .where(eq(chapters.mangaId, chapter.mangaId));
      await db
        .update(manga)
        .set({ chapterCount: total })
        .where(eq(manga.id, chapter.mangaId));
      await logAdminAction(ctx.user.id, "chapter.delete", {
        targetType: "chapter",
        targetId: input.id,
        meta: { mangaId: chapter.mangaId, number: chapter.number },
      });
      return { success: true };
    }),

  editChapter: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        number: z.number().positive().optional(),
        title: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const chapter = await db.query.chapters.findFirst({
        where: eq(chapters.id, input.id),
      });
      if (!chapter) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الفصل غير موجود" });
      }
      const patch: Partial<typeof chapters.$inferInsert> = {};
      if (input.number !== undefined) patch.number = input.number;
      if (input.title !== undefined) patch.title = input.title;
      if (Object.keys(patch).length) {
        await db.update(chapters).set(patch).where(eq(chapters.id, input.id));
      }
      await logAdminAction(ctx.user.id, "chapter.edit", {
        targetType: "chapter",
        targetId: input.id,
        meta: patch as Record<string, unknown>,
      });
      return { success: true };
    }),

  /** إعادة سحب صفحات فصل من المصدر وتحديث عدد الصفحات */
  rescrapeChapter: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const row = await db
        .select({ chapter: chapters, manga: manga, source: sources })
        .from(chapters)
        .innerJoin(manga, eq(chapters.mangaId, manga.id))
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(eq(chapters.id, input.id))
        .limit(1);
      if (!row.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الفصل غير موجود" });
      }
      const { chapter, source } = row[0];
      if (!chapter.url) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "لا يوجد رابط مصدر لهذا الفصل",
        });
      }
      const scraper = getScraper(source.name);
      if (!scraper) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `لا يوجد سكرابر للمصدر: ${source.name}`,
        });
      }
      try {
        const pages = await scraper.getPages(chapter.url);
        await db
          .update(chapters)
          .set({ pageCount: pages.length })
          .where(eq(chapters.id, chapter.id));
        await logAdminAction(ctx.user.id, "chapter.rescrape", {
          targetType: "chapter",
          targetId: chapter.id,
          meta: { pageCount: pages.length },
        });
        return { success: true, pageCount: pages.length };
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `فشل سحب الصفحات: ${(e as Error).message}`,
        });
      }
    }),

  /**
   * طابور الفصول المعطوبة: تقارير المستخدمين reason="broken" مع بيانات الفصل والمانجا.
   * سير المعالجة يُنفَّذ عبر hideChapter/unhideChapter/rescrapeChapter + reports.resolveReport.
   */
  listBrokenChapters: adminQuery
    .input(
      z.object({
        status: z.enum(["pending", "resolved", "dismissed"]).default("pending"),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = and(
        eq(reports.reason, "broken"),
        eq(reports.status, input.status),
      );
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            report: {
              id: reports.id,
              details: reports.details,
              status: reports.status,
              createdAt: reports.createdAt,
            },
            chapter: {
              id: chapters.id,
              number: chapters.number,
              title: chapters.title,
              pageCount: chapters.pageCount,
              hiddenAt: chapters.hiddenAt,
            },
            manga: { id: manga.id, title: manga.title, slug: manga.slug },
          })
          .from(reports)
          .leftJoin(chapters, eq(reports.chapterId, chapters.id))
          .leftJoin(manga, eq(reports.mangaId, manga.id))
          .where(where)
          .orderBy(desc(reports.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(reports).where(where),
      ]);
      return { items: rows, total, page: input.page, limit: input.limit };
    }),

  // ================= إدارة المانجا (موسّعة) =================

  /** تعديل شامل لبيانات مانجا */
  editManga: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().trim().min(1).max(500).optional(),
        description: z.string().max(10000).optional(),
        genres: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
        type: z.enum(["manga", "manhwa", "manhua"]).optional(),
        status: z.enum(["ongoing", "completed"]).optional(),
        coverUrl: z.string().trim().max(2000).optional(),
        isAdult: z.boolean().optional(),
        isTrending: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db.query.manga.findFirst({
        where: eq(manga.id, input.id),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المانجا غير موجودة" });
      }
      const { id, ...fields } = input;
      const patch: Partial<typeof manga.$inferInsert> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
      }
      if (Object.keys(patch).length) {
        await db.update(manga).set(patch).where(eq(manga.id, id));
      }
      await logAdminAction(ctx.user.id, "manga.edit", {
        targetType: "manga",
        targetId: id,
        meta: patch as Record<string, unknown>,
      });
      return db.query.manga.findFirst({ where: eq(manga.id, id) });
    }),

  hideManga: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(manga)
        .set({ hiddenAt: new Date() })
        .where(eq(manga.id, input.id));
      await logAdminAction(ctx.user.id, "manga.hide", {
        targetType: "manga",
        targetId: input.id,
      });
      return { success: true };
    }),

  unhideManga: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(manga)
        .set({ hiddenAt: null })
        .where(eq(manga.id, input.id));
      await logAdminAction(ctx.user.id, "manga.unhide", {
        targetType: "manga",
        targetId: input.id,
      });
      return { success: true };
    }),

  setFeatured: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(manga)
        .set({ featuredAt: new Date() })
        .where(eq(manga.id, input.id));
      await logAdminAction(ctx.user.id, "manga.feature", {
        targetType: "manga",
        targetId: input.id,
      });
      return { success: true };
    }),

  unsetFeatured: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(manga)
        .set({ featuredAt: null })
        .where(eq(manga.id, input.id));
      await logAdminAction(ctx.user.id, "manga.unfeature", {
        targetType: "manga",
        targetId: input.id,
      });
      return { success: true };
    }),

  /** غلاف مخصص يطغى على غلاف المصدر (coverOverrideUrl) */
  setCover: adminQuery
    .input(
      z.object({
        mangaId: z.number().int().positive(),
        url: z.string().trim().url().max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db.query.manga.findFirst({
        where: eq(manga.id, input.mangaId),
        columns: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المانجا غير موجودة" });
      }
      await db
        .update(manga)
        .set({ coverOverrideUrl: input.url })
        .where(eq(manga.id, input.mangaId));
      await logAdminAction(ctx.user.id, "manga.setCover", {
        targetType: "manga",
        targetId: input.mangaId,
        meta: { url: input.url },
      });
      return { success: true };
    }),

  /** أغلفة بديلة: نفس المانهوا (تطابق العنوان المُطبَّع) من مصادر أخرى */
  coverAlternatives: adminQuery
    .input(z.object({ mangaId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const current = await db.query.manga.findFirst({
        where: eq(manga.id, input.mangaId),
      });
      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المانجا غير موجودة" });
      }
      const norm = normalizeTitle(current.title);
      const all = await db
        .select({
          id: manga.id,
          title: manga.title,
          coverUrl: manga.coverUrl,
          sourceId: manga.sourceId,
        })
        .from(manga);
      return all
        .filter(
          (r) =>
            r.id !== current.id &&
            r.coverUrl &&
            normalizeTitle(r.title) === norm,
        )
        .map((r) => ({ mangaId: r.id, sourceId: r.sourceId, coverUrl: r.coverUrl }));
    }),

  /** إعادة استيراد فصول مانجا من مصدرها */
  rescrapeManga: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await refreshChapters(input.id);
        await logAdminAction(ctx.user.id, "manga.rescrape", {
          targetType: "manga",
          targetId: input.id,
          meta: result,
        });
        return { success: true, ...result };
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `فشل التحديث: ${(e as Error).message}`,
        });
      }
    }),

  /**
   * تشغيل دورة كتالوج يدوية: importCatalog لكل المصادر المفعّلة بنفس منطق
   * scraper-job في boot.ts. يعمل async (لا ينتظر الاكتمال) ويمنع التشغيل المتزامن.
   */
  triggerScrape: adminQuery
    .input(z.object({ source: z.string().trim().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
    if (scrapeRunning) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "دورة سكرابنغ تعمل حالياً — انتظر اكتمالها",
      });
    }
    const all = enabledScrapers().map((s) => s.name);
    const active = input?.source ? all.filter((n) => n === input.source) : all;
    if (!active.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: input?.source ? "المصدر غير مفعّل أو غير موجود" : "لا توجد مصادر مفعّلة",
      });
    }
    scrapeRunning = true;
    void (async () => {
      try {
        // تشغيل يدوي صريح من الأدمن — يتجاوز نافذة الحظر (تحكم الحظر بالتلقائي فقط)
        for (const name of active) {
          await scrapeOneSource(name, "manual", 1);
        }
        console.log("[admin] triggerScrape: اكتملت الدورة اليدوية.");
      } finally {
        scrapeRunning = false;
      }
    })();
    await logAdminAction(ctx.user.id, "scraper.trigger", {
      meta: { sources: active },
    });
    return { started: true, sources: active };
  }),

  /**
   * سكراب كامل للكتالوج: لكل مصدر مفعّل، ترقيم كامل (كل الصفحات، بلا سقف 150)
   * في الخلفية مع rate limiting — يرجع فوراً { started, sources }.
   */
  importFullCatalog: adminQuery
    .input(z.object({ source: z.string().trim().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
    if (scrapeRunning) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "دورة سكرابنغ تعمل حالياً — انتظر اكتمالها",
      });
    }
    const all = enabledScrapers().map((s) => s.name);
    const active = input?.source ? all.filter((n) => n === input.source) : all;
    if (!active.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: input?.source ? "المصدر غير مفعّل أو غير موجود" : "لا توجد مصادر مفعّلة",
      });
    }
    scrapeRunning = true;
    void (async () => {
      try {
        for (const name of active) {
          await scrapeOneSource(name, "manual", 1, { limit: 100000, maxPages: 500 });
        }
        console.log("[admin] importFullCatalog: اكتمل السكراب الكامل.");
      } finally {
        scrapeRunning = false;
      }
    })();
    await logAdminAction(ctx.user.id, "scraper.importFullCatalog", {
      meta: { sources: active },
    });
    return { started: true, sources: active };
  }),

  /** سجل دورات السكراب مع فلترة بالمصدر/الحالة وترقيم الصفحات */
  listScrapeJobs: adminQuery
    .input(
      z.object({
        source: z.string().trim().optional(),
        status: z.enum(["pending", "running", "completed", "failed"]).optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conds = [];
      if (input.source) conds.push(eq(scrapeJobs.source, input.source));
      if (input.status) conds.push(eq(scrapeJobs.status, input.status));
      const where = conds.length ? and(...conds) : undefined;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(scrapeJobs)
          .where(where)
          .orderBy(desc(scrapeJobs.id))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(scrapeJobs).where(where),
      ]);
      return { items: rows, total, page: input.page, limit: input.limit };
    }),

  /** إحصاءات الطابور: عمق الطابور (pending+running) وأداء كل مصدر (من صحّة المصادر) */
  scrapeJobStats: adminQuery.query(async () => {
    const db = getDb();
    const [[{ pending }], [{ running }], srcRows] = await Promise.all([
      db
        .select({ pending: count() })
        .from(scrapeJobs)
        .where(eq(scrapeJobs.status, "pending")),
      db
        .select({ running: count() })
        .from(scrapeJobs)
        .where(eq(scrapeJobs.status, "running")),
      db
        .select({
          name: sources.name,
          successCount: sources.successCount,
          errorCount: sources.errorCount,
          lastSuccessAt: sources.lastSuccessAt,
          lastRunAt: sources.lastRunAt,
          lastError: sources.lastError,
        })
        .from(sources)
        .orderBy(desc(sources.priority)),
    ]);
    return { queueDepth: pending + running, pending, running, sources: srcRows };
  }),

  /** إعادة تشغيل سكراب مصدر دورة فاشلة الآن (يدوياً) */
  retryScrapeJob: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const job = await db.query.scrapeJobs.findFirst({
        where: eq(scrapeJobs.id, input.id),
      });
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "الدورة غير موجودة" });
      if (scrapeRunning) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "دورة سكرابنغ تعمل حالياً — انتظر اكتمالها",
        });
      }
      scrapeRunning = true;
      void (async () => {
        try {
          await scrapeOneSource(job.source, "manual", 1);
        } finally {
          scrapeRunning = false;
        }
      })();
      await logAdminAction(ctx.user.id, "scraper.retry_job", {
        meta: { id: input.id, source: job.source },
      });
      return { started: true, source: job.source };
    }),

  /** قراءة نافذة حظر السكراب */
  getScrapeBlackout: adminQuery.query(async () => {
    const raw = await getSetting(SETTING_SCRAPE_BLACKOUT, "");
    if (!raw) return { enabled: false, startHour: 0, endHour: 0 };
    try {
      const v = JSON.parse(raw) as { startHour?: number; endHour?: number };
      return {
        enabled: typeof v.startHour === "number" && typeof v.endHour === "number",
        startHour: v.startHour ?? 0,
        endHour: v.endHour ?? 0,
      };
    } catch {
      return { enabled: false, startHour: 0, endHour: 0 };
    }
  }),

  /** ضبط/تعطيل نافذة حظر السكراب (بالساعة 0-23) */
  setScrapeBlackout: adminQuery
    .input(
      z.object({
        enabled: z.boolean(),
        startHour: z.number().int().min(0).max(23).default(0),
        endHour: z.number().int().min(0).max(23).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const value = input.enabled
        ? JSON.stringify({ startHour: input.startHour, endHour: input.endHour })
        : "";
      await setSetting(SETTING_SCRAPE_BLACKOUT, value);
      await logAdminAction(ctx.user.id, "scraper.blackout", { meta: input });
      return { success: true };
    }),

  /**
   * تصحيح الأغلفة والأوصاف: يمر على كل المانجا على دفعات في الخلفية،
   * يعيد جلب coverUrl + description من المصدر ويحدّثهما إن تغيّرا.
   * لا يمس coverUrl للمانجا التي لها coverOverrideUrl يدوي.
   */
  fixMetadata: adminQuery.mutation(async ({ ctx }) => {
    if (fixMetadataRunning) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "مهمة تصحيح بيانات تعمل حالياً — انتظر اكتمالها",
      });
    }
    const db = getDb();
    const [{ total }] = await db.select({ total: count() }).from(manga);
    fixMetadataRunning = true;
    const BATCH = 25;
    void (async () => {
      let scanned = 0;
      let updated = 0;
      let failed = 0;
      try {
        for (let offset = 0; ; offset += BATCH) {
          const rows = await getDb()
            .select({ manga: manga, source: sources })
            .from(manga)
            .innerJoin(sources, eq(manga.sourceId, sources.id))
            .orderBy(manga.id)
            .limit(BATCH)
            .offset(offset);
          if (!rows.length) break;
          for (const { manga: m, source } of rows) {
            scanned += 1;
            try {
              const scraper = getScraper(source.name);
              if (!scraper || !scraper.enabled || !m.sourceUrl) continue;
              const info = await scraper.getSeries(m.sourceUrl);
              const patch: { coverUrl?: string; description?: string } = {};
              if (
                !m.coverOverrideUrl &&
                info.cover &&
                info.cover !== m.coverUrl
              ) {
                patch.coverUrl = info.cover;
              }
              if (info.description && info.description !== m.description) {
                patch.description = info.description;
              }
              if (Object.keys(patch).length) {
                await getDb()
                  .update(manga)
                  .set(patch)
                  .where(eq(manga.id, m.id));
                updated += 1;
              }
            } catch (e) {
              failed += 1;
              console.warn(
                `[admin] fixMetadata(${m.id}) فشل: ${(e as Error).message}`,
              );
            }
          }
          console.log(
            `[admin] fixMetadata: ${scanned}/${total} — حُدّثت ${updated}، فشلت ${failed}`,
          );
        }
        console.log(
          `[admin] fixMetadata اكتمل: فُحصت ${scanned}، حُدّثت ${updated}، فشلت ${failed}`,
        );
      } finally {
        fixMetadataRunning = false;
      }
    })();
    await logAdminAction(ctx.user.id, "scraper.fixMetadata", {
      meta: { total },
    });
    return { started: true, total };
  }),

  // ================= طلبات التحديث =================

  listUpdateRequests: adminQuery
    .input(
      z.object({
        status: z.enum(["pending", "resolved"]).default("pending"),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = eq(updateRequests.status, input.status);
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            request: updateRequests,
            user: { id: users.id, name: users.name, username: users.username },
            manga: { id: manga.id, title: manga.title, slug: manga.slug },
          })
          .from(updateRequests)
          .innerJoin(users, eq(updateRequests.userId, users.id))
          .innerJoin(manga, eq(updateRequests.mangaId, manga.id))
          .where(where)
          .orderBy(desc(updateRequests.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(updateRequests).where(where),
      ]);
      return {
        items: rows.map((r) => ({ ...r.request, user: r.user, manga: r.manga })),
        total,
        page: input.page,
        limit: input.limit,
      };
    }),

  resolveUpdateRequest: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db.query.updateRequests.findFirst({
        where: eq(updateRequests.id, input.id),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
      }
      await db
        .update(updateRequests)
        .set({ status: "resolved" })
        .where(eq(updateRequests.id, input.id));
      await logAdminAction(ctx.user.id, "update_request.resolve", {
        targetType: "update_request",
        targetId: input.id,
        meta: { mangaId: existing.mangaId },
      });
      return { success: true };
    }),

  // ================= فلتر الكلمات المحظورة =================

  getBannedWords: adminQuery.query(async () => ({
    words: await bannedWords(),
  })),

  setBannedWords: adminQuery
    .input(
      z.object({ words: z.array(z.string().trim().min(1).max(100)).max(500) }),
    )
    .mutation(async ({ ctx, input }) => {
      await setSetting(SETTING_BANNED_WORDS, input.words.join(","));
      await logAdminAction(ctx.user.id, "settings.banned_words", {
        meta: { count: input.words.length },
      });
      return { success: true, count: input.words.length };
    }),

  // ================= وضع الصيانة =================

  getMaintenance: adminQuery.query(async () => {
    const [mode, message] = await Promise.all([
      getSetting(SETTING_MAINTENANCE_MODE, "0"),
      getSetting(SETTING_MAINTENANCE_MESSAGE, ""),
    ]);
    return { enabled: mode === "1", message: message ?? "" };
  }),

  setMaintenance: adminQuery
    .input(
      z.object({
        enabled: z.boolean(),
        message: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await setSetting(SETTING_MAINTENANCE_MODE, input.enabled ? "1" : "0");
      if (input.message !== undefined) {
        await setSetting(SETTING_MAINTENANCE_MESSAGE, input.message);
      }
      await logAdminAction(ctx.user.id, "settings.maintenance", {
        meta: { enabled: input.enabled },
      });
      return { success: true };
    }),

  // ================= سجل عمليات الأدمن =================

  adminLogs: adminQuery
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            log: adminLogs,
            admin: { id: users.id, name: users.name, username: users.username },
          })
          .from(adminLogs)
          .innerJoin(users, eq(adminLogs.adminId, users.id))
          .orderBy(desc(adminLogs.id))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(adminLogs),
      ]);
      return {
        items: rows.map((r) => ({ ...r.log, admin: r.admin })),
        total,
        page: input.page,
        limit: input.limit,
      };
    }),
});
