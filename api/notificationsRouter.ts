/**
 * راوتر الإشعارات الموحّد — عقد بسيط للواجهة (جرس + قائمة).
 * يلف على جدول notifications المشترك (المصدر: communities/importer).
 */
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { notifications } from "@db/schema";
import { getDb } from "./queries/connection";
import { authedQuery, createRouter } from "./middleware";

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
});
