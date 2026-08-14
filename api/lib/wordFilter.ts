import { getSetting } from "./siteSettings";

export const SETTING_BANNED_WORDS = "banned_words";

/** قراءة القائمة المحظورة من site_settings (مفصولة بفواصل) — كاش 30 ثانية عبر getSetting */
export async function bannedWords(): Promise<string[]> {
  const raw = await getSetting(SETTING_BANNED_WORDS, "");
  return (raw ?? "")
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

/** هل يحتوي النص على كلمة محظورة؟ */
export async function containsBannedWord(text: string): Promise<boolean> {
  const words = await bannedWords();
  if (!words.length) return false;
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w));
}

/** إخفاء الكلمات المحظورة داخل النص بنجوم */
export async function mask(text: string): Promise<string> {
  const words = await bannedWords();
  if (!words.length) return text;
  let out = text;
  for (const w of words) {
    out = out.replace(new RegExp(escapeRegExp(w), "gi"), "*".repeat(w.length));
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
