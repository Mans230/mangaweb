import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import type { Manga, MangaStatus, MangaType, SourceName } from "@/data/mock";
import { mangaList } from "@/data/mock";

/* ====== أنواع مستنتجة من tRPC (لا واجهات يدوية لكيانات DB) ====== */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type MangaListItem = RouterOutputs["manga"]["list"]["items"][number];
export type PopularItem = RouterOutputs["manga"]["popular"][number];
export type LatestChapterItem = RouterOutputs["manga"]["latest"][number];

/* ====== نموذج حالة الفلاتر (مدفوع بالـ URL) ====== */
export type SortKey = "popular" | "latest" | "rating" | "alpha";
export type StatusFilter = "all" | "ongoing" | "completed";
export type ViewMode = "grid" | "list";

export const CH_MAX_LIMIT = 1500;
export const PAGE_SIZE = 12;

export interface BrowseFilters {
  q: string;
  genres: string[];
  status: StatusFilter;
  chMin: number;
  chMax: number;
  types: MangaType[];
  sources: string[];
  sort: SortKey;
  page: number;
}

export const DEFAULT_FILTERS: BrowseFilters = {
  q: "",
  genres: [],
  status: "all",
  chMin: 0,
  chMax: CH_MAX_LIMIT,
  types: [],
  sources: [],
  sort: "popular",
  page: 1,
};

const SORTS: SortKey[] = ["popular", "latest", "rating", "alpha"];

export function parseFilters(params: URLSearchParams): BrowseFilters {
  const num = (key: string, fallback: number) => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const csv = (key: string) =>
    (params.get(key) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const sortRaw = params.get("sort") as SortKey | null;
  const statusRaw = params.get("status");
  return {
    q: params.get("q") ?? "",
    genres: csv("genres"),
    status: statusRaw === "ongoing" || statusRaw === "completed" ? statusRaw : "all",
    chMin: Math.max(0, num("chMin", 0)),
    chMax: Math.min(CH_MAX_LIMIT, num("chMax", CH_MAX_LIMIT)),
    types: csv("types").filter((x): x is MangaType =>
      ["مانهوا", "مانجا", "مانها"].includes(x),
    ),
    sources: csv("srcs"),
    sort: sortRaw && SORTS.includes(sortRaw) ? sortRaw : "popular",
    page: Math.max(1, num("page", 1)),
  };
}

export function filtersToParams(f: BrowseFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.genres.length) p.set("genres", f.genres.join(","));
  if (f.status !== "all") p.set("status", f.status);
  if (f.chMin > 0) p.set("chMin", String(f.chMin));
  if (f.chMax < CH_MAX_LIMIT) p.set("chMax", String(f.chMax));
  if (f.types.length) p.set("types", f.types.join(","));
  if (f.sources.length) p.set("srcs", f.sources.join(","));
  if (f.sort !== "popular") p.set("sort", f.sort);
  if (f.page > 1) p.set("page", String(f.page));
  return p;
}

/** مفتاح يتغير عند تغيّر أي فلتر (باستثناء الصفحة) — يُستخدم لإعادة تحريك النتائج */
export function filtersKey(f: BrowseFilters): string {
  return JSON.stringify({ ...f, page: 1 });
}

/* ====== تحويل صف tRPC إلى شكل Manga الذي تتوقعه المكونات المشتركة ====== */
const TYPE_TO_AR: Record<MangaListItem["type"], MangaType> = {
  manga: "مانجا",
  manhwa: "مانهوا",
  manhua: "مانها",
};
const STATUS_TO_AR: Record<MangaListItem["status"], MangaStatus> = {
  ongoing: "مستمر",
  completed: "مكتمل",
};

// TODO(backend): manga.list لا يعيد اسم المصدر حالياً — خريطة مؤقتة لمطابقة
// ترتيب الـ seed حتى يتوفّر endpoint عام لقائمة المصادر.
const SOURCE_ID_TO_NAME: Record<number, SourceName> = {
  1: "kawaiimanga",
  2: "olympustaff",
  3: "azorafly",
  4: "mangatime",
  5: "rocksmanga",
  6: "3asq",
  7: "despair-manga",
  8: "mangadar",
};

export function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function adaptListItem(m: MangaListItem): Manga {
  return {
    id: Number(m.id),
    slug: m.slug,
    title: m.title,
    altTitle: m.altTitles?.[0],
    cover: m.coverUrl || "/cover-01.png",
    type: TYPE_TO_AR[m.type] ?? "مانهوا",
    status: STATUS_TO_AR[m.status] ?? "مستمر",
    rating: m.rating,
    ratingCount: m.ratingCount,
    chapters: m.chapterCount,
    views: formatViews(m.viewCount),
    genres: m.genres ?? [],
    synopsis: m.description ?? "",
    source: SOURCE_ID_TO_NAME[m.sourceId] ?? "kawaiimanga",
    isAdult: m.isAdult,
    updatedAt: "",
  };
}

export function adaptPopularItem(m: PopularItem): Manga {
  return adaptListItem(m as MangaListItem);
}

/* ====== فلاتر تُطبّق محلياً (النوع/المصدر غير مدعومين في الـ API حالياً) ====== */
export function applyLocalOnlyFilters(list: Manga[], f: BrowseFilters): Manga[] {
  let out = list;
  // التصنيف الأول يُرسل للـ API؛ الباقي يُفلتر محلياً
  if (f.genres.length > 1) {
    const rest = f.genres.slice(1);
    out = out.filter((m) => rest.every((g) => m.genres.includes(g)));
  }
  if (f.types.length) out = out.filter((m) => f.types.includes(m.type));
  if (f.sources.length) out = out.filter((m) => f.sources.includes(m.source));
  if (f.sort === "alpha") {
    out = [...out].sort((a, b) => a.title.localeCompare(b.title, "ar"));
  }
  return out;
}

/** فلترة كاملة محلياً — تُستخدم لوضع الـ fallback على بيانات mock */
export function applyAllFiltersLocally(f: BrowseFilters): Manga[] {
  let out: Manga[] = mangaList;
  const q = f.q.trim().toLowerCase();
  if (q) {
    out = out.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        (m.altTitle ?? "").toLowerCase().includes(q) ||
        m.genres.some((g) => g.toLowerCase().includes(q)),
    );
  }
  if (f.genres.length) {
    out = out.filter((m) => f.genres.every((g) => m.genres.includes(g)));
  }
  if (f.status !== "all") {
    const target: MangaStatus = f.status === "ongoing" ? "مستمر" : "مكتمل";
    out = out.filter((m) => m.status === target);
  }
  out = out.filter((m) => m.chapters >= f.chMin && m.chapters <= f.chMax);
  if (f.types.length) out = out.filter((m) => f.types.includes(m.type));
  if (f.sources.length) out = out.filter((m) => f.sources.includes(m.source));
  if (f.sort === "alpha") {
    out = [...out].sort((a, b) => a.title.localeCompare(b.title, "ar"));
  }
  return out;
}

/* ====== وقت نسبي بسيط (قبل س/د/يوم) ====== */
export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} س`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "أمس";
  if (days < 7) return `قبل ${days} أيام`;
  const weeks = Math.floor(days / 7);
  return `منذ ${weeks} أسبوع`;
}
