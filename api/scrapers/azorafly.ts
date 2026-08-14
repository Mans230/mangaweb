import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import type { LatestItem, SearchItem, SeriesInfo } from "./base";

/**
 * azorafly.com — JSON API
 * بحث/فهرسة: GET /api/query?searchTerm=&page=&orderBy=lastChapterAddedAt
 *   -> { posts: [{ id, slug, postTitle, featuredImage, seriesType, seriesStatus,
 *        genres, chapters: [{ number, slug, isLocked }] }], totalCount }
 * فصل: /series/{slug}/chapter-{n} — الصور <img> في HTML (storage.azorafly.com)
 * تجاهل الفصول isLocked:true (مدفوعة)
 */
export class AzoraFlyScraper extends BaseScraper {
  constructor(opts: { enabled?: boolean } = {}) {
    super("azorafly", "https://azorafly.com", opts);
    this.allowedImageHosts = ["azorafly.com", "storage.azorafly.com", "cdn.azorafly.com"];
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

  private normalizePost(p: any): SeriesInfo & { chaptersCount: number } {
    const chapters = (p.chapters || [])
      .filter((c: any) => !c.isLocked) // تجاهل المدفوعة
      .map((c: any) => ({
        number: Number(c.number ?? 0),
        title: c.title || "",
        url: `${this.baseUrl}/series/${p.slug}/chapter-${c.number ?? c.slug}`,
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

  /**
   * فك ترميز props جزيرة Astro: القيم ملفوفة كـ [type, value] —
   * type رقم (0=قيمة خام، 1=مصفوفة/كائن مُشار إليه) والقيمة في الموضع 1.
   */
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

  /** فك كيانات HTML الأساسية داخل خاصية attribute */
  private unescapeAttr(s: string): string {
    return s
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  /**
   * صفحة السلسلة نفسها تحتوي جزيرة Astro فيها الكائن الكامل:
   * { post: {...العنوان/الوصف/الغلاف/النوع/الحالة/التصنيفات/التقييم/المشاهدات},
   *   initialChap: [كل الفصول] , totalChapterCount }
   * أدق من بحث الـ API الذي لا يطابق السلاجات (فواصل عليا وكلمات ناقصة).
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
        const chapters = (Array.isArray(obj.initialChap) ? obj.initialChap : [])
          .filter(
            (c: any) =>
              c &&
              Number.isFinite(Number(c.number)) &&
              c.chapterStatus === "PUBLIC" &&
              !(Number(c.finalPrice ?? c.price ?? 0) > 0) &&
              c.isLocked !== true,
          )
          .map((c: any) => ({
            number: Number(c.number),
            title: c.title || "",
            url: `${this.baseUrl}/series/${slug}/${c.slug || `chapter-${c.number}`}`,
            date: c.createdAt || null,
          }))
          .sort((a: any, b: any) => a.number - b.number);
        return {
          title: post.postTitle || slug,
          altTitles: Array.isArray(post.alternativeTitles)
            ? post.alternativeTitles.filter((t: any) => typeof t === "string")
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
          isAdult: post.isAdult ?? post.adult ?? undefined,
          genres: (post.genres || [])
            .map((g: any) => (typeof g === "string" ? g : g.name))
            .filter(Boolean),
          chapters,
        };
      } catch {
        continue; // جزيرة تالفة — جرّب التالية
      }
    }
    return null;
  }

  async getSeries(urlOrSlug: string): Promise<SeriesInfo> {
    const slug = String(urlOrSlug).includes("/series/")
      ? String(urlOrSlug).match(/\/series\/([^/]+)/)?.[1]
      : String(urlOrSlug);
    if (!slug) throw new Error(`[azorafly] السلسلة غير موجودة: ${slug}`);

    // 1) صفحة السلسلة مباشرة — البيانات الكاملة مضمّنة فيها (الأدق)
    try {
      const htmlDoc = await this.getHtml(`/series/${slug}`);
      const info = this.parseSeriesPage(htmlDoc, slug);
      if (info) return info;
    } catch {
      /* نكمل للبحث كـ fallback */
    }

    // 2) fallback: بحث الـ API (لا يطابق السلاجات التي بها فواصل عليا)
    let posts: any[] = [];
    try {
      const direct = await this.queryApi({ searchTerm: slug, orderBy: "" });
      posts = direct?.posts || [];
    } catch {
      posts = [];
    }
    if (!posts.some((p: any) => p.slug === slug)) {
      const term = decodeURIComponent(slug).replace(/-/g, " ");
      const words = term.split(" ").filter(Boolean);
      for (let len = words.length; len >= 2; len--) {
        const data = await this.queryApi({
          searchTerm: words.slice(0, len).join(" "),
          orderBy: "",
        });
        posts = data?.posts || [];
        if (posts.some((p: any) => p.slug === slug)) break;
      }
    }
    // لا نرضخ لـ posts[0] إلا لو كانت النتيجة وحيدة — تجنباً لاستيراد سلسلة خاطئة
    const post =
      posts.find((p: any) => p.slug === slug) || (posts.length === 1 ? posts[0] : null);
    if (!post) throw new Error(`[azorafly] السلسلة غير موجودة: ${slug}`);
    return this.normalizePost(post);
  }

  async getPages(chapterUrl: string): Promise<string[]> {
    const html = await this.getHtml(chapterUrl);
    const $ = cheerio.load(String(html));
    const pages: string[] = [];
    const seen = new Set<string>();
    $("img").each((_, img) => {
      const src = $(img).attr("src") || $(img).attr("data-src");
      if (!src) return;
      const abs = this.abs(src.trim());
      // استبعاد صريح: لوجو/أيقونات الموقع وأغلفة السلاسل المميزة
      if (/logo|icon|avatar|banner|\/upload\/series\/featured\//i.test(abs)) return;
      // صور الفصل الحقيقية فقط: مسار رفع السلاسل أو alt يشير لصفحة
      const alt = $(img).attr("alt") || "";
      const isChapterImage = /\/public\/upload\/series\//i.test(abs) || /page/i.test(alt);
      if (!isChapterImage) return;
      if (seen.has(abs)) return; // dedupe
      seen.add(abs);
      pages.push(abs);
    });
    return pages;
  }
}

export default AzoraFlyScraper;
