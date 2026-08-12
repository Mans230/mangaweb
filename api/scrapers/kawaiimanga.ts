import { BaseScraper, BROWSER_UA } from "./base";
import type { LatestItem, SearchItem, SeriesInfo } from "./base";

const API_BASE = "https://manga-api.kawaii-anime.com/api/manga/own";
const SITE = "https://kawaiimanga.org";

/**
 * kawaiimanga.org — JSON API
 * Base: https://manga-api.kawaii-anime.com/api/manga/own?action=...
 * هيدر إلزامي: x-app-key
 * إن فشل المفتاح: يُستخرج NEXT_PUBLIC_MANGA_APP_KEY من chunks موقع Next.js
 */
export class KawaiiMangaScraper extends BaseScraper {
  private appKey: string;
  private siteBase = SITE;

  constructor(opts: { enabled?: boolean } = {}) {
    super("kawaiimanga", API_BASE, opts);
    this.appKey = process.env.KAWAII_APP_KEY || "km_2026_live";
    this.allowedImageHosts = [
      "kawaiimanga.org",
      "kawaii-anime.com",
      "cdn.kawaii-anime.com",
      "img.kawaii-anime.com",
    ];
    this.imageReferer = `${SITE}/`;
  }

  private async api(params: Record<string, string | number>, retried = false): Promise<any> {
    try {
      return await this.getJson("", {
        params,
        headers: { "x-app-key": this.appKey, Referer: `${this.siteBase}/` },
      });
    } catch (err) {
      const status = (err as any)?.response?.status;
      if (!retried && (status === 401 || status === 403)) {
        console.warn("[kawaiimanga] مفتاح API مرفوض — محاولة استخراج مفتاح جديد من الموقع");
        const fresh = await this.refreshAppKey();
        if (fresh && fresh !== this.appKey) {
          this.appKey = fresh;
          return this.api(params, true);
        }
      }
      throw err;
    }
  }

  /** استخرج NEXT_PUBLIC_MANGA_APP_KEY من أي chunk تحت /_next/static/chunks/ */
  private async refreshAppKey(): Promise<string | null> {
    try {
      const html = await this.getHtml(this.siteBase, {
        headers: { "User-Agent": BROWSER_UA },
      });
      const chunks = [...String(html).matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)]
        .map((m) => m[1])
        .slice(0, 25);
      for (const chunk of chunks) {
        try {
          const js = await this.getHtml(`${this.siteBase}${chunk}`, {
            headers: { "User-Agent": BROWSER_UA },
          });
          const m = String(js).match(/NEXT_PUBLIC_MANGA_APP_KEY["'\]]?\s*[:,=]\s*"([^"]+)"/);
          if (m) {
            console.log(`[kawaiimanga] تم استخراج مفتاح جديد من ${chunk}`);
            return m[1];
          }
        } catch {
          /* جرّب chunk التالي */
        }
      }
    } catch (e) {
      console.error(`[kawaiimanga] فشل استخراج المفتاح: ${(e as Error).message}`);
    }
    return null;
  }

  // تطبيع متسامح مع اختلاف أسماء الحقول
  private normalizeItem(it: any): SearchItem & { slug: string } {
    const slug = it.slug || it.seriesSlug || this.slugFromUrl(it.url || "");
    return {
      title: it.title || it.name || it.postTitle || "بدون عنوان",
      cover: this.abs(it.cover || it.image || it.coverUrl || it.thumbnail || "") ?? "",
      url: it.url || (slug ? `${this.siteBase}/manga/${slug}` : ""),
      slug,
      chaptersCount:
        it.chaptersCount ??
        it.chapters_count ??
        (Array.isArray(it.chapters) ? it.chapters.length : undefined),
    };
  }

  private listFrom(data: any): any[] {
    if (Array.isArray(data)) return data;
    return data?.data || data?.manga || data?.results || data?.items || data?.posts || [];
  }

  async search(query: string): Promise<SearchItem[]> {
    const data = await this.api({ action: "search", q: query });
    return this.listFrom(data).map((it) => this.normalizeItem(it));
  }

  async getLatest(page = 1): Promise<LatestItem[]> {
    const data = await this.api({ action: "browse", page });
    return this.listFrom(data).map((it) => {
      const item = this.normalizeItem(it);
      const ch = it.latestChapter || it.lastChapter || it.chapter || {};
      const num = Number(ch.number ?? ch.chapter ?? it.latestChapterNumber ?? 0);
      return {
        seriesTitle: item.title,
        seriesUrl: item.url,
        cover: item.cover,
        genres: it.genres || [],
        chapter: {
          number: num,
          title: ch.title || "",
          url: ch.url || (item.slug && num ? `${this.siteBase}/manga/${item.slug}/${num}` : item.url),
          date: ch.date || ch.createdAt || it.updatedAt || null,
        },
      };
    });
  }

  async getSeries(urlOrSlug: string): Promise<SeriesInfo> {
    const slug = String(urlOrSlug).includes("/")
      ? this.slugFromUrl(urlOrSlug)
      : String(urlOrSlug);
    const data = await this.api({ action: "series", slug });
    const info = data?.series || data?.data || data || {};
    const chapters = (info.chapters || data?.chapters || []).map((c: any) => ({
      sourceRef: c.id || c.chapterId,
      number: Number(c.number ?? c.chapter ?? 0),
      title: c.title || "",
      url: c.url || `${this.siteBase}/manga/${slug}/${c.number ?? c.chapter}`,
      date: c.date || c.createdAt || null,
    }));
    return {
      title: info.title || info.name || slug,
      cover: this.abs(info.cover || info.image || "") ?? "",
      url: `${this.siteBase}/manga/${slug}`,
      slug,
      description: info.description || info.synopsis || undefined,
      genres: info.genres || undefined,
      status: info.status || undefined,
      type: info.type || undefined,
      rating: info.rating != null ? Number(info.rating) : undefined,
      chapters,
    };
  }

  async getPages(chapterIdOrUrl: string, sourceRef?: string | number): Promise<string[]> {
    // الواجهة تحتاج chapterId — يُمرَّر من كائن الفصل (sourceRef) أو من الرقم كحل أخير
    let chapterId = String(sourceRef ?? chapterIdOrUrl);
    // لو مُرِّر رابط فصل /manga/{slug}/{num} بدل المعرف: حلّه عبر بيانات السلسلة
    const m = chapterId.match(/\/manga\/([^/]+)\/(\d+(?:\.\d+)?)\/?$/);
    if (m) {
      const [, slug, num] = m;
      const series = await this.getSeries(slug);
      const hit = series.chapters.find((c) => Number(c.number) === Number(num));
      if (hit?.sourceRef) chapterId = String(hit.sourceRef);
      else chapterId = num;
    }
    const data = await this.api({ action: "pages", chapterId });
    const pages = data?.pages || data?.images || data?.data || [];
    return pages
      .map((p: any) => (typeof p === "string" ? p : p.url || p.src || p.image))
      .filter(Boolean)
      .map((u: string) => this.abs(u));
  }
}

export default KawaiiMangaScraper;
