import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import type { LatestItem, SearchItem, SeriesInfo } from "./base";

/** وسوم +18 المرفوضة — المصادر الإنجليزية تُستبعد منها المحتوى البالغ */
const ADULT_TAG_RE =
  /(\+18|adult|ecchi|smut|yaoi|yuri|hentai|boys?'?\s*love|girls?'?\s*love|mature|erotica|pornographic)/i;

/**
 * vortexscans.org — منصة vcomics/Astro نفس بنية azorafly (لا Cloudflare حالياً).
 * بحث/فهرسة: GET /api/query?searchTerm=&page=&orderBy=lastChapterAddedAt
 *   -> { posts: [{ id, slug, postTitle, featuredImage, seriesType, seriesStatus,
 *        genres, chapters: [{ number, slug, isLocked }] }], totalCount }
 * سلسلة: GET /series/{slug} — جزيرة Astro فيها { post: {...}, initialChap: [...] }.
 *   رابط الفصل: /series/{slug}/{chapter.slug}  (مثل chapter-100).
 *   تُتجاوز الفصول غير PUBLIC أو isLocked أو المدفوعة (finalPrice > 0).
 * صفحات: <img data-reader-page-image src="https://storage.vortexscans.org/upload/series/...">
 *   بترتيب data-reader-index.
 */
export class VortexScansScraper extends BaseScraper {
  constructor(opts: { enabled?: boolean } = {}) {
    super("vortexscans", "https://vortexscans.org", opts);
    this.allowedImageHosts = ["vortexscans.org", "storage.vortexscans.org"];
  }

  private async queryApi(params: Record<string, string | number> = {}): Promise<any> {
    return this.getJson("/api/query", {
      params: {
        searchTerm: "",
        page: 1,
        genreIds: "",
        seriesStatus: "",
        minChapters: "",
        maxChapters: "",
        orderBy: "lastChapterAddedAt",
        ...params,
      },
    });
  }

  private chapterUrl(seriesSlug: string, c: any): string {
    return `${this.baseUrl}/series/${seriesSlug}/${c.slug || `chapter-${c.number}`}`;
  }

  private normalizePost(p: any): SeriesInfo & { chaptersCount: number } {
    const chapters = (p.chapters || [])
      .filter((c: any) => !c.isLocked) // تجاهل المقفلة/المدفوعة
      .map((c: any) => ({
        number: Number(c.number ?? 0),
        title: c.title || "",
        url: this.chapterUrl(p.slug, c),
        date: c.createdAt || c.date || null,
      }))
      .sort((a: any, b: any) => a.number - b.number);
    return {
      title: p.postTitle || p.title || p.slug,
      cover: this.abs(p.featuredImage || p.cover || "") ?? "",
      url: `${this.baseUrl}/series/${p.slug}`,
      slug: p.slug,
      status: p.seriesStatus,
      type: p.seriesType,
      description: p.description || p.synopsis || undefined,
      rating: p.rating != null ? Number(p.rating) : undefined,
      views: p.views != null ? Number(p.views) : undefined,
      isAdult: p.isAdult ?? p.adult ?? undefined,
      genres: (p.genres || [])
        .map((g: any) => (typeof g === "string" ? g : g.name))
        .filter(Boolean),
      chaptersCount: chapters.length,
      chapters,
    };
  }

  async search(query: string): Promise<SearchItem[]> {
    const data = await this.queryApi({ searchTerm: query, orderBy: "" });
    return (data?.posts || []).map((p: any) => {
      const n = this.normalizePost(p);
      return {
        title: n.title,
        cover: n.cover,
        url: n.url,
        slug: n.slug,
        chaptersCount: n.chaptersCount,
      };
    });
  }

  async getLatest(page = 1): Promise<LatestItem[]> {
    const data = await this.queryApi({ page, orderBy: "lastChapterAddedAt" });
    return (data?.posts || [])
      .map((p: any) => {
        const n = this.normalizePost(p);
        const last = n.chapters[n.chapters.length - 1];
        return {
          seriesTitle: n.title,
          seriesUrl: n.url,
          cover: n.cover,
          genres: n.genres,
          chapter: last || { number: 0, title: "", url: n.url, date: null },
        };
      })
      .filter((it: LatestItem) => it.chapter.number > 0);
  }

  /* ====== فك جزر Astro (نفس أسلوب azorafly) ====== */

  private decodeAstroValue(node: any): any {
    if (Array.isArray(node)) {
      if (
        node.length === 2 &&
        typeof node[0] === "number" &&
        node[0] >= -1 &&
        node[0] <= 3
      ) {
        return this.decodeAstroValue(node[1]);
      }
      return node.map((x) => this.decodeAstroValue(x));
    }
    if (node && typeof node === "object") {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(node)) out[k] = this.decodeAstroValue(v);
      return out;
    }
    return node;
  }

  private unescapeAttr(s: string): string {
    return s
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  /**
   * صفحة السلسلة تحتوي جزيرة Astro فيها الكائن الكامل:
   * { post: {...العنوان/الوصف/الغلاف/النوع/الحالة/التصنيفات}, initialChap: [الفصول] }
   */
  private parseSeriesPage(htmlDoc: string, slug: string): SeriesInfo | null {
    const re = /props="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(htmlDoc))) {
      const attr = m[1];
      if (!attr.includes("postTitle") || !attr.includes("initialChap")) continue;
      try {
        const obj = this.decodeAstroValue(JSON.parse(this.unescapeAttr(attr)));
        const post = obj?.post;
        if (!post || post.slug !== slug) continue;
        const genres = (post.genres || [])
          .map((g: any) => (typeof g === "string" ? g : g.name))
          .filter(Boolean);
        if (post.isAdult === true || genres.some((g: string) => ADULT_TAG_RE.test(g))) {
          throw new Error("محتوى غير مسموح");
        }
        const chapters = (Array.isArray(obj.initialChap) ? obj.initialChap : [])
          .filter(
            (c: any) =>
              c &&
              Number.isFinite(Number(c.number)) &&
              (c.chapterStatus == null || c.chapterStatus === "PUBLIC") &&
              !(Number(c.finalPrice ?? c.price ?? 0) > 0) &&
              c.isLocked !== true,
          )
          .map((c: any) => ({
            number: Number(c.number),
            title: c.title || "",
            url: this.chapterUrl(slug, c),
            date: c.createdAt || null,
          }))
          .sort((a: any, b: any) => a.number - b.number);
        return {
          title: post.postTitle || slug,
          altTitles: Array.isArray(post.alternativeTitles)
            ? post.alternativeTitles.filter((t: any) => typeof t === "string")
            : typeof post.alternativeTitles === "string" && post.alternativeTitles
              ? post.alternativeTitles
                  .split("•")
                  .map((t: string) => t.trim())
                  .filter(Boolean)
              : undefined,
          cover: this.abs(post.featuredImage || "") ?? "",
          url: `${this.baseUrl}/series/${slug}`,
          slug,
          description: post.postContent || undefined,
          status: post.seriesStatus,
          type: post.seriesType,
          rating:
            obj.averageRating != null
              ? Number(obj.averageRating)
              : post.averageRating != null
                ? Number(post.averageRating)
                : undefined,
          views: post.totalViews != null ? Number(post.totalViews) : undefined,
          isAdult: false,
          genres,
          chapters,
        };
      } catch (e) {
        if ((e as Error).message === "محتوى غير مسموح") throw e;
        continue; // جزيرة تالفة — جرّب التالية
      }
    }
    return null;
  }

  async getSeries(urlOrSlug: string): Promise<SeriesInfo> {
    const raw = String(urlOrSlug);
    const slug = raw.includes("/series/")
      ? raw.match(/\/series\/([^/?#]+)/)?.[1]
      : raw;
    if (!slug) throw new Error(`[vortexscans] السلسلة غير موجودة: ${raw}`);

    // 1) صفحة السلسلة مباشرة — البيانات الكاملة مضمّنة فيها
    try {
      const htmlDoc = await this.getHtml(`/series/${slug}`);
      const info = this.parseSeriesPage(htmlDoc, slug);
      if (info) return info;
    } catch (e) {
      if ((e as Error).message === "محتوى غير مسموح") throw e;
      /* نكمل للبحث كـ fallback */
    }

    // 2) fallback: بحث الـ API
    const data = await this.queryApi({ searchTerm: slug.replace(/-/g, " "), orderBy: "" });
    const posts: any[] = data?.posts || [];
    const post =
      posts.find((p: any) => p.slug === slug) || (posts.length === 1 ? posts[0] : null);
    if (!post) throw new Error(`[vortexscans] السلسلة غير موجودة: ${slug}`);
    const info = this.normalizePost(post);
    if (info.isAdult === true || (info.genres || []).some((g) => ADULT_TAG_RE.test(g))) {
      throw new Error("محتوى غير مسموح");
    }
    info.isAdult = false;
    return info;
  }

  async getPages(chapterUrl: string): Promise<string[]> {
    const html = await this.getHtml(chapterUrl);
    const $ = cheerio.load(String(html));
    const indexed: { i: number; src: string }[] = [];
    const seen = new Set<string>();
    $("img[data-reader-page-image]").each((_, img) => {
      const raw =
        $(img).attr("src") ||
        $(img).attr("data-src") ||
        ($(img).attr("srcset") || "").split(",")[0]?.trim().split(" ")[0];
      if (!raw) return;
      const abs = this.abs(raw.trim());
      if (!abs || seen.has(abs)) return;
      seen.add(abs);
      indexed.push({ i: Number($(img).attr("data-reader-index") ?? indexed.length), src: abs });
    });
    return indexed.sort((a, b) => a.i - b.i).map((p) => p.src);
  }
}

export default VortexScansScraper;
