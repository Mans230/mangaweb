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
/** إخفاء قسم المتجر (الكوينز) */
export const SETTING_UI_HIDE_STORE = "ui.hide_store";
/** محتوى بطاقة تليجرام في الرئيسية (JSON: title/body/button/url/fontScale) */
export const SETTING_CTA_TELEGRAM = "cta.telegram";
/**
 * قوائم منسّقة من الأدمن (JSON array من ids) — فارغة = المنطق التلقائي.
 * منفصلة لكل لغة: العربية (المصادر العربية) والإنجليزية (mangadex/asura/vortex).
 */
export const SETTING_HOME_GEMS_IDS = "home.hidden_gems_ids"; // ar
export const SETTING_HOME_TOP_IDS = "home.top_week_ids"; // ar
export const SETTING_HOME_GEMS_IDS_EN = "home.hidden_gems_ids_en";
export const SETTING_HOME_TOP_IDS_EN = "home.top_week_ids_en";

/** يختار مفتاح الإعداد حسب القسم واللغة */
export function homeSectionKey(section: "gems" | "top", lang: "ar" | "en"): string {
  if (section === "gems") {
    return lang === "en" ? SETTING_HOME_GEMS_IDS_EN : SETTING_HOME_GEMS_IDS;
  }
  return lang === "en" ? SETTING_HOME_TOP_IDS_EN : SETTING_HOME_TOP_IDS;
}

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
