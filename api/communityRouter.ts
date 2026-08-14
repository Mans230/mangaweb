import { z } from "zod";
import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { communityMessages, manga, users } from "@db/schema";
import { getDb } from "./queries/connection";
import { checkRateLimit, clientIp } from "./lib/rateLimit";
import { isMangaCommunitiesEnabled } from "./lib/siteSettings";
import { containsBannedWord } from "./lib/wordFilter";
import { createRouter, authedQuery, publicQuery } from "./middleware";

/** عند تعطيل مجتمعات المانجا تصبح أرشيفاً للقراءة فقط — تُحظر كل الكتابات */
async function assertMangaCommunityWritable(): Promise<void> {
  if (!(await isMangaCommunitiesEnabled())) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "مجتمعات المانجا معطّلة حالياً — القراءة فقط",
    });
  }
}

const userCard = {
  id: users.id,
  name: users.name,
  username: users.username,
  avatarUrl: users.avatarUrl,
} as const;

export const communityRouter = createRouter({
  /** نشر رسالة في مجتمع مانجا — rate limit: 10 رسائل / دقيقة / IP */
  postMessage: authedQuery
    .input(
      z.object({
        mangaId: z.number().int().positive(),
        body: z.string().trim().min(1, "الرسالة فارغة").max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMangaCommunityWritable();
      if (await containsBannedWord(input.body)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "الرسالة تحتوي كلمات مخالفة",
        });
      }
      if (!checkRateLimit(`community:${clientIp(ctx.req)}`, 10, 60 * 1000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "ترسل رسائل بسرعة كبيرة، جرب بعد شوية",
        });
      }
      const db = getDb();
      const exists = await db.query.manga.findFirst({
        where: eq(manga.id, input.mangaId),
        columns: { id: true },
      });
      if (!exists) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المانجا غير موجودة" });
      }
      const [{ id }] = await db
        .insert(communityMessages)
        .values({ mangaId: input.mangaId, userId: ctx.user.id, body: input.body })
        .$returningId();
      const [row] = await db
        .select({ message: communityMessages, user: userCard })
        .from(communityMessages)
        .innerJoin(users, eq(communityMessages.userId, users.id))
        .where(eq(communityMessages.id, id))
        .limit(1);
      return row ? { ...row.message, user: row.user } : null;
    }),

  /**
   * رسائل مجتمع مانجا — صالحة للـ polling:
   *  - الوضع الافتراضي: أحدث limit رسالة (تنازلي بالـ id)، مع beforeId للتمرير للأسفل.
   *  - afterId: الرسائل الأحدث من id المعطى (تصاعدي) — لجلب الجديد أثناء الـ polling.
   */
  listMessages: publicQuery
    .input(
      z.object({
        mangaId: z.number().int().positive(),
        beforeId: z.number().int().positive().optional(),
        afterId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(50).default(50),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conditions = [eq(communityMessages.mangaId, input.mangaId)];
      if (input.beforeId !== undefined) {
        conditions.push(lt(communityMessages.id, input.beforeId));
      }
      if (input.afterId !== undefined) {
        conditions.push(gt(communityMessages.id, input.afterId));
      }
      const rows = await db
        .select({ message: communityMessages, user: userCard })
        .from(communityMessages)
        .innerJoin(users, eq(communityMessages.userId, users.id))
        .where(and(...conditions))
        .orderBy(
          input.afterId !== undefined
            ? asc(communityMessages.id)
            : desc(communityMessages.id),
        )
        .limit(input.limit);
      return rows.map((r) => ({ ...r.message, user: r.user }));
    }),

  /** حذف رسالة — صاحبها أو الأدمن فقط */
  deleteMessage: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertMangaCommunityWritable();
      const db = getDb();
      const message = await db.query.communityMessages.findFirst({
        where: eq(communityMessages.id, input.id),
      });
      if (!message) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الرسالة غير موجودة" });
      }
      if (message.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لا يمكنك حذف رسالة ليست لك",
        });
      }
      await db
        .delete(communityMessages)
        .where(eq(communityMessages.id, input.id));
      return { success: true };
    }),
});
