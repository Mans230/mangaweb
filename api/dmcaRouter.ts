import { z } from "zod";
import { count, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { dmcaRequests, manga, users } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import { checkRateLimit, clientIp } from "./lib/rateLimit";
import { logAdminAction } from "./lib/adminLog";

/** حالات طلب DMCA: جديد | قيد المراجعة | أُزيل المحتوى | مرفوض */
const dmcaStatusEnum = z.enum(["pending", "reviewing", "actioned", "rejected"]);

export const dmcaRouter = createRouter({
  /**
   * تقديم بلاغ DMCA من صاحب الحق (عام — بلا تسجيل دخول).
   * محمي بحدّ معدّل: 3 بلاغات لكل IP كل ساعة لتقليل السبام.
   */
  submit: publicQuery
    .input(
      z.object({
        claimantName: z.string().trim().min(2).max(200),
        claimantEmail: z.string().trim().email().max(200),
        company: z.string().trim().max(200).optional(),
        mangaId: z.number().int().positive().optional(),
        targetUrl: z.string().trim().url().max(500),
        workDescription: z.string().trim().min(10).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ip = clientIp(ctx.req);
      if (!checkRateLimit(`dmca:${ip}`, 3, 60 * 60 * 1000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "لقد أرسلت بلاغات كثيرة. حاول لاحقاً.",
        });
      }
      const db = getDb();
      await db.insert(dmcaRequests).values({
        claimantName: input.claimantName,
        claimantEmail: input.claimantEmail,
        company: input.company ?? null,
        mangaId: input.mangaId ?? null,
        targetUrl: input.targetUrl,
        workDescription: input.workDescription,
        status: "pending",
      });
      return { success: true };
    }),

  /** قائمة الطلبات مع فلتر الحالة والصفحات — مع بيانات المانجا والمعالِج */
  list: adminQuery
    .input(
      z.object({
        status: dmcaStatusEnum.optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = input.status ? eq(dmcaRequests.status, input.status) : undefined;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            request: dmcaRequests,
            manga: { id: manga.id, title: manga.title, slug: manga.slug },
            handler: { id: users.id, name: users.name, username: users.username },
          })
          .from(dmcaRequests)
          .leftJoin(manga, eq(dmcaRequests.mangaId, manga.id))
          .leftJoin(users, eq(dmcaRequests.handledBy, users.id))
          .where(where)
          .orderBy(desc(dmcaRequests.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(dmcaRequests).where(where),
      ]);
      return { items: rows, total, page: input.page, limit: input.limit };
    }),

  /** عدد الطلبات المعلّقة — لشارة التبويب */
  pendingCount: adminQuery.query(async () => {
    const db = getDb();
    const [{ total }] = await db
      .select({ total: count() })
      .from(dmcaRequests)
      .where(eq(dmcaRequests.status, "pending"));
    return total;
  }),

  /** تحديث حالة طلب + ملاحظة/قرار، ويسجّل المعالِج */
  updateStatus: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        status: dmcaStatusEnum,
        notes: z.string().trim().max(5000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db.query.dmcaRequests.findFirst({
        where: eq(dmcaRequests.id, input.id),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود" });
      }
      await db
        .update(dmcaRequests)
        .set({
          status: input.status,
          notes: input.notes ?? existing.notes,
          handledBy: ctx.user.id,
        })
        .where(eq(dmcaRequests.id, input.id));
      await logAdminAction(ctx.user.id, "dmca.update_status", {
        meta: { id: input.id, status: input.status },
      });
      return { success: true };
    }),

  /** حذف طلب نهائياً */
  remove: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.delete(dmcaRequests).where(eq(dmcaRequests.id, input.id));
      await logAdminAction(ctx.user.id, "dmca.remove", { meta: { id: input.id } });
      return { success: true };
    }),
});
