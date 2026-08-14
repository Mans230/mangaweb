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
 *   - shared = ECDH(priv, epk)
 *   - salt حسب الإصدار: v1 = clientPub||epk ، v2 = epk||clientPub
 *   - key = HKDF-SHA256(shared, salt, "dilar.response.ecies.v{v}|{e}", 32)
 *   - AES-256-GCM(ct, iv, tag) → تفاصيل الفصل
 * فتح الفصل (إلزامي وإلا pages فارغة):
 *   POST /api/chapters/{id}/unlock/free → {token} يُرسل كـ X-Unlock-Free-Chapter
 *   عندها يرجع الرد المفكوك pages + storage_key + media_token
 * الصورة: /uploads/releases/{team}/{key}/hq/{page.url}?t={media_token}
 *   (media_token صالح ~8 دقائق — البروكسي يجدّده تلقائياً عند 403)
 * الفصول ذات link_control > 0 مقفلة وتُتجاوز بصمت.
 */
export class DilarScraper extends BaseScraper {
  /** كاش توكن الصور (مشترك بين الفصول — التوكن عام ويدوّر كل بضع دقائق) */
  private mediaTokenCache: { token: string; expiresAt: number } | null = null;

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

  /**
   * يفك تشفير رد ECIES ويعيد تفاصيل الفصل.
   * extraHeaders: مثل X-Unlock-Free-Chapter (إلزامي لإرجاع الصفحات).
   */
  private async decryptChapter(
    releaseId: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<any> {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
    const pubRaw = Buffer.concat([Buffer.from([0x04]), fromB64u(jwk.x), fromB64u(jwk.y)]);

    const res = await this.request({
      method: "GET",
      url: `/api/chapters/${releaseId}`,
      headers: { "X-DH-Pub": b64u(pubRaw), ...extraHeaders },
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
    const version = Number(data.v) || 1;
    // v1: salt = clientPub||epk — v2: salt = epk||clientPub
    const salt =
      version === 1 ? Buffer.concat([pubRaw, epkRaw]) : Buffer.concat([epkRaw, pubRaw]);
    const key = Buffer.from(
      crypto.hkdfSync("sha256", shared, salt, `dilar.response.ecies.v${version}|${data.e}`, 32),
    );
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, fromB64u(data.iv));
    decipher.setAuthTag(fromB64u(data.tag));
    const plain = Buffer.concat([decipher.update(fromB64u(data.ct)), decipher.final()]);
    return JSON.parse(plain.toString("utf8"));
  }

  /** توكن فتح مجاني للفصل (بدونه يرجع الموقع pages فارغة) */
  private async unlockFree(releaseId: string): Promise<string> {
    const res = await this.request({
      method: "POST",
      url: `/api/chapters/${releaseId}/unlock/free`,
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    const token = res.data?.token;
    if (typeof token !== "string" || !token) {
      throw new Error(`[dilar] فشل فتح الفصل ${releaseId} (لا توكن)`);
    }
    return token;
  }

  /** يبني روابط الصور من التفاصيل المفكوكة */
  private buildPageUrls(detail: any): string[] {
    const pages: any[] = Array.isArray(detail?.pages) ? detail.pages : [];
    const sk = String(detail?.storage_key || "");
    const token = String(detail?.media_token || "");
    if (!pages.length || !sk) return [];
    const parts = sk.split("/");
    const team = parts[0];
    const key = parts.slice(1).join("/");
    return pages
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((p) => String(p?.url || ""))
      .filter(Boolean)
      .map(
        (file) =>
          `${this.baseUrl}/uploads/releases/${team}/${key}/hq/${file}?t=${encodeURIComponent(token)}`,
      );
  }

  async getPages(chapterUrl: string, sourceRef?: string | number): Promise<string[]> {
    const releaseId = sourceRef ? String(sourceRef) : this.idFromUrl(chapterUrl);
    // 1) فتح الفصل بتوكن مجاني ثم 2) جلب التفاصيل بالتوكن — وإلا pages فارغة
    const pass = await this.unlockFree(releaseId);
    const detail = await this.decryptChapter(releaseId, { "X-Unlock-Free-Chapter": pass });
    // حدّث كاش توكن الصور للبروكسي
    if (typeof detail?.media_token === "string" && detail.media_token) {
      const ttl = Number(detail.media_token_expires_in) || 300;
      this.mediaTokenCache = {
        token: detail.media_token,
        expiresAt: Date.now() + Math.max(60, ttl * 0.8) * 1000,
      };
    }
    return this.buildPageUrls(detail);
  }

  /**
   * توكن صور صالح لبروكسي /api/img — يُستخدم لإعادة المحاولة عند 403
   * (التوكنات منتهية في الروابط المخزنة). التوكن عام ويدوّر كل بضع دقائق.
   */
  async getFreshMediaToken(): Promise<string | null> {
    if (this.mediaTokenCache && Date.now() < this.mediaTokenCache.expiresAt) {
      return this.mediaTokenCache.token;
    }
    try {
      const data = await this.getJson("/api/chapters", { params: { page: 1 } });
      const releases: DilarRelease[] = Array.isArray(data?.releases) ? data.releases : [];
      const id = releases.find((r) => r && r.id)?.id;
      if (!id) return null;
      const detail = await this.decryptChapter(String(id));
      const token = typeof detail?.media_token === "string" ? detail.media_token : null;
      if (!token) return null;
      const ttl = Number(detail.media_token_expires_in) || 300;
      this.mediaTokenCache = {
        token,
        expiresAt: Date.now() + Math.max(60, ttl * 0.8) * 1000,
      };
      return token;
    } catch {
      return null;
    }
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
