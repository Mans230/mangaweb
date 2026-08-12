import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import type { LatestItem, SearchItem, SeriesInfo } from "./base";

/**
 * despair-manga.net — WordPress MangaReader (ThemeSwitcher / ts_reader)
 * فصل: /{slug}-chapter-{n}/ في الجذر
 * الفصول: HTML مباشر في صفحة السلسلة /manga/{slug}/
 * الصور: JSON داخل ts_reader.run({...}) -> sources[0].images[]
 * بحث: GET /?s=
 */
export class DespairScraper extends BaseScraper {
  constructor(opts: { enabled?: boolean } = {}) {
    super("despair", "https://despair-manga.net", opts);
    this.allowedImageHosts = [
      "despair-manga.net",
      "cdn.despair-manga.net",
      "img.despair-manga.net",
      // الصور تُقدَّم عبر Jetpack CDN (i0.wp.com/despair-manga.net/...)
      "i0.wp.com",
      "i1.wp.com",
      "i2.wp.com",
    ];
  }

  async search(query: string): Promise<SearchItem[]> {
    const html = await this.getHtml("/", { params: { s: query } });
    const $ = cheerio.load(String(html));
    const out: SearchItem[] = [];
    const seen = new Set<string>();
    // نتائج بحث WP: عادة .bs .bsx أو روابط /manga/
    $('.bsx a, .listupd a, article a, a[href*="/manga/"]').each((_, a) => {
      const href = this.abs($(a).attr("href") ?? "")!;
      const m = href.match(/\/manga\/([^/]+)\/?$/);
      if (!m || seen.has(href)) return;
      seen.add(href);
      const title =
        $(a).find(".tt, h2, h4").first().text().trim() ||
        $(a).attr("title") ||
        m[1].replace(/-/g, " ");
      out.push({
        title: title.replace(/\s+/g, " ").slice(0, 150),
        cover: this.abs($(a).find("img").first().attr("src") || "") ?? "",
        url: href,
        slug: m[1],
      });
    });
    return out.slice(0, 20);
  }

  async getSeries(urlOrSlug: string): Promise<SeriesInfo> {
    const url = String(urlOrSlug).startsWith("http")
      ? String(urlOrSlug)
      : `${this.baseUrl}/manga/${urlOrSlug}/`;
    const html = await this.getHtml(url);
    const $ = cheerio.load(String(html));
    const slug = url.match(/\/manga\/([^/]+)/)?.[1] || this.slugFromUrl(url);
    const title =
      $("h1.entry-title, h1").first().text().trim() ||
      $('meta[property="og:title"]').attr("content") ||
      slug.replace(/-/g, " ");
    const cover =
      this.abs(
        $(".thumb img, .bigcover img, .ime img").first().attr("src") ||
          $('meta[property="og:image"]').attr("content") ||
          "",
      ) ?? "";
    const description =
      $(".entry-content, .summary__content, [itemprop='description']").first().text().trim() ||
      $('meta[property="og:description"]').attr("content") ||
      undefined;
    const genres = $(".mgen a, .genrex a, .genre-info a")
      .map((_, a) => $(a).text().trim())
      .get()
      .filter(Boolean);

    const chapters: SeriesInfo["chapters"] = [];
    const seen = new Set<string>();
    // MangaReader: .eplister li a أو روابط /{slug}-chapter-{n}/
    $(".eplister li a, #chapterlist li a, .cl li a").each((_, a) => {
      const href = this.abs($(a).attr("href") ?? "")!;
      if (!href || seen.has(href)) return;
      const m = href.match(new RegExp(`${slug}-chapter-(\\d+(?:\\.\\d+)?)/?`, "i"));
      seen.add(href);
      chapters.push({
        number: m ? Number(m[1]) : chapters.length + 1,
        title: $(a).find(".chapternum").text().trim() || $(a).text().trim().slice(0, 120),
        url: href,
        date: $(a).find(".chapterdate").text().trim() || null,
      });
    });
    if (!chapters.length) {
      $("a[href]").each((_, a) => {
        const href = this.abs($(a).attr("href") ?? "")!;
        const m = href.match(new RegExp(`${slug}-chapter-(\\d+(?:\\.\\d+)?)/?$`, "i"));
        if (!m || seen.has(href)) return;
        seen.add(href);
        chapters.push({
          number: Number(m[1]),
          title: $(a).text().trim().slice(0, 120),
          url: href,
          date: null,
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

  /** الصور من JSON داخل ts_reader.run({...}) */
  async getPages(chapterUrl: string): Promise<string[]> {
    const html = await this.getHtml(chapterUrl);
    const m = String(html).match(/ts_reader\.run\(([\s\S]*?)\);?\s*<\/script>/);
    if (!m) throw new Error(`[despair] ts_reader JSON غير موجود في ${chapterUrl}`);
    let json: any;
    try {
      const cleaned = m[1].replace(/,\s*([}\]])/g, "$1"); // trailing commas
      json = JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`[despair] فشل parse لـ ts_reader JSON: ${(e as Error).message}`);
    }
    const images: string[] = json?.sources?.[0]?.images || [];
    return images.map((u) => this.abs(u)).filter(Boolean);
  }

  async getLatest(page = 1): Promise<LatestItem[]> {
    const html = await this.getHtml(page > 1 ? `/page/${page}/` : "/");
    const $ = cheerio.load(String(html));
    const items: LatestItem[] = [];
    const seen = new Set<string>();
    $('a[href*="-chapter-"]').each((_, a) => {
      const href = this.abs($(a).attr("href") ?? "")!;
      const m = href.match(/\/([^/]+)-chapter-(\d+(?:\.\d+)?)\/?$/i);
      if (!m || seen.has(href)) return;
      seen.add(href);
      const container = $(a).closest(".bs, .utao, article, div, li");
      items.push({
        seriesTitle:
          container.find(".tt, h2, h4").first().text().trim() || m[1].replace(/-/g, " "),
        seriesUrl: `${this.baseUrl}/manga/${m[1]}/`,
        cover: this.abs(container.find("img").first().attr("src") || ""),
        chapter: { number: Number(m[2]), title: "", url: href, date: null },
      });
    });
    return items.slice(0, 30);
  }
}

export default DespairScraper;
