import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { requests } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery } from "./middleware";

export const requestRouter = createRouter({
  create: authedQuery
    .input(
      z.object({
        title: z.string().trim().min(1).max(500),
        sourceUrl: z.string().url().optional(),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [{ id }] = await db
        .insert(requests)
        .values({
          userId: ctx.user.id,
          title: input.title,
          sourceUrl: input.sourceUrl ?? null,
          note: input.note ?? null,
        })
        .$returningId();
      return { id, success: true };
    }),

  myRequests: authedQuery.query(({ ctx }) =>
    getDb().query.requests.findMany({
      where: eq(requests.userId, ctx.user.id),
      orderBy: [desc(requests.createdAt)],
    }),
  ),
});
