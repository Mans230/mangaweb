import * as cheerio from "cheerio";
import { BaseScraper, extractChapterDateText } from "./base";
import type { LatestItem, SearchItem, SeriesInfo } from "./base";

/**
 * olympustaff.com — HTML scraping
 * سلسلة: /series/{slug} ، فصل: /series/{slug}/{num}
 * الفصول: روابط <a> في صفحة السلسلة ؛ الصور: img[id^="image-"]
 * بحث: /ajax/search?keyword= (X-Requested-With) أو /search?keyword=
 */
export class OlympusStaffScraper extends BaseScraper {
  constructor(opts: { enabled?: boolean } = {}) {
    super("olympustaff", "https://olympustaff.com", opts);
    this.allowedImageHosts = [
      "olympustaff.com",
      "cdn.olympustaff.com",
      "img.olympustaff.com",
      "storage.olympustaff.com",
    ];
  }

  async search(query: string): Promise<SearchItem[]> {
    let html: string;
    try {
      html = await this.getHtml("/ajax/search", {
        params: { keyword: query },
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
    } catch {
      html = await this.getHtml("/search", { params: { keyword: query } });
    }
    const $ = cheerio.load(String(html));
    const out: SearchItem[] = [];
    const seen = new Set<string>();
    $('a[href*="/series/"]').each((_, a) => {
      const href = this.abs($(a).attr("href") ?? "")!;
      // تجاهل روابط الفصول /series/{slug}/{num}
      const m = href.match(/\/series\/([^/]+)\/?$/);
      if (!m || seen.has(href)) return;
      seen.add(href);
      const title =
        $(a)
          .text()
          .trim()
          .replace(/\s+/g, " ")
          .replace(/\s*(مانهوا كورية|مانجا يابانية|مانها صينية|مانهوا|مانجا|مانها)\s*/g, " ")
          .replace(/\s*\d+\s*فصل\s*/g, " ")
          .replace(/\s+(studio|studios|scan|scans|scanlation|team)\s*$/i, "")
          .replace(/\s+\d+$/, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120) || m[1].replace(/-/g, " ");
      const cover =
        this.abs($(a).find("img").attr("src") || $(a).find("img").attr("data-src") || "") ?? "";
      out.push({ title, cover, url: href, slug: m[1] });
    });
    return out.slice(0, 20);
  }

  async getSeries(urlOrSlug: string): Promise<SeriesInfo> {
    const url = String(urlOrSlug).startsWith("http")
      ? String(urlOrSlug)
      : `${this.baseUrl}/series/${urlOrSlug}`;
    const html = await this.getHtml(url);
    const $ = cheerio.load(String(html));
    const slug = url.match(/\/series\/([^/]+)/)?.[1] || this.slugFromUrl(url);
    const title =
      $("h1").first().text().trim().replace(/\s+/g, " ") ||
      $('meta[property="og:title"]').attr("content") ||
      slug.replace(/-/g, " ");
    const cover =
      this.abs(
        $('meta[property="og:image"]').attr("content") ||
          $('.series-cover img, .cover img, img[alt*="cover" i]').first().attr("src") ||
          "",
      ) ?? "";
    const description =
      $('meta[property="og:description"]').attr("content") ||
      $(".description, .series-description, [class*='description' i]").first().text().trim() ||
      undefined;

    // الموقع يرقّم قائمة الفصول على صفحات: /series/{slug}?page=1..N
    let lastPage = 1;
    $('a[href*="?page="]').each((_, a) => {
      const pm = String($(a).attr("href")).match(/[?&]page=(\d+)/);
      if (pm) lastPage = Math.max(lastPage, Number(pm[1]));
    });
    lastPage = Math.min(lastPage, 60); // سقف أمان

    const chapters: SeriesInfo["chapters"] = [];
    const seen = new Set<string>();
    const collect = ($page: cheerio.CheerioAPI) => {
      $page("a[href]").each((_, a) => {
        const href = this.abs($page(a).attr("href") ?? "")!;
        const m = href.match(new RegExp(`/series/${slug}/(\\d+(?:\\.\\d+)?)/?$`));
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);
        chapters.push({
          number: Number(m[1]),
          title: $page(a).text().trim().replace(/\s+/g, " ").slice(0, 120),
          url: href,
          date: extractChapterDateText($page(a)),
        });
      });
    };
    collect($);
    for (let p = 2; p <= lastPage; p++) {
      try {
        const pageHtml = await this.getHtml(url, { params: { page: p } });
        collect(cheerio.load(String(pageHtml)));
      } catch {
        break; // صفحة فاشلة = نهاية الترقيم غالباً
      }
    }
    chapters.sort((a, b) => a.number - b.number);
    return { title, cover, url, slug, description, chapters };
  }

  async getPages(chapterUrl: string): Promise<string[]> {
    const html = await this.getHtml(chapterUrl);
    const $ = cheerio.load(String(html));
    const pages: string[] = [];
    $('img[id^="image-"]').each((_, img) => {
      const src = $(img).attr("src") || $(img).attr("data-src");
      if (src) pages.push(this.abs(src.trim()));
    });
    return pages;
  }

  async getLatest(page = 1): Promise<LatestItem[]> {
    const html = await this.getHtml(page > 1 ? `/?page=${page}` : "/");
    const $ = cheerio.load(String(html));
    const items: LatestItem[] = [];
    const seen = new Set<string>();
    $('a[href*="/series/"]').each((_, a) => {
      const href = this.abs($(a).attr("href") ?? "")!;
      const m = href.match(/\/series\/([^/]+)\/(\d+(?:\.\d+)?)\/?$/);
      if (!m || seen.has(href)) return;
      seen.add(href);
      const slug = m[1];
      const container = $(a).closest("div, article, li");
      const titleText =
        container.find('h2, h3, .title, [class*="title" i]').first().text().trim() ||
        $(a).attr("title") ||
        slug.replace(/-/g, " ");
      items.push({
        seriesTitle: titleText.replace(/\s+/g, " ").slice(0, 150),
        seriesUrl: `${this.baseUrl}/series/${slug}`,
        cover: this.abs(
          container.find("img").first().attr("src") ||
            container.find("img").first().attr("data-src") ||
            "",
        ),
        chapter: { number: Number(m[2]), title: "", url: href, date: null },
      });
    });
    return items.slice(0, 30);
  }
}

export default OlympusStaffScraper;
