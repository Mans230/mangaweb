import { useEffect } from "react";
import { trpc } from "@/providers/trpc";

/**
 * تطبيق الهوية البصرية التي يضبطها الأدمن (ألوان/شعار/فافيكون/CSS مخصّص).
 * الألوان تُحقن كمتغيّرات CSS على :root عبر وسم <style> ذي أولوية عالية،
 * فتُلوّن كامل الواجهة دون لمس ملفات المصدر. القيم الفارغة تُترك للثيم الأساسي.
 */
export interface BrandingConfig {
  colors: {
    primary: string;
    primarySoft: string;
    accent: string;
    accent2: string;
    primaryInk: string;
  };
  siteName: string;
  siteDescription: string;
  logoUrl: string;
  faviconEmoji: string;
  customCss: string;
}

const STYLE_ID = "admin-branding-style";

/** يبني قواعد :root من الألوان غير الفارغة فقط */
function buildColorCss(colors: BrandingConfig["colors"]): string {
  const map: Array<[keyof BrandingConfig["colors"], string]> = [
    ["primary", "--primary"],
    ["primarySoft", "--primary-soft"],
    ["accent", "--accent"],
    ["accent2", "--accent-2"],
    ["primaryInk", "--primary-ink"],
  ];
  const rules = map
    .filter(([key]) => (colors[key] ?? "").trim() !== "")
    .map(([key, cssVar]) => `  ${cssVar}: ${colors[key]};`)
    .join("\n");
  return rules ? `:root {\n${rules}\n}` : "";
}

/** فافيكون من إيموجي عبر data-URI (SVG) — بلا رفع ملفات */
function faviconDataUri(emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text y="52" font-size="52">${emoji}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function applyBranding(cfg: BrandingConfig | null | undefined): void {
  if (typeof document === "undefined") return;

  // 1) وسم <style> واحد قابل لإعادة الكتابة يحمل الألوان + CSS المخصّص
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  const colorCss = cfg ? buildColorCss(cfg.colors) : "";
  const customCss = cfg?.customCss?.trim() ?? "";
  style.textContent = [colorCss, customCss].filter(Boolean).join("\n\n");

  // 2) الفافيكون من إيموجي (إن ضُبط)
  const emoji = cfg?.faviconEmoji?.trim();
  if (emoji) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/svg+xml";
    link.href = faviconDataUri(emoji);
  }

  // 3) اسم الموقع في عنوان التبويب (إن ضُبط)
  const name = cfg?.siteName?.trim();
  if (name) document.title = name;

  // 4) وصف SEO في <meta name="description">
  const desc = cfg?.siteDescription?.trim();
  if (desc) {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = desc;
  }
}

/**
 * هوك عام: يجلب الهوية البصرية العامة ويطبّقها على كامل الموقع.
 * يُستدعى مرة واحدة قرب جذر التطبيق. فشل الاستعلام ⇒ يبقى الثيم الأساسي.
 */
export function useBranding(): void {
  const query = trpc.manga.branding.useQuery(undefined, {
    retry: false,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (query.data) applyBranding(query.data as BrandingConfig);
  }, [query.data]);
}
