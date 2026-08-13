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

  async getSeries(urlOrSlug: string): Promise<SeriesInfo> {
    const slug = String(urlOrSlug).includes("/series/")
      ? String(urlOrSlug).match(/\/series\/([^/]+)/)?.[1]
      : String(urlOrSlug);
    // لا يوجد endpoint مباشر للسلسلة — جرّب الـ slug الخام أولاً (يطابق حقل slug
    // في فهرس المصدر غالباً) ثم ابحث بتقليص كلمات العنوان كـ fallback.
    let posts: any[] = [];
    try {
      const direct = await this.queryApi({ searchTerm: slug ?? "", orderBy: "" });
      posts = direct?.posts || [];
    } catch {
      posts = [];
    }
    if (!posts.some((p: any) => p.slug === slug)) {
      const term = decodeURIComponent(slug || "").replace(/-/g, " ");
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
