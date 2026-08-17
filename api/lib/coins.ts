import { and, eq, gte, sql } from "drizzle-orm";
import {
  chapterCompletions,
  coinTransactions,
  coinWallets,
  referrals,
  userMissionClaims,
} from "@db/schemaCoins";
import { comments, favorites, ratings, users } from "@db/schema";
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
  /** مكافأة مهمة قراءة الفصول اليومية (افتراضي 30) */
  missionRead3Reward: "coins.mission_read3_reward",
  /** عدد الفصول المطلوبة لمهمة القراءة (افتراضي 3) */
  missionRead3Count: "coins.mission_read3_count",
  /** مكافأة مهمة التعليق (افتراضي 10) */
  missionCommentReward: "coins.mission_comment_reward",
  /** مكافأة مهمة التقييم (افتراضي 10) */
  missionRateReward: "coins.mission_rate_reward",
  /** مكافأة مهمة الإضافة للمكتبة (افتراضي 5) */
  missionLibraryReward: "coins.mission_library_reward",
  /** أدنى جائزة لعجلة الحظ (افتراضي 5) */
  spinMin: "coins.spin_min",
  /** أقصى جائزة لعجلة الحظ (افتراضي 100) */
  spinMax: "coins.spin_max",
  /** مكافأة الداعي في الإحالة (افتراضي 100) */
  referralInviter: "coins.referral_inviter",
  /** مكافأة المدعو في الإحالة (افتراضي 50) */
  referralInvitee: "coins.referral_invitee",
  /** عدد الفصول التي يكملها المدعو لدفع مكافأة الإحالة (افتراضي 5) */
  referralThreshold: "coins.referral_threshold",
} as const;

const DEFAULTS: Record<string, number> = {
  [COIN_SETTING_KEYS.perChapter]: 5,
  [COIN_SETTING_KEYS.dailyCap]: 50,
  [COIN_SETTING_KEYS.xpPerChapter]: 10,
  [COIN_SETTING_KEYS.xpPerLevel]: 100,
  [COIN_SETTING_KEYS.checkinBase]: 10,
  [COIN_SETTING_KEYS.checkinMaxDay]: 7,
  [COIN_SETTING_KEYS.missionRead3Reward]: 30,
  [COIN_SETTING_KEYS.missionRead3Count]: 3,
  [COIN_SETTING_KEYS.missionCommentReward]: 10,
  [COIN_SETTING_KEYS.missionRateReward]: 10,
  [COIN_SETTING_KEYS.missionLibraryReward]: 5,
  [COIN_SETTING_KEYS.spinMin]: 5,
  [COIN_SETTING_KEYS.spinMax]: 100,
  [COIN_SETTING_KEYS.referralInviter]: 100,
  [COIN_SETTING_KEYS.referralInvitee]: 50,
  [COIN_SETTING_KEYS.referralThreshold]: 5,
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
 * - أفضل جهد: يفحص مكافأة الإحالة بعد كل إكمال
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

  // أفضل جهد: دفع مكافأة الإحالة عند بلوغ المدعو حد الفصول — لا يُفشل الإكمال أبداً
  try {
    await maybeRewardReferral(userId);
  } catch (e) {
    console.warn(`[coins] maybeRewardReferral: ${(e as Error).message}`);
  }

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

// ================= المهام اليومية =================

export const MISSION_KEYS = ["read", "comment", "rate", "library"] as const;
export type MissionKey = (typeof MISSION_KEYS)[number];

export type MissionInfo = {
  key: MissionKey;
  target: number;
  progress: number;
  reward: number;
  claimed: boolean;
  claimable: boolean;
};

/** المهام اليومية الأربع مع تقدّم المستخدم وحالة الاستلام */
export async function getMissions(userId: number): Promise<MissionInfo[]> {
  const db = getDb();
  const today = dateStr();
  const startOfToday = new Date(today);
  const [readTarget, readReward, commentReward, rateReward, libraryReward] =
    await Promise.all([
      coinSettingInt(COIN_SETTING_KEYS.missionRead3Count),
      coinSettingInt(COIN_SETTING_KEYS.missionRead3Reward),
      coinSettingInt(COIN_SETTING_KEYS.missionCommentReward),
      coinSettingInt(COIN_SETTING_KEYS.missionRateReward),
      coinSettingInt(COIN_SETTING_KEYS.missionLibraryReward),
    ]);
  const [readRow, commentRow, rateRow, libraryRow, claims] = await Promise.all([
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(chapterCompletions)
      .where(
        and(
          eq(chapterCompletions.userId, userId),
          gte(chapterCompletions.createdAt, startOfToday),
        ),
      ),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(comments)
      .where(
        and(eq(comments.userId, userId), gte(comments.createdAt, startOfToday)),
      ),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(ratings)
      .where(
        and(eq(ratings.userId, userId), gte(ratings.createdAt, startOfToday)),
      ),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(favorites)
      .where(
        and(
          eq(favorites.userId, userId),
          gte(favorites.createdAt, startOfToday),
        ),
      ),
    db
      .select({ missionKey: userMissionClaims.missionKey })
      .from(userMissionClaims)
      .where(
        and(
          eq(userMissionClaims.userId, userId),
          eq(userMissionClaims.periodKey, today),
        ),
      ),
  ]);
  const claimedKeys = new Set(claims.map((c) => c.missionKey));

  const defs: { key: MissionKey; target: number; progress: number; reward: number }[] = [
    {
      key: "read",
      target: Math.max(readTarget, 1),
      progress: Number(readRow[0]?.c ?? 0),
      reward: readReward,
    },
    {
      key: "comment",
      target: 1,
      progress: Number(commentRow[0]?.c ?? 0),
      reward: commentReward,
    },
    {
      key: "rate",
      target: 1,
      progress: Number(rateRow[0]?.c ?? 0),
      reward: rateReward,
    },
    {
      key: "library",
      target: 1,
      progress: Number(libraryRow[0]?.c ?? 0),
      reward: libraryReward,
    },
  ];

  return defs.map((d) => {
    const claimed = claimedKeys.has(d.key);
    return {
      ...d,
      claimed,
      claimable: d.progress >= d.target && !claimed,
    };
  });
}

/** استلام مكافأة مهمة — يعيد الحساب ثم يسجّل المطالبة ويمنح الكوينز */
export async function claimMission(
  userId: number,
  key: MissionKey,
): Promise<{ ok: true; reward: number } | { ok: false }> {
  const items = await getMissions(userId);
  const mission = items.find((m) => m.key === key);
  if (!mission || !mission.claimable) return { ok: false };
  try {
    await getDb().insert(userMissionClaims).values({
      userId,
      missionKey: key,
      periodKey: dateStr(),
    });
  } catch {
    // المفتاح المركّب يمنع التكرار — أي خطأ إدراج = سبق الاستلام
    return { ok: false };
  }
  await awardCoins(userId, mission.reward, "mission", { mission: key });
  return { ok: true, reward: mission.reward };
}

// ================= عجلة الحظ =================

/** لفة يومية واحدة — جائزة عشوائية بين spin_min و spin_max (شاملة) */
export async function luckySpin(userId: number): Promise<
  | { ok: true; reward: number; balance: number }
  | { ok: false; reason: "already_spun" }
> {
  const db = getDb();
  const w = await getOrCreateWallet(userId);
  const today = dateStr();
  if (w.lastSpinDate === today) {
    return { ok: false, reason: "already_spun" };
  }
  const min = await coinSettingInt(COIN_SETTING_KEYS.spinMin);
  const max = await coinSettingInt(COIN_SETTING_KEYS.spinMax);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const reward = lo + Math.floor(Math.random() * (hi - lo + 1));
  await db
    .update(coinWallets)
    .set({ lastSpinDate: today })
    .where(eq(coinWallets.userId, userId));
  const balance = await awardCoins(userId, reward, "spin");
  return { ok: true, reward, balance };
}

// ================= الإحالات =================

/** تسجيل إحالة عند التسجيل — يتجاهل الإحالة الذاتية/الداعي غير الموجود/المدعو المكرر */
export async function registerReferral(
  inviterId: number,
  inviteeId: number,
): Promise<boolean> {
  if (!Number.isFinite(inviterId) || !Number.isFinite(inviteeId)) return false;
  if (inviterId === inviteeId) return false;
  const db = getDb();
  const inviter = await db.query.users.findFirst({
    where: eq(users.id, inviterId),
    columns: { id: true },
  });
  if (!inviter) return false;
  try {
    await db.insert(referrals).values({ inviterId, inviteeId });
    return true;
  } catch {
    // inviteeId فريد — المدعو مُحال مسبقاً
    return false;
  }
}

/**
 * دفع مكافأة الإحالة (مرة واحدة) عند بلوغ المدعو حد الفصول المكتملة.
 * تُستدعى من completeChapter — ترجع true إذا دُفعت المكافأة.
 */
export async function maybeRewardReferral(inviteeId: number): Promise<boolean> {
  const db = getDb();
  const ref = await db.query.referrals.findFirst({
    where: eq(referrals.inviteeId, inviteeId),
  });
  if (!ref || ref.rewardedAt) return false;
  const threshold = await coinSettingInt(COIN_SETTING_KEYS.referralThreshold);
  const [row] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(chapterCompletions)
    .where(eq(chapterCompletions.userId, inviteeId));
  if (Number(row?.c ?? 0) < Math.max(threshold, 1)) return false;
  const inviterReward = await coinSettingInt(COIN_SETTING_KEYS.referralInviter);
  const inviteeReward = await coinSettingInt(COIN_SETTING_KEYS.referralInvitee);
  await awardCoins(ref.inviterId, inviterReward, "referral", {
    role: "inviter",
    inviteeId,
  });
  await awardCoins(inviteeId, inviteeReward, "referral", {
    role: "invitee",
    inviterId: ref.inviterId,
  });
  await db
    .update(referrals)
    .set({ rewardedAt: new Date() })
    .where(eq(referrals.id, ref.id));
  return true;
}

/** معلومات إحالة المستخدم: الكود + العدادات + القيم الحالية */
export async function referralInfo(userId: number): Promise<{
  code: string;
  invited: number;
  rewarded: number;
  earned: number;
  threshold: number;
  inviterReward: number;
  inviteeReward: number;
}> {
  const db = getDb();
  const [inviterReward, inviteeReward, threshold, invitedRow, rewardedRow] =
    await Promise.all([
      coinSettingInt(COIN_SETTING_KEYS.referralInviter),
      coinSettingInt(COIN_SETTING_KEYS.referralInvitee),
      coinSettingInt(COIN_SETTING_KEYS.referralThreshold),
      db
        .select({ c: sql<number>`COUNT(*)` })
        .from(referrals)
        .where(eq(referrals.inviterId, userId)),
      db
        .select({ c: sql<number>`COUNT(*)` })
        .from(referrals)
        .where(
          and(
            eq(referrals.inviterId, userId),
            sql`${referrals.rewardedAt} IS NOT NULL`,
          ),
        ),
    ]);
  const invited = Number(invitedRow[0]?.c ?? 0);
  const rewarded = Number(rewardedRow[0]?.c ?? 0);
  return {
    code: String(userId),
    invited,
    rewarded,
    earned: rewarded * inviterReward,
    threshold: Math.max(threshold, 1),
    inviterReward,
    inviteeReward,
  };
}
