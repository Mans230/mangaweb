import { z } from "zod";
import { and, avg, count, desc, eq, isNotNull, ne } from "drizzle-orm";
import { comments, manga, ratings, users } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { containsBannedWord } from "./lib/wordFilter";
import { checkRateLimit, clientIp } from "./lib/rateLimit";
import { TRPCError } from "@trpc/server";

/** تنظيف نص المراجعة: إزالة محارف التحكم ودمج المسافات + حد أقصى للروابط */
function sanitizeReview(raw: string): string {
  const clean = raw
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const links = clean.match(/http/gi)?.length ?? 0;
  if (links > 3) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "المراجعة فيها روابط كثيرة",
    });
  }
  return clean;
}

function assertRateLimit(action: string, req: Request) {
  const key = `engagement:${action}:${clientIp(req)}`;
  if (!checkRateLimit(key, 20, 60 * 1000)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "محاولات كثيرة، جرب بعد شوية",
    });
  }
}

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
      if (await containsBannedWord(input.content)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "التعليق يحتوي كلمات مخالفة",
        });
      }
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
        /** مراجعة نصية اختيارية: تحذف بالسلسلة الفارغة، ولا تتغير عند الحذف من الطلب */
        review: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertRateLimit("rate", ctx.req);
      const db = getDb();
      // undefined = لا تلمس النص الحالي؛ "" = امسحه؛ غير ذلك = خزّنه
      let reviewText: string | null | undefined;
      if (input.review !== undefined) {
        const clean = sanitizeReview(input.review);
        if (clean && clean.length < 3) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "المراجعة قصيرة جداً",
          });
        }
        reviewText = clean || null;
      }
      await db
        .insert(ratings)
        .values({
          userId: ctx.user.id,
          mangaId: input.mangaId,
          stars: input.stars,
          ...(reviewText !== undefined ? { reviewText } : {}),
        })
        .onDuplicateKeyUpdate({
          set: {
            stars: input.stars,
            ...(reviewText !== undefined ? { reviewText } : {}),
          },
        });

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

  /** المراجعات النصية فقط (الأحدث أولاً) */
  reviews: publicQuery
    .input(
      z.object({
        mangaId: z.number().int().positive(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(20).default(10),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = and(
        eq(ratings.mangaId, input.mangaId),
        isNotNull(ratings.reviewText),
        ne(ratings.reviewText, ""),
      );
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            rating: ratings,
            user: { id: users.id, name: users.name, avatar: users.avatarUrl },
          })
          .from(ratings)
          .innerJoin(users, eq(ratings.userId, users.id))
          .where(where)
          .orderBy(desc(ratings.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(ratings).where(where),
      ]);
      return {
        items: rows.map((r) => ({
          id: r.rating.id,
          userId: r.rating.userId,
          userName: r.user.name,
          avatarUrl: r.user.avatar,
          stars: r.rating.stars,
          text: r.rating.reviewText,
          createdAt: r.rating.createdAt,
        })),
        total,
        page: input.page,
      };
    }),

  /** مراجعتي الحالية (نجوم + نص) لهذه المانجا */
  myReview: authedQuery
    .input(z.object({ mangaId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const r = await getDb().query.ratings.findFirst({
        where: and(
          eq(ratings.userId, ctx.user.id),
          eq(ratings.mangaId, input.mangaId),
        ),
      });
      if (!r) return null;
      return { stars: r.stars, text: r.reviewText ?? null };
    }),

  /** مسح نص مراجعتي فقط — النجوم تبقى */
  deleteReview: authedQuery
    .input(z.object({ mangaId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(ratings)
        .set({ reviewText: null })
        .where(
          and(
            eq(ratings.userId, ctx.user.id),
            eq(ratings.mangaId, input.mangaId),
          ),
        );
      return { ok: true };
    }),
});
