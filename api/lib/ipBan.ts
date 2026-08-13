import { bannedIps } from "@db/schema";
import { getDb } from "../queries/connection";

/** كاش في الذاكرة لعناوين IP المحظورة (TTL 60 ثانية) لتفادي ضرب القاعدة كل طلب */
const CACHE_TTL_MS = 60 * 1000;
let cache: { ips: Set<string>; at: number } | null = null;
let refreshing: Promise<void> | null = null;

async function refresh(): Promise<void> {
  try {
    const rows = await getDb()
      .select({ ip: bannedIps.ip })
      .from(bannedIps);
    cache = { ips: new Set(rows.map((r) => r.ip)), at: Date.now() };
  } catch (e) {
    // فشل القراءة (مثلاً قبل تطبيق migration) — لا نحظر أحداً ونحتفظ بالكاش القديم
    console.warn(`[ip-ban] تعذّر تحديث قائمة الحظر: ${(e as Error).message}`);
    if (!cache) cache = { ips: new Set(), at: Date.now() };
  }
}

/** أبطل الكاش بعد عمليات ban/unban من لوحة الأدمن */
export function invalidateIpBanCache() {
  cache = null;
}

/** هل هذا الـ IP محظور؟ */
export async function isIpBanned(ip: string): Promise<boolean> {
  if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
    if (!refreshing) {
      refreshing = refresh().finally(() => {
        refreshing = null;
      });
    }
    await refreshing;
  }
  return cache?.ips.has(ip) ?? false;
}
