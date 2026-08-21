/**
 * راوتر الإشعارات الموحّد — عقد بسيط للواجهة (جرس + قائمة).
 * يلف على جدول notifications المشترك (المصدر: communities/importer).
 */
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  follows,
  notifications,
  notificationTemplates,
  users,
} from "@db/schema";
import { getDb } from "./queries/connection";
import { adminQuery, authedQuery, createRouter } from "./middleware";
import { logAdminAction } from "./lib/adminLog";

export const notificationsRouter = createRouter({
  /** قائمة إشعارات المستخدم + عداد غير المقروء */
  list: authedQuery
    .input(
      z
        .object({ limit: z.number().int().min(1).max(50).default(30) })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const limit = input?.limit ?? 30;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(notifications)
          .where(eq(notifications.userId, ctx.user.id))
          .orderBy(desc(notifications.id))
          .limit(limit),
        db
          .select({ total: count() })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, ctx.user.id),
              isNull(notifications.readAt),
            ),
          ),
      ]);
      const items = rows.map((n) => {
        const p = n.payload ?? {};
        let title: string;
        let body: string;
        switch (n.type) {
          case "new_chapter":
            title = `فصل جديد: ${p.mangaTitle ?? "مانهوا"}`;
            body = `نزل الفصل ${p.chapterNumber ?? ""} — اضغط للقراءة`;
            break;
          case "mention":
            title = `${p.fromUsername ? `@${p.fromUsername} ` : ""}ذكرك في ${p.communityName ?? "مجتمع"}`;
            body = p.excerpt ?? "";
            break;
          case "reel_approved":
            title = "تم قبول الريل الخاص بك";
            body = p.excerpt ?? "أصبح ظاهراً الآن في قسم الريلز";
            break;
          case "ticket_reply":
            title = `رد على تذكرتك: ${p.subject ?? "تذكرة دعم"}`;
            body = p.excerpt ?? "";
            break;
          case "reel_rejected":
            title = "تم رفض الريل الخاص بك";
            body = p.excerpt ? `السبب: ${p.excerpt}` : "";
            break;
          default:
            title = p.title ?? "إشعار";
            body = p.body ?? p.excerpt ?? "";
        }
        return {
          id: n.id,
          type: n.type,
          title,
          body,
          mangaId: p.mangaId ?? null,
          mangaSlug: p.mangaSlug ?? null,
          communitySlug: p.communitySlug ?? null,
          chapterId: p.chapterId ?? null,
          chapterNumber: p.chapterNumber ?? null,
          ticketId: p.ticketId ?? null,
          readAt: n.readAt ? n.readAt.toISOString() : null,
          createdAt: n.createdAt.toISOString(),
        };
      });
      return { items, unreadCount: total };
    }),

  /** تعليم إشعار (أو الكل بدون id) كمقروء */
  markRead: authedQuery
    .input(z.object({ id: z.number().int().positive().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.userId, ctx.user.id),
            isNull(notifications.readAt),
            input.id ? eq(notifications.id, input.id) : undefined,
          ),
        );
      return { success: true as const };
    }),

  // ================= إدارة القوالب والبث (أدمن) =================

  /** قائمة قوالب الإشعارات */
  adminListTemplates: adminQuery.query(() =>
    getDb()
      .select()
      .from(notificationTemplates)
      .orderBy(desc(notificationTemplates.id)),
  ),

  /** إنشاء قالب */
  adminCreateTemplate: adminQuery
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        title: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getDb().insert(notificationTemplates).values(input);
      await logAdminAction(ctx.user.id, "notif.template_create", { meta: input });
      return { success: true as const };
    }),

  /** تعديل قالب */
  adminUpdateTemplate: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(120),
        title: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(500),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await getDb()
        .update(notificationTemplates)
        .set(rest)
        .where(eq(notificationTemplates.id, id));
      return { success: true as const };
    }),

  /** حذف قالب */
  adminDeleteTemplate: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await getDb()
        .delete(notificationTemplates)
        .where(eq(notificationTemplates.id, input.id));
      return { success: true as const };
    }),

  /**
   * بثّ إشعار لجمهور مستهدف:
   * all = كل المستخدمين · premium = مشتركو البريميوم الساريون ·
   * manga_followers = متابعو مانجا محدّدة (mangaId مطلوب).
   * يُدرَج صفّ واحد لكل مستخدم على دفعات 500 لتفادي استعلام ضخم.
   */
  adminBroadcast: adminQuery
    .input(
      z
        .object({
          title: z.string().trim().min(1).max(200),
          body: z.string().trim().min(1).max(500),
          target: z.enum(["all", "premium", "manga_followers"]),
          mangaId: z.number().int().positive().optional(),
        })
        .refine((v) => v.target !== "manga_followers" || v.mangaId !== undefined, {
          message: "mangaId مطلوب عند استهداف متابعي مانجا",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      let userIds: number[];
      if (input.target === "premium") {
        const rows = await db
          .select({ id: users.id })
          .from(users)
          .where(gt(users.premiumUntil, new Date()));
        userIds = rows.map((r) => r.id);
      } else if (input.target === "manga_followers") {
        const rows = await db
          .select({ userId: follows.userId })
          .from(follows)
          .where(eq(follows.mangaId, input.mangaId!));
        userIds = [...new Set(rows.map((r) => r.userId))];
      } else {
        const rows = await db.select({ id: users.id }).from(users);
        userIds = rows.map((r) => r.id);
      }

      const payload = { title: input.title, body: input.body };
      const CHUNK = 500;
      for (let i = 0; i < userIds.length; i += CHUNK) {
        const slice = userIds.slice(i, i + CHUNK);
        if (slice.length === 0) continue;
        await db.insert(notifications).values(
          slice.map((userId) => ({
            userId,
            type: "announcement" as const,
            payload,
          })),
        );
      }
      await logAdminAction(ctx.user.id, "notif.broadcast", {
        meta: { target: input.target, mangaId: input.mangaId, count: userIds.length },
      });
      return { success: true as const, count: userIds.length };
    }),
});
