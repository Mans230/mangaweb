import { z } from "zod";
import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { TRPCError } from "@trpc/server";
import {
  chapters,
  manga,
  pageViews,
  readingProgress,
  reels,
  sources,
  users,
} from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, adminQuery, publicQuery } from "./middleware";
import { checkRateLimit, clientIp } from "./lib/rateLimit";

function dayStart(offsetDays = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

export const analyticsRouter = createRouter({
  /**
   * تسجيل مشاهدة صفحة — عام، rate-limited، والـ IP يُخزَّن مجهولاً (sha256).
   */
  track: publicQuery
    .input(
      z.object({
        path: z.string().trim().min(1).max(300),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ip = clientIp(ctx.req);
      if (!checkRateLimit(`analytics:track:${ip}`, 120, 60 * 1000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "طلبات كثيرة",
        });
      }
      const ipHash = createHash("sha256").update(ip).digest("hex");
      const db = getDb();

      // عدّاد مشاهدات حقيقي لكل مانجا: صفحة /manga/:slug فقط (بلا فصول/مجتمع)،
      // وبحد أقصى مرة كل 6 ساعات لنفس (ipHash + المانجا).
      const mangaMatch = /^\/manga\/([^/]+)\/?$/.exec(input.path);
      let mangaIdForView: number | null = null;
      if (mangaMatch) {
        const slug = decodeURIComponent(mangaMatch[1]);
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        const [mRow, recent] = await Promise.all([
          db
            .select({ id: manga.id })
            .from(manga)
            .where(eq(manga.slug, slug))
            .limit(1),
          db
            .select({ id: pageViews.id })
            .from(pageViews)
            .where(
              and(
                eq(pageViews.ipHash, ipHash),
                eq(pageViews.path, input.path.slice(0, 300)),
                gte(pageViews.createdAt, sixHoursAgo),
              ),
            )
            .limit(1),
        ]);
        if (mRow.length && recent.length === 0) {
          mangaIdForView = mRow[0].id;
        }
      }

      await db.insert(pageViews).values({
        path: input.path.slice(0, 300),
        userId: ctx.user ? Number(ctx.user.id) : null,
        ipHash,
      });

      if (mangaIdForView !== null) {
        await db
          .update(manga)
          .set({ siteViewCount: sql`${manga.siteViewCount} + 1` })
          .where(eq(manga.id, mangaIdForView));
      }
      return { success: true };
    }),

  /** نظرة عامة: زيارات اليوم/أمس، أعضاء جدد 7/30 يوم، إجماليات */
  overview: adminQuery.query(async () => {
    const db = getDb();
    const today = dayStart(0);
    const yesterday = dayStart(-1);
    const weekAgo = dayStart(-7);
    const monthAgo = dayStart(-30);

    const [
      [vToday],
      [vYesterday],
      [u7],
      [u30],
      [totalUsers],
      [totalManga],
      [totalChapters],
      [pendingReels],
    ] = await Promise.all([
      db
        .select({ total: count() })
        .from(pageViews)
        .where(gte(pageViews.createdAt, today)),
      db
        .select({ total: count() })
        .from(pageViews)
        .where(
          and(
            gte(pageViews.createdAt, yesterday),
            lt(pageViews.createdAt, today),
          ),
        ),
      db.select({ total: count() }).from(users).where(gte(users.createdAt, weekAgo)),
      db
        .select({ total: count() })
        .from(users)
        .where(gte(users.createdAt, monthAgo)),
      db.select({ total: count() }).from(users),
      db.select({ total: count() }).from(manga),
      db.select({ total: count() }).from(chapters),
      db.select({ total: count() }).from(reels).where(eq(reels.status, "pending")),
    ]);

    return {
      visitsToday: vToday.total,
      visitsYesterday: vYesterday.total,
      newUsers7d: u7.total,
      newUsers30d: u30.total,
      totalUsers: totalUsers.total,
      totalManga: totalManga.total,
      totalChapters: totalChapters.total,
      pendingReels: pendingReels.total,
    };
  }),

  /** زيارات وأعضاء جدد يومياً لآخر 30 يوم */
  timeseries: adminQuery.query(async () => {
    const db = getDb();
    const since = dayStart(-29);
    const [viewsRows, usersRows] = await Promise.all([
      db
        .select({
          day: sql<string>`DATE(${pageViews.createdAt})`,
          total: count(),
        })
        .from(pageViews)
        .where(gte(pageViews.createdAt, since))
        .groupBy(sql`DATE(${pageViews.createdAt})`),
      db
        .select({
          day: sql<string>`DATE(${users.createdAt})`,
          total: count(),
        })
        .from(users)
        .where(gte(users.createdAt, since))
        .groupBy(sql`DATE(${users.createdAt})`),
    ]);

    const viewsByDay = new Map(
      viewsRows.map((r) => [String(r.day).slice(0, 10), r.total]),
    );
    const usersByDay = new Map(
      usersRows.map((r) => [String(r.day).slice(0, 10), r.total]),
    );

    const days: { date: string; visits: number; newUsers: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = dayStart(-29 + i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        date: key,
        visits: viewsByDay.get(key) ?? 0,
        newUsers: usersByDay.get(key) ?? 0,
      });
    }
    return days;
  }),

  /** أكثر المانجا قراءةً: عدد سجلات readingProgress + مشاهدات المانجا */
  topManga: adminQuery
    .input(
      z.object({ limit: z.number().int().min(1).max(50).default(10) }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          id: manga.id,
          title: manga.title,
          slug: manga.slug,
          viewCount: manga.viewCount,
          readers: count(readingProgress.id),
        })
        .from(readingProgress)
        .innerJoin(manga, eq(readingProgress.mangaId, manga.id))
        .groupBy(manga.id)
        .orderBy(desc(sql`readers`))
        .limit(input.limit);
      return rows;
    }),

  /** توزيع الزيارات على ساعات اليوم (0-23) */
  peakHours: adminQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        hour: sql<number>`HOUR(${pageViews.createdAt})`,
        total: count(),
      })
      .from(pageViews)
      .groupBy(sql`HOUR(${pageViews.createdAt})`);
    const byHour = new Map(rows.map((r) => [Number(r.hour), r.total]));
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      visits: byHour.get(h) ?? 0,
    }));
  }),

  /** حالة المصادر من جدول sources */
  sourcesStatus: adminQuery.query(async () => {
    const db = getDb();
    const rows = await db.select().from(sources).orderBy(desc(sources.mangaCount));
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      baseUrl: s.baseUrl,
      status: s.status,
      mangaCount: s.mangaCount,
      lastScanAt: s.lastScanAt,
    }));
  }),
});
