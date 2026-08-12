import axios from "axios";
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ====== الواجهة الموحدة للأنواع ====== */

export interface SearchItem {
  title: string;
  cover: string;
  url: string;
  slug?: string;
  chaptersCount?: number;
}

export interface ChapterInfo {
  number: number;
  title?: string;
  url: string;
  date?: string | null;
  /** معرف الفصل لدى المصدر إن لزم (kawaiimanga يتطلب chapterId لجلب الصفحات) */
  sourceRef?: string | number;
}

export interface LatestItem {
  seriesTitle: string;
  seriesUrl: string;
  cover?: string;
  genres?: string[];
  chapter: { number: number; title?: string; url: string; date?: string | null };
}

export interface SeriesInfo {
  title: string;
  altTitles?: string[];
  cover: string;
  url: string;
  slug: string;
  description?: string;
  genres?: string[];
  status?: string;
  type?: string;
  rating?: number;
  views?: number;
  isAdult?: boolean;
  chapters: ChapterInfo[];
}

/**
 * Rate limiter بسيط لكل مفتاح (مصدر): يضمن تسلسل الطلبات
 * وحد أدنى من الزمن بين طلب وآخر.
 */
export class RateLimiter {
  private min: number;
  private state = new Map<string, { last: number; chain: Promise<void> }>();

  constructor(minIntervalMs = 1200) {
    this.min = minIntervalMs;
  }

  async wait(key = "default"): Promise<void> {
    let s = this.state.get(key);
    if (!s) {
      s = { last: 0, chain: Promise.resolve() };
      this.state.set(key, s);
    }
    const job = s.chain.then(async () => {
      const delay = this.min - (Date.now() - s.last);
      if (delay > 0) await sleep(delay);
      s.last = Date.now();
    });
    // لا تكسر السلسلة لو فشل شيء ما
    s.chain = job.catch(() => {});
    return job;
  }
}

/**
 * الواجهة الموحدة لكل المصادر.
 * كل سكرابر يعيد:
 *  - search(query)   => [{ title, cover, url, chaptersCount? }]
 *  - getLatest(page) => [{ seriesTitle, seriesUrl, cover?, chapter: {...}, genres? }]
 *  - getSeries(url)  => SeriesInfo مع chapters
 *  - getPages(url)   => [imageUrl, ...]
 */
export abstract class BaseScraper {
  readonly name: string;
  readonly baseUrl: string;
  enabled: boolean;
  /** دومينات الصور/CDN الخاصة بالمصدر — whitelist لبروكسي /api/img */
  allowedImageHosts: string[] = [];
  /** Referer المطلوب عند جلب الصور */
  imageReferer: string;

  protected failures = 0;
  protected circuitOpenUntil = 0;
  protected circuitMs: number;
  protected maxRetries: number;
  protected limiter: RateLimiter;
  protected client: AxiosInstance;

  constructor(
    name: string,
    baseUrl: string,
    opts: { enabled?: boolean; circuitMs?: number; maxRetries?: number; rateLimitMs?: number } = {},
  ) {
    this.name = name;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.imageReferer = `${this.baseUrl}/`;
    this.enabled = opts.enabled !== false;
    this.circuitMs = opts.circuitMs || 30 * 60 * 1000; // 30 دقيقة
    this.maxRetries = opts.maxRetries || 3; // محاولة أولى + إعادتان فعلياً
    this.limiter = new RateLimiter(opts.rateLimitMs ?? 1200);

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 20000,
      maxRedirects: 5,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
      },
      validateStatus: (s) => s >= 200 && s < 400,
    });
  }

  isAvailable(): boolean {
    if (!this.enabled) return false;
    return Date.now() >= this.circuitOpenUntil;
  }

  /** طلب HTTP مع rate limit + retry/backoff + circuit breaker */
  async request(opts: AxiosRequestConfig, attempt = 1): Promise<AxiosResponse> {
    if (!this.enabled) throw new Error(`[${this.name}] المصدر معطّل`);
    if (Date.now() < this.circuitOpenUntil) {
      throw new Error(`[${this.name}] circuit breaker مفتوح مؤقتاً`);
    }
    await this.limiter.wait(this.name);
    try {
      const res = await this.client.request(opts);
      this.failures = 0;
      return res;
    } catch (err) {
      const e = err as Error;
      if (attempt < this.maxRetries) {
        const backoff = attempt * 2000;
        console.warn(
          `[${this.name}] ${opts.method || "GET"} ${opts.url} فشل (محاولة ${attempt}/${this.maxRetries}): ${e.message} — إعادة بعد ${backoff}ms`,
        );
        await sleep(backoff);
        return this.request(opts, attempt + 1);
      }
      this.failures += 1;
      if (this.failures >= 3) {
        this.circuitOpenUntil = Date.now() + this.circuitMs;
        console.error(
          `[${this.name}] المصدر تعطّل مؤقتاً لمدة 30 دقيقة بعد تكرار الفشل. السبب: ${e.message}`,
        );
      }
      throw err;
    }
  }

  async getHtml(url: string, opts: AxiosRequestConfig = {}): Promise<string> {
    const res = await this.request({ method: "GET", url, ...opts });
    return res.data;
  }

  async getJson(url: string, opts: AxiosRequestConfig = {}): Promise<any> {
    const res = await this.request({
      method: "GET",
      url,
      responseType: "json",
      ...opts,
    });
    return res.data;
  }

  async postForm(
    url: string,
    fields: Record<string, string>,
    opts: AxiosRequestConfig = {},
  ): Promise<any> {
    const body = new URLSearchParams(fields).toString();
    const res = await this.request({
      method: "POST",
      url,
      data: body,
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      ...opts,
    });
    return res.data;
  }

  /** استخرج الـ slug من رابط (آخر مقطع) */
  slugFromUrl(url: string): string {
    try {
      const parts = new URL(url, this.baseUrl).pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || "";
    } catch {
      return String(url).split("/").filter(Boolean).pop() || "";
    }
  }

  abs(url: string): string;
  abs(url: string | undefined | null): string | undefined;
  abs(url: string | undefined | null): string | undefined {
    if (!url) return url ?? undefined;
    try {
      return new URL(url, this.baseUrl + "/").href;
    } catch {
      return url;
    }
  }

  // ===== الواجهة الموحدة (تُنفَّذ في الأبناء) =====
  abstract search(query: string): Promise<SearchItem[]>;
  abstract getLatest(page?: number): Promise<LatestItem[]>;
  abstract getSeries(urlOrSlug: string): Promise<SeriesInfo>;
  abstract getPages(chapterUrl: string, sourceRef?: string | number): Promise<string[]>;
}

export default BaseScraper;
