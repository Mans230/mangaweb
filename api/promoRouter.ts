import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { promoCodes, promoRedemptions, users } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import { awardCoins } from "./lib/coins";
import { checkRateLimit } from "./lib/rateLimit";
import { logAdminAction } from "./lib/adminLog";

const rewardTypeEnum = z.enum(["premium_days", "coins"]);

/** توحيد شكل الكود: قص + حروف كبيرة (المقارنة والتخزين متسقان) */
const normalizeCode = (c: string) => c.trim().toUpperCase();

export const promoRouter = createRouter({
  /**
   * استبدال كود ترويجي (مستخدم مسجّل). يرفض الأكواد المنتهية/المعطّلة/المستنفدة/
   * المُستبدلة سابقاً. الفهرس الفريد (codeId,userId) يمنع الاستبدال المزدوج حتى مع التزامن.
   */
  redeem: authedQuery
    .input(z.object({ code: z.string().trim().min(1).max(40) }))
    .mutation(async ({ ctx, input }) => {
      if (!checkRateLimit(`promo:${ctx.user.id}`, 10, 60 * 60 * 1000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "محاولات كثيرة. حاول لاحقاً.",
        });
      }
      const db = getDb();
      const code = normalizeCode(input.code);
      const promo = await db.query.promoCodes.findFirst({
        where: eq(promoCodes.code, code),
      });
      if (!promo || !promo.active) {
        throw new TRPCError({ code: "NOT_FOUND", message: "كود غير صالح" });
      }
      if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "انتهت صلاحية الكود" });
      }
      if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "استُنفد هذا الكود" });
      }

      // سجّل الاستبدال أولاً — الفهرس الفريد يرفض التكرار (سباق أو محاولة ثانية)
      try {
        await db
          .insert(promoRedemptions)
          .values({ codeId: promo.id, userId: ctx.user.id });
      } catch (e) {
        const msg = `${(e as Error).message} ${(e as { cause?: { code?: string } }).cause?.code ?? ""}`;
        if (/duplicate|ER_DUP_ENTRY|1062/i.test(msg)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "استبدلت هذا الكود من قبل" });
        }
        throw e;
      }

      // طبّق المكافأة
      if (promo.rewardType === "premium_days") {
        const [cur] = await db
          .select({ premiumUntil: users.premiumUntil })
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1);
        const base =
          cur?.premiumUntil && new Date(cur.premiumUntil) > new Date()
            ? new Date(cur.premiumUntil)
            : new Date();
        const until = new Date(base.getTime() + promo.amount * 24 * 60 * 60 * 1000);
        await db.update(users).set({ premiumUntil: until }).where(eq(users.id, ctx.user.id));
      } else {
        await awardCoins(ctx.user.id, promo.amount, "promo", { code });
      }

      await db
        .update(promoCodes)
        .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
        .where(eq(promoCodes.id, promo.id));

      return { rewardType: promo.rewardType, amount: promo.amount };
    }),

  // ================= إدارة الأكواد (أدمن) =================

  listCodes: adminQuery.query(() =>
    getDb().select().from(promoCodes).orderBy(desc(promoCodes.id)),
  ),

  createCode: adminQuery
    .input(
      z.object({
        code: z.string().trim().min(3).max(40),
        rewardType: rewardTypeEnum,
        amount: z.number().int().min(1).max(1_000_000),
        maxUses: z.number().int().min(0).max(1_000_000).default(0),
        expiresAt: z.coerce.date().optional(),
        active: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const code = normalizeCode(input.code);
      const existing = await db.query.promoCodes.findFirst({
        where: eq(promoCodes.code, code),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "هذا الكود موجود مسبقاً" });
      }
      await db.insert(promoCodes).values({
        code,
        rewardType: input.rewardType,
        amount: input.amount,
        maxUses: input.maxUses,
        expiresAt: input.expiresAt ?? null,
        active: input.active,
      });
      await logAdminAction(ctx.user.id, "promo.create", { meta: { ...input, code } });
      return { success: true as const };
    }),

  updateCode: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        amount: z.number().int().min(1).max(1_000_000).optional(),
        maxUses: z.number().int().min(0).max(1_000_000).optional(),
        expiresAt: z.coerce.date().nullable().optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const patch: Record<string, unknown> = {};
      if (rest.amount !== undefined) patch.amount = rest.amount;
      if (rest.maxUses !== undefined) patch.maxUses = rest.maxUses;
      if (rest.expiresAt !== undefined) patch.expiresAt = rest.expiresAt;
      if (rest.active !== undefined) patch.active = rest.active;
      if (Object.keys(patch).length === 0) return { success: true as const };
      await getDb().update(promoCodes).set(patch).where(eq(promoCodes.id, id));
      await logAdminAction(ctx.user.id, "promo.update", { meta: input });
      return { success: true as const };
    }),

  deleteCode: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await getDb().delete(promoCodes).where(eq(promoCodes.id, input.id));
      await logAdminAction(ctx.user.id, "promo.delete", { meta: { id: input.id } });
      return { success: true as const };
    }),
});
