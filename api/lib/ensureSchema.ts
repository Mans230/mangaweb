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
