import { and, eq, gte, sql } from "drizzle-orm";
import {
  chapterCompletions,
  coinTransactions,
  coinWallets,
} from "@db/schemaCoins";
import { getDb } from "../queries/connection";
import { getSetting } from "./siteSettings";

/**
 * محرك الكوينز/XP — كل القيم قابلة للتعديل من لوحة الأدمن عبر site_settings
 * بدون إعادة نشر. المفاتيح وقيمها الافتراضية:
 */

export const COIN_SETTING_KEYS = {
  /** كوين لكل فصل مكتمل (افتراضي 5) */
  perChapter: "coins.per_chapter",
  /** الحد اليومي لكوينز القراءة (افتراضي 50) */
  dailyCap: "coins.daily_cap",
  /** XP لكل فصل مكتمل (افتراضي 10) */
  xpPerChapter: "coins.xp_per_chapter",
  /** XP المطلوب لكل مستوى (افتراضي 100) */
  xpPerLevel: "coins.xp_per_level",
  /** مكافأة تسجيل الدخول اليومي الأساسية (افتراضي 10) */
  checkinBase: "coins.checkin_base",
  /** أقصى يوم يُحتسب في مضاعف الـ check-in (افتراضي 7 → 70 كوين) */
  checkinMaxDay: "coins.checkin_max_day",
} as const;

const DEFAULTS: Record<string, number> = {
  [COIN_SETTING_KEYS.perChapter]: 5,
  [COIN_SETTING_KEYS.dailyCap]: 50,
  [COIN_SETTING_KEYS.xpPerChapter]: 10,
  [COIN_SETTING_KEYS.xpPerLevel]: 100,
  [COIN_SETTING_KEYS.checkinBase]: 10,
  [COIN_SETTING_KEYS.checkinMaxDay]: 7,
};

export async function coinSettingInt(key: string): Promise<number> {
  const raw = await getSetting(key);
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : (DEFAULTS[key] ?? 0);
}

function dateStr(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return dateStr(d);
}

export type Wallet = typeof coinWallets.$inferSelect;

/** جلب محفظة المستخدم أو إنشاؤها */
export async function getOrCreateWallet(userId: number): Promise<Wallet> {
  const db = getDb();
  const existing = await db.query.coinWallets.findFirst({
    where: eq(coinWallets.userId, userId),
  });
  if (existing) return existing;
  await db
    .insert(coinWallets)
    .values({ userId })
    .onDuplicateKeyUpdate({ set: { userId } });
  const created = await db.query.coinWallets.findFirst({
    where: eq(coinWallets.userId, userId),
  });
  return created ?? {
    userId,
    coins: 0,
    xp: 0,
    level: 1,
    streakDays: 0,
    lastReadDate: null,
    checkinDays: 0,
    lastCheckinDate: null,
    lastSpinDate: null,
    updatedAt: new Date(),
  };
}

/** إضافة/خصم كوينز مع تسجيل العملية — المصدر الوحيد لتعديل الرصيد */
export async function awardCoins(
  userId: number,
  amount: number,
  kind: string,
  meta?: Record<string, unknown>,
): Promise<number> {
  const db = getDb();
  await getOrCreateWallet(userId);
  await db
    .update(coinWallets)
    .set({ coins: sql`${coinWallets.coins} + ${amount}` })
    .where(eq(coinWallets.userId, userId));
  await db.insert(coinTransactions).values({
    userId,
    amount,
    kind,
    meta: meta ?? null,
  });
  const w = await getOrCreateWallet(userId);
  return w.coins;
}

/** كوينز القراءة المكتسبة اليوم (لفرض الحد اليومي) */
export async function coinsEarnedToday(userId: number, kind = "read"): Promise<number> {
  const db = getDb();
  const startOfToday = new Date(dateStr());
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${coinTransactions.amount}),0)` })
    .from(coinTransactions)
    .where(
      and(
        eq(coinTransactions.userId, userId),
        eq(coinTransactions.kind, kind),
        gte(coinTransactions.createdAt, startOfToday),
      ),
    );
  return Number(row?.total ?? 0);
}

/** إضافة XP وإعادة حساب المستوى — يرجع { xp, level, leveledUp } */
export async function addXp(
  userId: number,
  amount: number,
): Promise<{ xp: number; level: number; leveledUp: boolean }> {
  const perLevel = await coinSettingInt(COIN_SETTING_KEYS.xpPerLevel);
  const w = await getOrCreateWallet(userId);
  const xp = w.xp + amount;
  const level = Math.floor(xp / Math.max(perLevel, 1)) + 1;
  await getDb()
    .update(coinWallets)
    .set({ xp, level })
    .where(eq(coinWallets.userId, userId));
  return { xp, level, leveledUp: level > w.level };
}

/**
 * تسجيل إكمال فصل — يُستدعى من القارئ عند وصول آخر صفحة.
 * - أول إكمال للفصل فقط يمنح كوينز + XP (إعادة القراءة لا تمنح شيئاً)
 * - كوينز القراءة محدودة يومياً (coins.daily_cap)
 * - يحدّث سلسلة أيام القراءة (streak)
 */
export async function completeChapter(
  userId: number,
  mangaId: number,
  chapterId: number,
): Promise<{
  alreadyCompleted: boolean;
  coinsAwarded: number;
  xpAwarded: number;
  level: number;
  leveledUp: boolean;
  streakDays: number;
  dailyEarned: number;
  dailyCap: number;
}> {
  const db = getDb();
  const existing = await db.query.chapterCompletions.findFirst({
    where: and(
      eq(chapterCompletions.userId, userId),
      eq(chapterCompletions.chapterId, chapterId),
    ),
  });

  const w = await getOrCreateWallet(userId);
  const today = dateStr();

  // تحديث الستريك (يُحسب حتى لو الفصل مقروء سابقاً — النشاط اليومي هو المهم)
  let streakDays = w.streakDays;
  if (w.lastReadDate !== today) {
    streakDays = w.lastReadDate === yesterdayStr() ? w.streakDays + 1 : 1;
  }

  let coinsAwarded = 0;
  let xpAwarded = 0;
  let level = w.level;
  let leveledUp = false;

  if (!existing) {
    await db.insert(chapterCompletions).values({ userId, mangaId, chapterId });

    const per = await coinSettingInt(COIN_SETTING_KEYS.perChapter);
    const cap = await coinSettingInt(COIN_SETTING_KEYS.dailyCap);
    const earnedToday = await coinsEarnedToday(userId, "read");
    if (earnedToday < cap) {
      coinsAwarded = Math.min(per, cap - earnedToday);
      if (coinsAwarded > 0) {
        await awardCoins(userId, coinsAwarded, "read", { mangaId, chapterId });
      }
    }

    xpAwarded = await coinSettingInt(COIN_SETTING_KEYS.xpPerChapter);
    const xpRes = await addXp(userId, xpAwarded);
    level = xpRes.level;
    leveledUp = xpRes.leveledUp;
  }

  await db
    .update(coinWallets)
    .set({ streakDays, lastReadDate: today })
    .where(eq(coinWallets.userId, userId));

  return {
    alreadyCompleted: Boolean(existing),
    coinsAwarded,
    xpAwarded,
    level,
    leveledUp,
    streakDays,
    dailyEarned: await coinsEarnedToday(userId, "read"),
    dailyCap: await coinSettingInt(COIN_SETTING_KEYS.dailyCap),
  };
}

/**
 * تسجيل الدخول اليومي (Daily Check-in):
 * المكافأة = checkin_base × min(checkinDays, checkin_max_day)
 * يوم 1 = 10 … يوم 7+ = 70
 */
export async function dailyCheckin(userId: number): Promise<
  | { ok: true; reward: number; checkinDays: number; balance: number }
  | { ok: false; reason: "already_checked_in" }
> {
  const db = getDb();
  const w = await getOrCreateWallet(userId);
  const today = dateStr();
  if (w.lastCheckinDate === today) {
    return { ok: false, reason: "already_checked_in" };
  }
  const checkinDays =
    w.lastCheckinDate === yesterdayStr() ? w.checkinDays + 1 : 1;
  const base = await coinSettingInt(COIN_SETTING_KEYS.checkinBase);
  const maxDay = await coinSettingInt(COIN_SETTING_KEYS.checkinMaxDay);
  const reward = base * Math.min(checkinDays, Math.max(maxDay, 1));
  await db
    .update(coinWallets)
    .set({ checkinDays, lastCheckinDate: today })
    .where(eq(coinWallets.userId, userId));
  const balance = await awardCoins(userId, reward, "checkin", { checkinDays });
  return { ok: true, reward, checkinDays, balance };
}
