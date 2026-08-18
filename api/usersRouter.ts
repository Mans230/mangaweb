/**
 * ملفات المستخدمين العامة + نظام المتابعة (follow).
 * publicProfile: بيانات مستخدم عام + إحصاءاته + نشاطه الأخير + حالة متابعتي له.
 */
import { z } from "zod";
import { and, count, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { comments, userFollows, users } from "@db/schema";
import { coinTransactions, coinWallets, chapterCompletions } from "@db/schemaCoins";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery, authedQuery } from "./middleware";

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
