import { and, asc, count, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  chapters,
  favorites,
  follows,
  manga,
  notifications,
  sources,
  userListItems,
  userLists,
} from "@db/schema";
import { getDb } from "../queries/connection";
import { getScraper } from "../scrapers";
import type { BaseScraper, SeriesInfo } from "../scrapers";

/** تطبيع العنوان للمطابقة بين المصادر */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** تواريخ المصادر: ISO أو نص حر أو نسبي ("2 days ago" / "منذ 3 أيام") — نعيد Date صالحة أو null */
function parseDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  const direct = Date.parse(d);
  if (!Number.isNaN(direct)) return new Date(direct);

  const t = d.trim().toLowerCase();
  if (/^(أمس|yesterday)$/.test(t)) return new Date(Date.now() - 86400000);
  if (/^(اليوم|today)$/.test(t)) return new Date();

  const UNITS: [RegExp, number][] = [
    [/ثانية|ثواني|seconds?/, 1000],
    [/دقيقة|دقائق|minutes?/, 60000],
    [/ساعة|ساعات|hours?/, 3600000],
    [/يوم|أيام|ايام|days?/, 86400000],
    [/أسبوع|اسبوع|أسابيع|اسابيع|weeks?/, 604800000],
    [/شهر|أشهر|اشهر|months?/, 2592000000],
    [/سنة|سنوات|years?/, 31536000000],
  ];
  const m = t.match(/(\d+(?:\.\d+)?)/);
  if (m && /(ago|منذ|قبل)/.test(t)) {
    const n = Number(m[1]);
    for (const [re, ms] of UNITS) {
      if (re.test(t)) return new Date(Date.now() - n * ms);
    }
  }
  // صيغ مثل "منذ يومين" / "قبل ساعتين" بلا رقم
  if (/(ago|منذ|قبل)/.test(t)) {
    if (/يومين/.test(t)) return new Date(Date.now() - 2 * 86400000);
    if (/ساعتين/.test(t)) return new Date(Date.now() - 2 * 3600000);
    if (/أسبوعين|اسبوعين/.test(t)) return new Date(Date.now() - 2 * 604800000);
  }
  return null;
}

function mapStatus(s?: string): "ongoing" | "completed" {
  if (!s) return "ongoing";
  return /complete|finished|ended|مكتمل|منتهي/i.test(s) ? "completed" : "ongoing";
}

function mapType(t?: string): "manga" | "manhwa" | "manhua" {
  if (!t) return "manhwa";
  if (/manhua|صيني/i.test(t)) return "manhua";
  if (/manga|يابان/i.test(t)) return "manga";
  return "manhwa";
}

/** rating في schema هو decimal(3,2) أي بحد أقصى 9.99 */
function mapRating(r?: number): number {
  if (r == null || !Number.isFinite(r) || r <= 0) return 0;
  let v = r;
  if (v > 100) v = v / 100;
  if (v > 10) v = v / 10;
  return Math.min(9.99, Math.max(0, Math.round(v * 100) / 100));
}

const ADULT_GENRE_RE = /(\+18|adult|mature|hentai|هنتاي|للكبار)/i;

function mapAdult(s: SeriesInfo): boolean {
  if (s.isAdult) return true;
  return (s.genres ?? []).some((g) => ADULT_GENRE_RE.test(g));
}

const SOURCE_SITE_URLS: Record<string, string> = {
  kawaiimanga: "https://kawaiimanga.org",
  olympustaff: "https://olympustaff.com",
  azorafly: "https://azorafly.com",
  mangatime: "https://mangatime.org",
  rocksmanga: "https://rocksmanga.com",
  "3asq": "https://3asq.online",
  despair: "https://despair-manga.net",
  mangadar: "https://mangadar.com",
  dilar: "https://dilar.tube",
};

/** أوجد صف المصدر بالاسم أو أنشئه */
async function ensureSource(sourceKey: string): Promise<typeof sources.$inferSelect> {
  const db = getDb();
  const existing = await db.query.sources.findFirst({
    where: eq(sources.name, sourceKey),
  });
  if (existing) return existing;
  const scraper = getScraper(sourceKey);
  const baseUrl = SOURCE_SITE_URLS[sourceKey] ?? scraper?.baseUrl ?? "";
  const [{ id }] = await db
    .insert(sources)
    .values({
      name: sourceKey,
      baseUrl,
      status: scraper?.enabled === false ? "paused" : "active",
      mangaCount: 0,
    })
    .$returningId();
  const created = await db.query.sources.findFirst({ where: eq(sources.id, id) });
  return created!;
}

function sanitizeSlug(slug: string, fallback: string): string {
  const clean = decodeURIComponent(slug || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF-]+/gi, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 280);
  return clean || fallback;
}

async function upsertChapters(
  mangaId: number,
  list: SeriesInfo["chapters"],
): Promise<{ count: number; numbers: number[] }> {
  if (!list.length) return { count: 0, numbers: [] };
  const db = getDb();
  const existing = await db
    .select({ number: chapters.number, publishedAt: chapters.publishedAt })
    .from(chapters)
    .where(eq(chapters.mangaId, mangaId));
  const existingNums = new Set(existing.map((r) => Number(r.number)));

  // استيراد أولي (المانجا بلا فصول سابقة): لا تُغرق خلاصة "آخر الفصول" —
  // createdAt = publishedAt إن عُرف، وإلا نُرجعه 7 أيام للخلف.
  // الفصول المضافة لاحقاً عبر refresh (جديدة فعلاً) تحتفظ بـ createdAt=now.
  const isInitial = existingNums.size === 0;
  const backdated = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = list
    .filter((c) => Number.isFinite(c.number))
    .map((c) => {
      const publishedAt = parseDate(c.date);
      return {
        mangaId,
        number: c.number,
        title: c.title || null,
        url: c.url || null,
        publishedAt,
        ...(isInitial ? { createdAt: publishedAt ?? backdated } : {}),
      };
    });

  // أزل التكرار داخل الدفعة نفسها (نفس الرقم)
  const seen = new Set<number>();
  const deduped = rows.filter((r) => {
    const key = Number(r.number);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // أدخل الفصول الجديدة فقط — (mangaId, number) فريد
  const fresh = deduped.filter((r) => !existingNums.has(Number(r.number)));
  for (let i = 0; i < fresh.length; i += 200) {
    await db.insert(chapters).values(fresh.slice(i, i + 200));
  }

  // حدّث publishedAt للفصول الموجودة التي بلا تاريخ عندما توفر المصدر قيمة الآن
  const nullDates = new Set(
    existing.filter((r) => r.publishedAt == null).map((r) => Number(r.number)),
  );
  const dateFixes = deduped.filter(
    (r) => r.publishedAt && nullDates.has(Number(r.number)),
  );
  for (const r of dateFixes) {
    await db
      .update(chapters)
      .set({ publishedAt: r.publishedAt })
      .where(
        and(
          eq(chapters.mangaId, mangaId),
          eq(chapters.number, r.number),
          isNull(chapters.publishedAt),
        ),
      );
  }
  return { count: fresh.length, numbers: fresh.map((r) => Number(r.number)) };
}

/**
 * إشعارات "فصل جديد" لكل مستخدم لديه المانجا في مفضلته أو متابعاته أو أي قائمة.
 * يتجنب التكرار: لا يُنشئ إشعاراً ثانياً لنفس (userId, chapterId, type=new_chapter).
 */
export async function notifyNewChapters(
  mangaRow: Pick<typeof manga.$inferSelect, "id" | "title" | "slug">,
  numbers: number[],
): Promise<number> {
  if (!numbers.length) return 0;
  const db = getDb();
  const newChapters = await db
    .select({ id: chapters.id, number: chapters.number })
    .from(chapters)
    .where(
      and(eq(chapters.mangaId, mangaRow.id), inArray(chapters.number, numbers)),
    );
  if (!newChapters.length) return 0;

  const [favUsers, folUsers, listUsers] = await Promise.all([
    db
      .select({ userId: favorites.userId })
      .from(favorites)
      .where(eq(favorites.mangaId, mangaRow.id)),
    db
      .select({ userId: follows.userId })
      .from(follows)
      .where(eq(follows.mangaId, mangaRow.id)),
    db
      .select({ userId: userLists.userId })
      .from(userListItems)
      .innerJoin(userLists, eq(userListItems.listId, userLists.id))
      .where(eq(userListItems.mangaId, mangaRow.id)),
  ]);
  const userIds = [
    ...new Set([
      ...favUsers.map((r) => r.userId),
      ...folUsers.map((r) => r.userId),
      ...listUsers.map((r) => r.userId),
    ]),
  ];
  if (!userIds.length) return 0;

  // فصول موجودة مسبقاً لها إشعارات لهؤلاء المستخدمين (تفادي التكرار)
  const chapterIds = newChapters.map((c) => c.id);
  const existing = await db
    .select({
      userId: notifications.userId,
      chapterId: sql<number>`JSON_EXTRACT(${notifications.payload}, '$.chapterId')`,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.type, "new_chapter"),
        inArray(notifications.userId, userIds),
        sql`JSON_EXTRACT(${notifications.payload}, '$.chapterId') IN (${sql.join(
          chapterIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      ),
    );
  const seen = new Set(existing.map((r) => `${r.userId}:${Number(r.chapterId)}`));

  const rows = [];
  for (const ch of newChapters) {
    for (const userId of userIds) {
      if (seen.has(`${userId}:${ch.id}`)) continue;
      rows.push({
        userId,
        type: "new_chapter",
        payload: {
          mangaId: mangaRow.id,
          mangaTitle: mangaRow.title,
          mangaSlug: mangaRow.slug,
          chapterId: ch.id,
          chapterNumber: Number(ch.number),
        },
      });
    }
  }
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(notifications).values(rows.slice(i, i + 200));
  }
  return rows.length;
}

export interface ImportResult {
  manga: typeof manga.$inferSelect;
  chaptersAdded: number;
  duplicate: boolean;
  created: boolean;
}

/**
 * استيراد سلسلة واحدة من مصدر: getSeries → upsert manga + chapters.
 * المطابقة: slug فريد؛ العنوان المُطبَّع المكرر من مصدر آخر يُتخطَّى كمكرر.
 */
export async function importSeries(
  sourceKey: string,
  seriesUrl: string,
): Promise<ImportResult> {
  const scraper = getScraper(sourceKey);
  if (!scraper) throw new Error(`مصدر غير معروف: ${sourceKey}`);
  if (!scraper.enabled) throw new Error(`المصدر معطّل: ${sourceKey}`);

  const info = await scraper.getSeries(seriesUrl);
  const db = getDb();
  const source = await ensureSource(sourceKey);
  const normTitle = normalizeTitle(info.title);

  const baseSlug = sanitizeSlug(info.slug, `${sourceKey}-${Date.now()}`);
  const existingBySlug = await db.query.manga.findFirst({
    where: eq(manga.slug, baseSlug),
  });

  let target = existingBySlug && existingBySlug.sourceId === source.id ? existingBySlug : null;
  let finalSlug = baseSlug;

  if (!target) {
    // تكرار بالعنوان المُطبَّع من مصدر آخر؟
    const allTitles = await db
      .select({ id: manga.id, title: manga.title, sourceId: manga.sourceId })
      .from(manga);
    const dup = allTitles.find(
      (r) => r.sourceId !== source.id && normalizeTitle(r.title) === normTitle,
    );
    if (dup) {
      const dupManga = await db.query.manga.findFirst({ where: eq(manga.id, dup.id) });
      return { manga: dupManga!, chaptersAdded: 0, duplicate: true, created: false };
    }
    if (existingBySlug) {
      // slug محجوز من مصدر آخر لعنوان مختلف — ألحق مفتاح المصدر
      finalSlug = sanitizeSlug(`${baseSlug}-${sourceKey}`, baseSlug);
      const alt = await db.query.manga.findFirst({ where: eq(manga.slug, finalSlug) });
      if (alt && alt.sourceId === source.id) target = alt;
    }
  }

  const values = {
    title: info.title.slice(0, 500),
    altTitles: info.altTitles ?? [],
    description: info.description ?? null,
    coverUrl: info.cover ?? null,
    type: mapType(info.type),
    status: mapStatus(info.status),
    genres: info.genres ?? [],
    rating: mapRating(info.rating),
    viewCount: info.views && Number.isFinite(info.views) ? Math.round(info.views) : 0,
    chapterCount: info.chapters.length,
    isAdult: mapAdult(info),
    sourceId: source.id,
    sourceUrl: info.url || seriesUrl,
  };

  let mangaRow: typeof manga.$inferSelect;
  let created = false;
  if (target) {
    await db.update(manga).set(values).where(eq(manga.id, target.id));
    mangaRow = (await db.query.manga.findFirst({ where: eq(manga.id, target.id) }))!;
  } else {
    const [{ id }] = await db
      .insert(manga)
      .values({ slug: finalSlug, ...values })
      .$returningId();
    mangaRow = (await db.query.manga.findFirst({ where: eq(manga.id, id) }))!;
    created = true;
  }

  // غلاف مؤقت: لو المصدر لم يعطِ غلافاً، استخدم أول صورة من أول فصل
  if (!mangaRow.coverUrl && info.chapters.length) {
    try {
      const first = info.chapters.reduce((a, b) => (a.number <= b.number ? a : b));
      if (first.url) {
        const pages = await scraper.getPages(first.url, first.sourceRef);
        if (pages.length) {
          await db
            .update(manga)
            .set({ coverUrl: pages[0] })
            .where(eq(manga.id, mangaRow.id));
          mangaRow = { ...mangaRow, coverUrl: pages[0] };
        }
      }
    } catch (e) {
      console.warn(
        `[importer] تعذّر جلب غلاف مؤقت لـ "${info.title}": ${(e as Error).message}`,
      );
    }
  }

  const { count: chaptersAdded } = await upsertChapters(mangaRow.id, info.chapters);
  const [[{ total }]] = await Promise.all([
    db.select({ total: count() }).from(chapters).where(eq(chapters.mangaId, mangaRow.id)),
  ]);
  await db
    .update(manga)
    .set({ chapterCount: total, updatedAt: new Date() })
    .where(eq(manga.id, mangaRow.id));
  // حدّث عدّاد المصدر
  const [[{ total: srcTotal }]] = await Promise.all([
    db.select({ total: count() }).from(manga).where(eq(manga.sourceId, source.id)),
  ]);
  await db.update(sources).set({ mangaCount: srcTotal }).where(eq(sources.id, source.id));

  return {
    manga: { ...mangaRow, chapterCount: total },
    chaptersAdded,
    duplicate: false,
    created,
  };
}

/** استيراد أحدث السلاسل من مصدر (صفحة أو صفحتين من getLatest) حتى limit */
export async function importLatest(
  sourceKey: string,
  limit = 12,
): Promise<{ imported: number; failed: number; errors: string[] }> {
  const scraper = getScraper(sourceKey);
  if (!scraper) throw new Error(`مصدر غير معروف: ${sourceKey}`);
  if (!scraper.enabled) return { imported: 0, failed: 0, errors: [`${sourceKey} معطّل`] };

  const urls: string[] = [];
  const seen = new Set<string>();
  for (const page of [1, 2]) {
    if (urls.length >= limit) break;
    try {
      const items = await scraper.getLatest(page);
      for (const it of items) {
        if (!it.seriesUrl || seen.has(it.seriesUrl)) continue;
        seen.add(it.seriesUrl);
        urls.push(it.seriesUrl);
        if (urls.length >= limit) break;
      }
    } catch (e) {
      console.warn(`[importer] getLatest(${sourceKey}, page=${page}) فشل: ${(e as Error).message}`);
      break;
    }
  }

  let imported = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const res = await importSeries(sourceKey, url);
      if (!res.duplicate) imported += 1;
    } catch (e) {
      failed += 1;
      errors.push(`${url}: ${(e as Error).message}`);
      console.warn(`[importer] فشل استيراد ${url}: ${(e as Error).message}`);
    }
  }
  return { imported, failed, errors };
}

/**
 * استيراد الكتالوج: ترقيم كامل عبر source.getLatest(page) من الصفحة 1
 * حتى صفحة فارغة أو بلوغ maxPages. يتخطى السلاسل الموجودة مسبقاً لنفس المصدر
 * (تحديث فصولها من مسؤولية refreshAll) ويقف عند limit سلسلة جديدة لكل دورة.
 */
export async function importCatalog(
  sourceKey: string,
  opts: { limit?: number; maxPages?: number } = {},
): Promise<{ imported: number; failed: number; skipped: number; errors: string[] }> {
  const limit = Math.max(1, opts.limit ?? 150);
  const maxPages = Math.max(1, opts.maxPages ?? 30);
  const scraper = getScraper(sourceKey);
  if (!scraper) throw new Error(`مصدر غير معروف: ${sourceKey}`);
  if (!scraper.enabled) {
    return { imported: 0, failed: 0, skipped: 0, errors: [`${sourceKey} معطّل`] };
  }

  const db = getDb();
  const source = await ensureSource(sourceKey);
  const seen = new Set<string>();
  let imported = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  let stop = false;
  for (let page = 1; page <= maxPages && !stop; page++) {
    let items: Awaited<ReturnType<BaseScraper["getLatest"]>>;
    try {
      items = await scraper.getLatest(page);
    } catch (e) {
      const msg = `page ${page}: ${(e as Error).message}`;
      errors.push(msg);
      console.warn(`[importer] catalog getLatest(${sourceKey}, ${msg.split(":")[0]}) فشل: ${(e as Error).message}`);
      break; // فشل الصفحة = نهاية الترقيم غالباً
    }
    if (!items.length) break; // صفحة فارغة = نهاية الكتالوج
    for (const it of items) {
      if (!it.seriesUrl || seen.has(it.seriesUrl)) continue;
      seen.add(it.seriesUrl);
      try {
        // تخطَّ المستورد مسبقاً من نفس المصدر (مطابقة بالرابط أو بالـ slug)
        const slug = scraper.slugFromUrl(it.seriesUrl);
        const existing = await db.query.manga.findFirst({
          where: and(eq(manga.sourceId, source.id), eq(manga.sourceUrl, it.seriesUrl)),
          columns: { id: true },
        });
        const existingBySlug =
          !existing && slug
            ? await db.query.manga.findFirst({
                where: and(eq(manga.sourceId, source.id), eq(manga.slug, slug)),
                columns: { id: true },
              })
            : undefined;
        if (existing || existingBySlug) {
          skipped += 1;
          continue;
        }
        const res = await importSeries(sourceKey, it.seriesUrl);
        if (res.created) imported += 1;
        else skipped += 1; // مكرر بالعنوان من مصدر آخر أو تحديث لموجود
      } catch (e) {
        failed += 1;
        errors.push(`${it.seriesUrl}: ${(e as Error).message}`);
        console.warn(`[importer] فشل استيراد ${it.seriesUrl}: ${(e as Error).message}`);
      }
      if (imported >= limit) {
        stop = true;
        break;
      }
    }
  }
  return { imported, failed, skipped, errors };
}

/** تحديث فصول مانجا موجودة من مصدرها — يضيف الجديد فقط */
export async function refreshChapters(mangaId: number): Promise<{ chaptersAdded: number }> {
  const db = getDb();
  const row = await db
    .select({ manga: manga, source: sources })
    .from(manga)
    .innerJoin(sources, eq(manga.sourceId, sources.id))
    .where(eq(manga.id, mangaId))
    .limit(1);
  if (!row.length) throw new Error(`مانجا غير موجودة: ${mangaId}`);
  const { manga: m, source } = row[0];
  const scraper = getScraper(source.name);
  if (!scraper || !scraper.enabled || !m.sourceUrl) {
    return { chaptersAdded: 0 };
  }

  const info = await scraper.getSeries(m.sourceUrl);

  // عالج الغلاف الناقص/المحلي: الغلاف الافتراضي "/cover-01.png" ليس غلافاً حقيقياً
  if (info.cover && (!m.coverUrl || m.coverUrl.startsWith("/"))) {
    await db
      .update(manga)
      .set({ coverUrl: info.cover })
      .where(eq(manga.id, m.id));
  }

  const { count: chaptersAdded, numbers } = await upsertChapters(
    m.id,
    info.chapters,
  );
  if (numbers.length) {
    try {
      const notified = await notifyNewChapters(
        { id: m.id, title: m.title, slug: m.slug },
        numbers,
      );
      if (notified > 0) {
        console.log(
          `[importer] ${m.title}: ${numbers.length} فصل جديد — أُرسل ${notified} إشعار`,
        );
      }
    } catch (e) {
      console.warn(
        `[importer] فشل إنشاء إشعارات ${m.id}: ${(e as Error).message}`,
      );
    }
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(chapters)
    .where(eq(chapters.mangaId, m.id));
  await db
    .update(manga)
    .set({
      chapterCount: total,
      status: info.status ? mapStatus(info.status) : m.status,
      coverUrl: info.cover || m.coverUrl,
      updatedAt: new Date(),
    })
    .where(eq(manga.id, m.id));
  return { chaptersAdded };
}

/**
 * إصلاح الأغلفة المفقودة: دفعة صغيرة من المانجا بلا coverUrl،
 * يعيد جلب بياناتها من المصدر (getSeries + تحديث الفصول)،
 * ولو لم يجد غلافاً يستخدم أول صورة من أول فصل كغلاف مؤقت.
 */
export async function fixMissingCovers(
  limit = 20,
): Promise<{ scanned: number; fixed: number; failed: number }> {
  const db = getDb();
  const rows = await db
    .select({ manga: manga, source: sources })
    .from(manga)
    .innerJoin(sources, eq(manga.sourceId, sources.id))
    .where(or(isNull(manga.coverUrl), eq(manga.coverUrl, "")))
    .orderBy(asc(manga.id))
    .limit(Math.max(1, Math.min(limit, 100)));

  let fixed = 0;
  let failed = 0;
  for (const { manga: m, source } of rows) {
    try {
      const scraper = getScraper(source.name);
      if (!scraper || !scraper.enabled || !m.sourceUrl) continue;
      const info = await scraper.getSeries(m.sourceUrl);
      await upsertChapters(m.id, info.chapters);

      let cover = info.cover || null;
      if (!cover && info.chapters.length) {
        const first = info.chapters.reduce((a, b) =>
          a.number <= b.number ? a : b,
        );
        if (first.url) {
          try {
            const pages = await scraper.getPages(first.url, first.sourceRef);
            cover = pages[0] ?? null;
          } catch {
            /* اتركه null */
          }
        }
      }
      if (cover) {
        await db.update(manga).set({ coverUrl: cover }).where(eq(manga.id, m.id));
        fixed += 1;
      }
    } catch (e) {
      failed += 1;
      console.warn(`[importer] fixMissingCovers(${m.id}) فشل: ${(e as Error).message}`);
    }
  }
  return { scanned: rows.length, fixed, failed };
}

/**
 * تحديث دوري للمانجا — دفعة واحدة لكل دورة (الافتراضي 40، REFRESH_BATCH_SIZE)
 * بالتناوب: الأقدم تحديثاً أولاً، حتى لا نُحمّل المصادر بمئات الطلبات دفعة واحدة.
 */
export async function refreshAll(): Promise<{
  total: number;
  updated: number;
  chaptersAdded: number;
  failed: number;
}> {
  const batchSize = Math.max(
    1,
    parseInt(process.env.REFRESH_BATCH_SIZE || "200", 10) || 200,
  );
  const db = getDb();
  const all = await db
    .select({ id: manga.id })
    .from(manga)
    .orderBy(asc(manga.updatedAt), asc(manga.id))
    .limit(batchSize);
  let updated = 0;
  let chaptersAdded = 0;
  let failed = 0;
  for (const { id } of all) {
    try {
      const r = await refreshChapters(id);
      if (r.chaptersAdded > 0) updated += 1;
      chaptersAdded += r.chaptersAdded;
    } catch (e) {
      failed += 1;
      console.warn(`[importer] refreshChapters(${id}) فشل: ${(e as Error).message}`);
    }
  }
  return { total: all.length, updated, chaptersAdded, failed };
}