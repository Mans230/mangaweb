import * as cheerio from "cheerio";
import { BaseScraper, extractChapterDateText } from "./base";
import type { LatestItem, SearchItem, SeriesInfo } from "./base";

/**
 * rocksmanga.com — WordPress Madara
 * بحث: POST /wp-admin/admin-ajax.php  action=wp-manga-search-manga&title=
 *   -> { success, data: [{ title, url, type }] }
 * الفصول: li.item a في صفحة المانجا
 * الصور: data-src لوسوم img.preload-image (str.rockscans.org، بدون Referer)
 */
export class RocksMangaScraper extends BaseScraper {
  constructor(opts: { enabled?: boolean } = {}) {
    super("rocksmanga", "https://rocksmanga.com", opts);
    this.allowedImageHosts = [
      "rocksmanga.com",
      "rockscans.org",
      "str.rockscans.org",
      "cdn.rocksmanga.com",
    ];
    // str.rockscans.org يرفض الطلبات التي تحمل Referer
    this.imageReferer = "";
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
    const description = $(".summary__content, .description-summary .summary__content")
      .first()
      .text()
      .trim() || $('meta[property="og:description"]').attr("content") || undefined;
    const genres = $(".genres-content a, .manga-genres a")
      .map((_, a) => $(a).text().trim())
      .get()
      .filter(Boolean);

    const chapters: SeriesInfo["chapters"] = [];
    const seen = new Set<string>();
    // Madara: li.item a (أو li.wp-manga-chapter a)
    $("li.item a, li.wp-manga-chapter a").each((_, a) => {
      const href = this.abs($(a).attr("href") ?? "")!;
      if (!href || seen.has(href)) return;
      const m = href.match(new RegExp(`/manga/${slug}/(\\d+(?:\\.\\d+)?)/?`));
      seen.add(href);
      chapters.push({
        number: m ? Number(m[1]) : chapters.length + 1,
        title: $(a).text().trim().replace(/\s+/g, " ").slice(0, 120),
        url: href,
        date: extractChapterDateText($(a)),
      });
    });
    // fallback لأي روابط فصول
    if (!chapters.length) {
      $("a[href]").each((_, a) => {
        const href = this.abs($(a).attr("href") ?? "")!;
        const m = href.match(new RegExp(`/manga/${slug}/(\\d+(?:\\.\\d+)?)/?$`));
        if (!m || seen.has(href)) return;
        seen.add(href);
        chapters.push({
          number: Number(m[1]),
          title: $(a).text().trim().slice(0, 120),
          url: href,
          date: extractChapterDateText($(a)),
        });
      });
    }
    chapters.sort((a, b) => a.number - b.number);
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

  async getPages(chapterUrl: string): Promise<string[]> {
    const html = await this.getHtml(chapterUrl);
    const $ = cheerio.load(String(html));
    const pages: string[] = [];
    $("img.preload-image").each((_, img) => {
      const src = $(img).attr("data-src") || $(img).attr("src");
      if (src && !/loading|placeholder/i.test(src)) pages.push(this.abs(src.trim()));
    });
    return pages;
  }

  async getLatest(page = 1): Promise<LatestItem[]> {
    const html = await this.getHtml(page > 1 ? `/page/${page}/` : "/");
    const $ = cheerio.load(String(html));
    const items: LatestItem[] = [];
    const seen = new Set<string>();
    $('a[href*="/manga/"]').each((_, a) => {
      const href = this.abs($(a).attr("href") ?? "")!;
      const m = href.match(/\/manga\/([^/]+)\/(\d+(?:\.\d+)?)\/?$/);
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

export default RocksMangaScraper;
