import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { setSetting } from "./lib/siteSettings";
import {
  awardCoins,
  coinSettingInt,
  COIN_SETTING_DEFAULTS,
  COIN_SETTING_KEYS,
  spendCoins,
} from "./lib/coins";
import { currentWeekKey } from "./lib/polls";
import { pollOptions, polls, shopItems } from "@db/schemaCoins";
import { users } from "@db/schema";

const COIN_KEY_LIST = Object.values(COIN_SETTING_KEYS) as string[];

const settingKeySchema = z
  .string()
  .refine((v) => COIN_KEY_LIST.includes(v), { message: "مفتاح غير معروف" });

function parseMeta(raw?: string): Record<string, unknown> | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "صيغة JSON للـ meta غير صالحة" });
  }
}

export const adminCoinsRouter = createRouter({
  /** كل قيم إعدادات الاقتصاد + القيم الافتراضية */
  getSettings: adminQuery.query(async () => {
    const values: Record<string, number> = {};
    for (const key of COIN_KEY_LIST) {
      values[key] = await coinSettingInt(key);
    }
    return { values, defaults: COIN_SETTING_DEFAULTS };
  }),

  /** تعديل قيمة إعداد واحد — يُطبَّق فوراً (إبطال كاش الإعدادات) */
  setSetting: adminQuery
    .input(
      z.object({
        key: settingKeySchema,
        value: z.number().int().min(0).max(100000),
      }),
    )
    .mutation(async ({ input }) => {
      await setSetting(input.key, String(input.value));
      return { ok: true };
    }),

  /** منح/خصم كوينز يدوياً لمستخدم بالبريد — موجب منح، سالب خصم (لا ينزل تحت الصفر) */
  grantCoins: adminQuery
    .input(
      z.object({
        email: z.string().email(),
        amount: z.number().int().min(-10000).max(10000).refine((v) => v !== 0, {
          message: "المبلغ لا يمكن أن يكون صفراً",
        }),
        note: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const user = await db.query.users.findFirst({
        where: eq(users.email, input.email.trim().toLowerCase()),
        columns: { id: true },
      });
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "لا يوجد مستخدم بهذا البريد",
        });
      }
      const userId = Number(user.id);
      const meta = {
        note: input.note ?? null,
        byAdminId: Number(ctx.user.id),
      };
      let balance: number;
      if (input.amount > 0) {
        balance = await awardCoins(userId, input.amount, "admin", meta);
      } else {
        const spend = await spendCoins(userId, -input.amount, "admin", meta);
        if (!spend.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "الرصيد لا يكفي" });
        }
        balance = spend.balance;
      }
      return { ok: true, balance };
    }),

  /** إضافة/تعديل عنصر متجر (id موجود → تحديث) */
  shopUpsertItem: adminQuery
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        itemKey: z.string().min(1).max(64),
        type: z.enum(["theme", "badge", "adfree"]),
        nameAr: z.string().min(1).max(128),
        nameEn: z.string().min(1).max(128),
        price: z.number().int().min(0).max(100000),
        meta: z.string().max(2000).optional(),
        active: z.boolean(),
        sort: z.number().int().min(0).max(999),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const values = {
        itemKey: input.itemKey.trim(),
        type: input.type,
        nameAr: input.nameAr.trim(),
        nameEn: input.nameEn.trim(),
        price: input.price,
        meta: parseMeta(input.meta),
        active: input.active,
        sort: input.sort,
      };
      if (input.id) {
        await db.update(shopItems).set(values).where(eq(shopItems.id, input.id));
      } else {
        await db.insert(shopItems).values(values);
      }
      return { ok: true };
    }),

  /** حذف عنصر متجر نهائياً */
  shopDeleteItem: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await getDb().delete(shopItems).where(eq(shopItems.id, input.id));
      return { ok: true };
    }),

  /** إنشاء استطلاع أسبوعي جديد — يعطّل أي استطلاع نشط سابق */
  createPoll: adminQuery
    .input(
      z.object({
        questionAr: z.string().min(1).max(255),
        questionEn: z.string().min(1).max(255),
        options: z
          .array(
            z.object({
              textAr: z.string().min(1).max(255),
              textEn: z.string().min(1).max(255),
            }),
          )
          .min(2)
          .max(6),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(polls).set({ active: false }).where(eq(polls.active, true));
      const result = await db.insert(polls).values({
        questionAr: input.questionAr.trim(),
        questionEn: input.questionEn.trim(),
        active: true,
        weekKey: currentWeekKey(),
      });
      const id = Number((result as unknown as [{ insertId: number | string }])[0]?.insertId);
      await db.insert(pollOptions).values(
        input.options.map((o) => ({
          pollId: id,
          textAr: o.textAr.trim(),
          textEn: o.textEn.trim(),
        })),
      );
      return { ok: true, id };
    }),

  /** إغلاق استطلاع (إيقاف التصويت عليه) */
  closePoll: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await getDb().update(polls).set({ active: false }).where(eq(polls.id, input.id));
      return { ok: true };
    }),
});
