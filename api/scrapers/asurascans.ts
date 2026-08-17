import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import type { ChapterInfo, LatestItem, SearchItem, SeriesInfo } from "./base";

/** وسوم +18 المرفوضة — المصادر الإنجليزية تُستبعد منها المحتوى البالغ */
const ADULT_TAG_RE =
  /(\+18|adult|ecchi|smut|yaoi|yuri|hentai|boys?'?\s*love|girls?'?\s*love|mature|erotica|pornographic)/i;

/**
 * asurascans.com — Astro SSR + API عام (لا Cloudflare حالياً).
 * بحث:    GET https://api.asurascans.com/api/search?q=  → { data: [{slug,title,cover,public_url,...}] }
 * آخر:    GET /browse?order=update&page=N — جزيرة Astro فيها initialSeries
 *         (public_url, cover, genres, latest_chapters) + ترقيم initialTotalPages.
 * سلسلة:  GET /comics/{slug} (يحوّل 302 للرابط الكانوني /comics/{slug}-{hash}) —
 *         جزيرتان: ميتا (title/description/coverUrl/status/type/genres/seriesId)
 *         وفصول ({chapters, seriesSlug, totalChapters, publicUrl}).
 *         رابط الفصل: {publicUrl}/chapter/{number}.
 *         الفصول is_premium مع early_access_until بالمستقبل = وصول مبكر مقفل → تُتجاوز.
 * صفحات:  <img src="https://cdn.asurascans.com/asura-images/chapters/..."> بترتيب data-page-index.
 */
export class AsuraScansScraper extends BaseScraper {
  constructor(opts: { enabled?: boolean } = {}) {
    super("asurascans", "https://asurascans.com", opts);
    this.allowedImageHosts = ["asurascans.com", "cdn.asurascans.com"];
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

  /** كل كائنات props المفكوكة من صفحة HTML */
  private *iterIslands(htmlDoc: string): Generator<any> {
    const re = /props="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(htmlDoc))) {
      try {
        yield this.decodeAstroValue(JSON.parse(this.unescapeAttr(m[1])));
      } catch {
        continue; // جزيرة تالفة — جرّب التالية
      }
    }
  }

  private genresOf(list: any): string[] {
    return (Array.isArray(list) ? list : [])
      .map((g: any) => (typeof g === "string" ? g : g?.name))
      .filter(Boolean);
  }

  /** فصل وصول مبكر مقفل حالياً؟ (is_premium وearly_access_until بالمستقبل) */
  private isLockedEarlyAccess(c: any): boolean {
    if (!c?.is_premium) return false;
    const until = Date.parse(c?.early_access_until || "");
    return Number.isFinite(until) && until > Date.now();
  }

  async search(query: string): Promise<SearchItem[]> {
    const data = await this.getJson("https://api.asurascans.com/api/search", {
      params: { q: query },
    });
    return (data?.data || []).map((p: any) => ({
      title: p.title || p.slug,
      cover: this.abs(p.cover || "") ?? "",
      url: this.abs(p.public_url || `/comics/${p.slug}`)!,
      slug: p.slug,
      chaptersCount: p.chapter_count != null ? Number(p.chapter_count) : undefined,
    }));
  }

  async getLatest(page = 1): Promise<LatestItem[]> {
    const htmlDoc = await this.getHtml("/browse", {
      params: { order: "update", page },
    });
    for (const obj of this.iterIslands(htmlDoc)) {
      const list = obj?.initialSeries;
      if (!Array.isArray(list)) continue;
      return list
        .map((p: any) => {
          const pub = this.abs(p.public_url || `/comics/${p.slug}`)!;
          const chs = (Array.isArray(p.latest_chapters) ? p.latest_chapters : []).filter(
            (c: any) => Number.isFinite(Number(c?.number)) && !this.isLockedEarlyAccess(c),
          );
          const last = chs.sort((a: any, b: any) => Number(b.number) - Number(a.number))[0];
          if (!last) return null;
          return {
            seriesTitle: p.title || p.slug,
            seriesUrl: pub,
            cover: this.abs(p.cover || "") ?? "",
            genres: this.genresOf(p.genres),
            chapter: {
              number: Number(last.number),
              url: `${pub}/chapter/${last.number}`,
              date: last.published_at || null,
            },
          };
        })
        .filter(Boolean) as LatestItem[];
    }
    return [];
  }

  async getSeries(urlOrSlug: string): Promise<SeriesInfo> {
    const raw = String(urlOrSlug);
    const slug = raw.includes("/comics/")
      ? raw.match(/\/comics\/([^/?#]+)/)?.[1]
      : raw;
    if (!slug) throw new Error(`[asurascans] السلسلة غير موجودة: ${raw}`);

    const htmlDoc = await this.getHtml(`/comics/${slug}`);
    let meta: any = null;
    let chapBox: any = null;
    for (const obj of this.iterIslands(htmlDoc)) {
      if (!meta && obj?.coverUrl && Array.isArray(obj?.genres) && obj?.status) meta = obj;
      if (!chapBox && Array.isArray(obj?.chapters) && obj?.publicUrl) chapBox = obj;
      if (meta && chapBox) break;
    }
    if (!meta) throw new Error(`[asurascans] السلسلة غير موجودة: ${slug}`);

    const genres = this.genresOf(meta.genres);
    if (genres.some((g) => ADULT_TAG_RE.test(g))) {
      throw new Error("محتوى غير مسموح");
    }

    const publicUrl: string = chapBox?.publicUrl || `/comics/${slug}`;
    const chapters: ChapterInfo[] = (Array.isArray(chapBox?.chapters) ? chapBox.chapters : [])
      .filter(
        (c: any) =>
          c && Number.isFinite(Number(c.number)) && !this.isLockedEarlyAccess(c),
      )
      .map((c: any) => ({
        number: Number(c.number),
        url: `${this.abs(publicUrl)}/chapter/${c.number}`,
        date: c.published_at || c.created_at || null,
      }))
      .sort((a: ChapterInfo, b: ChapterInfo) => a.number - b.number);

    const altRaw: string =
      typeof meta.alternativeTitles === "string" ? meta.alternativeTitles : "";
    return {
      title: meta.title || slug,
      altTitles: altRaw
        ? altRaw
            .split("•")
            .map((t: string) => t.trim())
            .filter(Boolean)
        : undefined,
      cover: this.abs(meta.coverUrl || chapBox?.coverUrl || "") ?? "",
      url: this.abs(publicUrl)!,
      slug,
      description: meta.description || undefined,
      status: meta.status,
      type: meta.type,
      rating: meta.rating != null ? Number(meta.rating) : undefined,
      views: meta.viewCount != null ? Number(meta.viewCount) : undefined,
      isAdult: false,
      genres,
      chapters,
    };
  }

  async getPages(chapterUrl: string): Promise<string[]> {
    const html = await this.getHtml(chapterUrl);
    const $ = cheerio.load(String(html));
    const indexed: { i: number; src: string }[] = [];
    const seen = new Set<string>();
    $("img").each((_, img) => {
      const raw =
        $(img).attr("src") ||
        $(img).attr("data-src") ||
        ($(img).attr("srcset") || "").split(",")[0]?.trim().split(" ")[0];
      if (!raw) return;
      const abs = this.abs(raw.trim());
      if (!abs || !/\/asura-images\/chapters\//i.test(abs)) return;
      if (seen.has(abs)) return;
      seen.add(abs);
      indexed.push({ i: Number($(img).attr("data-page-index") ?? indexed.length), src: abs });
    });
    return indexed.sort((a, b) => a.i - b.i).map((p) => p.src);
  }
}

export default AsuraScansScraper;
