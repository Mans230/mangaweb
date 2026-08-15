import { eq } from "drizzle-orm";
import { siteSettings } from "@db/schema";
import { getDb } from "../queries/connection";

/**
 * إعدادات الموقع العامة (site_settings) مع كاش في الذاكرة لمدة 30 ثانية
 * حتى لا تضغط استعلامات الإعدادات المتكررة على قاعدة البيانات.
 */

export const SETTING_COMMUNITY_USER_ENABLED = "community.user_enabled";
export const SETTING_COMMUNITY_MANGA_ENABLED = "community.manga_enabled";
/** إخفاء أقسام كاملة من الواجهة (روابط + صفحات) */
export const SETTING_UI_HIDE_COMMUNITIES = "ui.hide_communities";
export const SETTING_UI_HIDE_REELS = "ui.hide_reels";
/** رابط جروب المناقشة (تليجرام/ديسكورد…) — يظهر زره في صفحة المانجا عند ضبطه */
export const SETTING_COMMUNITY_GROUP_URL = "ui.community_group_url";

const CACHE_TTL_MS = 30 * 1000;

type CacheEntry = { value: string | null; expiresAt: number };

const cache = new Map<string, CacheEntry>();

/** قراءة إعداد بنص بديل عند غيابه — كاش 30 ثانية */
export async function getSetting(
  key: string,
  fallback: string | null = null,
): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value ?? fallback;
  }
  const row = await getDb().query.siteSettings.findFirst({
    where: eq(siteSettings.key, key),
  });
  const value = row?.value ?? null;
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value ?? fallback;
}

/** كتابة إعداد (upsert) مع إبطال الكاش فوراً */
export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  await db
    .insert(siteSettings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
  cache.delete(key);
}

/** إبطال يدوي للكاش (يُستخدم في الاختبارات مثلاً) */
export function invalidateSettingsCache(key?: string): void {
  if (key === undefined) cache.clear();
  else cache.delete(key);
}

/** هل مجتمعات المستخدمين مفعّلة؟ الافتراضي: مفعّلة */
export async function isUserCommunitiesEnabled(): Promise<boolean> {
  return (await getSetting(SETTING_COMMUNITY_USER_ENABLED, "1")) === "1";
}

/** هل مجتمعات المانجا مفعّلة؟ الافتراضي: مفعّلة */
export async function isMangaCommunitiesEnabled(): Promise<boolean> {
  return (await getSetting(SETTING_COMMUNITY_MANGA_ENABLED, "1")) === "1";
}
