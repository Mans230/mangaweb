/**
 * نظام تذاكر الدعم — المستخدم يفتح تذكرة ويرد عليها، والأدمن يرد ويغيّر الحالة.
 * رد الإدارة يُنشئ إشعاراً للمستخدم (type=ticket_reply).
 */
import { z } from "zod";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  notifications,
  supportTicketMessages,
  supportTickets,
  users,
} from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import { checkRateLimit, clientIp } from "./lib/rateLimit";

const categoryEnum = z.enum(["general", "technical", "source", "other"]);
const statusEnum = z.enum(["open", "answered", "closed"]);

const excerptOf = (body: string, max = 140) =>
  body.length > max ? `${body.slice(0, max)}…` : body;

/** تذكرة مملوكة للمستخدم الحالي وإلا 404 */
async function ownTicket(ticketId: number, userId: number) {
  const db = getDb();
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1);
  if (!ticket || ticket.userId !== userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "التذكرة غير موجودة" });
  }
  return ticket;
}

export const supportRouter = createRouter({
  /* ================= المستخدم ================= */

  /** فتح تذكرة جديدة مع أول رسالة */
  create: authedQuery
    .input(
      z.object({
        subject: z.string().trim().min(3).max(200),
        category: categoryEnum.default("general"),
        body: z.string().trim().min(5).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ip = clientIp(ctx.req);
      if (!checkRateLimit(`support:create:${ctx.user.id}:${ip}`, 5, 60 * 60 * 1000)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "فتحت تذاكر كثيرة — جرّب لاحقاً",
        });
      }
      const db = getDb();
      const [{ id }] = await db
        .insert(supportTickets)
        .values({
          userId: ctx.user.id,
          subject: input.subject,
          category: input.category,
        })
        .$returningId();
      await db.insert(supportTicketMessages).values({
        ticketId: id,
        authorId: ctx.user.id,
        isAdmin: false,
        body: input.body,
      });
      return { id, success: true as const };
    }),

  /** تذاكر المستخدم + مقتطف آخر رسالة + عدد ردود الإدارة غير المقروءة */
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const tickets = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.userId, ctx.user.id))
      .orderBy(desc(supportTickets.updatedAt))
      .limit(100);
    if (!tickets.length) return { items: [] };

    const ids = tickets.map((t) => t.id);
    const msgs = await db
      .select()
      .from(supportTicketMessages)
      .where(sql`${supportTicketMessages.ticketId} IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`)
      .orderBy(desc(supportTicketMessages.id));

    // إشعارات ticket_reply غير المقروءة لهذه التذاكر → عداد لكل تذكرة
    const unreadNotifs = await db
      .select({
        ticketId: sql<number>`JSON_EXTRACT(${notifications.payload}, '$.ticketId')`,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ctx.user.id),
          eq(notifications.type, "ticket_reply"),
          sql`${notifications.readAt} IS NULL`,
        ),
      );
    const unreadByTicket = new Map<number, number>();
    for (const n of unreadNotifs) {
      const tid = Number(n.ticketId);
      unreadByTicket.set(tid, (unreadByTicket.get(tid) ?? 0) + 1);
    }

    const lastByTicket = new Map<number, (typeof msgs)[number]>();
    const countByTicket = new Map<number, number>();
    for (const m of msgs) {
      if (!lastByTicket.has(m.ticketId)) lastByTicket.set(m.ticketId, m);
      countByTicket.set(m.ticketId, (countByTicket.get(m.ticketId) ?? 0) + 1);
    }

    return {
      items: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        category: t.category,
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        excerpt: excerptOf(lastByTicket.get(t.id)?.body ?? ""),
        messagesCount: countByTicket.get(t.id) ?? 0,
        unreadAdmin: unreadByTicket.get(t.id) ?? 0,
      })),
    };
  }),

  /** تذكرة واحدة + كل رسائلها (المالك فقط) */
  get: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const ticket = await ownTicket(input.id, ctx.user.id);
      const msgs = await db
        .select({
          id: supportTicketMessages.id,
          isAdmin: supportTicketMessages.isAdmin,
          body: supportTicketMessages.body,
          createdAt: supportTicketMessages.createdAt,
          authorName: users.name,
        })
        .from(supportTicketMessages)
        .innerJoin(users, eq(supportTicketMessages.authorId, users.id))
        .where(eq(supportTicketMessages.ticketId, ticket.id))
        .orderBy(supportTicketMessages.id);
      return { ticket, messages: msgs };
    }),

  /** رد المستخدم على تذكرته (غير المغلقة) */
  reply: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        body: z.string().trim().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const ticket = await ownTicket(input.id, ctx.user.id);
      if (ticket.status === "closed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "التذكرة مغلقة — افتح تذكرة جديدة",
        });
      }
      await db.insert(supportTicketMessages).values({
        ticketId: ticket.id,
        authorId: ctx.user.id,
        isAdmin: false,
        body: input.body,
      });
      await db
        .update(supportTickets)
        // رد المستخدم بعد رد الإدارة يعيدها "مفتوحة"
        .set({ status: "open", updatedAt: new Date() })
        .where(eq(supportTickets.id, ticket.id));
      return { success: true as const };
    }),

  /** إغلاق المستخدم لتذكرته */
  close: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const ticket = await ownTicket(input.id, ctx.user.id);
      if (ticket.status !== "closed") {
        await db
          .update(supportTickets)
          .set({ status: "closed", updatedAt: new Date() })
          .where(eq(supportTickets.id, ticket.id));
      }
      return { success: true as const };
    }),

  /* ================= الأدمن ================= */

  /** كل التذاكر معلومات المستخدم + أعداد الرسائل */
  listTickets: adminQuery
    .input(
      z.object({
        status: statusEnum.optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = input.status
        ? eq(supportTickets.status, input.status)
        : undefined;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            ticket: supportTickets,
            userName: users.name,
            userUsername: users.username,
          })
          .from(supportTickets)
          .innerJoin(users, eq(supportTickets.userId, users.id))
          .where(where)
          .orderBy(desc(supportTickets.updatedAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ total: count() }).from(supportTickets).where(where),
      ]);
      if (!rows.length) return { items: [], total, page: input.page };

      const ids = rows.map((r) => r.ticket.id);
      const msgs = await db
        .select()
        .from(supportTicketMessages)
        .where(sql`${supportTicketMessages.ticketId} IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )})`)
        .orderBy(desc(supportTicketMessages.id));
      const lastByTicket = new Map<number, (typeof msgs)[number]>();
      const countByTicket = new Map<number, number>();
      for (const m of msgs) {
        if (!lastByTicket.has(m.ticketId)) lastByTicket.set(m.ticketId, m);
        countByTicket.set(m.ticketId, (countByTicket.get(m.ticketId) ?? 0) + 1);
      }

      return {
        items: rows.map((r) => ({
          id: r.ticket.id,
          subject: r.ticket.subject,
          category: r.ticket.category,
          status: r.ticket.status,
          createdAt: r.ticket.createdAt,
          updatedAt: r.ticket.updatedAt,
          userName: r.userName ?? r.userUsername ?? `#${r.ticket.userId}`,
          excerpt: excerptOf(lastByTicket.get(r.ticket.id)?.body ?? ""),
          messagesCount: countByTicket.get(r.ticket.id) ?? 0,
        })),
        total,
        page: input.page,
      };
    }),

  /** تذكرة + رسائلها (أي تذكرة — أدمن) */
  getTicket: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [ticket] = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, input.id))
        .limit(1);
      if (!ticket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "التذكرة غير موجودة" });
      }
      const [owner] = await db
        .select({ name: users.name, username: users.username })
        .from(users)
        .where(eq(users.id, ticket.userId))
        .limit(1);
      const msgs = await db
        .select({
          id: supportTicketMessages.id,
          isAdmin: supportTicketMessages.isAdmin,
          body: supportTicketMessages.body,
          createdAt: supportTicketMessages.createdAt,
          authorName: users.name,
        })
        .from(supportTicketMessages)
        .innerJoin(users, eq(supportTicketMessages.authorId, users.id))
        .where(eq(supportTicketMessages.ticketId, ticket.id))
        .orderBy(supportTicketMessages.id);
      return {
        ticket,
        ownerName: owner?.name ?? owner?.username ?? `#${ticket.userId}`,
        messages: msgs,
      };
    }),

  /** رد الإدارة → الحالة answered + إشعار للمستخدم */
  replyTicket: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        body: z.string().trim().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [ticket] = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, input.id))
        .limit(1);
      if (!ticket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "التذكرة غير موجودة" });
      }
      await db.insert(supportTicketMessages).values({
        ticketId: ticket.id,
        authorId: ctx.user.id,
        isAdmin: true,
        body: input.body,
      });
      await db
        .update(supportTickets)
        .set({ status: "answered", updatedAt: new Date() })
        .where(eq(supportTickets.id, ticket.id));
      await db.insert(notifications).values({
        userId: ticket.userId,
        type: "ticket_reply",
        payload: {
          ticketId: ticket.id,
          subject: ticket.subject,
          excerpt: excerptOf(input.body),
        },
      });
      return { success: true as const };
    }),

  /** تغيير حالة تذكرة (فتح/إغلاق…) */
  setTicketStatus: adminQuery
    .input(z.object({ id: z.number().int().positive(), status: statusEnum }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(supportTickets)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(supportTickets.id, input.id));
      return { success: true as const };
    }),
});
