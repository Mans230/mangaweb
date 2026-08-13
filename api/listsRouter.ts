import { z } from "zod";
import { and, asc, count, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { manga, userListItems, userLists } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery } from "./middleware";

const listNameSchema = z.string().trim().min(1, "اسم القائمة مطلوب").max(80);

function isDuplicateEntry(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "ER_DUP_ENTRY"
  );
}

/** يتحقق أن القائمة موجودة ومملوكة للمستخدم ويعيدها */
async function ownedList(listId: number, userId: number) {
  const db = getDb();
  const list = await db.query.userLists.findFirst({
    where: and(eq(userLists.id, listId), eq(userLists.userId, userId)),
  });
  if (!list) {
    throw new TRPCError({ code: "NOT_FOUND", message: "القائمة غير موجودة" });
  }
  return list;
}

export const listsRouter = createRouter({
  /** قوائم المستخدم مع عدد العناصر وأغلفة أول 4 عناصر */
  myLists: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select({
        list: userLists,
        itemCount: count(userListItems.mangaId),
      })
      .from(userLists)
      .leftJoin(userListItems, eq(userListItems.listId, userLists.id))
      .where(eq(userLists.userId, ctx.user.id))
      .groupBy(userLists.id)
      .orderBy(asc(userLists.createdAt), asc(userLists.id));

    return Promise.all(
      rows.map(async (r) => {
        const covers = await db
          .select({ coverUrl: manga.coverUrl })
          .from(userListItems)
          .innerJoin(manga, eq(userListItems.mangaId, manga.id))
          .where(eq(userListItems.listId, r.list.id))
          .orderBy(asc(userListItems.addedAt))
          .limit(4);
        return {
          ...r.list,
          itemCount: r.itemCount,
          covers: covers.map((cv) => cv.coverUrl).filter(Boolean),
        };
      }),
    );
  }),

  createList: authedQuery
    .input(z.object({ name: listNameSchema }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      try {
        const [{ id }] = await db
          .insert(userLists)
          .values({ userId: ctx.user.id, name: input.name })
          .$returningId();
        const list = await db.query.userLists.findFirst({
          where: eq(userLists.id, id),
        });
        return { ...list!, itemCount: 0, covers: [] as string[] };
      } catch (err) {
        if (isDuplicateEntry(err)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "عندك قائمة بنفس الاسم",
          });
        }
        throw err;
      }
    }),

  renameList: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        name: listNameSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await ownedList(input.id, ctx.user.id);
      try {
        await db
          .update(userLists)
          .set({ name: input.name })
          .where(eq(userLists.id, input.id));
      } catch (err) {
        if (isDuplicateEntry(err)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "عندك قائمة بنفس الاسم",
          });
        }
        throw err;
      }
      return { success: true };
    }),

  deleteList: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await ownedList(input.id, ctx.user.id);
      await db.delete(userLists).where(eq(userLists.id, input.id));
      return { success: true };
    }),

  addToList: authedQuery
    .input(
      z.object({
        listId: z.number().int().positive(),
        mangaId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await ownedList(input.listId, ctx.user.id);
      const exists = await db.query.manga.findFirst({
        where: eq(manga.id, input.mangaId),
        columns: { id: true },
      });
      if (!exists) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المانجا غير موجودة" });
      }
      await db
        .insert(userListItems)
        .values({ listId: input.listId, mangaId: input.mangaId })
        .onDuplicateKeyUpdate({ set: { mangaId: input.mangaId } });
      return { success: true };
    }),

  removeFromList: authedQuery
    .input(
      z.object({
        listId: z.number().int().positive(),
        mangaId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await ownedList(input.listId, ctx.user.id);
      await db
        .delete(userListItems)
        .where(
          and(
            eq(userListItems.listId, input.listId),
            eq(userListItems.mangaId, input.mangaId),
          ),
        );
      return { success: true };
    }),

  /** عناصر قائمة مع بيانات المانجا الأساسية للبطاقات */
  listItems: authedQuery
    .input(z.object({ listId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const list = await ownedList(input.listId, ctx.user.id);
      const rows = await db
        .select({
          item: userListItems,
          manga: {
            id: manga.id,
            slug: manga.slug,
            title: manga.title,
            coverUrl: manga.coverUrl,
            type: manga.type,
            status: manga.status,
            rating: manga.rating,
            chapterCount: manga.chapterCount,
          },
        })
        .from(userListItems)
        .innerJoin(manga, eq(userListItems.mangaId, manga.id))
        .where(eq(userListItems.listId, list.id))
        .orderBy(asc(userListItems.addedAt));
      return {
        list,
        items: rows.map((r) => ({ ...r.item, manga: r.manga })),
      };
    }),
});
