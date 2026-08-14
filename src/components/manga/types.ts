/**
 * نماذج عرض (View-Models) ومحوّلات لصفحة تفاصيل المانجا.
 * البيانات تأتي حصرياً من tRPC (صفوف قاعدة البيانات) — لا بدائل وهمية.
 */
import type { Lang, MangaCardData, MangaStatus, MangaType } from "@/lib/manga";
import { STATUS_AR, TYPE_AR, formatViews, timeAgo } from "@/lib/manga";

/** نافذة اعتبار الفصل "جديداً" — ٤٨ ساعة من نزوله */
const NEW_CHAPTER_WINDOW_MS = 48 * 60 * 60 * 1000;

function isWithinNewWindow(dateLike: Date | string | null | undefined): boolean {
  if (!dateLike) return false;
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return Date.now() - d.getTime() < NEW_CHAPTER_WINDOW_MS;
}

export type { Lang };
export { timeAgo };

/* ================= أنواع موحّدة ================= */

export interface ChapterVM {
  id: number;
  number: number;
  title?: string | null;
  timeAgo: string;
  pageCount: number;
  isNew: boolean;
}

export interface DetailVM {
  id: number;
  slug: string;
  title: string;
  altTitle?: string;
  cover: string;
  type: MangaType;
  status: MangaStatus;
  rating: number;
  ratingCount: number;
  chapterTotal: number;
  views: string;
  genres: string[];
  synopsis: string;
  source: string;
  isAdult: boolean;
  updatedAgo: string;
  chapters: ChapterVM[]; // مرتبة من الأحدث إلى الأقدم
  isFavorite: boolean;
  isFollowing: boolean;
  /** رقم آخر فصل مقروء — null إن لم تبدأ القراءة */
  lastReadNumber: number | null;
  readCount: number; // عدد الفصول المقروءة (حسب آخر فصل مقروء)
  nextChapter: number | null; // أول فصل غير مقروء
}

export interface CommentVM {
  id: number;
  author: string;
  avatar: string;
  badge?: "عضو" | "مشرف";
  timeAgo: string;
  content: string;
  isSpoiler: boolean;
  likes: number;
}

/** شكل صف المانجا القادم من قاعدة البيانات (يُقبل أيضاً بدون source) */
export interface DbMangaLike {
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
  chapterCount: number;
  isAdult: boolean;
  source?: { name: string } | null;
  updatedAt: Date | string;
}

export interface DbChapterLike {
  id: number;
  number: number;
  title?: string | null;
  pageCount: number;
  publishedAt?: Date | string | null;
  createdAt: Date | string;
}

/* ================= محوّلات ================= */

export function fmtChapter(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** صف مانجا من قاعدة البيانات → شكل MangaCardData */
export function dbMangaToCard(m: DbMangaLike, lang: Lang): MangaCardData {
  return {
    id: m.id,
    slug: m.slug,
    title: m.title,
    altTitle: m.altTitles?.[0],
    cover: m.coverUrl || "/cover-01.png",
    type: TYPE_AR[m.type] ?? "مانهوا",
    status: STATUS_AR[m.status] ?? "مستمر",
    rating: m.rating ?? 0,
    ratingCount: m.ratingCount ?? 0,
    chapters: m.chapterCount ?? 0,
    views: formatViews(m.viewCount ?? 0),
    genres: m.genres ?? [],
    synopsis: m.description ?? "",
    source: m.source?.name ?? "",
    isAdult: m.isAdult,
    updatedAt: timeAgo(m.updatedAt, lang),
  };
}

export function dbChapterToVM(c: DbChapterLike, lang: Lang): ChapterVM {
  // TODO(backend): publishedAt اختياري — الباكند سيضيفه؛ حتى تسليمه نعتمد createdAt
  const when = c.publishedAt ?? c.createdAt;
  return {
    id: c.id,
    number: c.number,
    title: c.title,
    timeAgo: timeAgo(when, lang),
    pageCount: c.pageCount ?? 0,
    isNew: isWithinNewWindow(when),
  };
}

/** حساب حالة القراءة: الفصول ذات الرقم الأصغر أو المساوي لآخر فصل مقروء تُعتبر مقروءة */
export function computeReadState(
  chapters: ChapterVM[],
  lastReadNumber: number | null,
): { readCount: number; nextChapter: number | null } {
  if (!chapters.length) return { readCount: 0, nextChapter: null };
  const numbers = chapters.map((c) => c.number);
  const first = Math.min(...numbers);
  if (lastReadNumber === null || lastReadNumber <= 0) {
    return { readCount: 0, nextChapter: first };
  }
  const readCount = numbers.filter((n) => n <= lastReadNumber).length;
  const unread = numbers.filter((n) => n > lastReadNumber);
  return {
    readCount,
    nextChapter: unread.length ? Math.min(...unread) : null,
  };
}
