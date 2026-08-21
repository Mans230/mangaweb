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
    // رسالة drizzle الظاهرة = "Failed query: ALTER TABLE …" بلا نص التكرار؛
    // نص MySQL الحقيقي ("Duplicate column name" / ER_DUP_FIELDNAME / 1060) في cause.
    const err = e as { message?: string; cause?: { message?: string; code?: string | number } };
    const full = `${err.message ?? ""} ${err.cause?.message ?? ""} ${err.cause?.code ?? ""}`;
    if (!/duplicate column|ER_DUP_FIELDNAME|1060/i.test(full)) {
      console.warn(`[ensure-schema] ${label}: ${err.message ?? ""}`);
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

  // ===== أعمدة مراقبة صحّة المصادر (Phase 3) =====
  for (const [col, ddl] of [
    ["lastRunAt", "ADD `lastRunAt` timestamp NULL"],
    ["lastSuccessAt", "ADD `lastSuccessAt` timestamp NULL"],
    ["lastError", "ADD `lastError` varchar(1000)"],
    ["successCount", "ADD `successCount` int NOT NULL DEFAULT 0"],
    ["errorCount", "ADD `errorCount` int NOT NULL DEFAULT 0"],
    ["priority", "ADD `priority` int NOT NULL DEFAULT 0"],
    ["autoScrape", "ADD `autoScrape` boolean NOT NULL DEFAULT true"],
  ] as const) {
    await ignoreDuplicateColumn(
      db.execute(sql.raw(`ALTER TABLE \`sources\` ${ddl}`)),
      `sources.${col}`,
    );
  }

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

  // اشتراك مميّز
  await ignoreDuplicateColumn(
    db.execute(sql.raw("ALTER TABLE `users` ADD `premiumUntil` timestamp NULL")),
    "users.premiumUntil",
  );

  // روابط السوشيال العامة على البروفايل
  await ignoreDuplicateColumn(
    db.execute(sql.raw("ALTER TABLE `users` ADD `socialLinks` json")),
    "users.socialLinks",
  );

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

  // ===== متابعة المستخدمين (البروفايل العام) =====
  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`user_follows\` (
	\`followerId\` bigint unsigned NOT NULL,
	\`followingId\` bigint unsigned NOT NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`user_follows_pk\` PRIMARY KEY(\`followerId\`, \`followingId\`)
)`));
    await ensureIndex(
      "user_follows",
      "user_follows_following_idx",
      "CREATE INDEX `user_follows_following_idx` ON `user_follows` (`followingId`)",
    );
  } catch (e) {
    console.warn(`[ensure-schema] user_follows: ${(e as Error).message}`);
  }

  // ===== بوستات الأعضاء (قسم Fun) =====
  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`posts\` (
	\`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
	\`userId\` bigint unsigned NOT NULL,
	\`body\` text NOT NULL,
	\`imageUrl\` varchar(500),
	\`hidden\` boolean NOT NULL DEFAULT false,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`posts_id\` PRIMARY KEY(\`id\`)
)`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`post_likes\` (
	\`postId\` bigint unsigned NOT NULL,
	\`userId\` bigint unsigned NOT NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`post_likes_pk\` PRIMARY KEY(\`postId\`, \`userId\`)
)`));
    await ensureIndex(
      "posts",
      "posts_created_idx",
      "CREATE INDEX `posts_created_idx` ON `posts` (`createdAt`)",
    );
  } catch (e) {
    console.warn(`[ensure-schema] posts: ${(e as Error).message}`);
  }

  // ===== تحديث نظام التعليقات: ردود + تصويت + حظر + بلاغات =====
  await ignoreDuplicateColumn(
    db.execute(sql.raw("ALTER TABLE `comments` ADD `parentId` bigint unsigned")),
    "comments.parentId",
  );
  await ignoreDuplicateColumn(
    db.execute(sql.raw("ALTER TABLE `comments` ADD `imageUrl` varchar(500)")),
    "comments.imageUrl",
  );
  await ignoreDuplicateColumn(
    db.execute(sql.raw("ALTER TABLE `comments` ADD `stars` int")),
    "comments.stars",
  );
  // نقل المراجعات النصية القديمة من ratings إلى نظام التعليقات (idempotent)
  try {
    await db.execute(
      sql.raw(`INSERT INTO \`comments\` (\`userId\`, \`mangaId\`, \`content\`, \`stars\`, \`createdAt\`)
SELECT r.\`userId\`, r.\`mangaId\`, r.\`reviewText\`, r.\`stars\`, r.\`createdAt\`
FROM \`ratings\` r
WHERE r.\`reviewText\` IS NOT NULL AND r.\`reviewText\` <> ''
AND NOT EXISTS (
  SELECT 1 FROM \`comments\` c
  WHERE c.\`userId\` = r.\`userId\` AND c.\`mangaId\` = r.\`mangaId\` AND c.\`stars\` IS NOT NULL
)`),
    );
  } catch (e) {
    console.warn(`[ensure-schema] reviews backfill: ${(e as Error).message}`);
  }
  await ignoreDuplicateColumn(
    db.execute(sql.raw("ALTER TABLE `reports` ADD `commentId` bigint unsigned")),
    "reports.commentId",
  );
  try {
    await ensureIndex(
      "comments",
      "comments_parent_idx",
      "CREATE INDEX `comments_parent_idx` ON `comments` (`parentId`)",
    );
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`comment_votes\` (
	\`commentId\` bigint unsigned NOT NULL,
	\`userId\` bigint unsigned NOT NULL,
	\`value\` int NOT NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`comment_votes_pk\` PRIMARY KEY(\`commentId\`, \`userId\`)
)`));
    await ensureIndex(
      "comment_votes",
      "comment_votes_comment_idx",
      "CREATE INDEX `comment_votes_comment_idx` ON `comment_votes` (`commentId`)",
    );
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`user_blocks\` (
	\`blockerId\` bigint unsigned NOT NULL,
	\`blockedId\` bigint unsigned NOT NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`user_blocks_pk\` PRIMARY KEY(\`blockerId\`, \`blockedId\`)
)`));
  } catch (e) {
    console.warn(`[ensure-schema] comments upgrade: ${(e as Error).message}`);
  }

  // ===== ترشيحات تحدي الأسبوع من المستخدمين =====
  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`challenge_submissions\` (
	\`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
	\`userId\` bigint unsigned NOT NULL,
	\`mangaIds\` json NOT NULL,
	\`note\` varchar(300),
	\`status\` varchar(20) NOT NULL DEFAULT 'pending',
	\`pollId\` int,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	\`reviewedAt\` timestamp NULL,
	CONSTRAINT \`challenge_submissions_id\` PRIMARY KEY(\`id\`)
)`));
    await ensureIndex(
      "challenge_submissions",
      "challenge_submissions_status_idx",
      "CREATE INDEX `challenge_submissions_status_idx` ON `challenge_submissions` (`status`)",
    );
    await ensureIndex(
      "challenge_submissions",
      "challenge_submissions_user_idx",
      "CREATE INDEX `challenge_submissions_user_idx` ON `challenge_submissions` (`userId`)",
    );
  } catch (e) {
    console.warn(`[ensure-schema] challenge_submissions: ${(e as Error).message}`);
  }

  // ===== رياكشنات المانهوا/الفصل =====
  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`reactions\` (
	\`targetType\` varchar(10) NOT NULL,
	\`targetId\` bigint unsigned NOT NULL,
	\`userId\` bigint unsigned NOT NULL,
	\`kind\` varchar(12) NOT NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`reactions_pk\` PRIMARY KEY(\`targetType\`, \`targetId\`, \`userId\`)
)`));
    await ensureIndex(
      "reactions",
      "reactions_target_idx",
      "CREATE INDEX `reactions_target_idx` ON `reactions` (`targetType`, `targetId`)",
    );
  } catch (e) {
    console.warn(`[ensure-schema] reactions: ${(e as Error).message}`);
  }

  // ===== طلبات إزالة DMCA =====
  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`dmca_requests\` (
	\`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
	\`claimantName\` varchar(200) NOT NULL,
	\`claimantEmail\` varchar(200) NOT NULL,
	\`company\` varchar(200),
	\`mangaId\` bigint unsigned,
	\`targetUrl\` varchar(500) NOT NULL,
	\`workDescription\` text NOT NULL,
	\`status\` varchar(20) NOT NULL DEFAULT 'pending',
	\`notes\` text,
	\`handledBy\` bigint unsigned,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	\`updatedAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`dmca_requests_id\` PRIMARY KEY(\`id\`)
)`));
    await ensureIndex(
      "dmca_requests",
      "dmca_requests_status_idx",
      "CREATE INDEX `dmca_requests_status_idx` ON `dmca_requests` (`status`)",
    );
    await ensureIndex(
      "dmca_requests",
      "dmca_requests_manga_idx",
      "CREATE INDEX `dmca_requests_manga_idx` ON `dmca_requests` (`mangaId`)",
    );
  } catch (e) {
    console.warn(`[ensure-schema] dmca_requests: ${(e as Error).message}`);
  }

  // ===== قوالب الإشعارات =====
  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`notification_templates\` (
	\`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
	\`name\` varchar(120) NOT NULL,
	\`title\` varchar(200) NOT NULL,
	\`body\` varchar(500) NOT NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	\`updatedAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`notification_templates_id\` PRIMARY KEY(\`id\`)
)`));
  } catch (e) {
    console.warn(`[ensure-schema] notification_templates: ${(e as Error).message}`);
  }

  // ===== سجل أخطاء الخادم =====
  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`error_logs\` (
	\`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
	\`level\` varchar(16) NOT NULL DEFAULT 'error',
	\`path\` varchar(200),
	\`message\` varchar(1000) NOT NULL,
	\`stack\` text,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`error_logs_id\` PRIMARY KEY(\`id\`)
)`));
    await ensureIndex(
      "error_logs",
      "error_logs_created_idx",
      "CREATE INDEX `error_logs_created_idx` ON `error_logs` (`createdAt`)",
    );
  } catch (e) {
    console.warn(`[ensure-schema] error_logs: ${(e as Error).message}`);
  }

  // ===== الأكواد الترويجية =====
  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`promo_codes\` (
	\`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
	\`code\` varchar(40) NOT NULL,
	\`rewardType\` varchar(16) NOT NULL,
	\`amount\` int NOT NULL,
	\`maxUses\` int NOT NULL DEFAULT 0,
	\`usedCount\` int NOT NULL DEFAULT 0,
	\`expiresAt\` timestamp NULL,
	\`active\` boolean NOT NULL DEFAULT true,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	\`updatedAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`promo_codes_id\` PRIMARY KEY(\`id\`),
	CONSTRAINT \`promo_codes_code_unique\` UNIQUE(\`code\`)
)`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`promo_redemptions\` (
	\`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
	\`codeId\` bigint unsigned NOT NULL,
	\`userId\` bigint unsigned NOT NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`promo_redemptions_id\` PRIMARY KEY(\`id\`)
)`));
    await ensureIndex(
      "promo_redemptions",
      "promo_redemptions_code_user_unique",
      "CREATE UNIQUE INDEX `promo_redemptions_code_user_unique` ON `promo_redemptions` (`codeId`, `userId`)",
    );
  } catch (e) {
    console.warn(`[ensure-schema] promo_codes: ${(e as Error).message}`);
  }

  // ===== سجل تشغيل السكرابر =====
  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`scrape_jobs\` (
	\`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
	\`source\` varchar(100) NOT NULL,
	\`trigger\` varchar(16) NOT NULL DEFAULT 'manual',
	\`status\` varchar(16) NOT NULL DEFAULT 'pending',
	\`imported\` int NOT NULL DEFAULT 0,
	\`failed\` int NOT NULL DEFAULT 0,
	\`attempt\` int NOT NULL DEFAULT 1,
	\`error\` varchar(1000),
	\`startedAt\` timestamp NULL,
	\`finishedAt\` timestamp NULL,
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`scrape_jobs_id\` PRIMARY KEY(\`id\`)
)`));
    await ensureIndex(
      "scrape_jobs",
      "scrape_jobs_status_idx",
      "CREATE INDEX `scrape_jobs_status_idx` ON `scrape_jobs` (`status`)",
    );
    await ensureIndex(
      "scrape_jobs",
      "scrape_jobs_source_idx",
      "CREATE INDEX `scrape_jobs_source_idx` ON `scrape_jobs` (`source`, `createdAt`)",
    );
  } catch (e) {
    console.warn(`[ensure-schema] scrape_jobs: ${(e as Error).message}`);
  }

  // ===== محاولات الدخول الفاشلة =====
  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`failed_logins\` (
	\`id\` bigint unsigned AUTO_INCREMENT NOT NULL,
	\`ip\` varchar(45) NOT NULL,
	\`email\` varchar(255),
	\`createdAt\` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT \`failed_logins_id\` PRIMARY KEY(\`id\`)
)`));
    await ensureIndex(
      "failed_logins",
      "failed_logins_created_idx",
      "CREATE INDEX `failed_logins_created_idx` ON `failed_logins` (`createdAt`)",
    );
    await ensureIndex(
      "failed_logins",
      "failed_logins_ip_idx",
      "CREATE INDEX `failed_logins_ip_idx` ON `failed_logins` (`ip`, `createdAt`)",
    );
  } catch (e) {
    console.warn(`[ensure-schema] failed_logins: ${(e as Error).message}`);
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
