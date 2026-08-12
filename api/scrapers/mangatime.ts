import { BaseScraper } from "./base";
import type { ChapterInfo, LatestItem, SearchItem, SeriesInfo } from "./base";

/**
 * mangatime.org — tRPC API
 * GET https://mangatime.org/trpc/{proc}?input=<urlencoded {"json":{...}}>
 * الرد: { result: { data: { json: ... } } }
 * تجاهل الفصول isPremium:true
 */
export class MangaTimeScraper extends BaseScraper {
  constructor(opts: { enabled?: boolean } = {}) {
    super("mangatime", "https://mangatime.org", opts);
    this.allowedImageHosts = [
      "mangatime.org",
      "cdn.mangatime.org",
      "img.mangatime.org",
      "storage.mangatime.org",
      "mangatime.s3.amazonaws.com",
    ];
  }

  private async trpc(proc: string, payload: Record<string, unknown>): Promise<any> {
    const input = encodeURIComponent(JSON.stringify({ json: payload }));
    const data = await this.getJson(`/trpc/${proc}?input=${input}`);
    return data?.result?.data?.json ?? data?.result?.data ?? data;
  }

  async search(query: string): Promise<SearchItem[]> {
    const res = await this.trpc("search.searchSeries", { query });
    const list = Array.isArray(res) ? res : res?.series || res?.results || [];
    return list.map((s: any) => ({
      title: s.title || s.name || s.slug,
      cover: this.abs(s.cover || s.coverUrl || s.image || "") ?? "",
      url: s.url || `${this.baseUrl}/series/${s.slug}`,
      slug: s.slug,
      chaptersCount: s.chaptersCount ?? s.chapterCount,
    }));
  }

  async getSeries(urlOrSlug: string): Promise<SeriesInfo> {
    const slug = String(urlOrSlug).includes("/")
      ? this.slugFromUrl(urlOrSlug)
      : String(urlOrSlug);
    const s = await this.trpc("content.getSeriesBySlug", { slug });
    const seriesId = s?.id || s?.seriesId;
    const chapters = seriesId ? await this.fetchChapters(seriesId, slug) : [];
    return {
      title: s?.title || s?.name || slug,
      cover: this.abs(s?.cover || s?.coverUrl || s?.image || "") ?? "",
      url: `${this.baseUrl}/series/${slug}`,
      slug,
      description: s?.description || s?.synopsis || undefined,
      genres: s?.genres?.map?.((g: any) => (typeof g === "string" ? g : g.name)) ?? undefined,
      status: s?.status || undefined,
      type: s?.type || undefined,
      rating: s?.rating != null ? Number(s.rating) : undefined,
      chapters,
    };
  }

  private async fetchChapters(seriesId: string | number, slug?: string): Promise<ChapterInfo[]> {
    const res = await this.trpc("content.getChapters", { seriesId, limit: -1 });
    const list = Array.isArray(res) ? res : res?.chapters || [];
    return list
      .filter((c: any) => !c.isPremium) // تجاهل المدفوعة
      .map((c: any) => ({
        number: Number(c.number ?? c.chapterNumber ?? 0),
        title: c.title || "",
        url:
          c.url ||
          `${this.baseUrl}/series/${c.seriesSlug || slug || ""}/chapter/${c.number ?? c.chapterNumber}`,
        date: c.createdAt || c.date || null,
      }))
      .sort((a: ChapterInfo, b: ChapterInfo) => a.number - b.number);
  }

  async getPages(payload: string): Promise<string[]> {
    const m = String(payload).match(/\/series\/([^/]+)\/chapter[s]?\/(\d+(?:\.\d+)?)/i);
    const seriesSlug = m?.[1];
    const chapterNumber = m ? Number(m[2]) : undefined;
    const res = await this.trpc("content.getChapterPages", { seriesSlug, chapterNumber });
    const pages = Array.isArray(res) ? res : res?.pages || res?.images || [];
    return pages
      .map((p: any) => (typeof p === "string" ? p : p.url || p.src || p.image))
      .filter(Boolean)
      .map((u: string) => this.abs(u));
  }

  async getLatest(page = 1): Promise<LatestItem[]> {
    const res = await this.trpc("content.getLatestChapters", { page, limit: 30 }).catch(
      () => null,
    );
    const list = Array.isArray(res) ? res : res?.chapters || res?.items || [];
    return list
      .map((c: any) => ({
        seriesTitle: c.seriesTitle || c.series?.title || c.seriesSlug,
        seriesUrl: `${this.baseUrl}/series/${c.seriesSlug || c.series?.slug}`,
        cover: this.abs(c.cover || c.series?.cover || ""),
        chapter: {
          number: Number(c.number ?? c.chapterNumber ?? 0),
          title: c.title || "",
          url:
            c.url ||
            `${this.baseUrl}/series/${c.seriesSlug}/chapter/${c.number ?? c.chapterNumber}`,
          date: c.createdAt || c.date || null,
        },
      }))
      .filter((it: LatestItem) => it.chapter.number > 0);
  }
}

export default MangaTimeScraper;
