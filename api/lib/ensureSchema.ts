/**
 * تطبيق تغييرات السكيمة عند الإقلاع — Railway ينشر بـ `node dist/boot.js`
 * بلا خطوة migrate، لذا تُطبَّق التغييرات هنا بشكل idempotent.
 * (ملفات drizzle-kit في db/migrations تبقى المرجع الرسمي.)
 */
import { sql } from "drizzle-orm";
import { getDb } from "../queries/connection";

/** يتجاهل خطأ "Duplicate column" عند إعادة التشغيل */
async function ignoreDuplicateColumn(p: Promise<unknown>, label: string) {
  try {
    await p;
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (!/duplicate column/i.test(msg)) {
      console.warn(`[ensure-schema] ${label}: ${msg}`);
    }
  }
}

export async function ensureBootSchema(): Promise<void> {
  const db = getDb();

  await ignoreDuplicateColumn(
    db.execute(
      sql.raw(
        "ALTER TABLE `manga` ADD `siteViewCount` bigint unsigned NOT NULL DEFAULT 0",
      ),
    ),
    "manga.siteViewCount",
  );

  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`support_tickets\` (
	\`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
	\`userId\` bigint unsigned NOT NULL,
	\`subject\` varchar(200) NOT NULL,
	\`category\` varchar(40) NOT NULL DEFAULT 'general',
	\`status\` varchar(20) NOT NULL DEFAULT 'open',
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	\`updatedAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`support_tickets_id\` PRIMARY KEY(\`id\`)
)`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`support_ticket_messages\` (
	\`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
	\`ticketId\` bigint unsigned NOT NULL,
	\`authorId\` bigint unsigned NOT NULL,
	\`isAdmin\` boolean NOT NULL DEFAULT false,
	\`body\` text NOT NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`support_ticket_messages_id\` PRIMARY KEY(\`id\`)
)`));
    // CREATE INDEX لا يقبل IF NOT EXISTS في MySQL ≤8 — أنشئه فقط إن لم يوجد
    await ensureIndex(
      "support_tickets",
      "support_tickets_user_idx",
      "CREATE INDEX `support_tickets_user_idx` ON `support_tickets` (`userId`)",
    );
    await ensureIndex(
      "support_tickets",
      "support_tickets_status_idx",
      "CREATE INDEX `support_tickets_status_idx` ON `support_tickets` (`status`)",
    );
    await ensureIndex(
      "support_ticket_messages",
      "support_ticket_messages_ticket_idx",
      "CREATE INDEX `support_ticket_messages_ticket_idx` ON `support_ticket_messages` (`ticketId`)",
    );
  } catch (e) {
    console.warn(`[ensure-schema] support tables: ${(e as Error).message}`);
  }

  // مرفق صورة على رسائل التذاكر
  await ignoreDuplicateColumn(
    db.execute(
      sql.raw("ALTER TABLE `support_ticket_messages` ADD `imageUrl` varchar(500)"),
    ),
    "support_ticket_messages.imageUrl",
  );

  // جدول أكواد تغيير كلمة المرور عبر البريد
  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`password_reset_codes\` (
	\`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
	\`userId\` bigint unsigned NOT NULL,
	\`code\` varchar(6) NOT NULL,
	\`expiresAt\` timestamp NOT NULL,
	CONSTRAINT \`password_reset_codes_id\` PRIMARY KEY(\`id\`)
)`));
    await ensureIndex(
      "password_reset_codes",
      "password_reset_codes_user_idx",
      "CREATE INDEX `password_reset_codes_user_idx` ON `password_reset_codes` (`userId`)",
    );
  } catch (e) {
    console.warn(`[ensure-schema] password_reset_codes: ${(e as Error).message}`);
  }

  // ===== نظام الكوينز/XP =====
  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`coin_wallets\` (
	\`userId\` bigint unsigned NOT NULL,
	\`coins\` int NOT NULL DEFAULT 0,
	\`xp\` int NOT NULL DEFAULT 0,
	\`level\` int NOT NULL DEFAULT 1,
	\`streakDays\` int NOT NULL DEFAULT 0,
	\`lastReadDate\` varchar(10),
	\`checkinDays\` int NOT NULL DEFAULT 0,
	\`lastCheckinDate\` varchar(10),
	\`lastSpinDate\` varchar(10),
	\`updatedAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`coin_wallets_userId\` PRIMARY KEY(\`userId\`)
)`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`coin_transactions\` (
	\`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
	\`userId\` bigint unsigned NOT NULL,
	\`amount\` int NOT NULL,
	\`kind\` varchar(40) NOT NULL,
	\`meta\` json,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`coin_transactions_id\` PRIMARY KEY(\`id\`)
)`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`chapter_completions\` (
	\`userId\` bigint unsigned NOT NULL,
	\`chapterId\` bigint unsigned NOT NULL,
	\`mangaId\` bigint unsigned NOT NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`chapter_completions_pk\` PRIMARY KEY(\`userId\`, \`chapterId\`)
)`));
    await ensureIndex(
      "coin_transactions",
      "coin_transactions_user_idx",
      "CREATE INDEX `coin_transactions_user_idx` ON `coin_transactions` (`userId`)",
    );
    await ensureIndex(
      "coin_transactions",
      "coin_transactions_created_idx",
      "CREATE INDEX `coin_transactions_created_idx` ON `coin_transactions` (`createdAt`)",
    );
    await ensureIndex(
      "chapter_completions",
      "chapter_completions_user_idx",
      "CREATE INDEX `chapter_completions_user_idx` ON `chapter_completions` (`userId`)",
    );
  } catch (e) {
    console.warn(`[ensure-schema] coins tables: ${(e as Error).message}`);
  }

  // ===== الكوينز دفعة 3: المهام اليومية + الإحالات =====
  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`user_mission_claims\` (
	\`userId\` int NOT NULL,
	\`missionKey\` varchar(64) NOT NULL,
	\`periodKey\` varchar(16) NOT NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`user_mission_claims_pk\` PRIMARY KEY(\`userId\`, \`missionKey\`, \`periodKey\`)
)`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`referrals\` (
	\`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
	\`inviterId\` int NOT NULL,
	\`inviteeId\` int NOT NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	\`rewardedAt\` timestamp,
	CONSTRAINT \`referrals_id\` PRIMARY KEY(\`id\`)
)`));
    await ensureIndex(
      "referrals",
      "referrals_invitee_unique",
      "CREATE UNIQUE INDEX `referrals_invitee_unique` ON `referrals` (`inviteeId`)",
    );
    await ensureIndex(
      "referrals",
      "referrals_inviter_idx",
      "CREATE INDEX `referrals_inviter_idx` ON `referrals` (`inviterId`)",
    );
  } catch (e) {
    console.warn(`[ensure-schema] missions/referrals tables: ${(e as Error).message}`);
  }

  // ===== الكوينز دفعة 4: المتجر + الاستطلاعات =====
  try {
    // أعمدة التجهيز على المحافظ الموجودة
    await ignoreDuplicateColumn(
      db.execute(
        sql.raw("ALTER TABLE `coin_wallets` ADD `equippedTheme` varchar(64)"),
      ),
      "coin_wallets.equippedTheme",
    );
    await ignoreDuplicateColumn(
      db.execute(
        sql.raw("ALTER TABLE `coin_wallets` ADD `equippedBadge` varchar(64)"),
      ),
      "coin_wallets.equippedBadge",
    );

    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`shop_items\` (
	\`id\` int AUTO_INCREMENT NOT NULL,
	\`itemKey\` varchar(64) NOT NULL,
	\`type\` varchar(16) NOT NULL,
	\`nameAr\` varchar(128),
	\`nameEn\` varchar(128),
	\`price\` int NOT NULL,
	\`meta\` json,
	\`active\` boolean NOT NULL DEFAULT true,
	\`sort\` int NOT NULL DEFAULT 0,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`shop_items_id\` PRIMARY KEY(\`id\`),
	CONSTRAINT \`shop_items_itemKey_unique\` UNIQUE(\`itemKey\`)
)`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`user_purchases\` (
	\`id\` int AUTO_INCREMENT NOT NULL,
	\`userId\` bigint unsigned NOT NULL,
	\`itemKey\` varchar(64) NOT NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`user_purchases_id\` PRIMARY KEY(\`id\`)
)`));
    await ensureIndex(
      "user_purchases",
      "user_purchases_user_item_unique",
      "CREATE UNIQUE INDEX `user_purchases_user_item_unique` ON `user_purchases` (`userId`, `itemKey`)",
    );

    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`polls\` (
	\`id\` int AUTO_INCREMENT NOT NULL,
	\`questionAr\` varchar(255),
	\`questionEn\` varchar(255),
	\`active\` boolean NOT NULL DEFAULT true,
	\`weekKey\` varchar(16),
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`polls_id\` PRIMARY KEY(\`id\`)
)`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`poll_options\` (
	\`id\` int AUTO_INCREMENT NOT NULL,
	\`pollId\` int NOT NULL,
	\`textAr\` varchar(255),
	\`textEn\` varchar(255),
	CONSTRAINT \`poll_options_id\` PRIMARY KEY(\`id\`)
)`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`poll_votes\` (
	\`pollId\` int NOT NULL,
	\`userId\` bigint unsigned NOT NULL,
	\`optionId\` int NOT NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`poll_votes_pk\` PRIMARY KEY(\`pollId\`, \`userId\`)
)`));
  } catch (e) {
    console.warn(`[ensure-schema] shop/polls tables: ${(e as Error).message}`);
  }

  // ===== المرحلة 3: مراجعات نصية على التقييمات =====
  await ignoreDuplicateColumn(
    db.execute(sql.raw("ALTER TABLE `ratings` ADD `reviewText` text")),
    "ratings.reviewText",
  );

  // ===== إعلانات الموقع =====
  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`announcements\` (
	\`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
	\`type\` varchar(20) NOT NULL DEFAULT 'info',
	\`title\` varchar(200) NOT NULL,
	\`body\` text NOT NULL,
	\`linkUrl\` varchar(500),
	\`linkLabel\` varchar(80),
	\`audience\` varchar(20) NOT NULL DEFAULT 'all',
	\`active\` boolean NOT NULL DEFAULT true,
	\`startsAt\` timestamp NULL,
	\`endsAt\` timestamp NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`announcements_id\` PRIMARY KEY(\`id\`)
)`));
    await ensureIndex(
      "announcements",
      "announcements_active_idx",
      "CREATE INDEX `announcements_active_idx` ON `announcements` (`active`)",
    );
  } catch (e) {
    console.warn(`[ensure-schema] announcements: ${(e as Error).message}`);
  }
}

async function ensureIndex(table: string, indexName: string, ddl: string) {
  const db = getDb();
  const res = (await db.execute(
    sql.raw(
      `SELECT COUNT(*) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND INDEX_NAME = '${indexName}'`,
    ),
  )) as unknown as [{ c: number | string }[], unknown];
  const rows = Array.isArray(res[0]) ? res[0] : [];
  if (Number(rows[0]?.c ?? 0) > 0) return;
  try {
    await db.execute(sql.raw(ddl));
  } catch (e) {
    if (!/duplicate key name/i.test((e as Error).message ?? "")) {
      console.warn(`[ensure-schema] index ${indexName}: ${(e as Error).message}`);
    }
  }
}
