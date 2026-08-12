/**
 * نماذج عرض (View-Models) ومحوّلات لصفحة تفاصيل المانجا.
 * توحّد شكل البيانات القادمة من tRPC (صفوف قاعدة البيانات) مع بيانات mock
 * حتى تتعامل المكونات مع شكل واحد فقط.
 */
import type { Manga, MangaStatus, MangaType, SourceName } from "@/data/mock";
import { getMangaBySlug, mangaList } from "@/data/mock";

export type Lang = "ar" | "en";

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
  /** true عند السقوط إلى بيانات mock بسبب تعذّر الـ API */
  isMock: boolean;
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

export const TYPE_AR: Record<string, MangaType> = {
  manga: "مانجا",
  manhwa: "مانهوا",
  manhua: "مانها",
};

export const STATUS_AR: Record<string, MangaStatus> = {
  ongoing: "مستمر",
  completed: "مكتمل",
};

export function fmtChapter(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function formatViews(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

export function timeAgo(dateLike: Date | string | null | undefined, lang: Lang): string {
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

/** صف مانجا من قاعدة البيانات → شكل MangaCard */
export function dbMangaToCard(m: DbMangaLike, lang: Lang): Manga {
  const knownSources: SourceName[] = [
    "kawaiimanga", "olympustaff", "azorafly", "mangatime",
    "rocksmanga", "3asq", "despair-manga", "mangadar",
  ];
  const srcName = m.source?.name ?? "olympustaff";
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
    source: (knownSources.includes(srcName as SourceName) ? srcName : "olympustaff") as SourceName,
    isAdult: m.isAdult,
    updatedAt: timeAgo(m.updatedAt, lang),
  };
}

export function dbChapterToVM(c: DbChapterLike, lang: Lang): ChapterVM {
  const when = c.publishedAt ?? c.createdAt;
  return {
    id: c.id,
    number: c.number,
    title: c.title,
    timeAgo: timeAgo(when, lang),
    pageCount: c.pageCount ?? 0,
    isNew: isWithin24h(when),
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

/* ================= بدائل mock (TODO: تُزال عند استقرار الـ API) ================= */

/** TODO: fallback مؤقت — يُستخدم فقط عند فشل trpc.manga.getBySlug */
export function buildMockDetail(slug: string, lang: Lang): DetailVM | null {
  const m = getMangaBySlug(slug);
  if (!m) return null;

  const chapters: ChapterVM[] = [];
  for (let n = m.chapters; n >= 1; n--) {
    const dist = m.chapters - n; // 0 = الأحدث
    chapters.push({
      id: n,
      number: n,
      title: null,
      timeAgo:
        dist === 0
          ? m.updatedAt
          : lang === "ar"
            ? `قبل ${Math.max(1, dist)} يوم`
            : `${Math.max(1, dist)}d ago`,
      pageCount: 10 + (n % 4),
      isNew: dist === 0,
    });
  }

  // TODO: تقدّم تجريبي ثابت لأغراض العرض — يُستبدل بـ trpc.library.getProgress
  const demoLastRead: number | null = Math.floor(m.chapters * 0.3);
  const { readCount, nextChapter } = computeReadState(chapters, demoLastRead);

  return {
    id: m.id,
    slug: m.slug,
    title: m.title,
    altTitle: m.altTitle,
    cover: m.cover,
    type: m.type,
    status: m.status,
    rating: m.rating,
    ratingCount: m.ratingCount,
    chapterTotal: m.chapters,
    views: m.views,
    genres: m.genres,
    synopsis: m.synopsis,
    source: m.source,
    isAdult: !!m.isAdult,
    updatedAgo: m.updatedAt,
    chapters,
    isFavorite: false,
    isFollowing: false,
    lastReadNumber: demoLastRead,
    readCount,
    nextChapter,
    isMock: true,
  };
}

/** TODO: fallback مؤقت لأعمال مشابهة — يُستخدم عند فشل trpc.manga.similar */
export function buildMockSimilar(slug: string): Manga[] {
  const base = getMangaBySlug(slug);
  if (!base) return mangaList.slice(0, 6);
  const genres = new Set(base.genres);
  return mangaList
    .filter((m) => m.slug !== slug)
    .map((m) => ({ m, overlap: m.genres.filter((g) => genres.has(g)).length }))
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 6)
    .map((x) => x.m);
}

/** TODO: fallback مؤقت للتعليقات — يُستخدم عند فشل trpc.engagement.listComments */
export function buildMockComments(lang: Lang): CommentVM[] {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  return [
    {
      id: 1,
      author: t("سارة أحمد", "Sara Ahmed"),
      avatar: "/avatar-2.png",
      badge: "مشرف",
      timeAgo: t("قبل 20 د", "20m ago"),
      content: t(
        "الرسم في الفصول الأخيرة وصل لمستوى آخر، خصوصاً مشهد القتال على حافة الهاوية. من أفضل الأعمال حالياً بلا منازع.",
        "The art in recent chapters is on another level, especially the cliff fight. Easily one of the best right now."
      ),
      isSpoiler: false,
      likes: 42,
    },
    {
      id: 2,
      author: t("عمر خالد", "Omar Khaled"),
      avatar: "/avatar-1.png",
      badge: "عضو",
      timeAgo: t("قبل ساعة", "1h ago"),
      content: t(
        "لا أصدق أن الخائن كان أخاه طوال الوقت! لحظة كشف الهوية في الفصل الأخير صدمتني فعلاً.",
        "Can't believe the traitor was his brother all along! The reveal in the last chapter genuinely shocked me."
      ),
      isSpoiler: true,
      likes: 18,
    },
    {
      id: 3,
      author: t("ليان محمود", "Layan M."),
      avatar: "/avatar-3.png",
      badge: "عضو",
      timeAgo: t("قبل 3 س", "3h ago"),
      content: t(
        "بدأتها أمس وأنهيت 40 فصلاً دفعة واحدة… الإدمان حقيقي. الترجمة العربية ممتازة والتنضيد نظيف.",
        "Started yesterday and binged 40 chapters… the addiction is real. Great translation and clean typesetting."
      ),
      isSpoiler: false,
      likes: 27,
    },
    {
      id: 4,
      author: t("يوسف النجار", "Yousef N."),
      avatar: "/avatar-4.png",
      badge: "عضو",
      timeAgo: t("قبل 5 س", "5h ago"),
      content: t(
        "البطل سيهزم الزعيم في الفصل القادم على الأرجح، كل التلميحات منذ القوس الأول تشير لذلك.",
        "The MC will probably beat the boss next chapter — every hint since the first arc points to it."
      ),
      isSpoiler: true,
      likes: 9,
    },
    {
      id: 5,
      author: t("مريم عادل", "Mariam Adel"),
      avatar: "/avatar-2.png",
      badge: "عضو",
      timeAgo: t("أمس", "yesterday"),
      content: t(
        "تطور الشخصيات ممتاز، خاصة الشخصية الثانوية التي بدأت ككوميديا وأصبحت محورية في القصة.",
        "Character development is excellent — the side character who started as comic relief is now central to the plot."
      ),
      isSpoiler: false,
      likes: 15,
    },
  ];
}
