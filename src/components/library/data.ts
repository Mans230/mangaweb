import type { Lang } from "@/lib/manga";
import { STATUS_AR, TYPE_AR, formatViews, proxyImg, timeAgo } from "@/lib/manga";

/**
 * أنواع موحّدة لصفحة المكتبة — البيانات تأتي حصرياً من library.getLibrary.
 */

export interface LibManga {
  id: number;
  slug: string;
  title: string;
  cover: string;
  chapters: number;
  type: string; // عربي: مانهوا/مانجا/مانها
  status: string; // عربي: مستمر/مكتمل
  rating: number;
  ratingCount: number;
  views: string;
  genres: string[];
  synopsis: string;
  source: string;
  isAdult: boolean;
}

export interface FollowItem {
  manga: LibManga;
  updatedAt: string; // نص "قبل .." للعرض
}

export interface HistoryItem {
  id: number;
  manga: LibManga;
  chapter: number;
  lastPage: number;
  date: Date;
  timeLabel: string;
}

export interface LibraryData {
  favorites: LibManga[];
  following: FollowItem[];
  history: HistoryItem[];
}

/** تطبيع سجل مانجا قادم من الـ API إلى شكل العرض. */
export function normalizeApiManga(m: {
  id: number;
  slug: string;
  title: string;
  coverUrl: string | null;
  chapterCount: number;
  type: string;
  status: string;
  rating?: number;
  ratingCount?: number;
  viewCount?: number;
  genres?: string[] | null;
  description?: string | null;
  isAdult?: boolean;
  source?: { name: string } | null;
}): LibManga {
  return {
    id: m.id,
    slug: m.slug,
    title: m.title,
    cover: proxyImg(m.coverUrl) || "/placeholder-cover.svg",
    chapters: m.chapterCount,
    type: TYPE_AR[m.type] ?? m.type,
    status: STATUS_AR[m.status] ?? m.status,
    rating: m.rating ?? 0,
    ratingCount: m.ratingCount ?? 0,
    views: formatViews(m.viewCount ?? 0),
    genres: m.genres ?? [],
    synopsis: m.description ?? "",
    source: m.source?.name ?? "",
    isAdult: m.isAdult ?? false,
  };
}

export function timeAgoAr(date: Date): string {
  return timeAgo(date, "ar" as Lang);
}

export function dayLabel(date: Date): string {
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((dayStart(new Date()) - dayStart(date)) / 86400000);
  if (diffDays <= 0) return "اليوم";
  if (diffDays === 1) return "أمس";
  return date.toLocaleDateString("ar", { day: "numeric", month: "long" });
}

/** تجميع عناصر السجل حسب اليوم مع الحفاظ على الترتيب الزمني التنازلي. */
export function groupByDay(items: HistoryItem[]): { label: string; items: HistoryItem[] }[] {
  const groups: { label: string; items: HistoryItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.date);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

