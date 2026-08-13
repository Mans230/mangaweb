import { z } from "zod";
import { and, count, desc, eq, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  bannedIps,
  chapters,
  comments,
  favorites,
  follows,
  manga,
  ratings,
  readingProgress,
  requests,
  sources,
  users,
} from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, adminQuery } from "./middleware";
import { enabledScrapers } from "./scrapers";
import {
  fixMissingCovers,
  importSeries,
  normalizeTitle,
} from "./services/importer";
import { invalidateIpBanCache } from "./lib/ipBan";

const sourceStatusEnum = z.enum(["active", "paused", "blocked"]);
const requestStatusEnum = z.enum(["pending", "added", "rejected"]);

export const adminRouter = createRouter({
  stats: adminQuery.query(async () => {
    const db = getDb();
    const [[m], [c], [u], [r], [rp]] = await Promise.all([
      db.select({ total: count() }).from(manga),
      db.select({ total: count() }).from(chapters),
      db.select({ total: count() }).from(users),
      db.select({ total: count() }).from(requests),
      db
        .select({ total: count() })
        .from(requests)
        .where(eq(requests.status, "pending")),
    ]);
    return {
      manga: m.total,
      chapters: c.total,
      users: u.total,
      requests: r.total,
      pendingRequests: rp.total,
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
      const allSources = await db.select().from(sources);
      let hostname = "";
      try {
        hostname = new URL(input.url).hostname.replace(/^www\./, "");
      } catch {
        hostname = "";
      }
      const matched = allSources.find((s) => {
        try {
          return (
            new URL(s.baseUrl).hostname.replace(/^www\./, "") === hostname
          );
        } catch {
          return false;
        }
      });

      // Actual scraping is handled by an external service — register the request here.
      const [{ id }] = await db
        .insert(requests)
        .values({
          userId: ctx.user.id,
          title: input.title ?? input.url,
          sourceUrl: input.url,
          note:
            input.note ??
            `admin import via ${matched?.name ?? "unknown source"} (pending scraper)`,
        })
        .$returningId();

      return { requestId: id, matchedSource: matched ?? null };
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
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .insert(bannedIps)
        .values({ ip: input.ip, reason: input.reason ?? null })
        .onDuplicateKeyUpdate({ set: { reason: input.reason ?? null } });
      invalidateIpBanCache();
      return { success: true };
    }),

  unbanIp: adminQuery
    .input(z.object({ ip: z.string().trim().min(3).max(45) }))
    .mutation(async ({ input }) => {
      await getDb().delete(bannedIps).where(eq(bannedIps.ip, input.ip));
      invalidateIpBanCache();
      return { success: true };
    }),

  listBans: adminQuery.query(() =>
    getDb().select().from(bannedIps).orderBy(desc(bannedIps.createdAt)),
  ),

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
});
