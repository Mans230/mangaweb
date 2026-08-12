import { z } from "zod";
import { and, avg, count, desc, eq } from "drizzle-orm";
import { comments, manga, ratings, users } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery, publicQuery } from "./middleware";

export const engagementRouter = createRouter({
  addComment: authedQuery
    .input(
      z.object({
        mangaId: z.number().int().positive(),
        chapterId: z.number().int().positive().nullish(),
        content: z.string().trim().min(1).max(2000),
        isSpoiler: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [{ id }] = await db
        .insert(comments)
        .values({
          userId: ctx.user.id,
          mangaId: input.mangaId,
          chapterId: input.chapterId ?? null,
          content: input.content,
          isSpoiler: input.isSpoiler,
        })
        .$returningId();
      const [row] = await db
        .select({
          comment: comments,
          user: { id: users.id, name: users.name, avatar: users.avatarUrl },
        })
        .from(comments)
        .innerJoin(users, eq(comments.userId, users.id))
        .where(eq(comments.id, id))
        .limit(1);
      return row ? { ...row.comment, user: row.user } : null;
    }),

  listComments: publicQuery
    .input(
      z.object({
        mangaId: z.number().int().positive(),
        chapterId: z.number().int().positive().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where =
        input.chapterId !== undefined
          ? and(
              eq(comments.mangaId, input.mangaId),
              eq(comments.chapterId, input.chapterId),
            )
          : eq(comments.mangaId, input.mangaId);

      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            comment: comments,
            user: { id: users.id, name: users.name, avatar: users.avatarUrl },
          })
          .from(comments)
          .innerJoin(users, eq(comments.userId, users.id))
          .where(where)
          .orderBy(desc(comments.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(comments).where(where),
      ]);

      return {
        items: rows.map((r) => ({ ...r.comment, user: r.user })),
        total,
        page: input.page,
        limit: input.limit,
      };
    }),

  rate: authedQuery
    .input(
      z.object({
        mangaId: z.number().int().positive(),
        stars: z.number().int().min(1).max(5),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .insert(ratings)
        .values({
          userId: ctx.user.id,
          mangaId: input.mangaId,
          stars: input.stars,
        })
        .onDuplicateKeyUpdate({ set: { stars: input.stars } });

      const [stats] = await db
        .select({ average: avg(ratings.stars), total: count() })
        .from(ratings)
        .where(eq(ratings.mangaId, input.mangaId));

      const average = Math.round(Number(stats.average ?? 0) * 100) / 100;
      await db
        .update(manga)
        .set({ rating: average, ratingCount: stats.total })
        .where(eq(manga.id, input.mangaId));

      return { average, count: stats.total };
    }),

  getRating: publicQuery
    .input(z.object({ mangaId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const m = await db.query.manga.findFirst({
        where: eq(manga.id, input.mangaId),
        columns: { rating: true, ratingCount: true },
      });
      let userStars: number | null = null;
      if (ctx.user) {
        const r = await db.query.ratings.findFirst({
          where: and(
            eq(ratings.userId, ctx.user.id),
            eq(ratings.mangaId, input.mangaId),
          ),
        });
        userStars = r?.stars ?? null;
      }
      return {
        average: m?.rating ?? 0,
        count: m?.ratingCount ?? 0,
        userStars,
      };
    }),
});
