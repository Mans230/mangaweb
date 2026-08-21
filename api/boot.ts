import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { captureError } from "./lib/errorLog";
import { env } from "./lib/env";
import { linkVerifyHandler } from "./lib/link";
import { telegramResetHandler } from "./lib/telegramReset";
import { isIpBanned } from "./lib/ipBan";
import { clientIp } from "./lib/rateLimit";
import { googleAuthStartHandler, googleCallbackHandler } from "./lib/google";
import { downloadChapterHandler } from "./lib/download";
import { Paths } from "@contracts/constants";
import { BROWSER_UA, imageHostPolicy, getScraper } from "./scrapers";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB

/* ===== كاش صور في الذاكرة — شبكات البطاقات تولّد عشرات الطلبات المتوازية فتخنق المصادر ===== */
const IMG_CACHE_MAX_ENTRIES = 500;
const IMG_CACHE_MAX_BYTES = 150 * 1024 * 1024; // 150MB
const IMG_CACHE_ITEM_MAX = 4 * 1024 * 1024; // لا تُخزَّن الصور الضخمة
const IMG_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 ساعات
type ImgCacheEntry = { buf: Uint8Array; ct: string; exp: number; size: number };
const imgCache = new Map<string, ImgCacheEntry>();
let imgCacheBytes = 0;
const imgInflight = new Map<string, Promise<UpstreamImg>>();

type UpstreamImg =
  | { ok: true; buf: Uint8Array; ct: string }
  | { ok: false; status: number; msg: string };

/** حد تزامن لكل مصدر — صفحة واحدة فيها عشرات الأغلفة، وفتح الطلبات دفعة واحدة
 *  يجعل المصدر يخنقنا (429/5xx) فتظهر الأغلفة مكسورة رغم أنها سليمة */
const IMG_HOST_CONCURRENCY = 6;
const imgHostSem = new Map<string, { active: number; queue: (() => void)[] }>();

function acquireImgHost(host: string): Promise<() => void> {
  let sem = imgHostSem.get(host);
  if (!sem) {
    sem = { active: 0, queue: [] };
    imgHostSem.set(host, sem);
  }
  const s = sem;
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (s.active < IMG_HOST_CONCURRENCY) {
        s.active++;
        resolve(() => {
          s.active--;
          const next = s.queue.shift();
          if (next) next();
        });
      } else {
        s.queue.push(tryAcquire);
      }
    };
    tryAcquire();
  });
}

/** يكتشف نوع الصورة من الـ magic bytes (لما content-type غير موثوق) */
function sniffImageType(b: Uint8Array): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  // RIFF....WEBP
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  )
    return "image/webp";
  // ....ftyp (avif/heic)
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "image/avif";
  return null;
}

/** جلب الصورة من المصدر مع إعادة محاولة واحدة عند 429/5xx */
async function fetchUpstreamImageRaw(target: URL, referer?: string): Promise<UpstreamImg> {
  const headers: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  };
  if (referer) headers.Referer = referer;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      let upstream = await fetch(target.href, {
        headers,
        signal: controller.signal,
        redirect: "follow",
      });
      // dilar.tube: توكن الصور (?t=) ينتهي خلال دقائق — جدّده وأعد المحاولة مرة واحدة
      if (
        !upstream.ok &&
        (upstream.status === 401 || upstream.status === 403) &&
        target.hostname.toLowerCase() === "dilar.tube" &&
        target.pathname.startsWith("/uploads/releases/")
      ) {
        const dilar = getScraper("dilar") as unknown as {
          getFreshMediaToken?: () => Promise<string | null>;
        };
        const fresh = await dilar?.getFreshMediaToken?.().catch(() => null);
        if (fresh) {
          target.searchParams.set("t", fresh);
          upstream = await fetch(target.href, {
            headers,
            signal: controller.signal,
            redirect: "follow",
          });
        }
      }
      if (!upstream.ok || !upstream.body) {
        if (upstream.status === 429 || upstream.status >= 500) continue; // أعد المحاولة
        return { ok: false, status: 502, msg: `Upstream error ${upstream.status}` };
      }
      const contentType = (upstream.headers.get("content-type") ?? "").split(";")[0].trim();
      const declared = Number(upstream.headers.get("content-length") ?? 0);
      if (declared > MAX_IMAGE_BYTES) return { ok: false, status: 413, msg: "Image too large" };

      const reader = upstream.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          await reader.cancel().catch(() => {});
          return { ok: false, status: 413, msg: "Image too large" };
        }
        chunks.push(value);
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
      }
      // بعض المصادر (مثل storage.vortexscans.org) تُرجع الصورة بـ
      // content-type: application/octet-stream — نشمّ الـ magic bytes بدل الرفض.
      let ct = contentType;
      if (!ct.startsWith("image/")) {
        const sniffed = sniffImageType(out);
        if (!sniffed) return { ok: false, status: 415, msg: "Not an image" };
        ct = sniffed;
      }
      return { ok: true, buf: out, ct };
    } catch (e) {
      const isAbort = (e as Error).name === "AbortError";
      if (attempt === 0) continue; // أعد المحاولة مرة
      return { ok: false, status: 502, msg: isAbort ? "Upstream timeout" : "Fetch failed" };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: 502, msg: "Upstream rate-limited" };
}

/** غلاف يقيّد التزامن لكل مصدر قبل الجلب الفعلي */
async function fetchUpstreamImage(target: URL, referer?: string): Promise<UpstreamImg> {
  const release = await acquireImgHost(target.hostname.toLowerCase());
  try {
    return await fetchUpstreamImageRaw(target, referer);
  } finally {
    release();
  }
}

function imgCacheStore(key: string, buf: Uint8Array, ct: string) {
  if (buf.byteLength > IMG_CACHE_ITEM_MAX) return;
  const old = imgCache.get(key);
  if (old) {
    imgCache.delete(key);
    imgCacheBytes -= old.size;
  }
  imgCache.set(key, { buf, ct, exp: Date.now() + IMG_CACHE_TTL_MS, size: buf.byteLength });
  imgCacheBytes += buf.byteLength;
  // إخلاء الأقدم (ترتيب الإدراج = الأقدم أولاً)
  while (imgCacheBytes > IMG_CACHE_MAX_BYTES || imgCache.size > IMG_CACHE_MAX_ENTRIES) {
    const oldestKey = imgCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = imgCache.get(oldestKey);
    imgCache.delete(oldestKey);
    if (oldest) imgCacheBytes -= oldest.size;
  }
}

/** بروكسي صور فصول المصادر — whitelist صارمة ضد SSRF */
async function imageProxyHandler(c: Context) {
  const raw = c.req.query("u") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      throw new Error("bad protocol");
    }
  } catch {
    return c.json({ error: "Invalid URL" }, 400);
  }

  const host = target.hostname.toLowerCase();
  let referer: string | undefined;
  let allowed = false;
  for (const [allowedHost, ref] of imageHostPolicy()) {
    if (host === allowedHost || host.endsWith(`.${allowedHost}`)) {
      allowed = true;
      referer = ref;
      break;
    }
  }
  if (!allowed) {
    console.warn(`[img] مضيف مرفوض (أضفه للقائمة البيضاء لو شرعي): ${host}`);
    return c.json({ error: "Forbidden host" }, 403);
  }

  // s=1 = صفحة فصل داخل القارئ — لا تُخزَّن (تتراكم بسرعة لمئات الميغا)
  const cacheable = c.req.query("s") !== "1";
  const key = target.href;

  if (cacheable) {
    const hit = imgCache.get(key);
    if (hit) {
      if (hit.exp > Date.now()) {
        imgCache.delete(key);
        imgCache.set(key, hit); // LRU
        return c.body(hit.buf, 200, {
          "Content-Type": hit.ct,
          "Cache-Control": "public, max-age=86400, immutable",
          "X-Img-Cache": "hit",
        });
      }
      imgCache.delete(key);
      imgCacheBytes -= hit.size;
    }
  }

  // دمج الطلبات المتزامنة لنفس الصورة — طلب واحد للمصدر مهما تزامنت البطاقات
  let pending = cacheable ? imgInflight.get(key) : undefined;
  if (!pending) {
    pending = fetchUpstreamImage(target, referer);
    if (cacheable) {
      imgInflight.set(key, pending);
      void pending.finally(() => imgInflight.delete(key));
    }
  }
  const res = await pending;
  if (!res.ok) {
    console.warn(`[img] فشل جلب ${target.href.slice(0, 140)} — ${res.msg}`);
    return c.json({ error: res.msg }, res.status as 502 | 415 | 413);
  }

  if (cacheable) imgCacheStore(key, res.buf, res.ct);
  return c.body(res.buf, 200, {
    "Content-Type": res.ct,
    "Cache-Control": cacheable ? "public, max-age=86400, immutable" : "no-store",
  });
}

const UPLOAD_IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif"];
const UPLOAD_VIDEO_EXTS = ["mp4", "webm", "mov"];
const UPLOAD_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const UPLOAD_VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_UPLOAD_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB

/**
 * رفع مباشر (multipart/form-data، حقل "file") إلى catbox — بديل عن base64
 * الذي يتضخم ~33% ويفشل صامتاً مع الفيديوهات الكبيرة.
 * المصادقة بكوكي الجلسة نفسه المستخدم في tRPC.
 */
async function directUploadHandler(c: Context) {
  const { authenticateRequest } = await import("./lib/auth");
  const { checkRateLimit } = await import("./lib/rateLimit");
  const { uploadToCatbox } = await import("./lib/catbox");

  let user: { id: number | string };
  try {
    user = await authenticateRequest(c.req.raw.headers);
  } catch {
    return c.json({ error: "غير مسجل الدخول" }, 401);
  }

  let file: File | null = null;
  try {
    const body = await c.req.parseBody();
    const candidate = body["file"];
    if (candidate instanceof File) file = candidate;
  } catch {
    return c.json({ error: "طلب multipart غير صالح" }, 400);
  }
  if (!file || !file.size) {
    return c.json({ error: "الملف مفقود — أرسل الحقل file" }, 400);
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const mime = (file.type || "").toLowerCase();
  const isImage =
    UPLOAD_IMAGE_EXTS.includes(ext) && UPLOAD_IMAGE_MIMES.includes(mime);
  const isVideo =
    UPLOAD_VIDEO_EXTS.includes(ext) && UPLOAD_VIDEO_MIMES.includes(mime);
  if (!isImage && !isVideo) {
    return c.json(
      {
        error:
          "صيغة غير مدعومة — صور: jpg, jpeg, png, webp, gif / فيديو: mp4, webm, mov",
      },
      400,
    );
  }

  const maxBytes = isImage ? MAX_UPLOAD_IMAGE_BYTES : MAX_UPLOAD_VIDEO_BYTES;
  if (file.size > maxBytes) {
    return c.json({ error: "الملف أكبر من الحد المسموح" }, 413);
  }

  // نفس حدود uploadRouter: 10 صور/10د، 3 فيديوهات/ساعة لكل مستخدم
  const key = isImage
    ? `upload:image:${user.id}`
    : `upload:video:${user.id}`;
  const allowed = isImage
    ? checkRateLimit(key, 10, 10 * 60 * 1000)
    : checkRateLimit(key, 3, 60 * 60 * 1000);
  if (!allowed) {
    return c.json({ error: "رفعت ملفات كثيرة، جرب بعد شوية" }, 429);
  }

  try {
    const url = await uploadToCatbox(file, file.name);
    return c.json({ url });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
}

const app = new Hono<{ Bindings: HttpBindings }>();

const CSP = [
  "default-src 'self'",
  // 'unsafe-eval' مطلوب لودجت تليجرام (telegram-widget.js يستخدم eval داخلياً)
  "script-src 'self' 'unsafe-eval' https://telegram.org",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // Covers are hotlinked from many source domains, so they can't be pinned to a
  // fixed host list without proxying every cover through /api/img or R2. Restrict
  // to https only — http/ws are already blocked by mixed-content on this HTTPS/HSTS
  // site, so there is no functional regression.
  "img-src https: data: blob:",
  "connect-src 'self'",
  "frame-src https://telegram.org https://oauth.telegram.org",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

// ترويسات أمان على كل الردود
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Content-Security-Policy", CSP);
  // HSTS: 6 أشهر — بلا includeSubDomains (دومين www غير موجود بعد)
  c.header("Strict-Transport-Security", "max-age=15552000");
  c.res.headers.delete("x-powered-by");
});

// 280MB لاستيعاب رفع الفيديو base64 (حد 200MB خام)
app.use(bodyLimit({ maxSize: 280 * 1024 * 1024 }));

// فرض حظر الـ IP على كل /api/* (كاش 60 ثانية)
app.use("/api/*", async (c, next) => {
  const ip = clientIp(c.req.raw);
  if (ip !== "unknown" && (await isIpBanned(ip))) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return next();
});

app.get(Paths.googleAuth, googleAuthStartHandler());
app.get(Paths.googleCallback, googleCallbackHandler());
app.post(Paths.linkVerify, linkVerifyHandler());
app.post("/api/auth/telegram-reset", telegramResetHandler());
app.get("/api/download/:slug/chapter/:num", downloadChapterHandler);
app.get("/api/img", imageProxyHandler);
app.post("/api/upload", directUploadHandler);
// وضع الصيانة: غير الأدمن يحصل على MAINTENANCE لكل tRPC ما عدا auth.me/ping/admin.*
app.use("/api/trpc/*", async (c, next) => {
  const { getSetting } = await import("./lib/siteSettings");
  const mode = await getSetting("maintenance_mode", "0");
  if (mode !== "1") return next();

  const procs = c.req.path
    .replace(/^\/api\/trpc\//, "")
    .split("/")[0]
    .split(",")
    .filter(Boolean);
  const allowed = (p: string) =>
    p === "ping" ||
    p === "auth.me" ||
    p === "auth.login" ||
    p === "auth.telegramLogin" ||
    p.startsWith("admin.");
  if (procs.length && procs.every(allowed)) return next();

  try {
    const { authenticateRequest } = await import("./lib/auth");
    const user = await authenticateRequest(c.req.raw.headers);
    if (user.role === "admin") return next();
  } catch {
    /* غير مسجل أو جلسة منتهية */
  }

  const message = await getSetting("maintenance_message", "");
  return c.json(
    {
      error: {
        code: "MAINTENANCE",
        message: message || "الموقع تحت الصيانة حالياً — عود لاحقاً",
      },
    },
    503,
  );
});

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
    onError: ({ error, path }) => {
      // نسجّل فقط أخطاء الخادم (500) — الأخطاء المتوقّعة (4xx) ليست أعطالاً
      if (error.code === "INTERNAL_SERVER_ERROR") {
        void captureError(error.message, {
          path: path ?? undefined,
          stack: error.stack,
        });
      }
    },
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // تغييرات السكيمة idempotent — لا migrate تلقائي على Railway.
  // fire-and-forget بعد بدء الاستماع حتى لا يعلّق الإقلاع لو تأخر الاتصال بقاعدة البيانات.
  void (async () => {
    try {
      const { ensureBootSchema } = await import("./lib/ensureSchema");
      await ensureBootSchema();
      console.log("[boot] ensureBootSchema: ok");
    } catch (e) {
      console.warn(`[boot] ensureBootSchema: ${(e as Error).message}`);
    }
  })();

  // ===== محرك البيانات: استيراد أولي + كتالوج دوري + تحديث دوري (لا يُسقط السيرفر أبداً) =====
  try {
    const { count } = await import("drizzle-orm");
    const { getDb } = await import("./queries/connection");
    const { manga } = await import("@db/schema");
    const { enabledScrapers } = await import("./scrapers");
    const { importLatest, importCatalog, refreshAll } = await import("./services/importer");

    const importOnEmpty = (process.env.IMPORT_ON_EMPTY ?? "true") !== "false";
    const limitPerSource = Math.max(
      1,
      parseInt(process.env.IMPORT_LIMIT_PER_SOURCE || "12", 10) || 12,
    );
    const refreshMin = Math.max(
      5,
      parseInt(process.env.SCRAPER_REFRESH_MIN || "15", 10) || 15,
    );
    // استيراد الكتالوج الدوري (الوصول لكتالوج واسع تدريجياً)
    const catalogHours = Math.max(
      1,
      parseInt(process.env.CATALOG_REFRESH_HOURS || "12", 10) || 12,
    );
    const catalogLimit = Math.max(
      1,
      parseInt(process.env.CATALOG_IMPORT_LIMIT || "150", 10) || 150,
    );
    const catalogMaxPages = Math.max(
      1,
      parseInt(process.env.CATALOG_MAX_PAGES || "30", 10) || 30,
    );

    const db = getDb();
    const [{ total: mangaTotal }] = await db
      .select({ total: count() })
      .from(manga);

    // علم مشترك يمنع تداخل أي دورتين (استيراد أولي / كتالوج / refreshAll)
    let jobRunning = false;

    /** دورة كتالوج: المصادر بالتتابع مع تسجيل نتيجة كل مصدر */
    const runCatalog = async () => {
      if (jobRunning) {
        console.log("[scraper-job] دورة الكتالوج مؤجلة — مهمة خلفية أخرى تعمل");
        return;
      }
      jobRunning = true;
      try {
        for (const s of enabledScrapers()) {
          try {
            console.log(
              `[scraper-job] importCatalog(${s.name}, limit=${catalogLimit}, maxPages=${catalogMaxPages})…`,
            );
            const r = await importCatalog(s.name, {
              limit: catalogLimit,
              maxPages: catalogMaxPages,
            });
            console.log(
              `[scraper-job] كتالوج ${s.name}: استُوردت ${r.imported}، تخطّى ${r.skipped}، فشلت ${r.failed}`,
            );
          } catch (e) {
            console.error(
              `[scraper-job] فشل استيراد كتالوج ${s.name}: ${(e as Error).message}`,
            );
          }
        }
        console.log("[scraper-job] اكتملت دورة الكتالوج.");
      } finally {
        jobRunning = false;
      }
    };

    if (importOnEmpty && mangaTotal === 0) {
      console.log(
        `[scraper-job] قاعدة البيانات فارغة — استيراد أولي (${limitPerSource} سلسلة لكل مصدر)…`,
      );
      void (async () => {
        jobRunning = true;
        try {
          for (const s of enabledScrapers()) {
            try {
              console.log(`[scraper-job] importLatest(${s.name})…`);
              const r = await importLatest(s.name, limitPerSource);
              console.log(
                `[scraper-job] ${s.name}: استُوردت ${r.imported}، فشلت ${r.failed}`,
              );
            } catch (e) {
              console.error(
                `[scraper-job] فشل الاستيراد من ${s.name}: ${(e as Error).message}`,
              );
            }
          }
          console.log("[scraper-job] اكتمل الاستيراد الأولي.");
        } finally {
          jobRunning = false;
        }
        // دورة كتالوج أولى مباشرة بعد الاستيراد الأولي
        await runCatalog();
      })();
    } else {
      // أول دورة كتالوج بعد دقيقة من الإقلاع، ثم كل catalogHours
      setTimeout(() => {
        void runCatalog();
      }, 60 * 1000);
    }
    setInterval(() => {
      void runCatalog();
    }, catalogHours * 60 * 60 * 1000);

    // تحديث دوري بلا تداخل
    setInterval(() => {
      if (jobRunning) return;
      jobRunning = true;
      console.log("[scraper-job] بدء refreshAll الدوري…");
      refreshAll()
        .then((r) => {
          console.log(
            `[scraper-job] refreshAll: ${r.total} مانجا، ${r.chaptersAdded} فصل جديد، ${r.failed} فشل`,
          );
        })
        .catch((e) => {
          console.error(`[scraper-job] refreshAll فشل: ${(e as Error).message}`);
        })
        .finally(() => {
          jobRunning = false;
        });
    }, refreshMin * 60 * 1000);
  } catch (e) {
    console.error(`[scraper-job] تعذّر تشغيل مهام الخلفية: ${(e as Error).message}`);
  }
}
