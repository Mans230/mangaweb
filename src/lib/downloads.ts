/**
 * سجل محلي بسيط للفصول المحمّلة عبر /api/download — يُخزَّن في localStorage
 * ويُعرض في تبويب "التحميلات" بصفحة المكتبة.
 * ينادي recordDownload() من أي زر تحميل بعد نجاح بدء التنزيل.
 */

export interface DownloadRecord {
  slug: string;
  title: string;
  /** رقم الفصل */
  chapter: number;
  /** ISO date */
  at: string;
}

const KEY = "zeko-downloads";
const MAX_RECORDS = 100;
/** حدث مخصص يُبث بعد كل تغيير ليتحدث العرض فوراً ضمن نفس التبويب */
export const DOWNLOADS_EVENT = "zeko:downloads-changed";

function readAll(): DownloadRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is DownloadRecord =>
        typeof r === "object" &&
        r !== null &&
        typeof (r as DownloadRecord).slug === "string" &&
        typeof (r as DownloadRecord).title === "string" &&
        typeof (r as DownloadRecord).chapter === "number" &&
        typeof (r as DownloadRecord).at === "string",
    );
  } catch {
    return [];
  }
}

function writeAll(records: DownloadRecord[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    // امتلاء التخزين — تجاهل بصمت
  }
  window.dispatchEvent(new Event(DOWNLOADS_EVENT));
}

/** يسجّل تحميل فصل (الأحدث أولاً، بلا تكرار لنفس الفصل). */
export function recordDownload(slug: string, title: string, chapter: number) {
  const rest = readAll().filter((r) => !(r.slug === slug && r.chapter === chapter));
  writeAll(
    [{ slug, title, chapter, at: new Date().toISOString() }, ...rest].slice(0, MAX_RECORDS),
  );
}

/** يعيد كل السجلات — الأحدث أولاً. */
export function getDownloads(): DownloadRecord[] {
  return readAll();
}

export function removeDownload(slug: string, chapter: number) {
  writeAll(readAll().filter((r) => !(r.slug === slug && r.chapter === chapter)));
}

export function clearDownloads() {
  writeAll([]);
}
