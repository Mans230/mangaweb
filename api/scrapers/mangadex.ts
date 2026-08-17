import { BaseScraper } from "./base";
import type { ChapterInfo, LatestItem, SearchItem, SeriesInfo } from "./base";

const API_BASE = "https://api.mangadex.org";
const SITE = "https://mangadex.org";
const UPLOADS = "https://uploads.mangadex.org";

/** أسماء تصنيفات MangaDex الممنوعة (محتوى غير عائلي) — تُطابَق بحرف صغير */
const BLOCKED_TAG_NAMES = new Set([
  "boys' love",
  "girls' love",
  "yaoi",
  "yuri",
  "ecchi",
  "hentai",
  "smut",
  "erotica",
  "adult",
]);

interface MdManga {
  id: string;
  attributes: {
    title?: Record<string, string>;
    altTitles?: Record<string, string>[];
    description?: Record<string, string>;
    status?: string;
    year?: number;
    contentRating?: string;
    tags?: { id: string; attributes?: { name?: Record<string, string> } }[];
  };
  relationships?: { type: string; attributes?: { fileName?: string } }[];
}

/**
 * MangaDex — المصدر الإنجليزي الأول عبر الـ API الرسمي فقط (لا HTML scraping).
 * https://api.mangadex.org — حدود المعدل ~5 req/s (نستخدم rateLimitMs=1000).
 *
 * سياسة المحتوى: family-safe فقط.
 *  - كل طلبات /manga و /feed تتضمن contentRating[]=safe حصرياً.
 *  - تُستثنى تصنيفات البالغين (Boys' Love / Ecchi / Hentai / ...) عبر excludedTags[]
 *    بمعرّفات تُجلَب مرة واحدة من GET /manga/tag وتُخزَّن في الذاكرة.
 *  - لو فشل جلب التصنيفات: نكتفي بـ contentRating[]=safe ونسجّل تحذيراً.
 *  - حارس إضافي في getSeries: أي contentRating !== "safe" يُرفض.
 */
export class MangaDexScraper extends BaseScraper {
  /** معرّفات التصنيفات الممنوعة — null = لم تُجلَب بعد، [] = فشل الجلب (fallback) */
  private excludedTagIds: string[] | null = null;

  constructor(opts: { enabled?: boolean } = {}) {
    super("mangadex", API_BASE, { ...opts, rateLimitMs: 1000 });
    this.allowedImageHosts = ["uploads.mangadex.org"];
    this.imageReferer = `${SITE}/`;
  }

  /** بناء query string بمفاتيح مصفوفة مكررة (contentRating[]=safe&includes[]=cover_art...) */
  private qs(params: Record<string, string | number | string[]>): string {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) {
        for (const item of v) sp.append(k, item);
      } else {
        sp.append(k, String(v));
      }
    }
    const s = sp.toString();
    return s ? `?${s}` : "";
  }

  /** فلاتر الأمان المشتركة: safe فقط + استبعاد تصنيفات البالغين إن عُرفت */
  private safeFilters(): Record<string, string[]> {
    const out: Record<string, string[]> = { "contentRating[]": ["safe"] };
    if (this.excludedTagIds?.length) out["excludedTags[]"] = this.excludedTagIds;
    return out;
  }

  /** جلب قائمة التصنيفات مرة واحدة واستخراج معرّفات التصنيفات الممنوعة */
  private async ensureExcludedTags(): Promise<void> {
    if (this.excludedTagIds !== null) return;
    try {
      const data = await this.getJson("/manga/tag");
      const tags: any[] = data?.data ?? [];
      this.excludedTagIds = tags
        .filter((t) => {
          const name = String(t?.attributes?.name?.en ?? "").toLowerCase();
          return BLOCKED_TAG_NAMES.has(name);
        })
        .map((t) => String(t.id));
      console.log(
        `[mangadex] تم استبعاد ${this.excludedTagIds.length} تصنيفاً للبالغين`,
      );
    } catch (e) {
      this.excludedTagIds = [];
      console.warn(
        `[mangadex] تعذّر جلب قائمة التصنيفات — الاكتفاء بـ contentRating[]=safe: ${(e as Error).message}`,
      );
    }
  }

  /** الغلاف من علاقة cover_art */
  private coverOf(m: MdManga): string {
    const rel = (m.relationships ?? []).find((r) => r.type === "cover_art");
    const fileName = rel?.attributes?.fileName;
    return fileName ? `${UPLOADS}/covers/${m.id}/${fileName}.512.jpg` : "";
  }

  private titleOf(m: MdManga): string {
    const t = m.attributes?.title ?? {};
    if (t.en) return t.en;
    const first = Object.values(t)[0];
    if (first) return first;
    const alt = (m.attributes?.altTitles ?? [])
      .map((a) => a.en ?? Object.values(a)[0])
      .find(Boolean);
    return alt ?? "بدون عنوان";
  }

  private toSearchItem(m: MdManga): SearchItem {
    return {
      title: this.titleOf(m),
      cover: this.coverOf(m),
      url: `${SITE}/title/${m.id}`,
      slug: m.id,
    };
  }

  async search(query: string): Promise<SearchItem[]> {
    await this.ensureExcludedTags();
    const data = await this.getJson(
      `/manga${this.qs({
        title: query,
        limit: 20,
        "includes[]": ["cover_art"],
        "availableTranslatedLanguage[]": ["en"],
        "order[followedCount]": "desc",
        ...this.safeFilters(),
      })}`,
    );
    return (data?.data ?? []).map((m: MdManga) => this.toSearchItem(m));
  }

  /**
   * أحدث السلاسل مرتبةً بآخر فصل مرفوع.
   * ملاحظة: المستورد (importLatest/importCatalog) يستهلك seriesUrl فقط،
   * لذا chapter.number يُترك 0 (لا نجلب رقم الفصل الأخير لتفادي طلب لكل عنصر)
   * ويُضبط رابط الفصل على رابط السلسلة.
   */
  async getLatest(page = 1): Promise<LatestItem[]> {
    await this.ensureExcludedTags();
    const limit = 30;
    const data = await this.getJson(
      `/manga${this.qs({
        limit,
        offset: (page - 1) * limit,
        "order[latestUploadedChapter]": "desc",
        hasAvailableChapters: "true",
        "includes[]": ["cover_art"],
        "availableTranslatedLanguage[]": ["en"],
        ...this.safeFilters(),
      })}`,
    );
    return (data?.data ?? []).map((m: MdManga) => {
      const item = this.toSearchItem(m);
      return {
        seriesTitle: item.title,
        seriesUrl: item.url,
        cover: item.cover,
        genres: (m.attributes?.tags ?? [])
          .map((t) => t?.attributes?.name?.en)
          .filter((g): g is string => !!g),
        chapter: { number: 0, title: "", url: item.url, date: null },
      };
    });
  }

  async getSeries(urlOrSlug: string): Promise<SeriesInfo> {
    const input = String(urlOrSlug);
    const id = input.includes("/") ? this.slugFromUrl(input) : input;
    if (!id) throw new Error("[mangadex] معرّف مانجا غير صالح");
    await this.ensureExcludedTags();

    const data = await this.getJson(
      `/manga/${id}${this.qs({ "includes[]": ["cover_art"] })}`,
    );
    const m: MdManga | undefined = data?.data;
    if (!m) throw new Error(`[mangadex] سلسلة غير موجودة: ${id}`);

    // حارس مزدوج: رفض أي محتوى ليس safe حتى لو تسرب من الفلاتر
    if (m.attributes?.contentRating !== "safe") {
      throw new Error("محتوى غير مسموح");
    }

    const a = m.attributes ?? {};
    const altTitles = (a.altTitles ?? [])
      .flatMap((t) => Object.values(t))
      .filter((t): t is string => typeof t === "string" && !!t);
    const genres = (a.tags ?? [])
      .map((t) => t?.attributes?.name?.en)
      .filter((g): g is string => !!g);

    // خلاصة الفصول الإنجليزية — ترقيم كامل (500 لكل صفحة)
    const byNumber = new Map<number, ChapterInfo>();
    let offset = 0;
    const limit = 500;
    for (;;) {
      const feed = await this.getJson(
        // endpoint /feed لا يقبل excludedTags (يرفضه بـ 400) — التصفية بالتصنيفات
        // تمّت على مستوى السلسلة؛ هنا نكتفي بـ contentRating=safe فقط.
        `/manga/${id}/feed${this.qs({
          limit,
          offset,
          "translatedLanguage[]": ["en"],
          "order[chapter]": "asc",
          "contentRating[]": ["safe"],
        })}`,
      );
      const list: any[] = feed?.data ?? [];
      for (const ch of list) {
        const ca = ch?.attributes ?? {};
        // تخطَّ الفصول الخارجية (مستضافة في موقع آخر) والفصول بلا رقم
        if (ca.externalUrl || ca.chapter == null) continue;
        const num = parseFloat(String(ca.chapter));
        if (!Number.isFinite(num)) continue;
        if (byNumber.has(num)) continue; // احتفظ بالأقدم عند تكرار الرقم
        byNumber.set(num, {
          number: num,
          title: ca.title || "",
          url: `${SITE}/chapter/${ch.id}`,
          date: ca.publishAt || null,
          sourceRef: ch.id,
        });
      }
      const total = Number(feed?.total ?? list.length);
      offset += list.length;
      if (!list.length || offset >= total) break;
    }
    const chapters = [...byNumber.values()].sort((x, y) => x.number - y.number);

    return {
      title: this.titleOf(m),
      altTitles,
      cover: this.coverOf(m),
      url: `${SITE}/title/${id}`,
      slug: id,
      description: a.description?.en ?? Object.values(a.description ?? {})[0],
      genres,
      status: a.status || undefined,
      type: "manga",
      isAdult: false, // محتوى safe فقط
      chapters,
    };
  }

  async getPages(chapterUrl: string, sourceRef?: string | number): Promise<string[]> {
    const chapterId = String(sourceRef ?? this.slugFromUrl(chapterUrl));
    if (!chapterId) throw new Error("[mangadex] معرّف فصل غير صالح");
    const data = await this.getJson(`/at-home/server/${chapterId}`);
    const base = data?.baseUrl;
    const hash = data?.chapter?.hash;
    const files: string[] = data?.chapter?.data ?? [];
    if (!base || !hash || !files.length) return [];
    return files.map((f) => `${base}/data/${hash}/${f}`);
  }
}

export default MangaDexScraper;
