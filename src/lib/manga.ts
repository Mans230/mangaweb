/**
 * zeko-manga — أنواع عرض مشتركة ومحوّلات من صفوف الـ API (tRPC/Drizzle)
 * إلى الأشكال التي تتوقعها مكونات الواجهة. لا توجد هنا أي بيانات وهمية —
 * كل الأرقام تأتي من قاعدة البيانات كما هي.
 */

export type Lang = "ar" | "en";

/**
 * لفّ رابط صورة خارجي عبر بروكسي /api/img (مصادر كثيرة تمنع التحميل المباشر
 * hotlink protection فتظهر الأغلفة مكسورة). الروابط المحلية تمر كما هي.
 */
export function proxyImg(url?: string | null): string {
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) return url;
  return `/api/img?u=${encodeURIComponent(url)}`;
}

export type MangaType = "مانهوا" | "مانجا" | "مانها";
export type MangaStatus = "مستمر" | "مكتمل" | "متوقف";

export type SourceName =
  | "kawaiimanga"
  | "olympustaff"
  | "azorafly"
  | "mangatime"
  | "rocksmanga"
  | "3asq"
  | "despair-manga"
  | "mangadar"
  | "dilar";

/** شكل بطاقة المانجا الذي تتوقعه MangaCard ومشتقاتها */
export interface MangaCardData {
  id: number;
  slug: string;
  title: string;
  altTitle?: string;
  cover: string;
  type: MangaType;
  status: MangaStatus;
  rating: number;
  ratingCount: number;
  chapters: number;
  views: string;
  genres: string[];
  synopsis: string;
  source: string;
  isAdult?: boolean;
  updatedAt: string; // نص "قبل .." للعرض
}

/** شكل صف فصل حديث الذي تتوقعه ChapterRow */
export interface LatestChapterData {
  id: number;
  mangaSlug: string;
  mangaTitle: string;
  cover: string;
  chapter: number;
  timeAgo: string;
  source: string;
  isNew: boolean; // أقل من 24 ساعة
}

/* ================= خرائط الحالات/الأنواع ================= */

export const TYPE_AR: Record<string, MangaType> = {
  manga: "مانجا",
  manhwa: "مانهوا",
  manhua: "مانها",
};

export const STATUS_AR: Record<string, MangaStatus> = {
  ongoing: "مستمر",
  completed: "مكتمل",
};

export function typeLabel(t: string): string {
  return TYPE_AR[t] ?? "مانجا";
}

export function mangaStatusLabel(s: string): string {
  if (s === "متوقف") return "متوقف";
  return STATUS_AR[s] ?? "مستمر";
}

/* ================= تنسيق الأرقام والوقت ================= */

export function formatNum(n: number): string {
  return new Intl.NumberFormat("ar-EG").format(n);
}

export function formatViews(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(v);
}

export function timeAgo(dateLike: Date | string | null | undefined, lang: Lang = "ar"): string {
  if (!dateLike) return "—";
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return lang === "ar" ? "الآن" : "now";
  if (mins < 60) return lang === "ar" ? `قبل ${mins} د` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return lang === "ar" ? `قبل ${hours} س` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return lang === "ar" ? "أمس" : "yesterday";
  if (days < 30) return lang === "ar" ? `قبل ${days} يوم` : `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return lang === "ar" ? `قبل ${months} شهر` : `${months}mo ago`;
  const years = Math.floor(months / 12);
  return lang === "ar" ? `قبل ${years} سنة` : `${years}y ago`;
}

export function isWithin24h(dateLike: Date | string | null | undefined): boolean {
  if (!dateLike) return false;
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return Date.now() - d.getTime() < 24 * 60 * 60 * 1000;
}

/* ================= كشف المصدر من الرابط ================= */

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
  { token: "dilar", source: "dilar" },
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

/* ================= تصنيفات ثابتة (أسماء فقط — بلا أعداد وهمية) ================= */

export interface GenreDef {
  name: string;
  popular?: boolean;
  adult?: boolean;
}

export const GENRES: GenreDef[] = [
  { name: "أكشن", popular: true },
  { name: "فانتازيا", popular: true },
  { name: "رومانسي", popular: true },
  { name: "نظام / Level Up", popular: true },
  { name: "موريم" },
  { name: "إعادة تجسد" },
  { name: "مدرسي" },
  { name: "كوميدي" },
  { name: "دراما" },
  { name: "خارق للطبيعة" },
  { name: "مغامرة" },
  { name: "خيال علمي" },
  { name: "رعب" },
  { name: "+18", adult: true },
];

/* ================= محوّلات صفوف الـ API ================= */

/** صف مانجا كما يعيده الـ API (مع source مضمّن اختيارياً) */
export interface ApiMangaRow {
  id: number;
  slug: string;
  title: string;
  altTitles?: string[] | null;
  description?: string | null;
  coverUrl?: string | null;
  type: string;
  status: string;
  genres?: string[] | null;
  rating: number;
  ratingCount: number;
  viewCount?: number;
  /** مشاهدات الموقع الحقيقية — تُستخدم للعرض بدلاً من viewCount المجلوب من المصدر */
  siteViewCount?: number;
  chapterCount: number;
  isAdult: boolean;
  source?: { name: string } | null;
  updatedAt: Date | string;
}

/** صف مانجا من الـ API → شكل MangaCardData */
export function adaptMangaRow(m: ApiMangaRow, lang: Lang = "ar"): MangaCardData {
  return {
    id: Number(m.id),
    slug: m.slug,
    title: m.title,
    altTitle: m.altTitles?.[0],
    cover: proxyImg(m.coverUrl) || "/cover-01.png",
    type: TYPE_AR[m.type] ?? "مانهوا",
    status: STATUS_AR[m.status] ?? "مستمر",
    rating: m.rating ?? 0,
    ratingCount: m.ratingCount ?? 0,
    chapters: m.chapterCount ?? 0,
    views: formatViews(m.siteViewCount ?? 0),
    genres: m.genres ?? [],
    synopsis: m.description ?? "",
    source: m.source?.name ?? "",
    isAdult: m.isAdult,
    updatedAt: timeAgo(m.updatedAt, lang),
  };
}

export interface ApiChapterWithManga {
  id: number;
  number: number;
  publishedAt?: Date | string | null;
  createdAt: Date | string;
  manga: ApiMangaRow;
}

/** صف chapter+manga من manga.latest → شكل LatestChapterData */
export function adaptLatestChapter(
  c: ApiChapterWithManga,
  lang: Lang = "ar",
): LatestChapterData {
  const when = c.publishedAt ?? c.createdAt;
  return {
    id: Number(c.id),
    mangaSlug: c.manga.slug,
    mangaTitle: c.manga.title,
    cover: proxyImg(c.manga.coverUrl) || "/cover-01.png",
    chapter: c.number,
    timeAgo: timeAgo(when, lang),
    source: c.manga.source?.name ?? "",
    isNew: isWithin24h(when),
  };
}

/* ================= آخر الفصول مجمّعة لكل مانجا ================= */

/** صف فصل داخل مجموعة latestGrouped */
export interface GroupedChapterData {
  id: number;
  number: number;
  timeAgo: string;
  isNew: boolean;
}

/** بطاقة مانجا واحدة في قسم "آخر الفصول" */
export interface LatestGroupedMangaData {
  mangaId: number;
  slug: string;
  title: string;
  cover: string;
  rating: number;
  status: MangaStatus;
  type: MangaType;
  chapters: GroupedChapterData[];
}

export interface ApiLatestGroupedRow {
  manga: ApiMangaRow;
  chapters: {
    id: number;
    number: number;
    publishedAt?: Date | string | null;
    createdAt: Date | string;
  }[];
}

/** ناتج manga.latestGrouped → بطاقات جاهزة للعرض */
export function adaptLatestGrouped(
  rows: ApiLatestGroupedRow[],
  lang: Lang = "ar",
): LatestGroupedMangaData[] {
  return rows.map((r) => ({
    mangaId: Number(r.manga.id),
    slug: r.manga.slug,
    title: r.manga.title,
    cover: proxyImg(r.manga.coverUrl) || "/cover-01.png",
    rating: r.manga.rating ?? 0,
    status: STATUS_AR[r.manga.status] ?? "مستمر",
    type: TYPE_AR[r.manga.type] ?? "مانهوا",
    chapters: r.chapters.map((c) => {
      const when = c.publishedAt ?? c.createdAt;
      return {
        id: Number(c.id),
        number: c.number,
        timeAgo: timeAgo(when, lang),
        isNew: isWithin24h(when),
      };
    }),
  }));
}
