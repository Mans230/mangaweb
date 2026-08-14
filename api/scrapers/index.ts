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
};

const DEFAULT_ENABLED = [
  "kawaiimanga",
  "olympustaff",
  "azorafly",
  "mangatime",
  "rocksmanga",
  "3asq",
  "despair",
  "dilar",
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
  // mangadar محجوب بـ Cloudflare Managed Challenge: يُفعّل فقط لو FlareSolverr
  // مضبوط و(ENABLED_SOURCES غير مضبوط أو يتضمن mangadar صراحة)
  if (
    process.env.FLARESOLVERR_URL &&
    (!enabledSourcesEnv || enabledSet.has("mangadar"))
  ) {
    enabledSet.add("mangadar");
  }

  scrapers = [];
  for (const [name, Cls] of Object.entries(REGISTRY)) {
    let enabled = enabledSet.has(name);
    if (name === "mangadar" && enabled && !process.env.FLARESOLVERR_URL) {
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
  return map;
}
