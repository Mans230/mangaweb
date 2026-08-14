import crypto from "node:crypto";
import { BaseScraper } from "./base";
import type { ChapterInfo, LatestItem, SearchItem, SeriesInfo } from "./base";

const b64u = (buf: Buffer | Uint8Array): string => Buffer.from(buf).toString("base64url");
const fromB64u = (s: string): Buffer => Buffer.from(s, "base64url");

interface DilarRelease {
  id: string;
  showable?: boolean;
  deleted?: boolean;
  link_control?: number;
  created_at?: string;
  chapter?: { chapter?: string; title?: string };
  series?: { id: string; title: string; cover?: string };
}

/**
 * dilar.tube — React SPA + JSON API على نفس الدومين (بدون Cloudflare).
 * بحث:    POST /api/search/quick_search  {query, includes:["Manga"]}
 * قائمة:  GET  /api/series?page=N&title=Q
 * سلسلة:  GET  /api/series/{id}
 * فصول:   GET  /api/chapters?series_id={id}   (أو ?page=N لآخر الإصدارات)
 * صفحات:  GET  /api/chapters/{releaseId} — رد مشفّر ECIES:
 *   - نرسل X-DH-Pub = مفتاح ECDH P-256 عام (raw uncompressed 65B, base64url)
 *   - shared = ECDH(priv, epk)؛ salt = clientPub||epk
 *   - key = HKDF-SHA256(shared, salt, "dilar.response.ecies.v1|{e}", 32)
 *   - AES-256-GCM(ct, iv, tag) → {pages:[{url,order}], storage_key}
 *   - الصورة: /uploads/releases/{storage_key}/hq/{page.url}
 * الفصول ذات link_control > 0 مقفلة وتُتجاوز بصمت.
 */
export class DilarScraper extends BaseScraper {
  constructor(opts: { enabled?: boolean } = {}) {
    super("dilar", "https://dilar.tube", opts);
    this.allowedImageHosts = ["dilar.tube"];
  }

  private coverUrl(seriesId: string | number, cover?: string | null): string {
    if (!cover) return "";
    if (/^https?:\/\//.test(cover)) return cover;
    return `${this.baseUrl}/uploads/manga/cover/${seriesId}/large_${cover}`;
  }

  private seriesUrl(id: string | number): string {
    return `${this.baseUrl}/series/${id}`;
  }

  private chapterUrl(releaseId: string | number): string {
    return `${this.baseUrl}/read/${releaseId}`;
  }

  private idFromUrl(urlOrSlug: string): string {
    const m = String(urlOrSlug).match(/(\d+)(?!.*\d)/);
    return m ? m[1] : String(urlOrSlug);
  }

  private releaseToChapter(r: DilarRelease): ChapterInfo {
    return {
      number: Number(r.chapter?.chapter ?? 0),
      title: r.chapter?.title || "",
      url: this.chapterUrl(r.id),
      date: r.created_at || null,
      sourceRef: r.id,
    };
  }

  /** فصول السلسلة (يتجاوز الفصول المقفلة link_control بصمت) */
  private async fetchChapters(seriesId: string): Promise<ChapterInfo[]> {
    const data = await this.getJson("/api/chapters", { params: { series_id: seriesId } });
    const releases: DilarRelease[] = Array.isArray(data?.releases) ? data.releases : [];
    return releases
      .filter((r) => r && r.showable !== false && !r.deleted && !r.link_control)
      .map((r) => this.releaseToChapter(r))
      .sort((a, b) => a.number - b.number);
  }

  async search(query: string): Promise<SearchItem[]> {
    const res = await this.request({
      method: "POST",
      url: "/api/search/quick_search",
      data: { query, includes: ["Manga"] },
      headers: { "Content-Type": "application/json" },
    });
    const groups: any[] = Array.isArray(res.data) ? res.data : [];
    const manga = groups.find((g) => g?.class === "Manga") || groups[0];
    const items: any[] = Array.isArray(manga?.data) ? manga.data : [];
    return items.slice(0, 20).map((it) => ({
      title: it.title,
      cover: this.coverUrl(it.id, it.cover),
      url: this.seriesUrl(it.id),
      slug: String(it.id),
    }));
  }

  async getSeries(urlOrSlug: string): Promise<SeriesInfo> {
    const id = this.idFromUrl(urlOrSlug);
    const [info, chapters] = await Promise.all([
      this.getJson(`/api/series/${id}`),
      this.fetchChapters(id),
    ]);
    return {
      title: info.title || id,
      cover: this.coverUrl(info.id || id, info.cover),
      url: this.seriesUrl(info.id || id),
      slug: String(info.id || id),
      chapters,
    };
  }

  /** يفك تشفير رد ECIES ويعيد {pages, storage_key} */
  private async decryptChapter(
    releaseId: string,
  ): Promise<{ pages: { url: string; order: number }[]; storage_key: string }> {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
    const pubRaw = Buffer.concat([Buffer.from([0x04]), fromB64u(jwk.x), fromB64u(jwk.y)]);

    const res = await this.request({
      method: "GET",
      url: `/api/chapters/${releaseId}`,
      headers: { "X-DH-Pub": b64u(pubRaw) },
    });
    const data = res.data;
    if (!data?.ct || !data?.epk) {
      throw new Error(`[dilar] رد غير مشفر أو غير متوقع للفصل ${releaseId}`);
    }
    const epkRaw = fromB64u(data.epk);
    const serverKey = crypto.createPublicKey({
      format: "jwk",
      key: {
        kty: "EC",
        crv: "P-256",
        x: b64u(epkRaw.subarray(1, 33)),
        y: b64u(epkRaw.subarray(33, 65)),
      } as any,
    });
    const shared = crypto.diffieHellman({ privateKey, publicKey: serverKey });
    const salt = Buffer.concat([pubRaw, epkRaw]);
    const key = Buffer.from(
      crypto.hkdfSync("sha256", shared, salt, `dilar.response.ecies.v1|${data.e}`, 32),
    );
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, fromB64u(data.iv));
    decipher.setAuthTag(fromB64u(data.tag));
    const plain = Buffer.concat([decipher.update(fromB64u(data.ct)), decipher.final()]);
    return JSON.parse(plain.toString("utf8"));
  }

  async getPages(chapterUrl: string, sourceRef?: string | number): Promise<string[]> {
    const releaseId = sourceRef ? String(sourceRef) : this.idFromUrl(chapterUrl);
    const data = await this.decryptChapter(releaseId);
    const pages = Array.isArray(data?.pages) ? data.pages : [];
    return pages
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((p) => `${this.baseUrl}/uploads/releases/${data.storage_key}/hq/${p.url}`);
  }

  async getLatest(page = 1): Promise<LatestItem[]> {
    const data = await this.getJson("/api/chapters", { params: { page } });
    const releases: DilarRelease[] = Array.isArray(data?.releases) ? data.releases : [];
    return releases
      .filter((r) => r && r.series && r.showable !== false && !r.deleted && !r.link_control)
      .slice(0, 30)
      .map((r) => ({
        seriesTitle: r.series!.title,
        seriesUrl: this.seriesUrl(r.series!.id),
        cover: this.coverUrl(r.series!.id, r.series!.cover),
        chapter: this.releaseToChapter(r),
      }));
  }
}

export default DilarScraper;
