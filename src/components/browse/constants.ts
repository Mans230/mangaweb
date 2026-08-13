import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import type { MangaCardData, MangaType } from "@/lib/manga";
import { adaptMangaRow } from "@/lib/manga";

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

/* ====== تحويل صف tRPC إلى شكل MangaCardData ====== */
export function adaptListItem(m: MangaListItem): MangaCardData {
  return adaptMangaRow(m);
}

export function adaptPopularItem(m: PopularItem): MangaCardData {
  return adaptMangaRow(m);
}

/* ====== فلاتر تُطبّق محلياً فوق نتائج الـ API (النوع/المصدر/التصنيفات الإضافية/الأبجدي) ====== */
export function applyLocalOnlyFilters(list: MangaCardData[], f: BrowseFilters): MangaCardData[] {
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
