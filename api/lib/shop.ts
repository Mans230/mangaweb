/**
 * متجر الكوينز (ثيمات/شارات/إزالة إعلانات) + المتصدرون الأسبوعيون.
 */
import { asc, desc, eq, sql } from "drizzle-orm";
import {
  chapterCompletions,
  coinWallets,
  shopItems,
  userPurchases,
} from "@db/schemaCoins";
import { users } from "@db/schema";
import { getDb } from "../queries/connection";
import { awardCoins, getOrCreateWallet, spendCoins } from "./coins";

export type ShopItemRow = typeof shopItems.$inferSelect;

const SHOP_DEFAULTS: {
  itemKey: string;
  type: "theme" | "badge" | "adfree";
  nameAr: string;
  nameEn: string;
  price: number;
  sort: number;
  meta?: Record<string, unknown>;
}[] = [
  { itemKey: "theme_amoled", type: "theme", nameAr: "AMOLED أسود خالص", nameEn: "AMOLED Black", price: 200, sort: 1, meta: { theme: "amoled" } },
  { itemKey: "theme_light", type: "theme", nameAr: "ثيم فاتح", nameEn: "Light Theme", price: 150, sort: 2, meta: { theme: "light" } },
  { itemKey: "theme_ocean", type: "theme", nameAr: "ألوان: محيط", nameEn: "Ocean Colors", price: 150, sort: 3, meta: { theme: "ocean" } },
  { itemKey: "theme_sakura", type: "theme", nameAr: "ألوان: ساكورا", nameEn: "Sakura Colors", price: 150, sort: 4, meta: { theme: "sakura" } },
  { itemKey: "badge_star", type: "badge", nameAr: "شارة ⭐", nameEn: "Star Badge", price: 100, sort: 10, meta: { emoji: "⭐" } },
  { itemKey: "badge_fire", type: "badge", nameAr: "شارة 🔥", nameEn: "Fire Badge", price: 100, sort: 11, meta: { emoji: "🔥" } },
  { itemKey: "badge_crown", type: "badge", nameAr: "شارة 👑", nameEn: "Crown Badge", price: 300, sort: 12, meta: { emoji: "👑" } },
  { itemKey: "adfree_30d", type: "adfree", nameAr: "إزالة الإعلانات 30 يوم", nameEn: "Ad-free 30 days", price: 500, sort: 20, meta: { days: 30 } },
];

/** بذر العناصر الافتراضية إذا كان المتجر فارغاً — يُستدعى كسولاً، لا يفشل أبداً */
export async function seedShopDefaults(): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(shopItems);
  if (Number(row?.c ?? 0) > 0) return;
  await db.insert(shopItems).values(
    SHOP_DEFAULTS.map((d) => ({
      itemKey: d.itemKey,
      type: d.type,
      nameAr: d.nameAr,
      nameEn: d.nameEn,
      price: d.price,
      sort: d.sort,
      meta: d.meta ?? null,
    })),
  );
}

/** عناصر المتجر النشطة مرتبة — يبذر الافتراضيات عند أول استدعاء */
export async function listShopItems(): Promise<ShopItemRow[]> {
  const db = getDb();
  try {
    await seedShopDefaults();
  } catch (e) {
    console.warn(`[shop] seedShopDefaults: ${(e as Error).message}`);
  }
  return db
    .select()
    .from(shopItems)
    .where(eq(shopItems.active, true))
    .orderBy(asc(shopItems.sort), asc(shopItems.id));
}

/** مفاتيح العناصر التي يملكها المستخدم */
export async function myPurchases(userId: number): Promise<string[]> {
  const rows = await getDb()
    .select({ itemKey: userPurchases.itemKey })
    .from(userPurchases)
    .where(eq(userPurchases.userId, userId));
  return rows.map((r) => r.itemKey);
}

/** شراء عنصر — يتحقق من الوجود/الملكية/الرصيد ثم يخصم ويسجّل الشراء */
export async function buyItem(
  userId: number,
  itemKey: string,
): Promise<
  | { ok: true; balance: number }
  | { ok: false; reason: "not_found" | "owned" | "insufficient" }
> {
  const db = getDb();
  const item = await db.query.shopItems.findFirst({
    where: eq(shopItems.itemKey, itemKey),
  });
  if (!item || !item.active) return { ok: false, reason: "not_found" };
  const existing = await db
    .select({ id: userPurchases.id })
    .from(userPurchases)
    .where(
      sql`${userPurchases.userId} = ${userId} AND ${userPurchases.itemKey} = ${itemKey}`,
    )
    .limit(1);
  if (existing.length > 0) return { ok: false, reason: "owned" };
  const spend = await spendCoins(userId, item.price, "shop_spend", { itemKey });
  if (!spend.ok) return { ok: false, reason: "insufficient" };
  try {
    await db.insert(userPurchases).values({ userId, itemKey });
  } catch {
    // سباق شراء مزدوج — استرجع الكوينز
    await awardCoins(userId, item.price, "admin", { refund: itemKey });
    return { ok: false, reason: "owned" };
  }
  return { ok: true, balance: spend.balance };
}

/** تجهيز عنصر مملوك — الثيمات والشارات فقط؛ adfree سلبي (لا يُجهّز) */
export async function equipItem(
  userId: number,
  itemKey: string,
): Promise<
  { ok: true } | { ok: false; reason: "not_owned" | "passive" | "not_found" }
> {
  const db = getDb();
  const item = await db.query.shopItems.findFirst({
    where: eq(shopItems.itemKey, itemKey),
  });
  if (!item || !item.active) return { ok: false, reason: "not_found" };
  if (item.type === "adfree") return { ok: false, reason: "passive" };
  const owned = await db
    .select({ id: userPurchases.id })
    .from(userPurchases)
    .where(
      sql`${userPurchases.userId} = ${userId} AND ${userPurchases.itemKey} = ${itemKey}`,
    )
    .limit(1);
  if (owned.length === 0) return { ok: false, reason: "not_owned" };
  const set =
    item.type === "theme"
      ? { equippedTheme: itemKey }
      : { equippedBadge: itemKey };
  await getOrCreateWallet(userId);
  await db
    .update(coinWallets)
    .set(set)
    .where(eq(coinWallets.userId, userId));
  return { ok: true };
}

// ================= المتصدرون الأسبوعيون =================

/** بداية الأسبوع الحالي (الاثنين 00:00 UTC) */
export function weekStartUtc(d = new Date()): Date {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = date.getUTCDay() || 7; // الاثنين=1 … الأحد=7
  date.setUTCDate(date.getUTCDate() - (day - 1));
  return date;
}

export type LeaderboardEntry = {
  userId: number;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  chapters: number;
  coins: number;
  badge: string | null;
};

/**
 * المتصدرون الأسبوعيون: الأكثر إكمالاً للفصول هذا الأسبوع،
 * ثم الأكثر كسباً للكوينز. يبدأ الأسبوع الاثنين UTC.
 */
export async function weeklyLeaderboard(
  limit = 20,
): Promise<LeaderboardEntry[]> {
  const db = getDb();
  const start = weekStartUtc();
  const rows = await db
    .select({
      userId: chapterCompletions.userId,
      name: users.name,
      username: users.username,
      avatarUrl: users.avatarUrl,
      badge: coinWallets.equippedBadge,
      chapters: sql<number>`COUNT(${chapterCompletions.chapterId})`,
      coins: sql<number>`COALESCE((
        SELECT SUM(t.amount) FROM coin_transactions t
        WHERE t.userId = ${chapterCompletions.userId}
          AND t.amount > 0
          AND t.createdAt >= ${start}
      ), 0)`,
    })
    .from(chapterCompletions)
    .innerJoin(users, eq(users.id, chapterCompletions.userId))
    .leftJoin(coinWallets, eq(coinWallets.userId, chapterCompletions.userId))
    .where(sql`${chapterCompletions.createdAt} >= ${start}`)
    .groupBy(
      chapterCompletions.userId,
      users.name,
      users.username,
      users.avatarUrl,
      coinWallets.equippedBadge,
    )
    .orderBy(
      desc(sql`COUNT(${chapterCompletions.chapterId})`),
      desc(sql`coins`),
    )
    .limit(Math.max(1, Math.min(limit, 100)));
  return rows.map((r) => ({
    userId: Number(r.userId),
    name: r.name,
    username: r.username ?? null,
    avatarUrl: r.avatarUrl,
    chapters: Number(r.chapters ?? 0),
    coins: Number(r.coins ?? 0),
    badge: r.badge ?? null,
  }));
}
