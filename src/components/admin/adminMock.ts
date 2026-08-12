/**
 * zeko-manga — بيانات وأدوات مساعدة للوحة الأدمن وصفحة الطلبات.
 * تُستخدم كـ fallback عند تعذّر الوصول للـ API (مع TODO للربط الكامل).
 */
import { mangaList } from "@/data/mock";
import type { SourceName } from "@/data/mock";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";

/** مخرجات الـ API (لأنواع التحويل في مكونات الأدمن) */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/* ================= أسماء المصادر وكشف الدومين ================= */

export const ALL_SOURCES: SourceName[] = [
  "kawaiimanga",
  "olympustaff",
  "azorafly",
  "mangatime",
  "rocksmanga",
  "3asq",
  "despair-manga",
  "mangadar",
];

/** رموز مميزة داخل اسم النطاق لكل مصدر */
const SOURCE_DOMAIN_TOKENS: { token: string; source: SourceName }[] = [
  { token: "kawaiimanga", source: "kawaiimanga" },
  { token: "olympustaff", source: "olympustaff" },
  { token: "azorafly", source: "azorafly" },
  { token: "azora", source: "azorafly" },
  { token: "mangatime", source: "mangatime" },
  { token: "rocksmanga", source: "rocksmanga" },
  { token: "3asq", source: "3asq" },
  { token: "despair", source: "despair-manga" },
  { token: "mangadar", source: "mangadar" },
];

/** كشف المصدر تلقائياً من رابط — يعيد اسم المصدر أو null إن كان غير مدعوم */
export function detectSourceFromUrl(raw: string): {
  hostname: string;
  source: SourceName | null;
} | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const hit = SOURCE_DOMAIN_TOKENS.find((d) => hostname.includes(d.token));
    return { hostname, source: hit?.source ?? null };
  } catch {
    return null;
  }
}

/* ================= ترجمة الحالات/الأنواع ================= */

export type ApiMangaType = "manga" | "manhwa" | "manhua";
export type ApiMangaStatus = "ongoing" | "completed";
export type SourceStatus = "active" | "paused" | "blocked";
export type RequestStatus = "pending" | "added" | "rejected";

export function typeLabel(t: string): string {
  if (t === "manhwa" || t === "مانهوا") return "مانهوا";
  if (t === "manhua" || t === "مانها") return "مانها";
  return "مانجا";
}

export function mangaStatusLabel(s: string): string {
  if (s === "completed" || s === "مكتمل") return "مكتمل";
  if (s === "متوقف") return "متوقف";
  return "مستمر";
}

export function sourceStatusLabel(s: SourceStatus): string {
  if (s === "paused") return "بطيء";
  if (s === "blocked") return "محظور";
  return "نشط";
}

export function requestStatusLabel(s: RequestStatus): string {
  if (s === "added") return "تمت الإضافة";
  if (s === "rejected") return "مرفوض";
  return "قيد المراجعة";
}

/* ================= تنسيق الأرقام والوقت ================= */

export function formatNum(n: number): string {
  return new Intl.NumberFormat("ar-EG").format(n);
}

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} س`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
}

/* ================= نماذج عرض الأدمن ================= */

export interface AdminMangaRow {
  id: number;
  slug: string;
  title: string;
  altTitle?: string;
  cover: string;
  type: string;
  status: string;
  chapters: number;
  rating: number;
  source: string;
  isAdult: boolean;
  lastScan: string;
  genres: string[];
  description: string;
}

export const mockAdminManga: AdminMangaRow[] = mangaList.map((m) => ({
  id: m.id,
  slug: m.slug,
  title: m.title,
  altTitle: m.altTitle,
  cover: m.cover,
  type: m.type,
  status: m.status,
  chapters: m.chapters,
  rating: m.rating,
  source: m.source,
  isAdult: !!m.isAdult,
  lastScan: m.updatedAt,
  genres: m.genres,
  description: m.synopsis,
}));

export interface AdminSourceCard {
  id: number;
  name: SourceName;
  baseUrl: string;
  status: SourceStatus;
  lastScan: string;
  mangaCount: number;
  chaptersToday: number;
  latencyMs: number;
  enabled: boolean;
}

export const mockAdminSources: AdminSourceCard[] = [
  { id: 1, name: "kawaiimanga", baseUrl: "https://kawaiimanga.com", status: "active", lastScan: "قبل 6 د", mangaCount: 812, chaptersToday: 54, latencyMs: 420, enabled: true },
  { id: 2, name: "olympustaff", baseUrl: "https://olympustaff.com", status: "active", lastScan: "قبل 12 د", mangaCount: 694, chaptersToday: 61, latencyMs: 380, enabled: true },
  { id: 3, name: "azorafly", baseUrl: "https://azorafly.com", status: "active", lastScan: "قبل 4 د", mangaCount: 1030, chaptersToday: 88, latencyMs: 310, enabled: true },
  { id: 4, name: "mangatime", baseUrl: "https://mangatime.co", status: "active", lastScan: "قبل 18 د", mangaCount: 540, chaptersToday: 23, latencyMs: 690, enabled: true },
  { id: 5, name: "rocksmanga", baseUrl: "https://rocksmanga.com", status: "active", lastScan: "قبل 9 د", mangaCount: 477, chaptersToday: 35, latencyMs: 450, enabled: true },
  { id: 6, name: "3asq", baseUrl: "https://3asq.org", status: "paused", lastScan: "قبل 42 د", mangaCount: 735, chaptersToday: 19, latencyMs: 1240, enabled: true },
  { id: 7, name: "despair-manga", baseUrl: "https://despair-manga.com", status: "active", lastScan: "قبل 15 د", mangaCount: 388, chaptersToday: 27, latencyMs: 530, enabled: true },
  { id: 8, name: "mangadar", baseUrl: "https://mangadar.com", status: "blocked", lastScan: "قبل 3 س", mangaCount: 538, chaptersToday: 0, latencyMs: 0, enabled: false },
];

export interface AdminUserRow {
  id: number;
  name: string;
  username: string;
  email: string;
  avatar: string;
  role: "admin" | "user";
  banned: boolean;
  chaptersRead: number;
  comments: number;
  joinedAt: string;
}

export const mockAdminUsers: AdminUserRow[] = [
  { id: 1, name: "زيكو", username: "zeko", email: "zeko@zeko-manga.com", avatar: "/avatar-1.png", role: "admin", banned: false, chaptersRead: 4210, comments: 312, joinedAt: "يناير 2025" },
  { id: 2, name: "سارة أحمد", username: "sara_reads", email: "sara@example.com", avatar: "/avatar-2.png", role: "user", banned: false, chaptersRead: 1830, comments: 96, joinedAt: "مارس 2025" },
  { id: 3, name: "عمر خالد", username: "omar_k", email: "omar@example.com", avatar: "/avatar-3.png", role: "user", banned: false, chaptersRead: 940, comments: 41, joinedAt: "مايو 2025" },
  { id: 4, name: "ليان محمود", username: "layan.m", email: "layan@example.com", avatar: "/avatar-4.png", role: "user", banned: false, chaptersRead: 2760, comments: 188, joinedAt: "فبراير 2025" },
  { id: 5, name: "يوسف علي", username: "yusuf99", email: "yusuf@example.com", avatar: "/avatar-1.png", role: "user", banned: true, chaptersRead: 120, comments: 7, joinedAt: "أغسطس 2025" },
  { id: 6, name: "نور الهدى", username: "noor_h", email: "noor@example.com", avatar: "/avatar-2.png", role: "user", banned: false, chaptersRead: 3310, comments: 254, joinedAt: "ديسمبر 2024" },
  { id: 7, name: "كريم سامي", username: "karim_s", email: "karim@example.com", avatar: "/avatar-3.png", role: "user", banned: false, chaptersRead: 760, comments: 19, joinedAt: "أكتوبر 2025" },
  { id: 8, name: "جنى وليد", username: "jana_w", email: "jana@example.com", avatar: "/avatar-4.png", role: "user", banned: false, chaptersRead: 1490, comments: 63, joinedAt: "يونيو 2025" },
];

export interface AdminRequestRow {
  id: number;
  title: string;
  requester: string;
  date: string;
  sourceName: SourceName | null;
  sourceUrl?: string;
  note?: string;
  status: RequestStatus;
  addedSlug?: string;
}

export const mockAdminRequests: AdminRequestRow[] = [
  { id: 1042, title: "بداية النهاية", requester: "سارة أحمد", date: "قبل ساعتين", sourceName: "azorafly", sourceUrl: "https://azorafly.com/series/the-beginning-after-the-end", note: "النسخة الملونة إن توفرت", status: "pending" },
  { id: 1041, title: "سولو ليفلينغ: راغناروك", requester: "عمر خالد", date: "قبل 5 س", sourceName: "olympustaff", sourceUrl: "https://olympustaff.com/series/solo-leveling-ragnarok", status: "pending" },
  { id: 1040, title: "أومنيشنت ريدر", requester: "ليان محمود", date: "أمس", sourceName: "3asq", sourceUrl: "https://3asq.org/manga/omniscient-reader", status: "added", addedSlug: "gate-of-the-abyss" },
  { id: 1039, title: "مدرّب البرج المتقاعد", requester: "زائر", date: "أمس", sourceName: null, note: "لم أجد لينك مباشر", status: "pending" },
  { id: 1038, title: "قاتل الأبطال", requester: "نور الهدى", date: "قبل يومين", sourceName: "rocksmanga", sourceUrl: "https://rocksmanga.com/manga/hero-killer", status: "added", addedSlug: "return-of-the-shattered-king" },
  { id: 1037, title: "مانجا مكررة", requester: "كريم سامي", date: "قبل 3 أيام", sourceName: "mangatime", status: "rejected", note: "موجودة بالفعل على المنصة" },
  { id: 1036, title: "حكاية الحلزون", requester: "جنى وليد", date: "قبل 4 أيام", sourceName: null, status: "pending" },
  { id: 1035, title: "سيف الفجر الأخير", requester: "يوسف علي", date: "منذ أسبوع", sourceName: "despair-manga", sourceUrl: "https://despair-manga.com/series/last-dawn-sword", status: "rejected", note: "المصدر متوقف عن النشر" },
];

/** طلبات المستخدم الحالي (fallback لواجهة /request) */
export const mockMyRequests: AdminRequestRow[] = mockAdminRequests
  .filter((r) => [1042, 1040, 1038, 1036].includes(r.id))
  .map((r) => ({ ...r, requester: "أنت" }));

/* ================= دمج المكرر ================= */

export interface DuplicateItem {
  id: number; // id صف المانجا (يُرسل لـ mergeDuplicates)
  title: string;
  cover: string;
  source: SourceName;
  chapters: number;
  updatedAt: string;
  quality: "عالية" | "متوسطة" | "منخفضة";
  description: string;
}

export interface DuplicateGroup {
  id: string;
  title: string;
  items: DuplicateItem[];
}

export const mockDuplicateGroups: DuplicateGroup[] = [
  {
    id: "g1",
    title: "عودة الملك المدمّر",
    items: [
      { id: 101, title: "عودة الملك المدمّر", cover: "/cover-01.png", source: "azorafly", chapters: 152, updatedAt: "قبل 12 د", quality: "عالية", description: "بعد خيانة رفاقه وسقوطه في الهاوية، يعود 'كايل' إلى الماضي وبحوزته كل أسرار المستقبل." },
      { id: 102, title: "Return of the Shattered King", cover: "/cover-01.png", source: "mangatime", chapters: 148, updatedAt: "قبل ساعة", quality: "متوسطة", description: "عودة الملك الذي حكم أقوى الزنازين إلى الماضي للانتقام من خائنة رفاقه." },
      { id: 103, title: "عودة الملك المدمر", cover: "/cover-01.png", source: "rocksmanga", chapters: 150, updatedAt: "قبل 3 س", quality: "منخفضة", description: "نسخة مترجمة من مصدر ثانٍ مع فصول ناقصة الترقيم." },
    ],
  },
  {
    id: "g2",
    title: "بوابة الهاوية",
    items: [
      { id: 201, title: "بوابة الهاوية", cover: "/cover-07.png", source: "olympustaff", chapters: 178, updatedAt: "قبل 8 د", quality: "عالية", description: "حين ظهرت البوابات في سماء المدن، كان 'جين' أضعف صياد… حتى منحته بوابة مزدوجة نظام الهاوية." },
      { id: 202, title: "بوابة الهاوية (إعادة رفع)", cover: "/cover-07.png", source: "kawaiimanga", chapters: 171, updatedAt: "أمس", quality: "متوسطة", description: "إعادة رفع بجودة صور متوسطة مع ترجمة بديلة للأسماء." },
    ],
  },
  {
    id: "g3",
    title: "عبقري الأكاديمية المتواري",
    items: [
      { id: 301, title: "عبقري الأكاديمية المتواري", cover: "/cover-09.png", source: "kawaiimanga", chapters: 88, updatedAt: "قبل 5 س", quality: "عالية", description: "أقوى ساحر في القارة يتنكّر كطالب فاشل في أكاديمية السحر الملكية." },
      { id: 302, title: "The Academy's Hidden Genius", cover: "/cover-09.png", source: "3asq", chapters: 85, updatedAt: "قبل يومين", quality: "منخفضة", description: "نسخة قديمة قبل إعادة التسمية الرسمية." },
    ],
  },
];

/* ================= إحصاءات لوحة المعلومات ================= */

export const mockStats = {
  series: 5214,
  chaptersToday: 342,
  activeUsers: 1830,
  pendingRequests: 12,
};

/** بيانات 30 يوماً — الفصول المضافة يومياً */
export const chaptersSeries30d: { day: string; chapters: number }[] = (() => {
  const out: { day: string; chapters: number }[] = [];
  const base = [210, 260, 240, 300, 285, 330, 290, 310, 355, 342, 380, 365, 402, 390, 315, 280, 295, 340, 372, 410, 385, 430, 398, 420, 445, 405, 380, 412, 342, 360];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    out.push({
      day: d.toLocaleDateString("ar-EG", { day: "numeric", month: "numeric" }),
      chapters: base[29 - i],
    });
  }
  return out;
})();

export interface SourceSlice {
  name: SourceName;
  value: number;
  fill: string;
}

export const sourceDistribution: SourceSlice[] = [
  { name: "azorafly", value: 1030, fill: "#7C3AED" },
  { name: "kawaiimanga", value: 812, fill: "#A78BFA" },
  { name: "3asq", value: 735, fill: "#C4B5FD" },
  { name: "olympustaff", value: 694, fill: "#E879F9" },
  { name: "mangatime", value: 540, fill: "#38BDF8" },
  { name: "mangadar", value: 538, fill: "#F0ABFC" },
  { name: "rocksmanga", value: 477, fill: "#818CF8" },
  { name: "despair-manga", value: 388, fill: "#67E8F9" },
];

export const kpiSparklines: number[][] = [
  [38, 42, 40, 47, 45, 52, 50],
  [22, 28, 25, 31, 34, 30, 38],
  [61, 58, 66, 63, 70, 74, 72],
  [9, 12, 8, 14, 11, 15, 12],
];

export interface ActivityEvent {
  id: number;
  icon: "scan" | "user" | "request" | "merge" | "add";
  text: string;
  time: string;
}

export const mockActivity: ActivityEvent[] = [
  { id: 1, icon: "scan", text: "فحص مصدر olympustaff: ‎+18 فصل جديد", time: "قبل 4 د" },
  { id: 2, icon: "request", text: "طلب جديد #1042: بداية النهاية", time: "قبل 9 د" },
  { id: 3, icon: "user", text: "مستخدم جديد: كريم سامي", time: "قبل 22 د" },
  { id: 4, icon: "add", text: "أُضيفت «سيدة سيف الفجر» — 96 فصل", time: "قبل 35 د" },
  { id: 5, icon: "scan", text: "فحص مصدر azorafly: ‎+31 فصل جديد", time: "قبل 48 د" },
  { id: 6, icon: "merge", text: "دمج 3 نسخ من «عرش الألف حياة»", time: "قبل ساعة" },
  { id: 7, icon: "request", text: "تمت إضافة الطلب #1040: أومنيشنت ريدر", time: "قبل ساعتين" },
  { id: 8, icon: "user", text: "مستخدم جديد: جنى وليد", time: "قبل 3 س" },
  { id: 9, icon: "scan", text: "فحص مصدر rocksmanga: ‎+12 فصل جديد", time: "قبل 4 س" },
  { id: 10, icon: "add", text: "أُضيفت «أفق الفولاذ» — 54 فصل", time: "أمس" },
];
