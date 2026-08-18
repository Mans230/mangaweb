import axios from "axios";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { BaseScraper, extractChapterDateText } from "./base";
import type { ChapterInfo, LatestItem, SearchItem, SeriesInfo } from "./base";

/**
 * manga-starz.net — WordPress Madara خلف Cloudflare Managed Challenge.
 * بحث: POST /wp-admin/admin-ajax.php action=wp-manga-search-manga
 * السلسلة: /manga/{slug}/ ، الفصول: /manga/{slug}/ajax/chapters/?t=1
 * الصور: .reading-content img / .page-break img
 *
 * كل صفحات المحتوى محمية — تُمرَّر عبر FlareSolverr (FLARESOLVERR_URL) مثل mangadar.
 * المصدر يُفعَّل فقط عند ضبط FLARESOLVERR_URL.
 */
export class MangaStarzScraper extends BaseScraper {
  private cfCookie: string | null = null;
  private cfUserAgent: string | null = null;
  private alertedOnce = false;

  constructor(opts: { enabled?: boolean } = {}) {
    super("mangastarz", "https://manga-starz.net", opts);
    this.allowedImageHosts = ["manga-starz.net", "cdn.manga-starz.net", "i0.wp.com", "i1.wp.com", "i2.wp.com"];
  }

  private isChallenge(errOrRes: any): boolean {
    const res = errOrRes?.response || errOrRes;
    if (!res) return false;
    const headers = res.headers || {};
    const body = typeof res.data === "string" ? res.data : "";
    return (
      headers["cf-mitigated"] === "challenge" ||
      res.status === 403 ||
      /Just a moment|Verify you are human|cf-challenge|challenge-platform/i.test(body)
    );
  }

  private async flaresolverrFetch(url: string): Promise<string | null> {
    const flaresolverrUrl = process.env.FLARESOLVERR_URL;
    if (!flaresolverrUrl) return null;
    try {
      console.log(`[mangastarz] تمرير عبر FlareSolverr: ${url}`);
      const res = await axios.post(
        `${flaresolverrUrl}/v1`,
        { cmd: "request.get", url, maxTimeout: 60000 },
        { timeout: 70000 },
      );
      const sol = res.data?.solution;
      if (!sol || sol.status >= 400) return null;
      const cf = (sol.cookies || []).find((c: any) => c.name === "cf_clearance");
      if (cf) {
        this.cfCookie = `cf_clearance=${cf.value}`;
        this.cfUserAgent = sol.userAgent || null;
        console.log("[mangastarz] تم الحصول على cf_clearance");
      }
      return sol.response;
    } catch (e) {
      console.error(`[mangastarz] فشل FlareSolverr: ${(e as Error).message}`);
      return null;
    }
  }

  override async request(opts: AxiosRequestConfig, attempt = 1): Promise<AxiosResponse> {
    if (!this.enabled) throw new Error("[mangastarz] المصدر معطّل");
    if (Date.now() < this.circuitOpenUntil) {
      throw new Error("[mangastarz] circuit breaker مفتوح");
    }
    const withCf: AxiosRequestConfig = {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        ...(this.cfCookie ? { Cookie: this.cfCookie } : {}),
        ...(this.cfUserAgent ? { "User-Agent": this.cfUserAgent } : {}),
      },
    };
    try {
      return await super.request(withCf, attempt);
    } catch (err) {
      if (this.isChallenge(err)) {
        const url = this.abs(String(opts.url || ""))!;
        const html = await this.flaresolverrFetch(url);
        if (html) {
          return { data: html, status: 200, headers: {}, config: opts } as AxiosResponse;
        }
        if (!this.alertedOnce) {
          this.alertedOnce = true;
          console.error(
            "[mangastarz] محمي بـ Cloudflare Managed Challenge — يتطلب FlareSolverr (FLARESOLVERR_URL)",
          );
        }
        this.failures += 1;
        if (this.failures >= 3) this.circuitOpenUntil = Date.now() + this.circuitMs;
        throw new Error("[mangastarz] Cloudflare challenge — يتطلب FlareSolverr");
      }
      throw err;
    }
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
      $(".description-summary .summary__content, .summary__content").first().text().trim() ||
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

  private async fetchChapters(slug: string, $page: CheerioAPI | null = null): Promise<ChapterInfo[]> {
    const chapters: ChapterInfo[] = [];
    const seen = new Set<string>();
    const collect = ($: CheerioAPI) => {
      $("li.wp-manga-chapter a, .listing-chapters_wrap a, .chapter-li a").each((_, a) => {
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
      });
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
    $(".reading-content img, .page-break img, img.wp-manga-chapter-img").each((_, img) => {
      const src = ($(img).attr("src") || $(img).attr("data-src") || "").trim();
      if (src && !/loading|placeholder/i.test(src)) pages.push(this.abs(src));
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
      items.push({
        seriesTitle: m[1].replace(/-/g, " "),
        seriesUrl: `${this.baseUrl}/manga/${m[1]}/`,
        chapter: { number: Number(m[2]), title: "", url: href, date: null },
      });
    });
    return items.slice(0, 30);
  }
}

export default MangaStarzScraper;
