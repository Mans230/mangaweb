import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { coinWallets } from "@db/schemaCoins";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { checkRateLimit, clientIp } from "./lib/rateLimit";
import { getOrCreateWallet } from "./lib/coins";
import {
  buyItem,
  equipItem,
  listShopItems,
  myPurchases,
  weeklyLeaderboard,
} from "./lib/shop";

function assertShopRateLimit(action: string, req: Request) {
  const key = `shop:${action}:${clientIp(req)}`;
  if (!checkRateLimit(key, 20, 60 * 1000)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "محاولات كثيرة، جرب بعد شوية",
    });
  }
}

export const shopRouter = createRouter({
  /** عناصر المتجر النشطة (عام) */
  list: publicQuery.query(async () => {
    return { items: await listShopItems() };
  }),

  /** مشترياتي + التجهيز الحالي */
  mine: authedQuery.query(async ({ ctx }) => {
    const userId = Number(ctx.user.id);
    const [itemKeys, wallet] = await Promise.all([
      myPurchases(userId),
      getOrCreateWallet(userId),
    ]);
    return {
      itemKeys,
      equippedTheme: wallet.equippedTheme,
      equippedBadge: wallet.equippedBadge,
    };
  }),

  /** شراء عنصر بالكوينز */
  buy: authedQuery
    .input(z.object({ itemKey: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      assertShopRateLimit("buy", ctx.req);
      const res = await buyItem(Number(ctx.user.id), input.itemKey);
      if (!res.ok) {
        const message =
          res.reason === "owned"
            ? "تملك هذا العنصر بالفعل"
            : res.reason === "insufficient"
              ? "رصيدك لا يكفي"
              : "العنصر غير موجود";
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
      return res;
    }),

  /** تجهيز ثيم أو شارة مملوكة */
  equip: authedQuery
    .input(z.object({ itemKey: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      assertShopRateLimit("equip", ctx.req);
      const res = await equipItem(Number(ctx.user.id), input.itemKey);
      if (!res.ok) {
        const message =
          res.reason === "not_owned"
            ? "لا تملك هذا العنصر"
            : res.reason === "passive"
              ? "هذا العنصر يعمل تلقائياً بعد الشراء"
              : "العنصر غير موجود";
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
      return res;
    }),

  /** إعادة الثيم للافتراضي (إزالة الثيم المُفعَّل) */
  resetTheme: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await db
      .update(coinWallets)
      .set({ equippedTheme: null })
      .where(eq(coinWallets.userId, Number(ctx.user.id)));
    return { success: true as const };
  }),

  /** المتصدرون الأسبوعيون (عام) — يبدأ الأسبوع الاثنين UTC */
  leaderboard: publicQuery
    .input(
      z
        .object({ limit: z.number().int().min(1).max(50).default(20) })
        .optional(),
    )
    .query(async ({ input }) => {
      return { items: await weeklyLeaderboard(input?.limit ?? 20) };
    }),
});
