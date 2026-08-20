/**
 * تحدي الأسبوع من المستخدمين: يرشّح المستخدم 2–3 مانهوا للمقارنة،
 * يصل إشعار للأدمن، وعند الموافقة يُنشأ استطلاع الأسبوع تلقائياً.
 */
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { challengeSubmissions, manga, notifications, users } from "@db/schema";
import { pollOptions, polls } from "@db/schemaCoins";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import { checkRateLimit, clientIp } from "./lib/rateLimit";
import { currentWeekKey } from "./lib/polls";

/** يجلب عناوين المانجا بالترتيب المُمرَّر */
async function mangaTitles(ids: number[]): Promise<{ id: number; title: string; slug: string }[]> {
  if (!ids.length) return [];
  const rows = await getDb()
    .select({ id: manga.id, title: manga.title, slug: manga.slug })
    .from(manga)
    .where(inArray(manga.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is { id: number; title: string; slug: string } => !!r);
}

export const challengesRouter = createRouter({
  /** يرشّح المستخدم تحدياً (2–3 مانهوا) — إشعار للأدمن */
  submit: authedQuery
    .input(
      z.object({
        mangaIds: z.array(z.number().int().positive()).min(2).max(3),
        note: z.string().trim().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ids = [...new Set(input.mangaIds)];
      if (ids.length < 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "اختر مانهوتين مختلفتين على الأقل" });
      }
      if (!checkRateLimit(`challenge:${clientIp(ctx.req)}`, 5, 60 * 60 * 1000)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "محاولات كثيرة، جرّب لاحقاً" });
      }
      const db = getDb();
      const found = await mangaTitles(ids);
      if (found.length !== ids.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "بعض المانهوا غير موجودة" });
      }
      // ترشيح pending واحد لكل مستخدم
      const existing = await db.query.challengeSubmissions.findFirst({
        where: and(
          eq(challengeSubmissions.userId, ctx.user.id),
          eq(challengeSubmissions.status, "pending"),
        ),
        columns: { id: true },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "عندك ترشيح قيد المراجعة بالفعل" });
      }
      const [{ id }] = await db
        .insert(challengeSubmissions)
        .values({ userId: ctx.user.id, mangaIds: ids, note: input.note ?? null })
        .$returningId();

      // إشعار كل الأدمن
      const admins = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"));
      if (admins.length) {
        const titles = found.map((f) => f.title).join(" ⚔️ ");
        await db.insert(notifications).values(
          admins.map((a) => ({
            userId: a.id,
            type: "admin_challenge",
            payload: {
              title: "ترشيح تحدي الأسبوع",
              body: `رشّح ${ctx.user.name ?? "مستخدم"}: ${titles}`,
            },
          })),
        );
      }
      return { success: true as const, id };
    }),

  /** ترشيحاتي وحالتها */
  mine: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select()
      .from(challengeSubmissions)
      .where(eq(challengeSubmissions.userId, ctx.user.id))
      .orderBy(desc(challengeSubmissions.createdAt))
      .limit(20);
    const allIds = [...new Set(rows.flatMap((r) => r.mangaIds))];
    const titles = await mangaTitles(allIds);
    const byId = new Map(titles.map((t) => [t.id, t]));
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      note: r.note,
      createdAt: r.createdAt,
      manga: r.mangaIds.map((id) => byId.get(id)).filter(Boolean),
    }));
  }),

  // ===== أدمن =====
  list: adminQuery
    .input(
      z.object({
        status: z.enum(["pending", "approved", "rejected"]).optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = input.status
        ? eq(challengeSubmissions.status, input.status)
        : undefined;
      const rows = await db
        .select({
          sub: challengeSubmissions,
          user: { id: users.id, name: users.name, username: users.username },
        })
        .from(challengeSubmissions)
        .leftJoin(users, eq(challengeSubmissions.userId, users.id))
        .where(where)
        .orderBy(desc(challengeSubmissions.createdAt))
        .limit(input.limit);
      const allIds = [...new Set(rows.flatMap((r) => r.sub.mangaIds))];
      const titles = await mangaTitles(allIds);
      const byId = new Map(titles.map((t) => [t.id, t]));
      return rows.map((r) => ({
        id: r.sub.id,
        status: r.sub.status,
        note: r.sub.note,
        pollId: r.sub.pollId,
        createdAt: r.sub.createdAt,
        user: r.user,
        manga: r.sub.mangaIds.map((id) => byId.get(id)).filter(Boolean),
      }));
    }),

  /** موافقة: يُنشئ استطلاع الأسبوع من المانهوا المرشّحة ويفعّله */
  approve: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        questionAr: z.string().trim().max(255).optional(),
        questionEn: z.string().trim().max(255).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const sub = await db.query.challengeSubmissions.findFirst({
        where: eq(challengeSubmissions.id, input.id),
      });
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "الترشيح غير موجود" });
      if (sub.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "الترشيح مُراجَع بالفعل" });
      }
      const titles = await mangaTitles(sub.mangaIds);
      if (titles.length < 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "المانهوا المرشّحة لم تعد متاحة" });
      }
      // استطلاع نشط واحد فقط: عطّل السابق
      await db.update(polls).set({ active: false }).where(eq(polls.active, true));
      const [{ id: pollId }] = await db
        .insert(polls)
        .values({
          questionAr: input.questionAr || "تحدي الأسبوع: أيّهما تختار؟",
          questionEn: input.questionEn || "Weekly challenge: which one?",
          active: true,
          weekKey: currentWeekKey(),
        })
        .$returningId();
      await db.insert(pollOptions).values(
        titles.map((t) => ({ pollId, textAr: t.title, textEn: t.title })),
      );
      await db
        .update(challengeSubmissions)
        .set({ status: "approved", pollId, reviewedAt: new Date() })
        .where(eq(challengeSubmissions.id, sub.id));
      // إشعار المُرشِّح
      await db.insert(notifications).values({
        userId: sub.userId,
        type: "challenge_approved",
        payload: { title: "تم قبول ترشيحك!", body: "تحديك أصبح تصويت الأسبوع 🎉" },
      });
      return { success: true as const, pollId };
    }),

  /** رفض ترشيح */
  reject: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const sub = await db.query.challengeSubmissions.findFirst({
        where: eq(challengeSubmissions.id, input.id),
        columns: { id: true, userId: true, status: true },
      });
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "الترشيح غير موجود" });
      await db
        .update(challengeSubmissions)
        .set({ status: "rejected", reviewedAt: new Date() })
        .where(eq(challengeSubmissions.id, sub.id));
      await db.insert(notifications).values({
        userId: sub.userId,
        type: "challenge_rejected",
        payload: { title: "لم يُقبل ترشيحك", body: "جرّب ترشيح تحدٍّ آخر لاحقاً." },
      });
      return { success: true as const };
    }),
});
