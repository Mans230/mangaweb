/**
 * إعلانات الموقع — بانر علوي لكل الزوار + صفحة أرشيف /announcements + تحكّم أدمن.
 */
import { z } from "zod";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { announcements } from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, publicQuery, adminQuery } from "./middleware";

const typeEnum = z.enum(["info", "warning", "maintenance", "new"]);
const audienceEnum = z.enum(["all", "users"]);

/** شرط النافذة الزمنية: بدأ ولم ينتهِ */
function withinWindow() {
  return and(
    or(sql`${announcements.startsAt} IS NULL`, sql`${announcements.startsAt} <= NOW()`),
    or(sql`${announcements.endsAt} IS NULL`, sql`${announcements.endsAt} >= NOW()`),
  );
}

const upsertInput = z.object({
  type: typeEnum.default("info"),
  title: z.string().trim().min(2).max(200),
  body: z.string().trim().min(2).max(5000),
  linkUrl: z.string().trim().url().max(500).nullish(),
  linkLabel: z.string().trim().max(80).nullish(),
  audience: audienceEnum.default("all"),
  active: z.boolean().default(true),
  startsAt: z.coerce.date().nullish(),
  endsAt: z.coerce.date().nullish(),
});

export const announcementsRouter = createRouter({
  /* ================= عام ================= */

  /** الإعلانات النشطة ضمن النافذة الزمنية — مرئية للزائر حسب الجمهور */
  active: publicQuery.query(async ({ ctx }) => {
    const db = getDb();
    const audienceCond = ctx.user
      ? undefined
      : eq(announcements.audience, "all");
    const rows = await db
      .select()
      .from(announcements)
      .where(and(eq(announcements.active, true), withinWindow(), audienceCond))
      .orderBy(desc(announcements.createdAt))
      .limit(20);
    return { items: rows };
  }),

  /* ================= أدمن ================= */

  list: adminQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(announcements)
      .orderBy(desc(announcements.createdAt))
      .limit(200);
    return { items: rows };
  }),

  create: adminQuery.input(upsertInput).mutation(async ({ input }) => {
    const db = getDb();
    const [{ id }] = await db
      .insert(announcements)
      .values({
        type: input.type,
        title: input.title,
        body: input.body,
        linkUrl: input.linkUrl ?? null,
        linkLabel: input.linkLabel ?? null,
        audience: input.audience,
        active: input.active,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
      })
      .$returningId();
    return { id, success: true as const };
  }),

  update: adminQuery
    .input(upsertInput.partial().extend({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const db = getDb();
      await db.update(announcements).set(rest).where(eq(announcements.id, id));
      return { success: true as const };
    }),

  setActive: adminQuery
    .input(z.object({ id: z.number().int().positive(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(announcements)
        .set({ active: input.active })
        .where(eq(announcements.id, input.id));
      return { success: true as const };
    }),

  remove: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const res = await db
        .delete(announcements)
        .where(eq(announcements.id, input.id));
      if (!res) throw new TRPCError({ code: "NOT_FOUND" });
      return { success: true as const };
    }),
});
