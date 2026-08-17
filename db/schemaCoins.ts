/**
 * جداول نظام الكوينز/XP/الستريك — منفصلة عن schema.ts الأساسية.
 * الإنشاء الفعلي يتم عبر ensureBootSchema() (CREATE TABLE IF NOT EXISTS).
 */
import {
  mysqlTable,
  varchar,
  timestamp,
  bigint,
  int,
  json,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/mysql-core";
import { users } from "./schema";

/** محفظة كل مستخدم: الرصيد + XP + المستوى + الستريك + آخر أيام النشاط */
export const coinWallets = mysqlTable("coin_wallets", {
  userId: bigint("userId", { mode: "number", unsigned: true })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  coins: int("coins").default(0).notNull(),
  xp: int("xp").default(0).notNull(),
  level: int("level").default(1).notNull(),
  /** أيام القراءة المتتالية */
  streakDays: int("streakDays").default(0).notNull(),
  /** آخر يوم قراءة (YYYY-MM-DD UTC) */
  lastReadDate: varchar("lastReadDate", { length: 10 }),
  /** أيام تسجيل الحضور المتتالية */
  checkinDays: int("checkinDays").default(0).notNull(),
  lastCheckinDate: varchar("lastCheckinDate", { length: 10 }),
  lastSpinDate: varchar("lastSpinDate", { length: 10 }),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type CoinWallet = typeof coinWallets.$inferSelect;

/** سجل كل حركة كوينز (كسب/صرف) — موجب = كسب، سالب = صرف */
export const coinTransactions = mysqlTable(
  "coin_transactions",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: int("amount").notNull(),
    /** read | checkin | mission | spin | referral | achievement | streak | shop_spend | admin */
    kind: varchar("kind", { length: 40 }).notNull(),
    meta: json("meta").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("coin_transactions_user_idx").on(table.userId),
    createdIdx: index("coin_transactions_created_idx").on(table.createdAt),
  }),
);

export type CoinTransaction = typeof coinTransactions.$inferSelect;

/** الفصول المكتملة لكل مستخدم — أول إكمال فقط يمنح مكافأة */
export const chapterCompletions = mysqlTable(
  "chapter_completions",
  {
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chapterId: bigint("chapterId", { mode: "number", unsigned: true })
      .notNull(),
    mangaId: bigint("mangaId", { mode: "number", unsigned: true })
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.chapterId] }),
    userIdx: index("chapter_completions_user_idx").on(table.userId),
  }),
);

export type ChapterCompletion = typeof chapterCompletions.$inferSelect;

/** مطالبات المهام اليومية — صف واحد لكل (مستخدم، مهمة، يوم) */
export const userMissionClaims = mysqlTable(
  "user_mission_claims",
  {
    userId: int("userId").notNull(),
    /** read | comment | rate | library */
    missionKey: varchar("missionKey", { length: 64 }).notNull(),
    /** اليوم بصيغة YYYY-MM-DD (UTC) */
    periodKey: varchar("periodKey", { length: 16 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.userId, table.missionKey, table.periodKey],
    }),
  }),
);

export type UserMissionClaim = typeof userMissionClaims.$inferSelect;

/** الإحالات: المدعو فريد (يُحال مرة واحدة)، تُدفع المكافأة عند بلوغ حد الفصول */
export const referrals = mysqlTable(
  "referrals",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    inviterId: int("inviterId").notNull(),
    inviteeId: int("inviteeId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    rewardedAt: timestamp("rewardedAt"),
  },
  (table) => ({
    inviteeUnique: uniqueIndex("referrals_invitee_unique").on(table.inviteeId),
    inviterIdx: index("referrals_inviter_idx").on(table.inviterId),
  }),
);

export type Referral = typeof referrals.$inferSelect;
