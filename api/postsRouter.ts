/**
 * بوستات الأعضاء في قسم Fun — نشر نصّي + صورة اختيارية + إعجابات.
 */
import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { postLikes, posts, users } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { checkRateLimit, clientIp } from "./lib/rateLimit";

export const postsRouter = createRouter({
  /** خلاصة البوستات — الأحدث أولاً مع بيانات الكاتب وعدّاد الإعجابات */
  feed: publicQuery
    .input(
      z
        .object({
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(30).default(15),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 15;
      const db = getDb();
      const rows = await db
        .select({
          id: posts.id,
          body: posts.body,
          imageUrl: posts.imageUrl,
          createdAt: posts.createdAt,
          userId: posts.userId,
          authorName: users.name,
          authorUsername: users.username,
          authorAvatar: users.avatarUrl,
        })
        .from(posts)
        .innerJoin(users, eq(posts.userId, users.id))
        .where(eq(posts.hidden, false))
        .orderBy(desc(posts.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);

      if (!rows.length) return { items: [] };
      const ids = rows.map((r) => r.id);

      // عدّاد الإعجابات لكل بوست
      const likeCounts = await db
        .select({ postId: postLikes.postId, c: sql<number>`COUNT(*)` })
        .from(postLikes)
        .where(inArray(postLikes.postId, ids))
        .groupBy(postLikes.postId);
      const countBy = new Map(likeCounts.map((l) => [Number(l.postId), Number(l.c)]));

      // إعجاباتي أنا
      let myLikes = new Set<number>();
      if (ctx.user) {
        const mine = await db
          .select({ postId: postLikes.postId })
          .from(postLikes)
          .where(and(eq(postLikes.userId, ctx.user.id), inArray(postLikes.postId, ids)));
        myLikes = new Set(mine.map((m) => Number(m.postId)));
      }

      return {
        items: rows.map((r) => ({
          id: r.id,
          body: r.body,
          imageUrl: r.imageUrl,
          createdAt: r.createdAt,
          author: {
            id: r.userId,
            name: r.authorName,
            username: r.authorUsername,
            avatarUrl: r.authorAvatar,
          },
          likes: countBy.get(r.id) ?? 0,
          liked: myLikes.has(r.id),
          mine: ctx.user?.id === r.userId,
        })),
      };
    }),

  /** نشر بوست جديد */
  create: authedQuery
    .input(
      z.object({
        body: z.string().trim().min(1).max(1000),
        imageUrl: z.string().trim().url().max(500).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ip = clientIp(ctx.req);
      if (!checkRateLimit(`post:create:${ctx.user.id}:${ip}`, 10, 10 * 60 * 1000)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "نشرت كثيراً — جرّب بعد قليل" });
      }
      const db = getDb();
      const [{ id }] = await db
        .insert(posts)
        .values({ userId: ctx.user.id, body: input.body, imageUrl: input.imageUrl ?? null })
        .$returningId();
      return { id, success: true as const };
    }),

  /** إعجاب/إلغاء إعجاب */
  toggleLike: authedQuery
    .input(z.object({ postId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [existing] = await db
        .select({ postId: postLikes.postId })
        .from(postLikes)
        .where(and(eq(postLikes.postId, input.postId), eq(postLikes.userId, ctx.user.id)))
        .limit(1);
      if (existing) {
        await db
          .delete(postLikes)
          .where(and(eq(postLikes.postId, input.postId), eq(postLikes.userId, ctx.user.id)));
        return { liked: false };
      }
      await db
        .insert(postLikes)
        .values({ postId: input.postId, userId: ctx.user.id })
        .onDuplicateKeyUpdate({ set: { userId: ctx.user.id } });
      return { liked: true };
    }),

  /** حذف بوست (صاحبه أو أدمن) */
  remove: authedQuery
    .input(z.object({ postId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [post] = await db
        .select({ userId: posts.userId })
        .from(posts)
        .where(eq(posts.id, input.postId))
        .limit(1);
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });
      if (post.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "غير مسموح" });
      }
      await db.delete(posts).where(eq(posts.id, input.postId));
      return { success: true as const };
    }),
});
