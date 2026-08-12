import axios from "axios";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import type { LatestItem, SearchItem, SeriesInfo } from "./base";

/**
 * mangadar.com — محمي بـ Cloudflare Managed Challenge
 * بحث: GET /wp-admin/admin-ajax.php?action=mangaverse_search&q=
 * الفصول: JSON داخل x-data (مفتاح chapters:)
 * الصور: .reader-page img (src أو data-src)
 *
 * كل الصفحات محمية: إن وُجد FLARESOLVERR_URL تُمرَّر الطلبات عبره
 * (POST /v1 {cmd:'request.get', url, maxTimeout}) ثم يُعاد استخدام
 * كوكي cf_clearance + User-Agent. المصدر معطّل افتراضياً ويُفعَّل فقط
 * عند ضبط FLARESOLVERR_URL.
 */
export class MangadarScraper extends BaseScraper {
  private cfCookie: string | null = null; // كوكي cf_clearance
  private cfUserAgent: string | null = null;
  private alertedOnce = false;

  constructor(opts: { enabled?: boolean } = {}) {
    super("mangadar", "https://mangadar.com", opts);
    this.allowedImageHosts = ["mangadar.com", "cdn.mangadar.com", "img.mangadar.com"];
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
      console.log(`[mangadar] تمرير عبر FlareSolverr: ${url}`);
      const res = await axios.post(
        `${flaresolverrUrl}/v1`,
        { cmd: "request.get", url, maxTimeout: 60000 },
        { timeout: 70000 },
      );
      const sol = res.data?.solution;
      if (!sol || sol.status >= 400) return null;
      // خزّن cf_clearance + UA لإعادة الاستخدام في طلبات لاحقة
      const cf = (sol.cookies || []).find((c: any) => c.name === "cf_clearance");
      if (cf) {
        this.cfCookie = `cf_clearance=${cf.value}`;
        this.cfUserAgent = sol.userAgent || null;
        console.log("[mangadar] تم الحصول على cf_clearance");
      }
      return sol.response;
    } catch (e) {
      console.error(`[mangadar] فشل FlareSolverr: ${(e as Error).message}`);
      return null;
    }
  }

  /** تجاوز request الأساسي: كشف التحدي ثم FlareSolverr أو فشل واضح */
  override async request(opts: AxiosRequestConfig, attempt = 1): Promise<AxiosResponse> {
    if (!this.enabled) throw new Error("[mangadar] المصدر معطّل");
    if (Date.now() < this.circuitOpenUntil) {
      throw new Error("[mangadar] circuit breaker مفتوح");
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
            "[mangadar] محمي بـ Cloudflare Managed Challenge — يتطلب FlareSolverr (FLARESOLVERR_URL) أو بروكسي سكني",
          );
        }
        this.failures += 1;
        if (this.failures >= 3) this.circuitOpenUntil = Date.now() + this.circuitMs;
        throw new Error("[mangadar] Cloudflare challenge — يتطلب FlareSolverr أو بروكسي سكني");
      }
      throw err;
    }
  }

  async search(query: string): Promise<SearchItem[]> {
    const data = await this.getJson("/wp-admin/admin-ajax.php", {
      params: { action: "mangaverse_search", q: query },
      headers: { "X-Requested-With": "XMLHttpRequest" },
    }).catch(async (err: any) => {
      // بعض قوالب WP تعيد HTML partial بدل JSON
      if (typeof err.response?.data === "string") return err.response.data;
      throw err;
    });

    if (typeof data === "string") {
      const $ = cheerio.load(data);
      const out: SearchItem[] = [];
      $("a[href]").each((_, a) => {
        const href = this.abs($(a).attr("href") ?? "")!;
        if (!/\/manga\/[^/]+/.test(href)) return;
        out.push({
          title: $(a).text().trim() || this.slugFromUrl(href).replace(/-/g, " "),
          cover: this.abs($(a).find("img").attr("src") || "") ?? "",
          url: href,
          slug: this.slugFromUrl(href),
        });
      });
      return out.slice(0, 20);
    }

    const list = Array.isArray(data) ? data : data?.data || data?.results || data?.manga || [];
    return list.map((it: any) => ({
      title: it.title || it.name || it.post_title || "",
      cover: this.abs(it.cover || it.image || it.thumbnail || "") ?? "",
      url: this.abs(it.url || it.link || "") ?? "",
      slug: it.slug || this.slugFromUrl(it.url || it.link || ""),
    }));
  }

  async getSeries(urlOrSlug: string): Promise<SeriesInfo> {
    const url = String(urlOrSlug).startsWith("http")
      ? String(urlOrSlug)
      : `${this.baseUrl}/manga/${urlOrSlug}`;
    const html = await this.getHtml(url);
    const $ = cheerio.load(String(html));
    const slug = url.match(/\/manga\/([^/]+)/)?.[1] || this.slugFromUrl(url);
    const title =
      $("h1").first().text().trim() ||
      $('meta[property="og:title"]').attr("content") ||
      slug.replace(/-/g, " ");
    const cover =
      this.abs(
        $('meta[property="og:image"]').attr("content") ||
          $(".summary_image img, .thumb img").first().attr("src") ||
          "",
      ) ?? "";

    // الفصول: JSON داخل x-data (مفتاح chapters:)
    let chapters: SeriesInfo["chapters"] = [];
    const xdata = $("[x-data]").attr("x-data") || "";
    const m = String(xdata).match(/chapters\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
    if (m) {
      try {
        const cleaned = m[1].replace(/,\s*([\]}])/g, "$1"); // trailing commas
        chapters = JSON.parse(cleaned).map((c: any) => ({
          number: Number(c.number ?? c.chapter ?? 0),
          title: c.title || c.name || "",
          url: this.abs(
            c.url || c.link || `${this.baseUrl}/manga/${slug}/chapter-${c.number}`,
          ),
          date: c.date || c.created_at || null,
        }));
      } catch (e) {
        console.warn(`[mangadar] فشل parse لـ x-data chapters: ${(e as Error).message}`);
      }
    }
    // fallback: روابط HTML
    if (!chapters.length) {
      const seen = new Set<string>();
      $("a[href]").each((_, a) => {
        const href = this.abs($(a).attr("href") ?? "")!;
        const mm = href.match(
          new RegExp(`/manga/${slug}/(?:chapter[-/])?(\\d+(?:\\.\\d+)?)/?`),
        );
        if (!mm || seen.has(href)) return;
        seen.add(href);
        chapters.push({
          number: Number(mm[1]),
          title: $(a).text().trim().slice(0, 120),
          url: href,
          date: null,
        });
      });
    }
    chapters.sort((a, b) => a.number - b.number);
    return { title, cover, url, slug, chapters };
  }

  async getPages(chapterUrl: string): Promise<string[]> {
    const html = await this.getHtml(chapterUrl);
    const $ = cheerio.load(String(html));
    const pages: string[] = [];
    $(".reader-page img").each((_, img) => {
      const src = $(img).attr("src") || $(img).attr("data-src");
      if (src && !/loading|placeholder/i.test(src)) pages.push(this.abs(src.trim()));
    });
    return pages;
  }

  async getLatest(page = 1): Promise<LatestItem[]> {
    const html = await this.getHtml(page > 1 ? `/page/${page}/` : "/");
    const $ = cheerio.load(String(html));
    const items: LatestItem[] = [];
    const seen = new Set<string>();
    $("a[href]").each((_, a) => {
      const href = this.abs($(a).attr("href") ?? "")!;
      const m = href.match(/\/manga\/([^/]+)\/(?:chapter[-/])?(\d+(?:\.\d+)?)\/?/);
      if (!m || seen.has(href)) return;
      seen.add(href);
      items.push({
        seriesTitle: m[1].replace(/-/g, " "),
        seriesUrl: `${this.baseUrl}/manga/${m[1]}`,
        chapter: { number: Number(m[2]), title: "", url: href, date: null },
      });
    });
    return items.slice(0, 30);
  }
}

export default MangadarScraper;
