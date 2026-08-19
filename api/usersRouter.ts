/**
 * ملفات المستخدمين العامة + نظام المتابعة (follow).
 * publicProfile: بيانات مستخدم عام + إحصاءاته + نشاطه الأخير + حالة متابعتي له.
 */
import { z } from "zod";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { comments, manga, postLikes, posts, userFollows, users } from "@db/schema";
import { coinTransactions, coinWallets, chapterCompletions } from "@db/schemaCoins";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery, authedQuery } from "./middleware";

/** يحوّل username إلى id، أو NOT_FOUND */
async function userIdByUsername(username: string): Promise<number> {
  const [u] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
  return u.id;
}

export const usersRouter = createRouter({
  /** ملف عام لمستخدم عبر اسم المستخدم */
  publicProfile: publicQuery
    .input(z.object({ username: z.string().trim().min(1).max(32) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const [user] = await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          avatarUrl: users.avatarUrl,
          bannerUrl: users.bannerUrl,
          socialLinks: users.socialLinks,
          createdAt: users.createdAt,
          premiumUntil: users.premiumUntil,
        })
        .from(users)
        .where(eq(users.username, input.username))
        .limit(1);
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
      }

      const [wallet] = await db
        .select({
          coins: coinWallets.coins,
          xp: coinWallets.xp,
          level: coinWallets.level,
          streakDays: coinWallets.streakDays,
        })
        .from(coinWallets)
        .where(eq(coinWallets.userId, user.id))
        .limit(1);

      const [[{ chaptersRead }], [{ commentsCount }], [{ followers }], [{ following }]] =
        await Promise.all([
          db
            .select({ chaptersRead: count() })
            .from(chapterCompletions)
            .where(eq(chapterCompletions.userId, user.id)),
          db.select({ commentsCount: count() }).from(comments).where(eq(comments.userId, user.id)),
          db
            .select({ followers: count() })
            .from(userFollows)
            .where(eq(userFollows.followingId, user.id)),
          db
            .select({ following: count() })
            .from(userFollows)
            .where(eq(userFollows.followerId, user.id)),
        ]);

      let isFollowing = false;
      if (ctx.user && ctx.user.id !== user.id) {
        const [row] = await db
          .select({ f: userFollows.followerId })
          .from(userFollows)
          .where(
            and(
              eq(userFollows.followerId, ctx.user.id),
              eq(userFollows.followingId, user.id),
            ),
          )
          .limit(1);
        isFollowing = !!row;
      }

      const activity = await db
        .select({
          kind: coinTransactions.kind,
          amount: coinTransactions.amount,
          createdAt: coinTransactions.createdAt,
        })
        .from(coinTransactions)
        .where(eq(coinTransactions.userId, user.id))
        .orderBy(desc(coinTransactions.createdAt))
        .limit(15);

      const isPremium = !!user.premiumUntil && new Date(user.premiumUntil) > new Date();
      return {
        user,
        isPremium,
        isSelf: ctx.user?.id === user.id,
        isFollowing,
        wallet: {
          coins: wallet?.coins ?? 0,
          xp: wallet?.xp ?? 0,
          level: wallet?.level ?? 1,
          streakDays: wallet?.streakDays ?? 0,
        },
        stats: {
          chaptersRead: Number(chaptersRead ?? 0),
          comments: Number(commentsCount ?? 0),
          followers: Number(followers ?? 0),
          following: Number(following ?? 0),
        },
        activity,
      };
    }),

  /** تعليقات/مراجعات المستخدم العامة (مع رابط المانجا) */
  userComments: publicQuery
    .input(
      z.object({
        username: z.string().trim().min(1).max(32),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const uid = await userIdByUsername(input.username);
      const where = eq(comments.userId, uid);
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            id: comments.id,
            content: comments.content,
            stars: comments.stars,
            createdAt: comments.createdAt,
            mangaSlug: manga.slug,
            mangaTitle: manga.title,
          })
          .from(comments)
          .innerJoin(manga, eq(comments.mangaId, manga.id))
          .where(where)
          .orderBy(desc(comments.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(comments).where(where),
      ]);
      return { items: rows, total, page: input.page };
    }),

  /** منشورات المستخدم في قسم Fun */
  userPosts: publicQuery
    .input(
      z.object({
        username: z.string().trim().min(1).max(32),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const uid = await userIdByUsername(input.username);
      const where = and(eq(posts.userId, uid), eq(posts.hidden, false));
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            id: posts.id,
            body: posts.body,
            imageUrl: posts.imageUrl,
            createdAt: posts.createdAt,
          })
          .from(posts)
          .where(where)
          .orderBy(desc(posts.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(posts).where(where),
      ]);
      const ids = rows.map((r) => r.id);
      const likeMap = new Map<number, number>();
      if (ids.length > 0) {
        const agg = await db
          .select({ postId: postLikes.postId, c: count() })
          .from(postLikes)
          .where(inArray(postLikes.postId, ids))
          .groupBy(postLikes.postId);
        for (const a of agg) likeMap.set(a.postId, Number(a.c));
      }
      return {
        items: rows.map((r) => ({ ...r, likes: likeMap.get(r.id) ?? 0 })),
        total,
        page: input.page,
      };
    }),

  /** قائمة المتابِعين أو مَن يتابعهم المستخدم */
  followList: publicQuery
    .input(
      z.object({
        username: z.string().trim().min(1).max(32),
        kind: z.enum(["followers", "following"]),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const uid = await userIdByUsername(input.username);
      const rows =
        input.kind === "followers"
          ? await db
              .select({
                id: users.id,
                name: users.name,
                username: users.username,
                avatarUrl: users.avatarUrl,
              })
              .from(userFollows)
              .innerJoin(users, eq(userFollows.followerId, users.id))
              .where(eq(userFollows.followingId, uid))
              .orderBy(desc(userFollows.createdAt))
              .limit(input.limit)
          : await db
              .select({
                id: users.id,
                name: users.name,
                username: users.username,
                avatarUrl: users.avatarUrl,
              })
              .from(userFollows)
              .innerJoin(users, eq(userFollows.followingId, users.id))
              .where(eq(userFollows.followerId, uid))
              .orderBy(desc(userFollows.createdAt))
              .limit(input.limit);
      return { items: rows };
    }),

  /** تحديث روابط السوشيال الخاصة بي */
  updateSocialLinks: authedQuery
    .input(
      z.object({
        links: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(40),
              url: z.string().trim().url().max(300),
            }),
          )
          .max(8),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(users)
        .set({ socialLinks: input.links })
        .where(eq(users.id, ctx.user.id));
      return { success: true as const };
    }),

  /** متابعة مستخدم */
  follow: authedQuery
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.id === input.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكنك متابعة نفسك" });
      }
      const db = getDb();
      await db
        .insert(userFollows)
        .values({ followerId: ctx.user.id, followingId: input.userId })
        .onDuplicateKeyUpdate({ set: { followingId: input.userId } });
      return { success: true as const, following: true };
    }),

  /** إلغاء المتابعة */
  unfollow: authedQuery
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(userFollows)
        .where(
          and(
            eq(userFollows.followerId, ctx.user.id),
            eq(userFollows.followingId, input.userId),
          ),
        );
      return { success: true as const, following: false };
    }),
});
