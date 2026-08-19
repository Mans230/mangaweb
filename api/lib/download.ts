import type { Context } from "hono";
import { Readable } from "node:stream";
import { ZipFile } from "yazl";
import { and, eq } from "drizzle-orm";
import { chapters, manga, sources } from "@db/schema";
import { getDb } from "../queries/connection";
import { getScraper, BROWSER_UA } from "../scrapers";
import { checkRateLimit, clientIp } from "./rateLimit";

const MAX_PAGES = 60;
const FETCH_CONCURRENCY = 3;
const IMAGE_TIMEOUT_MS = 15000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const DOWNLOAD_RATE_LIMIT = 10; // 10 طلبات / دقيقة / IP
const DOWNLOAD_RATE_WINDOW_MS = 60 * 1000;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function extFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const m = path.match(/\.(jpe?g|png|webp|gif|avif)$/);
    if (m) return m[1] === "jpeg" ? "jpg" : m[1];
  } catch {
    /* ignore */
  }
  return "jpg";
}

/** جلب صورة واحدة مع timeout وحد للحجم — يعيد null عند الفشل (تُتخطَّى الصفحة) */
export async function fetchImage(
  url: string,
  referer: string,
): Promise<{ data: Buffer; ext: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: referer,
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok || !res.body) return null;
    const contentType = (res.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith("image/")) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_IMAGE_BYTES) return null;

    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    const ext = EXT_BY_MIME[contentType] ?? extFromUrl(url);
    return { data: Buffer.concat(chunks.map((c) => Buffer.from(c))), ext };
  } catch (e) {
    console.warn(
      `[download] فشل جلب صفحة (${url.slice(0, 120)}): ${(e as Error).message}`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** GET /api/download/:slug/chapter/:num — تجميع فصل كملف CBZ (أو ZIP عبر ?format=zip) */
export async function downloadChapterHandler(c: Context) {
  const ip = clientIp(c.req.raw);
  if (!checkRateLimit(`download:${ip}`, DOWNLOAD_RATE_LIMIT, DOWNLOAD_RATE_WINDOW_MS)) {
    return c.json({ error: "طلبات تحميل كثيرة، جرب بعد دقيقة" }, 429);
  }

  const slug = c.req.param("slug") ?? "";
  const numParam = c.req.param("num") ?? "";
  const number = Number(numParam);
  if (!slug || !Number.isFinite(number)) {
    return c.json({ error: "Invalid chapter number" }, 400);
  }

  const db = getDb();
  const [row] = await db
    .select({ chapter: chapters, manga: manga, source: sources })
    .from(chapters)
    .innerJoin(manga, eq(chapters.mangaId, manga.id))
    .innerJoin(sources, eq(manga.sourceId, sources.id))
    .where(and(eq(manga.slug, slug), eq(chapters.number, number)))
    .limit(1);
  if (!row || !row.chapter.url) {
    return c.json({ error: "الفصل غير موجود" }, 404);
  }

  const scraper = getScraper(row.source.name);
  if (!scraper || !scraper.enabled) {
    return c.json({ error: `المصدر ${row.source.name} غير متاح حالياً` }, 502);
  }

  let pages: string[];
  try {
    pages = await scraper.getPages(row.chapter.url);
  } catch (e) {
    console.warn(
      `[download] getPages(${row.chapter.url}) فشل: ${(e as Error).message}`,
    );
    return c.json({ error: "تعذّر جلب صفحات الفصل من المصدر" }, 502);
  }
  if (!pages.length) {
    return c.json({ error: "الفصل غير موجود" }, 404);
  }
  if (pages.length > MAX_PAGES) {
    return c.json({ error: `الفصل كبير جداً (${pages.length} صفحة، الحد ${MAX_PAGES})` }, 413);
  }

  // جلب الصور تباعاً بـ concurrency محدود — الفاشلة تُتخطَّى وتُدوَّن
  const results: ({ data: Buffer; ext: string; index: number } | null)[] =
    new Array(pages.length).fill(null);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, pages.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= pages.length) return;
        const img = await fetchImage(pages[i], scraper.imageReferer);
        if (img) results[i] = { ...img, index: i };
      }
    }),
  );

  const fetched = results.filter(
    (r): r is { data: Buffer; ext: string; index: number } => r !== null,
  );
  if (!fetched.length) {
    return c.json({ error: "تعذّر تحميل أي صفحة من هذا الفصل" }, 502);
  }
  const skipped = pages.length - fetched.length;
  if (skipped > 0) {
    console.warn(`[download] ${slug}#${numParam}: تُخطِّيت ${skipped} صفحة فاشلة`);
  }

  const zip = new ZipFile();
  for (const img of fetched) {
    const name = `${String(img.index + 1).padStart(3, "0")}.${img.ext}`;
    zip.addBuffer(img.data, name);
  }
  zip.end();

  const asZip = c.req.query("format") === "zip";
  const ext = asZip ? "zip" : "cbz";
  const safeSlug = slug.replace(/[^\w.-]+/g, "-").slice(0, 120) || "chapter";
  const safeNum = numParam.replace(/[^\d.]+/g, "") || String(number);
  const filename = `${safeSlug}-c${safeNum}.${ext}`;

  const webStream = Readable.toWeb(
    zip.outputStream as unknown as Readable,
  ) as ReadableStream;
  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": asZip ? "application/zip" : "application/x-cbz",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
