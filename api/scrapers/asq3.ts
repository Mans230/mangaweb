import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { BaseScraper, extractChapterDateText } from "./base";
import type { ChapterInfo, LatestItem, SearchItem, SeriesInfo } from "./base";

/**
 * 3asq.online — WordPress Madara (فصول AJAX)
 * الفصول: POST /manga/{slug}/ajax/chapters/?t=1 -> HTML قائمة فصول
 * الصور: .page-break img.wp-manga-chapter-img src
 * بحث: POST /wp-admin/admin-ajax.php action=wp-manga-search-manga
 */
export class Asq3Scraper extends BaseScraper {
  constructor(opts: { enabled?: boolean } = {}) {
    super("3asq", "https://3asq.online", opts);
    this.allowedImageHosts = ["3asq.online", "cdn.3asq.online", "img.3asq.online"];
  }

  async search(query: string): Promise<SearchItem[]> {
    const data = await this.postForm(
      "/wp-admin/admin-ajax.php",
      { action: "wp-manga-search-manga", title: query },
      { headers: { "X-Requested-With": "XMLHttpRequest", Referer: `${this.baseUrl}/` } },
    );
    const list = data?.data || (Array.isArray(data) ? data : []);
    return list
      .filter((it: any) => !it.type || it.type === "manga")
      .map((it: any) => ({
        title: (it.title || "").trim(),
        cover: "",
        url: this.abs(it.url || "") ?? "",
        slug: this.slugFromUrl(it.url || ""),
      }))
      .filter((it: SearchItem) => it.url);
  }

  async getSeries(urlOrSlug: string): Promise<SeriesInfo> {
    const url = String(urlOrSlug).startsWith("http")
      ? String(urlOrSlug)
      : `${this.baseUrl}/manga/${urlOrSlug}/`;
    const html = await this.getHtml(url);
    const $ = cheerio.load(String(html));
    const slug = url.match(/\/manga\/([^/]+)/)?.[1] || this.slugFromUrl(url);
    const title =
      $(".post-title h1, h1").first().text().trim() ||
      $('meta[property="og:title"]').attr("content") ||
      slug.replace(/-/g, " ");
    const cover =
      this.abs(
        $(".summary_image img").first().attr("data-src") ||
          $(".summary_image img").first().attr("src") ||
          $('meta[property="og:image"]').attr("content") ||
          "",
      ) ?? "";
    const description =
      $(".summary__content, .description-summary .summary__content").first().text().trim() ||
      $('meta[property="og:description"]').attr("content") ||
      undefined;
    const genres = $(".genres-content a, .manga-genres a")
      .map((_, a) => $(a).text().trim())
      .get()
      .filter(Boolean);
    const chapters = await this.fetchChapters(slug, $);
    return {
      title,
      cover,
      url,
      slug,
      description,
      genres: genres.length ? genres : undefined,
      chapters,
    };
  }

  /** الفصول عبر AJAX ثم fallback إلى HTML الصفحة */
  private async fetchChapters(slug: string, $page: CheerioAPI | null = null): Promise<ChapterInfo[]> {
    const chapters: ChapterInfo[] = [];
    const seen = new Set<string>();
    const collect = ($: CheerioAPI) => {
      $("li.wp-manga-chapter a, .chapter-li a, .listing-chapters_wrap a, li.item a").each(
        (_, a) => {
          const href = this.abs($(a).attr("href") ?? "")!;
          if (!href || seen.has(href)) return;
          const numM = href.match(/(\d+(?:\.\d+)?)\/?$/);
          seen.add(href);
          chapters.push({
            number: numM ? Number(numM[1]) : chapters.length + 1,
            title: $(a).text().trim().replace(/\s+/g, " ").slice(0, 120),
            url: href,
            date: extractChapterDateText($(a)),
          });
        },
      );
    };

    try {
      const html = await this.postForm(`/manga/${slug}/ajax/chapters/?t=1`, {}, {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${this.baseUrl}/manga/${slug}/`,
        },
      });
      collect(cheerio.load(String(html)));
    } catch {
      // بعض نسخ Madara تتطلب GET بدل POST
      try {
        const html = await this.getHtml(`/manga/${slug}/ajax/chapters/?t=1`, {
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        collect(cheerio.load(String(html)));
      } catch {
        /* fallback للصفحة */
      }
    }

    if (!chapters.length && $page) collect($page);
    chapters.sort((a, b) => a.number - b.number);
    return chapters;
  }

  async getPages(chapterUrl: string): Promise<string[]> {
    const html = await this.getHtml(chapterUrl);
    const $ = cheerio.load(String(html));
    const pages: string[] = [];
    $(".page-break img.wp-manga-chapter-img, .page-break img, img.wp-manga-chapter-img").each(
      (_, img) => {
        const src = ($(img).attr("src") || $(img).attr("data-src") || "").trim();
        if (src && !/loading|placeholder/i.test(src)) pages.push(this.abs(src));
      },
    );
    return pages;
  }

  async getLatest(page = 1): Promise<LatestItem[]> {
    const html = await this.getHtml(page > 1 ? `/page/${page}/` : "/");
    const $ = cheerio.load(String(html));
    const items: LatestItem[] = [];
    const seen = new Set<string>();
    $('a[href*="/manga/"]').each((_, a) => {
      const href = this.abs($(a).attr("href") ?? "")!;
      const m =
        href.match(/\/manga\/([^/]+)\/(\d+(?:\.\d+)?)\/?$/) ||
        href.match(/\/manga\/([^/]+)\/chapter[-/](\d+(?:\.\d+)?)\/?$/i);
      if (!m || seen.has(href)) return;
      seen.add(href);
      const container = $(a).closest(".page-item-detail, .manga, div, article, li");
      items.push({
        seriesTitle:
          container.find(".post-title, h3, h5").first().text().trim() ||
          m[1].replace(/-/g, " "),
        seriesUrl: `${this.baseUrl}/manga/${m[1]}/`,
        cover: this.abs(
          container.find("img").first().attr("data-src") ||
            container.find("img").first().attr("src") ||
            "",
        ),
        chapter: { number: Number(m[2]), title: "", url: href, date: null },
      });
    });
    return items.slice(0, 30);
  }
}

export default Asq3Scraper;
