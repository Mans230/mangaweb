import { z } from "zod";
import { and, count, desc, eq, lt, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  manga,
  notifications,
  reelComments,
  reelLikes,
  reels,
  users,
} from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, adminQuery, authedQuery, publicQuery } from "./middleware";
import { containsBannedWord } from "./lib/wordFilter";
import { checkRateLimit } from "./lib/rateLimit";

const PAGE_SIZE = 10;

const userCard = {
  id: users.id,
  name: users.name,
  username: users.username,
  avatarUrl: users.avatarUrl,
} as const;

/** مضيفو الفيديو المقبولون: catbox (مع userhash) أو uguu.se (الاحتياطي التلقائي) */
const ALLOWED_VIDEO_HOSTS = new Set([
  "files.catbox.moe",
  "uguu.se",
  "d.uguu.se",
  "www.uguu.se",
]);

function assertCatboxVideoUrl(url: string) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = "";
  }
  if (!ALLOWED_VIDEO_HOSTS.has(host)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "رابط الفيديو يجب أن يكون مرفوعاً عبر الموقع (upload.uploadVideo)",
    });
  }
}

async function assertNotBanned(text: string | null | undefined) {
  if (text && (await containsBannedWord(text))) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "النص يحتوي كلمات مخالفة",
    });
  }
}

export const reelsRouter = createRouter({
  /**
   * فيد الريلز المعتمدة فقط — tab=new (الأحدث) أو trending (لايكات+مشاهدات)،
   * pagination بـ cursor (id آخر عنصر)، 10 لكل صفحة.
   */
  feed: publicQuery
    .input(
      z.object({
        tab: z.enum(["new", "trending"]).default("new"),
        cursor: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [eq(reels.status, "approved")];
      if (input.cursor !== undefined && input.tab === "new") {
        conditions.push(lt(reels.id, input.cursor));
      }
      const limit = PAGE_SIZE + 1;
      const rows = await db
        .select({
          reel: reels,
          user: userCard,
          manga: { id: manga.id, title: manga.title, slug: manga.slug },
        })
        .from(reels)
        .innerJoin(users, eq(reels.userId, users.id))
        .leftJoin(manga, eq(reels.mangaId, manga.id))
        .where(and(...conditions))
        .orderBy(
          input.tab === "trending"
            ? desc(sql`${reels.likesCount} + ${reels.viewsCount}`)
            : desc(reels.id),
        )
        .limit(
          input.tab === "trending" && input.cursor !== undefined
            ? PAGE_SIZE
            : limit,
        )
        .offset(
          input.tab === "trending" && input.cursor !== undefined
            ? input.cursor
            : 0,
        );

      let items = rows;
      let nextCursor: number | null = null;
      if (input.tab === "new") {
        const hasMore = rows.length > PAGE_SIZE;
        items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
        nextCursor = hasMore ? Number(items[items.length - 1].reel.id) : null;
      } else {
        nextCursor =
          rows.length === PAGE_SIZE
            ? (input.cursor ?? 0) + PAGE_SIZE
            : null;
      }

      // هل المستخدم الحالي لايك كل ريل؟
      let likedIds = new Set<number>();
      if (ctx.user && items.length) {
        const liked = await db
          .select({ reelId: reelLikes.reelId })
          .from(reelLikes)
          .where(
            and(
              eq(reelLikes.userId, ctx.user.id),
              or(...items.map((r) => eq(reelLikes.reelId, r.reel.id))),
            ),
          );
        likedIds = new Set(liked.map((l) => Number(l.reelId)));
      }

      return {
        items: items.map((r) => ({
          ...r.reel,
          user: r.user,
          manga: r.manga?.id ? r.manga : null,
          liked: likedIds.has(Number(r.reel.id)),
        })),
        nextCursor,
      };
    }),

  /**
   * تقديم ريل — للمسجلين الموثقين فقط (emailVerifiedAt أو telegramId أو googleId).
   * يدخل بانتظار المراجعة (pending).
   */
  submit: authedQuery
    .input(
      z.object({
        videoUrl: z.string().trim().url().max(2000),
        caption: z.string().trim().max(300).optional(),
        mangaId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!checkRateLimit(`reels:submit:${ctx.user.id}`, 5, 60 * 60 * 1000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "قدّمت ريلز كثيرة، جرب بعد شوية",
        });
      }
      const verified =
        ctx.user.emailVerifiedAt || ctx.user.telegramId || ctx.user.googleId;
      if (!verified) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "وثّق حسابك أولاً (بريد، تيليجرام، أو جوجل) لتقديم ريلز",
        });
      }
      assertCatboxVideoUrl(input.videoUrl);
      await assertNotBanned(input.caption);
      const db = getDb();
      if (input.mangaId !== undefined) {
        const m = await db.query.manga.findFirst({
          where: eq(manga.id, input.mangaId),
          columns: { id: true },
        });
        if (!m) {
          throw new TRPCError({ code: "NOT_FOUND", message: "المانجا غير موجودة" });
        }
      }
      const [{ id }] = await db
        .insert(reels)
        .values({
          userId: ctx.user.id,
          videoUrl: input.videoUrl,
          caption: input.caption ?? null,
          mangaId: input.mangaId ?? null,
          status: "pending",
        })
        .$returningId();
      return { success: true, id };
    }),

  like: authedQuery
    .input(z.object({ reelId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const reel = await db.query.reels.findFirst({
        where: eq(reels.id, input.reelId),
        columns: { id: true, status: true },
      });
      if (!reel || reel.status !== "approved") {
        throw new TRPCError({ code: "NOT_FOUND", message: "الريل غير موجود" });
      }
      const existing = await db.query.reelLikes.findFirst({
        where: and(
          eq(reelLikes.reelId, input.reelId),
          eq(reelLikes.userId, ctx.user.id),
        ),
      });
      if (!existing) {
        await db
          .insert(reelLikes)
          .values({ reelId: input.reelId, userId: ctx.user.id });
        await db
          .update(reels)
          .set({ likesCount: sql`${reels.likesCount} + 1` })
          .where(eq(reels.id, input.reelId));
      }
      return { success: true, liked: true };
    }),

  unlike: authedQuery
    .input(z.object({ reelId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db.query.reelLikes.findFirst({
        where: and(
          eq(reelLikes.reelId, input.reelId),
          eq(reelLikes.userId, ctx.user.id),
        ),
      });
      if (existing) {
        await db
          .delete(reelLikes)
          .where(
            and(
              eq(reelLikes.reelId, input.reelId),
              eq(reelLikes.userId, ctx.user.id),
            ),
          );
        await db
          .update(reels)
          .set({ likesCount: sql`GREATEST(${reels.likesCount} - 1, 0)` })
          .where(eq(reels.id, input.reelId));
      }
      return { success: true, liked: false };
    }),

  /** تسجيل مشاهدة — عام، مخنوق بالمستخدم/IP */
  view: publicQuery
    .input(z.object({ reelId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const key = ctx.user
        ? `reels:view:u:${ctx.user.id}`
        : `reels:view:ip:${ctx.req.headers.get("x-forwarded-for") ?? "unknown"}`;
      if (!checkRateLimit(key, 60, 60 * 1000)) {
        return { success: true };
      }
      await getDb()
        .update(reels)
        .set({ viewsCount: sql`${reels.viewsCount} + 1` })
        .where(and(eq(reels.id, input.reelId), eq(reels.status, "approved")));
      return { success: true };
    }),

  /** تعليقات الريلز تُنشر مباشرة مع فلتر الكلمات */
  addComment: authedQuery
    .input(
      z.object({
        reelId: z.number().int().positive(),
        content: z.string().trim().min(1, "التعليق فارغ").max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!checkRateLimit(`reels:comment:${ctx.user.id}`, 20, 60 * 1000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "تعلق بسرعة كبيرة، جرب بعد شوية",
        });
      }
      await assertNotBanned(input.content);
      const db = getDb();
      const reel = await db.query.reels.findFirst({
        where: eq(reels.id, input.reelId),
        columns: { id: true, status: true },
      });
      if (!reel || reel.status !== "approved") {
        throw new TRPCError({ code: "NOT_FOUND", message: "الريل غير موجود" });
      }
      const [{ id }] = await db
        .insert(reelComments)
        .values({ reelId: input.reelId, userId: ctx.user.id, content: input.content })
        .$returningId();
      const [row] = await db
        .select({ comment: reelComments, user: userCard })
        .from(reelComments)
        .innerJoin(users, eq(reelComments.userId, users.id))
        .where(eq(reelComments.id, id))
        .limit(1);
      return row ? { ...row.comment, user: row.user } : null;
    }),

  listComments: publicQuery
    .input(
      z.object({
        reelId: z.number().int().positive(),
        cursor: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conditions = [eq(reelComments.reelId, input.reelId)];
      if (input.cursor !== undefined) {
        conditions.push(lt(reelComments.id, input.cursor));
      }
      const rows = await db
        .select({ comment: reelComments, user: userCard })
        .from(reelComments)
        .innerJoin(users, eq(reelComments.userId, users.id))
        .where(and(...conditions))
        .orderBy(desc(reelComments.id))
        .limit(PAGE_SIZE + 1);
      const hasMore = rows.length > PAGE_SIZE;
      const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
      return {
        items: items.map((r) => ({ ...r.comment, user: r.user })),
        nextCursor: hasMore ? Number(items[items.length - 1].comment.id) : null,
      };
    }),

  // ================= إدارة (أدمن) =================

  pendingList: adminQuery
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = eq(reels.status, "pending");
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({ reel: reels, user: userCard })
          .from(reels)
          .innerJoin(users, eq(reels.userId, users.id))
          .where(where)
          .orderBy(desc(reels.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(reels).where(where),
      ]);
      return {
        items: rows.map((r) => ({ ...r.reel, user: r.user })),
        total,
        page: input.page,
        limit: input.limit,
      };
    }),

  approve: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const reel = await db.query.reels.findFirst({
        where: eq(reels.id, input.id),
      });
      if (!reel) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الريل غير موجود" });
      }
      await db
        .update(reels)
        .set({ status: "approved", rejectReason: null })
        .where(eq(reels.id, input.id));
      await db.insert(notifications).values({
        userId: reel.userId,
        type: "reel_approved",
        payload: { excerpt: reel.caption?.slice(0, 120) },
      });
      return { success: true };
    }),

  reject: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        reason: z.string().trim().min(1, "سبب الرفض مطلوب").max(2000),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const reel = await db.query.reels.findFirst({
        where: eq(reels.id, input.id),
      });
      if (!reel) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الريل غير موجود" });
      }
      await db
        .update(reels)
        .set({ status: "rejected", rejectReason: input.reason })
        .where(eq(reels.id, input.id));
      await db.insert(notifications).values({
        userId: reel.userId,
        type: "reel_rejected",
        payload: { excerpt: input.reason.slice(0, 120) },
      });
      return { success: true };
    }),

  /** حذف ريل نهائياً (أدمن) */
  remove: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const reel = await db.query.reels.findFirst({
        where: eq(reels.id, input.id),
        columns: { id: true },
      });
      if (!reel) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الريل غير موجود" });
      }
      await db.delete(reels).where(eq(reels.id, input.id));
      return { success: true };
    }),
});
