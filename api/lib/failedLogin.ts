import { and, count, eq, gt } from "drizzle-orm";
import { bannedIps, failedLogins } from "@db/schema";
import { getDb } from "../queries/connection";
import { invalidateIpBanCache } from "./ipBan";

/** يُحظر الـ IP تلقائياً عند بلوغه هذا العدد من الإخفاقات داخل النافذة */
const AUTO_BLOCK_THRESHOLD = 10;
const AUTO_BLOCK_WINDOW_MS = 15 * 60 * 1000;

/**
 * يسجّل محاولة دخول فاشلة (best-effort) ثم يفعّل الحظر التلقائي:
 * إن تجاوز الـ IP عتبة الإخفاقات داخل النافذة، يُضاف إلى banned_ips.
 * لا يرمي أبداً داخل مسار المصادقة.
 */
export async function recordFailedLogin(ip: string, email?: string): Promise<void> {
  if (!ip || ip === "unknown") return;
  try {
    const db = getDb();
    await db.insert(failedLogins).values({ ip, email: email ?? null });

    const since = new Date(Date.now() - AUTO_BLOCK_WINDOW_MS);
    const [{ total }] = await db
      .select({ total: count() })
      .from(failedLogins)
      .where(and(eq(failedLogins.ip, ip), gt(failedLogins.createdAt, since)));

    if (total >= AUTO_BLOCK_THRESHOLD) {
      await db
        .insert(bannedIps)
        .values({ ip, reason: `auto: ${total} failed logins` })
        .onDuplicateKeyUpdate({ set: { reason: `auto: ${total} failed logins` } });
      invalidateIpBanCache();
    }
  } catch (e) {
    console.warn(`[failed-login] ${ip}: ${(e as Error).message}`);
  }
}
