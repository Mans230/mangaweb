import { z } from "zod";
import { and, count, desc, eq, like } from "drizzle-orm";
import {
  chapters,
  comments,
  favorites,
  follows,
  manga,
  ratings,
  readingProgress,
  requests,
  sources,
  users,
} from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, adminQuery } from "./middleware";

const sourceStatusEnum = z.enum(["active", "paused", "blocked"]);
const requestStatusEnum = z.enum(["pending", "added", "rejected"]);

export const adminRouter = createRouter({
  stats: adminQuery.query(async () => {
    const db = getDb();
    const [[m], [c], [u], [r], [rp]] = await Promise.all([
      db.select({ total: count() }).from(manga),
      db.select({ total: count() }).from(chapters),
      db.select({ total: count() }).from(users),
      db.select({ total: count() }).from(requests),
      db
        .select({ total: count() })
        .from(requests)
        .where(eq(requests.status, "pending")),
    ]);
    return {
      manga: m.total,
      chapters: c.total,
      users: u.total,
      requests: r.total,
      pendingRequests: rp.total,
    };
  }),

  listManga: adminQuery
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
        search: z.string().trim().min(1).optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = input.search
        ? like(manga.title, `%${input.search}%`)
        : undefined;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({ manga: manga, source: sources })
          .from(manga)
          .innerJoin(sources, eq(manga.sourceId, sources.id))
          .where(where)
          .orderBy(desc(manga.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(manga).where(where),
      ]);
      return {
        items: rows.map((r) => ({ ...r.manga, source: r.source })),
        total,
        page: input.page,
        limit: input.limit,
      };
    }),

  addMangaByUrl: adminQuery
    .input(
      z.object({
        url: z.string().url(),
        title: z.string().trim().max(500).optional(),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const allSources = await db.select().from(sources);
      let hostname = "";
      try {
        hostname = new URL(input.url).hostname.replace(/^www\./, "");
      } catch {
        hostname = "";
      }
      const matched = allSources.find((s) => {
        try {
          return (
            new URL(s.baseUrl).hostname.replace(/^www\./, "") === hostname
          );
        } catch {
          return false;
        }
      });

      // Actual scraping is handled by an external service — register the request here.
      const [{ id }] = await db
        .insert(requests)
        .values({
          userId: ctx.user.id,
          title: input.title ?? input.url,
          sourceUrl: input.url,
          note:
            input.note ??
            `admin import via ${matched?.name ?? "unknown source"} (pending scraper)`,
        })
        .$returningId();

      return { requestId: id, matchedSource: matched ?? null };
    }),

  listSources: adminQuery.query(() => getDb().select().from(sources)),

  updateSourceStatus: adminQuery
    .input(
      z.object({ id: z.number().int().positive(), status: sourceStatusEnum }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(sources)
        .set({ status: input.status })
        .where(eq(sources.id, input.id));
      return { success: true };
    }),

  mergeDuplicates: adminQuery
    .input(
      z.object({
        primaryId: z.number().int().positive(),
        duplicateId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.primaryId === input.duplicateId) {
        throw new Error("primaryId and duplicateId must differ");
      }
      const db = getDb();
      const [primary, duplicate] = await Promise.all([
        db.query.manga.findFirst({ where: eq(manga.id, input.primaryId) }),
        db.query.manga.findFirst({ where: eq(manga.id, input.duplicateId) }),
      ]);
      if (!primary || !duplicate) {
        throw new Error("manga not found");
      }

      await db.transaction(async (tx) => {
        // Move chapters
        await tx
          .update(chapters)
          .set({ mangaId: primary.id })
          .where(eq(chapters.mangaId, duplicate.id));

        // Move per-user rows, deduplicating on (userId, mangaId)
        const userTables = [favorites, follows, ratings, readingProgress];
        for (const table of userTables) {
          const dupRows = await tx
            .select()
            .from(table)
            .where(eq(table.mangaId, duplicate.id));
          for (const row of dupRows) {
            const [conflict] = await tx
              .select()
              .from(table)
              .where(
                and(eq(table.mangaId, primary.id), eq(table.userId, row.userId)),
              )
              .limit(1);
            if (conflict) {
              await tx.delete(table).where(eq(table.id, row.id));
            } else {
              await tx
                .update(table)
                .set({ mangaId: primary.id })
                .where(eq(table.id, row.id));
            }
          }
        }

        // Move comments (no uniqueness constraint)
        await tx
          .update(comments)
          .set({ mangaId: primary.id })
          .where(eq(comments.mangaId, duplicate.id));

        // Remove the duplicate entry
        await tx.delete(manga).where(eq(manga.id, duplicate.id));

        // Refresh the primary chapter count
        const [{ total }] = await tx
          .select({ total: count() })
          .from(chapters)
          .where(eq(chapters.mangaId, primary.id));
        await tx
          .update(manga)
          .set({ chapterCount: total })
          .where(eq(manga.id, primary.id));
      });

      return { success: true, primaryId: primary.id };
    }),

  listUsers: adminQuery
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const [items, [{ total }]] = await Promise.all([
        db
          .select()
          .from(users)
          .orderBy(desc(users.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(users),
      ]);
      return { items, total, page: input.page, limit: input.limit };
    }),

  listRequests: adminQuery
    .input(
      z.object({
        status: requestStatusEnum.optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = input.status
        ? eq(requests.status, input.status)
        : undefined;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            request: requests,
            user: { id: users.id, name: users.name, email: users.email },
          })
          .from(requests)
          .leftJoin(users, eq(requests.userId, users.id))
          .where(where)
          .orderBy(desc(requests.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(requests).where(where),
      ]);
      return {
        items: rows.map((r) => ({ ...r.request, user: r.user })),
        total,
        page: input.page,
        limit: input.limit,
      };
    }),

  updateRequestStatus: adminQuery
    .input(
      z.object({ id: z.number().int().positive(), status: requestStatusEnum }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(requests)
        .set({ status: input.status })
        .where(eq(requests.id, input.id));
      return { success: true };
    }),
});
