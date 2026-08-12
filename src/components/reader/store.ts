import { useCallback, useState } from "react";

/** ====== Reader settings (persisted in localStorage) ====== */

export type ReadingMode = "webtoon" | "paged";
export type FitMode = "width" | "screen";
export type ReaderBg = "auto" | "light" | "dark" | "oled";
export type FlipDirection = "rtl" | "ltr";
export type ImageQuality = "auto" | "high" | "saver";

export interface ReaderSettings {
  mode: ReadingMode;
  fit: FitMode;
  bg: ReaderBg;
  direction: FlipDirection;
  quality: ImageQuality;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  mode: "webtoon",
  fit: "width",
  bg: "auto",
  direction: "rtl",
  quality: "auto",
};

const SETTINGS_KEY = "zeko-reader-settings";

export function loadSettings(): ReaderSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useReaderSettings(): [
  ReaderSettings,
  (patch: Partial<ReaderSettings>) => void,
] {
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);
  const update = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);
  return [settings, update];
}

/** ====== Chapter / manga shapes (normalized API + mock) ====== */

export interface ChapterItem {
  id: number;
  number: number;
  title: string | null;
  pageCount: number;
}

export interface ReaderManga {
  id: number;
  slug: string;
  title: string;
  cover: string;
  isAdult: boolean;
  /** true when data came from the live API (real DB ids) */
  fromApi: boolean;
  chapters: ChapterItem[];
}

/** ====== Reading progress persistence ====== */

export interface SavedProgress {
  chapter: number;
  page: number;
  ratio: number;
  ts: number;
}

const PROGRESS_KEY = "zeko-reader-progress";
const READ_KEY = "zeko-reader-read";
const BOOKMARK_KEY = "zeko-reader-bookmarks";
const RATE_KEY = "zeko-reader-ratings";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export function loadProgress(slug: string): SavedProgress | null {
  const all = readJson<Record<string, SavedProgress>>(PROGRESS_KEY, {});
  return all[slug] ?? null;
}

export function saveProgress(slug: string, progress: SavedProgress) {
  const all = readJson<Record<string, SavedProgress>>(PROGRESS_KEY, {});
  all[slug] = progress;
  writeJson(PROGRESS_KEY, all);
}

export function loadReadSet(slug: string): number[] {
  const all = readJson<Record<string, number[]>>(READ_KEY, {});
  return all[slug] ?? [];
}

export function markChapterRead(slug: string, chapter: number) {
  const all = readJson<Record<string, number[]>>(READ_KEY, {});
  const list = new Set(all[slug] ?? []);
  list.add(chapter);
  all[slug] = [...list];
  writeJson(READ_KEY, all);
}

export function isChapterBookmarked(slug: string, chapter: number): boolean {
  const all = readJson<Record<string, number[]>>(BOOKMARK_KEY, {});
  return (all[slug] ?? []).includes(chapter);
}

export function toggleChapterBookmark(slug: string, chapter: number): boolean {
  const all = readJson<Record<string, number[]>>(BOOKMARK_KEY, {});
  const list = new Set(all[slug] ?? []);
  if (list.has(chapter)) list.delete(chapter);
  else list.add(chapter);
  all[slug] = [...list];
  writeJson(BOOKMARK_KEY, all);
  return list.has(chapter);
}

export function loadChapterRating(slug: string, chapter: number): number {
  const all = readJson<Record<string, number>>(RATE_KEY, {});
  return all[`${slug}:${chapter}`] ?? 0;
}

export function saveChapterRating(slug: string, chapter: number, stars: number) {
  const all = readJson<Record<string, number>>(RATE_KEY, {});
  all[`${slug}:${chapter}`] = stars;
  writeJson(RATE_KEY, all);
}

/** ====== Demo pages ====== */

export const SAMPLE_PAGES = [
  "/reader-sample-1.jpg",
  "/reader-sample-2.jpg",
  "/reader-sample-3.jpg",
];

/** Build the page list for a chapter using the 3 demo samples repeated. */
export function chapterPages(chapter: ChapterItem): string[] {
  // TODO: replace with real page URLs from the source scraper API.
  const count = chapter.pageCount > 0 ? chapter.pageCount : 12;
  return Array.from({ length: count }, (_, i) => SAMPLE_PAGES[i % SAMPLE_PAGES.length]);
}
