import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { chapters } from "@db/schema";
import { coinTransactions } from "@db/schemaCoins";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery } from "./middleware";
import { checkRateLimit, clientIp } from "./lib/rateLimit";
import {
  coinsEarnedToday,
  coinSettingInt,
  COIN_SETTING_KEYS,
  completeChapter,
  dailyCheckin,
  getMissions,
  claimMission,
  luckySpin,
  referralInfo,
  getOrCreateWallet,
} from "./lib/coins";

function assertCoinsRateLimit(action: string, req: Request) {
  const key = `coins:${action}:${clientIp(req)}`;
  if (!checkRateLimit(key, 20, 60 * 1000)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "محاولات كثيرة، جرب بعد شوية",
    });
  }
}

export const coinsRouter = createRouter({
  /** المحفظة: الرصيد + XP + المستوى + الستريك + حالة اليوم */
  wallet: authedQuery.query(async ({ ctx }) => {
    const w = await getOrCreateWallet(Number(ctx.user.id));
    const todayEarned = await coinsEarnedToday(Number(ctx.user.id), "read");
    const dailyCap = await coinSettingInt(COIN_SETTING_KEYS.dailyCap);
    const perChapter = await coinSettingInt(COIN_SETTING_KEYS.perChapter);
    const xpPerLevel = await coinSettingInt(COIN_SETTING_KEYS.xpPerLevel);
    const today = new Date().toISOString().slice(0, 10);
    return {
      coins: w.coins,
      xp: w.xp,
      level: w.level,
      xpProgress: w.xp % Math.max(xpPerLevel, 1),
      xpPerLevel,
      streakDays: w.streakDays,
      checkinDays: w.checkinDays,
      canCheckin: w.lastCheckinDate !== today,
      canSpin: w.lastSpinDate !== today,
      read: { perChapter, dailyCap, todayEarned },
    };
  }),

  /** تسجيل الدخول اليومي */
  checkin: authedQuery.mutation(async ({ ctx }) => {
    assertCoinsRateLimit("checkin", ctx.req);
    const res = await dailyCheckin(Number(ctx.user.id));
    if (!res.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "سجّلت حضورك النهاردة بالفعل — تعالى بكرة",
      });
    }
    return res;
  }),

  /**
   * إكمال فصل — يناديه القارئ عند وصول آخر صفحة.
   * أول إكمال فقط يمنح كوينز/XP؛ الستريك يتحدث مع أي قراءة.
   */
  completeChapter: authedQuery
    .input(
      z.object({
        mangaId: z.number().int().positive(),
        chapterId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertCoinsRateLimit("complete", ctx.req);
      const chapter = await getDb().query.chapters.findFirst({
        where: eq(chapters.id, input.chapterId),
        columns: { id: true, mangaId: true },
      });
      if (!chapter || Number(chapter.mangaId) !== input.mangaId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الفصل غير موجود" });
      }
      return completeChapter(Number(ctx.user.id), input.mangaId, input.chapterId);
    }),

  /** سجل العمليات (الأحدث أولاً) */
  transactions: authedQuery
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await getDb()
        .select()
        .from(coinTransactions)
        .where(eq(coinTransactions.userId, ctx.user.id))
        .orderBy(desc(coinTransactions.createdAt))
        .limit(input.limit)
        .offset((input.page - 1) * input.limit);
      return { items: rows, page: input.page };
    }),

  /** المهام اليومية الأربع مع التقدم وحالة الاستلام */
  missions: authedQuery.query(async ({ ctx }) => {
    return { items: await getMissions(Number(ctx.user.id)) };
  }),

  /** استلام مكافأة مهمة مكتملة */
  claimMission: authedQuery
    .input(z.object({ key: z.enum(["read", "comment", "rate", "library"]) }))
    .mutation(async ({ ctx, input }) => {
      assertCoinsRateLimit("claim_mission", ctx.req);
      const res = await claimMission(Number(ctx.user.id), input.key);
      if (!res.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "المهمة لم تكتمل بعد أو تم استلامها",
        });
      }
      return res;
    }),

  /** عجلة الحظ — لفة واحدة يومياً */
  spin: authedQuery.mutation(async ({ ctx }) => {
    assertCoinsRateLimit("spin", ctx.req);
    const res = await luckySpin(Number(ctx.user.id));
    if (!res.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "لفّيت العجلة النهاردة — تعالى بكرة",
      });
    }
    return res;
  }),

  /** معلومات الإحالة: الكود + العدادات + المكافآت الحالية */
  referralInfo: authedQuery.query(async ({ ctx }) => {
    return referralInfo(Number(ctx.user.id));
  }),
});
