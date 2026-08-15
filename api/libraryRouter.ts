import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { chapters, favorites, follows, manga, readingProgress, sources } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery } from "./middleware";

async function toggle(
  table: typeof favorites | typeof follows,
  userId: number,
  mangaId: number,
) {
  const db = getDb();
  const existing = await db
    .select()
    .from(table)
    .where(and(eq(table.userId, userId), eq(table.mangaId, mangaId)))
    .limit(1);
  if (existing.length) {
    await db.delete(table).where(eq(table.id, existing[0].id));
    return { active: false };
  }
  await db.insert(table).values({ userId, mangaId });
  return { active: true };
}

export const libraryRouter = createRouter({
  toggleFavorite: authedQuery
    .input(z.object({ mangaId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      toggle(favorites, ctx.user.id, input.mangaId),
    ),

  toggleFollow: authedQuery
    .input(z.object({ mangaId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => toggle(follows, ctx.user.id, input.mangaId)),

  getLibrary: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;
    const [favRows, followRows, historyRows] = await Promise.all([
      db
        .select({ entry: favorites, manga: manga, source: sources })
        .from(favorites)
        .innerJoin(manga, eq(favorites.mangaId, manga.id))
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(eq(favorites.userId, userId))
        .orderBy(desc(favorites.createdAt)),
      db
        .select({ entry: follows, manga: manga, source: sources })
        .from(follows)
        .innerJoin(manga, eq(follows.mangaId, manga.id))
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(eq(follows.userId, userId))
        .orderBy(desc(follows.createdAt)),
      db
        .select({ entry: readingProgress, manga: manga, chapter: chapters, source: sources })
        .from(readingProgress)
        .innerJoin(manga, eq(readingProgress.mangaId, manga.id))
        .innerJoin(chapters, eq(readingProgress.chapterId, chapters.id))
        .innerJoin(sources, eq(manga.sourceId, sources.id))
        .where(eq(readingProgress.userId, userId))
        .orderBy(desc(readingProgress.updatedAt)),
    ]);
    return {
      favorites: favRows.map((r) => ({ ...r.entry, manga: { ...r.manga, source: r.source } })),
      following: followRows.map((r) => ({ ...r.entry, manga: { ...r.manga, source: r.source } })),
      history: historyRows.map((r) => ({
        ...r.entry,
        manga: { ...r.manga, source: r.source },
        chapter: r.chapter,
      })),
    };
  }),

  getProgress: authedQuery
    .input(z.object({ mangaId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db
        .select({ progress: readingProgress, chapter: chapters })
        .from(readingProgress)
        .leftJoin(chapters, eq(readingProgress.chapterId, chapters.id))
        .where(
          and(
            eq(readingProgress.userId, ctx.user.id),
            eq(readingProgress.mangaId, input.mangaId),
          ),
        )
        .limit(1);
      if (!row) return null;
      const m = await db.query.manga.findFirst({
        where: eq(manga.id, input.mangaId),
      });
      return {
        ...row.progress,
        chapter: row.chapter,
        readChapters: row.chapter ? Math.floor(row.chapter.number) : 0,
        totalChapters: m?.chapterCount ?? 0,
      };
    }),

  updateProgress: authedQuery
    .input(
      z.object({
        mangaId: z.number().int().positive(),
        chapterId: z.number().int().positive(),
        lastPage: z.number().int().min(0).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .insert(readingProgress)
        .values({
          userId: ctx.user.id,
          mangaId: input.mangaId,
          chapterId: input.chapterId,
          lastPage: input.lastPage,
        })
        .onDuplicateKeyUpdate({
          set: { chapterId: input.chapterId, lastPage: input.lastPage },
        });

      const [chapter, m] = await Promise.all([
        db.query.chapters.findFirst({
          where: eq(chapters.id, input.chapterId),
        }),
        db.query.manga.findFirst({ where: eq(manga.id, input.mangaId) }),
      ]);

      return {
        success: true,
        readChapters: chapter ? Math.floor(chapter.number) : 0,
        totalChapters: m?.chapterCount ?? 0,
      };
    }),

  /** إلغاء تقدم القراءة لمانجا (إلغاء تحديد الكل كمقروء) */
  clearProgress: authedQuery
    .input(z.object({ mangaId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(readingProgress)
        .where(
          and(
            eq(readingProgress.userId, ctx.user.id),
            eq(readingProgress.mangaId, input.mangaId),
          ),
        );
      return { success: true as const, readChapters: 0 };
    }),
});
