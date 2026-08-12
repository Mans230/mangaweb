import { mangaList } from "@/data/mock";

/**
 * أنواع موحّدة لصفحة المكتبة + بيانات بديلة (mock fallback).
 * TODO(api): إزالة الـ fallback عند استقرار واجهة library.getLibrary في الإنتاج.
 */

export interface LibManga {
  id: number;
  slug: string;
  title: string;
  cover: string;
  chapters: number;
  type: string; // عربي: مانهوا/مانجا/مانها
  status: string; // عربي: مستمر/مكتمل
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

const TYPE_AR: Record<string, string> = { manhwa: "مانهوا", manga: "مانجا", manhua: "مانها" };
const STATUS_AR: Record<string, string> = { ongoing: "مستمر", completed: "مكتمل" };

/** تطبيع سجل مانجا قادم من الـ API إلى شكل العرض. */
export function normalizeApiManga(m: {
  id: number;
  slug: string;
  title: string;
  coverUrl: string | null;
  chapterCount: number;
  type: string;
  status: string;
}): LibManga {
  return {
    id: m.id,
    slug: m.slug,
    title: m.title,
    cover: m.coverUrl || "/cover-01.png",
    chapters: m.chapterCount,
    type: TYPE_AR[m.type] ?? m.type,
    status: STATUS_AR[m.status] ?? m.status,
  };
}

export function timeAgoAr(date: Date): string {
  const mins = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (mins < 60) return mins === 1 ? "قبل دقيقة" : `قبل ${mins} د`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? "قبل ساعة" : `قبل ${hours} س`;
  const days = Math.round(hours / 24);
  if (days === 1) return "أمس";
  if (days < 30) return `قبل ${days} يوم`;
  return date.toLocaleDateString("ar", { day: "numeric", month: "long" });
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

/* ---------------- mock fallback ---------------- */

function toLibManga(i: number): LibManga {
  const m = mangaList[i % mangaList.length];
  return {
    id: m.id,
    slug: m.slug,
    title: m.title,
    cover: m.cover,
    chapters: m.chapters,
    type: m.type,
    status: m.status,
  };
}

export const mockLibrary: LibraryData = (() => {
  const favorites: LibManga[] = [0, 6, 2, 4, 7, 1, 8, 10].map(toLibManga);

  const following: FollowItem[] = [0, 6, 4, 2, 8, 5].map((i) => ({
    manga: toLibManga(i),
    updatedAt: mangaList[i % mangaList.length].updatedAt,
  }));

  const history: HistoryItem[] = [];
  let id = 1;
  // توزيع واقعي على آخر 9 أيام لإظهار الرسم البياني والمجموعات
  const pattern = [3, 2, 0, 4, 1, 2, 5, 1, 3];
  pattern.forEach((perDay, dayIdx) => {
    for (let k = 0; k < perDay; k++) {
      const m = toLibManga((dayIdx * 3 + k) % mangaList.length);
      const date = new Date();
      date.setDate(date.getDate() - dayIdx);
      date.setHours(22 - k * 3, (k * 17 + dayIdx * 11) % 60, 0, 0);
      history.push({
        id: id++,
        manga: m,
        chapter: Math.max(1, m.chapters - ((dayIdx + k) % 9) - 1),
        lastPage: (k * 5 + dayIdx) % 12,
        date,
        timeLabel: date.toLocaleTimeString("ar", { hour: "numeric", minute: "2-digit" }),
      });
    }
  });
  history.sort((a, b) => b.date.getTime() - a.date.getTime());

  return { favorites, following, history };
})();
