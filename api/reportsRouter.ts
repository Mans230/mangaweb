import { z } from "zod";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { chapters, communityChatMessages, manga, reports, users } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery, adminQuery } from "./middleware";

const reportReasonEnum = z.enum([
  "porn",
  "broken",
  "wrong_translation",
  "other",
]);

export const reportsRouter = createRouter({
  /**
   * إنشاء تقرير — منع السبام: تقرير pending واحد فقط لكل (user, target).
   * الهدف: mangaId و/أو chapterId و/أو communityMessageId (واحد منها على الأقل).
   */
  create: authedQuery
    .input(
      z
        .object({
          mangaId: z.number().int().positive().optional(),
          chapterId: z.number().int().positive().optional(),
          communityMessageId: z.number().int().positive().optional(),
          reason: reportReasonEnum,
          details: z.string().trim().max(2000).optional(),
        })
        .refine(
          (v) =>
            v.mangaId !== undefined ||
            v.chapterId !== undefined ||
            v.communityMessageId !== undefined,
          { message: "يجب تحديد مانجا أو فصل أو رسالة مجتمع" },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // تحقق من وجود الهدف، واستنتج mangaId من الفصل إن لم يُمرَّر
      let mangaId = input.mangaId ?? null;
      if (input.communityMessageId !== undefined) {
        const msg = await db.query.communityChatMessages.findFirst({
          where: eq(communityChatMessages.id, input.communityMessageId),
          columns: { id: true },
        });
        if (!msg) {
          throw new TRPCError({ code: "NOT_FOUND", message: "الرسالة غير موجودة" });
        }
      }
      if (input.chapterId !== undefined) {
        const chapter = await db.query.chapters.findFirst({
          where: eq(chapters.id, input.chapterId),
          columns: { id: true, mangaId: true },
        });
        if (!chapter) {
          throw new TRPCError({ code: "NOT_FOUND", message: "الفصل غير موجود" });
        }
        if (mangaId === null) mangaId = chapter.mangaId;
      } else if (mangaId !== null) {
        const m = await db.query.manga.findFirst({
          where: eq(manga.id, mangaId),
          columns: { id: true },
        });
        if (!m) {
          throw new TRPCError({ code: "NOT_FOUND", message: "المانجا غير موجودة" });
        }
      }

      // منع السبام: تقرير pending واحد لكل (user, manga, chapter, message)
      const targetConditions = [eq(reports.userId, ctx.user.id), eq(reports.status, "pending")];
      targetConditions.push(
        mangaId !== null ? eq(reports.mangaId, mangaId) : isNull(reports.mangaId),
      );
      targetConditions.push(
        input.chapterId !== undefined
          ? eq(reports.chapterId, input.chapterId)
          : isNull(reports.chapterId),
      );
      targetConditions.push(
        input.communityMessageId !== undefined
          ? eq(reports.communityMessageId, input.communityMessageId)
          : isNull(reports.communityMessageId),
      );
      const existing = await db.query.reports.findFirst({
        where: and(...targetConditions),
        columns: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "عندك تقرير قيد المراجعة لنفس الهدف",
        });
      }

      const [{ id }] = await db
        .insert(reports)
        .values({
          userId: ctx.user.id,
          mangaId,
          chapterId: input.chapterId ?? null,
          communityMessageId: input.communityMessageId ?? null,
          reason: input.reason,
          details: input.details ?? null,
        })
        .$returningId();
      return { success: true, reportId: id };
    }),

  /** تقارير المستخدم نفسه */
  myReports: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select({
        report: reports,
        manga: { id: manga.id, slug: manga.slug, title: manga.title },
      })
      .from(reports)
      .leftJoin(manga, eq(reports.mangaId, manga.id))
      .where(eq(reports.userId, ctx.user.id))
      .orderBy(desc(reports.createdAt))
      .limit(100);
    return rows.map((r) => ({ ...r.report, manga: r.manga }));
  }),

  // ===== أدمن =====

  listReports: adminQuery
    .input(
      z.object({
        status: z.enum(["pending", "resolved", "dismissed"]).optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = input.status
        ? eq(reports.status, input.status)
        : undefined;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            report: reports,
            user: { id: users.id, name: users.name, username: users.username },
            manga: { id: manga.id, slug: manga.slug, title: manga.title },
          })
          .from(reports)
          .leftJoin(users, eq(reports.userId, users.id))
          .leftJoin(manga, eq(reports.mangaId, manga.id))
          .where(where)
          .orderBy(desc(reports.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ total: count() }).from(reports).where(where),
      ]);
      return {
        items: rows.map((r) => ({ ...r.report, user: r.user, manga: r.manga })),
        total,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  resolveReport: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["resolved", "dismissed"]),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.query.reports.findFirst({
        where: eq(reports.id, input.id),
        columns: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "التقرير غير موجود" });
      }
      await db
        .update(reports)
        .set({ status: input.status })
        .where(eq(reports.id, input.id));
      return { success: true };
    }),
});
