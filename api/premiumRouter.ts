/**
 * الاشتراك المميّز (Premium). البنية جاهزة؛ بوابات الدفع تُضاف لاحقاً.
 * حالياً: عرض الحالة + منح يدوي من الأدمن. لا خصم مالي بعد.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { users } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery, adminQuery } from "./middleware";

export const premiumRouter = createRouter({
  /** حالة اشتراكي المميّز */
  status: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const [row] = await db
      .select({ premiumUntil: users.premiumUntil })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);
    const until = row?.premiumUntil ?? null;
    return { active: !!until && new Date(until) > new Date(), until };
  }),

  /** منح/تمديد اشتراك يدوياً (أدمن) — بالأيام */
  grant: adminQuery
    .input(
      z.object({
        userId: z.number().int().positive().optional(),
        username: z.string().trim().optional(),
        days: z.number().int().min(1).max(3650),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      let userId = input.userId;
      if (!userId && input.username) {
        const [u] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.username, input.username))
          .limit(1);
        userId = u?.id;
      }
      if (!userId) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });

      const [cur] = await db
        .select({ premiumUntil: users.premiumUntil })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const base =
        cur?.premiumUntil && new Date(cur.premiumUntil) > new Date()
          ? new Date(cur.premiumUntil)
          : new Date();
      const until = new Date(base.getTime() + input.days * 24 * 60 * 60 * 1000);
      await db.update(users).set({ premiumUntil: until }).where(eq(users.id, userId));
      return { success: true as const, until };
    }),
});
