/**
 * رياكشنات على المانهوا والفصل — رياكشن واحد لكل مستخدم لكل هدف.
 * الأنواع: upvote | funny | love | surprised | angry | sad
 */
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { reactions } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery, authedQuery } from "./middleware";

const targetTypeEnum = z.enum(["manga", "chapter"]);
const kindEnum = z.enum(["upvote", "funny", "love", "surprised", "angry", "sad"]);
const KINDS = ["upvote", "funny", "love", "surprised", "angry", "sad"] as const;

export const reactionsRouter = createRouter({
  /** ملخّص رياكشنات هدف: عدّاد لكل نوع + رياكشني أنا */
  summary: publicQuery
    .input(z.object({ targetType: targetTypeEnum, targetId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select({ kind: reactions.kind, c: sql<number>`COUNT(*)` })
        .from(reactions)
        .where(
          and(
            eq(reactions.targetType, input.targetType),
            eq(reactions.targetId, input.targetId),
          ),
        )
        .groupBy(reactions.kind);

      const counts: Record<string, number> = {};
      for (const k of KINDS) counts[k] = 0;
      let total = 0;
      for (const r of rows) {
        const n = Number(r.c);
        counts[r.kind] = n;
        total += n;
      }

      let mine: string | null = null;
      if (ctx.user) {
        const [row] = await db
          .select({ kind: reactions.kind })
          .from(reactions)
          .where(
            and(
              eq(reactions.targetType, input.targetType),
              eq(reactions.targetId, input.targetId),
              eq(reactions.userId, ctx.user.id),
            ),
          )
          .limit(1);
        mine = row?.kind ?? null;
      }
      return { counts, total, mine };
    }),

  /** ضبط رياكشني: نفس النوع = إزالة، نوع مختلف = تغيير */
  set: authedQuery
    .input(
      z.object({
        targetType: targetTypeEnum,
        targetId: z.number().int().positive(),
        kind: kindEnum,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [existing] = await db
        .select({ kind: reactions.kind })
        .from(reactions)
        .where(
          and(
            eq(reactions.targetType, input.targetType),
            eq(reactions.targetId, input.targetId),
            eq(reactions.userId, ctx.user.id),
          ),
        )
        .limit(1);

      if (existing?.kind === input.kind) {
        await db
          .delete(reactions)
          .where(
            and(
              eq(reactions.targetType, input.targetType),
              eq(reactions.targetId, input.targetId),
              eq(reactions.userId, ctx.user.id),
            ),
          );
        return { mine: null as string | null };
      }

      await db
        .insert(reactions)
        .values({
          targetType: input.targetType,
          targetId: input.targetId,
          userId: ctx.user.id,
          kind: input.kind,
        })
        .onDuplicateKeyUpdate({ set: { kind: input.kind } });
      return { mine: input.kind as string | null };
    }),
});
