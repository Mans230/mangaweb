/**
 * ميرور صفحات فصل إلى R2: ينزّل بايتات كل صورة من المصدر ويرفعها لتخزيننا،
 * ثم يخزّن روابطنا في chapters.cachedPages. بعدها القراءة تخدم من R2 مباشرة.
 * best-effort وidempotent: يتخطّى الفصول المُميرَّرة سلفاً، ويترك المصدر كما هو عند الفشل.
 */
import { eq } from "drizzle-orm";
import { chapters } from "@db/schema";
import { getDb } from "../queries/connection";
import { fetchImage } from "./download";
import { isMirrored, mirrorEnabled, putImage } from "./r2";

/** أقصى عدد فصول قيد الميرور في نفس اللحظة (منع إغراق الذاكرة/الشبكة) */
const inFlight = new Set<number>();

async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * يميرّر صفحات فصل إلى R2 ويحدّث cachedPages بروابطنا.
 * pages: روابط الصفحات من المصدر (مباشرة). referer: scraper.imageReferer.
 * يعيد true إن تم التخزين الكامل.
 */
export async function mirrorChapter(
  chapterId: number,
  mangaId: number,
  pages: string[],
  referer: string,
): Promise<boolean> {
  if (!mirrorEnabled() || !pages.length) return false;
  // مُميرَّر سلفاً؟ (cachedPages كلها روابطنا)
  if (pages.every((p) => isMirrored(p))) return true;
  if (inFlight.has(chapterId)) return false;
  inFlight.add(chapterId);
  try {
    const results = await mapLimited(pages, 4, async (url, idx) => {
      if (isMirrored(url)) return url; // صفحة مخزّنة سلفاً
      const img = await fetchImage(url, referer);
      if (!img) return null;
      const key = `p/${mangaId}/${chapterId}/${idx}.${img.ext}`;
      return putImage(key, img.data, img.ext);
    });
    // نجاح كامل فقط — أي فشل يترك المصدر كما هو (نعيد المحاولة لاحقاً)
    if (results.some((r) => r === null)) {
      console.warn(`[mirror] فصل ${chapterId}: فشل جلب بعض الصفحات — أُجّل الميرور`);
      return false;
    }
    const urls = results as string[];
    await getDb()
      .update(chapters)
      .set({ cachedPages: urls, pagesCachedAt: new Date(), pageCount: urls.length })
      .where(eq(chapters.id, chapterId));
    console.log(`[mirror] فصل ${chapterId}: خُزِّنت ${urls.length} صفحة على R2`);
    return true;
  } catch (e) {
    console.warn(`[mirror] فصل ${chapterId} فشل: ${(e as Error).message}`);
    return false;
  } finally {
    inFlight.delete(chapterId);
  }
}
