import { z } from "zod";
import {
  and,
  asc,
  avg,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import { commentVotes, comments, manga, ratings, userBlocks, users } from "@db/schema";
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
        parentId: z.number().int().positive().nullish(),
        content: z.string().trim().max(2000),
        imageUrl: z.string().trim().url().max(500).optional(),
        isSpoiler: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // لا نص ولا صورة = رفض
      if (!input.content && !input.imageUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "التعليق فارغ" });
      }
      if (input.content && (await containsBannedWord(input.content))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "التعليق يحتوي كلمات مخالفة",
        });
      }
      const db = getDb();
      // الرد يكون على تعليق رئيسي فقط (مستوى واحد): استنتج parent الأصلي
      let parentId: number | null = null;
      if (input.parentId != null) {
        const parent = await db.query.comments.findFirst({
          where: eq(comments.id, input.parentId),
          columns: { id: true, parentId: true },
        });
        if (!parent) {
          throw new TRPCError({ code: "NOT_FOUND", message: "التعليق غير موجود" });
        }
        parentId = parent.parentId ?? parent.id;
      }
      const [{ id }] = await db
        .insert(comments)
        .values({
          userId: ctx.user.id,
          mangaId: input.mangaId,
          chapterId: input.chapterId ?? null,
          parentId,
          content: input.content,
          imageUrl: input.imageUrl ?? null,
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

  /** حذف تعليقي (والردود عليه إن كان رئيسياً) */
  deleteComment: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const c = await db.query.comments.findFirst({
        where: eq(comments.id, input.id),
        columns: { id: true, userId: true, parentId: true },
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "التعليق غير موجود" });
      if (c.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "غير مسموح" });
      }
      // احذف الردود أولاً إن كان تعليقاً رئيسياً
      if (c.parentId == null) {
        await db.delete(comments).where(eq(comments.parentId, c.id));
      }
      await db.delete(comments).where(eq(comments.id, c.id));
      return { ok: true };
    }),

  /** تصويت لايك/ديسلايك على تعليق — الضغط على نفس الاتجاه يلغيه */
  voteComment: authedQuery
    .input(
      z.object({
        commentId: z.number().int().positive(),
        value: z.union([z.literal(1), z.literal(-1)]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db.query.commentVotes.findFirst({
        where: and(
          eq(commentVotes.commentId, input.commentId),
          eq(commentVotes.userId, ctx.user.id),
        ),
      });
      if (existing && existing.value === input.value) {
        await db
          .delete(commentVotes)
          .where(
            and(
              eq(commentVotes.commentId, input.commentId),
              eq(commentVotes.userId, ctx.user.id),
            ),
          );
        return { myVote: 0 };
      }
      await db
        .insert(commentVotes)
        .values({ commentId: input.commentId, userId: ctx.user.id, value: input.value })
        .onDuplicateKeyUpdate({ set: { value: input.value } });
      return { myVote: input.value };
    }),

  /** حظر/فك حظر مستخدم — تعليقاته تختفي عني */
  blockUser: authedQuery
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكنك حظر نفسك" });
      }
      await getDb()
        .insert(userBlocks)
        .values({ blockerId: ctx.user.id, blockedId: input.userId })
        .onDuplicateKeyUpdate({ set: { blockedId: input.userId } });
      return { blocked: true };
    }),

  unblockUser: authedQuery
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .delete(userBlocks)
        .where(
          and(
            eq(userBlocks.blockerId, ctx.user.id),
            eq(userBlocks.blockedId, input.userId),
          ),
        );
      return { blocked: false };
    }),

  listComments: publicQuery
    .input(
      z.object({
        mangaId: z.number().int().positive(),
        chapterId: z.number().int().positive().optional(),
        sort: z.enum(["best", "newest", "oldest"]).default("best"),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const targetWhere =
        input.chapterId !== undefined
          ? and(
              eq(comments.mangaId, input.mangaId),
              eq(comments.chapterId, input.chapterId),
            )
          : eq(comments.mangaId, input.mangaId);

      // مستخدمون محظورون من الحاظر الحالي (لإخفاء تعليقاتهم)
      const blockedIds = new Set<number>();
      if (ctx.user) {
        const rows = await db
          .select({ id: userBlocks.blockedId })
          .from(userBlocks)
          .where(eq(userBlocks.blockerId, ctx.user.id));
        for (const r of rows) blockedIds.add(r.id);
      }

      // التعليقات الرئيسية (صفحة) + العدّ الكلّي
      const topWhere = and(targetWhere, isNull(comments.parentId));
      const [topRows, [{ total }]] = await Promise.all([
        db
          .select({
            comment: comments,
            user: { id: users.id, name: users.name, avatar: users.avatarUrl },
          })
          .from(comments)
          .innerJoin(users, eq(comments.userId, users.id))
          .where(topWhere)
          .orderBy(desc(comments.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(comments).where(targetWhere),
      ]);

      const visibleTop = topRows.filter((r) => !blockedIds.has(r.user.id));
      const topIds = visibleTop.map((r) => r.comment.id);

      // الردود على التعليقات الرئيسية المعروضة (مستوى واحد)
      const replyRows =
        topIds.length > 0
          ? await db
              .select({
                comment: comments,
                user: { id: users.id, name: users.name, avatar: users.avatarUrl },
              })
              .from(comments)
              .innerJoin(users, eq(comments.userId, users.id))
              .where(inArray(comments.parentId, topIds))
              .orderBy(asc(comments.createdAt))
          : [];
      const visibleReplies = replyRows.filter((r) => !blockedIds.has(r.user.id));

      // تجميع أصوات كل التعليقات المعروضة
      const allIds = [
        ...topIds,
        ...visibleReplies.map((r) => r.comment.id),
      ];
      const voteMap = new Map<number, { likes: number; dislikes: number }>();
      const myVoteMap = new Map<number, number>();
      if (allIds.length > 0) {
        const agg = await db
          .select({
            commentId: commentVotes.commentId,
            likes: sql<number>`SUM(CASE WHEN ${commentVotes.value} = 1 THEN 1 ELSE 0 END)`,
            dislikes: sql<number>`SUM(CASE WHEN ${commentVotes.value} = -1 THEN 1 ELSE 0 END)`,
          })
          .from(commentVotes)
          .where(inArray(commentVotes.commentId, allIds))
          .groupBy(commentVotes.commentId);
        for (const a of agg) {
          voteMap.set(a.commentId, {
            likes: Number(a.likes ?? 0),
            dislikes: Number(a.dislikes ?? 0),
          });
        }
        if (ctx.user) {
          const mine = await db
            .select({ commentId: commentVotes.commentId, value: commentVotes.value })
            .from(commentVotes)
            .where(
              and(
                eq(commentVotes.userId, ctx.user.id),
                inArray(commentVotes.commentId, allIds),
              ),
            );
          for (const m of mine) myVoteMap.set(m.commentId, m.value);
        }
      }

      const shape = (r: (typeof visibleTop)[number]) => {
        const v = voteMap.get(r.comment.id) ?? { likes: 0, dislikes: 0 };
        return {
          ...r.comment,
          user: r.user,
          likes: v.likes,
          dislikes: v.dislikes,
          score: v.likes - v.dislikes,
          myVote: myVoteMap.get(r.comment.id) ?? 0,
        };
      };

      const repliesByParent = new Map<number, ReturnType<typeof shape>[]>();
      for (const r of visibleReplies) {
        const pid = r.comment.parentId as number;
        const arr = repliesByParent.get(pid) ?? [];
        arr.push(shape(r));
        repliesByParent.set(pid, arr);
      }

      let items = visibleTop.map((r) => ({
        ...shape(r),
        replies: repliesByParent.get(r.comment.id) ?? [],
      }));

      if (input.sort === "best") {
        items = items.sort(
          (a, b) =>
            b.score - a.score ||
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      } else if (input.sort === "oldest") {
        items = items.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      }
      // newest = ترتيب الاستعلام (desc) الحالي

      return { items, total, page: input.page, limit: input.limit };
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
