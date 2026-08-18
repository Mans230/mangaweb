import type { BaseScraper } from "./base";
import KawaiiMangaScraper from "./kawaiimanga";
import OlympusStaffScraper from "./olympustaff";
import AzoraFlyScraper from "./azorafly";
import MangaTimeScraper from "./mangatime";
import RocksMangaScraper from "./rocksmanga";
import Asq3Scraper from "./asq3";
import DespairScraper from "./despair";
import MangadarScraper from "./mangadar";
import DilarScraper from "./dilar";
import MangaDexScraper from "./mangadex";
import AsuraScansScraper from "./asurascans";
import VortexScansScraper from "./vortexscans";
import MangaStarzScraper from "./mangastarz";

export * from "./base";

type ScraperCtor = new (opts: { enabled?: boolean }) => BaseScraper;

const REGISTRY: Record<string, ScraperCtor> = {
  kawaiimanga: KawaiiMangaScraper,
  olympustaff: OlympusStaffScraper,
  azorafly: AzoraFlyScraper,
  mangatime: MangaTimeScraper,
  rocksmanga: RocksMangaScraper,
  "3asq": Asq3Scraper,
  despair: DespairScraper,
  mangadar: MangadarScraper,
  dilar: DilarScraper,
  mangadex: MangaDexScraper,
  asurascans: AsuraScansScraper,
  vortexscans: VortexScansScraper,
  mangastarz: MangaStarzScraper,
};

/** مصادر محمية بـ Cloudflare — تُفعَّل فقط عند توفّر FlareSolverr */
const CF_GATED = ["mangadar", "mangastarz"];

const DEFAULT_ENABLED = [
  "kawaiimanga",
  "olympustaff",
  "azorafly",
  "mangatime",
  "rocksmanga",
  "3asq",
  "despair",
  "dilar",
  "mangadex",
  "asurascans",
  "vortexscans",
];

let scrapers: BaseScraper[] | null = null;

/** أنشئ كل السكرابرز وطبّق التفعيل من env (ENABLED_SOURCES + FLARESOLVERR_URL) */
export function initScrapers(): BaseScraper[] {
  const enabledSourcesEnv = (process.env.ENABLED_SOURCES ?? "").trim();
  const enabledList = (enabledSourcesEnv || DEFAULT_ENABLED.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const enabledSet = new Set(enabledList);
  // مصادر Cloudflare (mangadar/mangastarz): تُفعَّل فقط لو FlareSolverr مضبوط
  // و(ENABLED_SOURCES غير مضبوط أو يتضمن المصدر صراحةً)
  if (process.env.FLARESOLVERR_URL) {
    for (const name of CF_GATED) {
      if (!enabledSourcesEnv || enabledSet.has(name)) enabledSet.add(name);
    }
  }

  scrapers = [];
  for (const [name, Cls] of Object.entries(REGISTRY)) {
    let enabled = enabledSet.has(name);
    if (CF_GATED.includes(name) && enabled && !process.env.FLARESOLVERR_URL) {
      enabled = false;
    }
    const s = new Cls({ enabled });
    scrapers.push(s);
    console.log(`[scrapers] ${name}: ${enabled ? "مفعّل" : "معطّل"}`);
  }
  return scrapers;
}

export function allScrapers(): BaseScraper[] {
  if (!scrapers) initScrapers();
  return scrapers!;
}

export function enabledScrapers(): BaseScraper[] {
  return allScrapers().filter((s) => s.enabled);
}

export function getScraper(name: string): BaseScraper | undefined {
  return allScrapers().find((s) => s.name === name);
}

/** كشف المصدر من رابط عبر hostname */
export function scraperForUrl(rawUrl: string): BaseScraper | undefined {
  let hostname = "";
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
  return allScrapers().find((s) => {
    try {
      const host = new URL(s.baseUrl).hostname.toLowerCase().replace(/^www\./, "");
      // kawaiimanga.org موقع واجهة بينما baseUrl هو الـ API
      if (s.name === "kawaiimanga" && hostname === "kawaiimanga.org") return true;
      // mangadex.org موقع واجهة بينما baseUrl هو api.mangadex.org
      if (s.name === "mangadex" && hostname === "mangadex.org") return true;
      return hostname === host;
    } catch {
      return false;
    }
  });
}

/**
 * خريطة host -> referer لبروكسي الصور:
 * تجمع allowedImageHosts من كل السكرابرز المفعّلة + دومينات المصادر نفسها.
 */
export function imageHostPolicy(): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of enabledScrapers()) {
    try {
      map.set(new URL(s.baseUrl).hostname.toLowerCase().replace(/^www\./, ""), s.imageReferer);
    } catch {
      /* ignore */
    }
    for (const h of s.allowedImageHosts) {
      map.set(h.toLowerCase(), s.imageReferer);
    }
  }
  // دومين واجهة kawaiimanga دائماً (الـ API base هو نطاق آخر)
  if (getScraper("kawaiimanga")?.enabled) {
    map.set("kawaiimanga.org", "https://kawaiimanga.org/");
  }
  // صور حسابات المستخدمين (أفاتار/بانر) — تُمرَّر عبر البروكسي لتفادي حجب بعض الشبكات لها.
  // المفاتيح تُطابَق بـ host === key أو host.endsWith("." + key)، فنستخدم الدومين الجذر
  // ليشمل كل النطاقات الفرعية (lh3/lh4/lh5..، cdn1..cdn5، a.uguu.se ...).
  map.set("catbox.moe", ""); // files.catbox.moe
  map.set("googleusercontent.com", ""); // lh3..lh6.googleusercontent.com
  map.set("telegram-cdn.org", ""); // cdn1..cdn5.telegram-cdn.org
  map.set("t.me", "");
  // خدمات رفع ملفات المستخدمين (احتياطي الرفع عند تعذّر catbox)
  map.set("ibb.co", ""); // i.ibb.co — ImgBB
  map.set("0x0.st", "");
  map.set("uguu.se", ""); // a.uguu.se / n.uguu.se
  map.set("kappa.lol", "");
  map.set("pomf2.lain.la", "");
  return map;
}
