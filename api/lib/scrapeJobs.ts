import { eq } from "drizzle-orm";
import { scrapeJobs } from "@db/schema";
import { getDb } from "../queries/connection";
import { getSetting, SETTING_SCRAPE_BLACKOUT } from "./siteSettings";

/** أقصى عدد محاولات (المحاولة الأولى + إعادتان) قبل التوقّف */
export const MAX_SCRAPE_ATTEMPTS = 3;

/** تأخير إعادة المحاولة أُسّياً: 2^attempt دقيقة (2م، 4م، 8م…) */
export function retryBackoffMs(attempt: number): number {
  return Math.pow(2, attempt) * 60 * 1000;
}

/**
 * يبدأ سجل دورة سكراب (running) ويعيد المعرّف — best-effort:
 * أي فشل هنا يُرجع null ولا يوقف السكراب نفسه.
 */
export async function startJob(
  source: string,
  trigger: "manual" | "scheduled" | "retry",
  attempt = 1,
): Promise<number | null> {
  try {
    const res = await getDb()
      .insert(scrapeJobs)
      .values({ source, trigger, attempt, status: "running", startedAt: new Date() })
      .$returningId();
    return res[0]?.id ?? null;
  } catch (e) {
    console.warn(`[scrape-jobs] startJob(${source}): ${(e as Error).message}`);
    return null;
  }
}

/** ينهي سجل الدورة (completed/failed) مع العدّادات ورسالة الخطأ — best-effort */
export async function finishJob(
  id: number | null,
  ok: boolean,
  counts: { imported?: number; failed?: number },
  error?: string,
): Promise<void> {
  if (id == null) return;
  try {
    await getDb()
      .update(scrapeJobs)
      .set({
        status: ok ? "completed" : "failed",
        imported: counts.imported ?? 0,
        failed: counts.failed ?? 0,
        error: error ? error.slice(0, 1000) : null,
        finishedAt: new Date(),
      })
      .where(eq(scrapeJobs.id, id));
  } catch (e) {
    console.warn(`[scrape-jobs] finishJob(${id}): ${(e as Error).message}`);
  }
}

/**
 * هل نحن داخل نافذة حظر السكراب؟ الإعداد JSON {startHour,endHour} بالساعة 0-23.
 * يدعم النوافذ العابرة لمنتصف الليل (start > end). غياب الإعداد = لا حظر.
 */
export async function inBlackout(now = new Date()): Promise<boolean> {
  const raw = await getSetting(SETTING_SCRAPE_BLACKOUT, "");
  if (!raw) return false;
  try {
    const { startHour, endHour } = JSON.parse(raw) as {
      startHour?: number;
      endHour?: number;
    };
    if (typeof startHour !== "number" || typeof endHour !== "number") return false;
    if (startHour === endHour) return false;
    const h = now.getHours();
    return startHour < endHour
      ? h >= startHour && h < endHour
      : h >= startHour || h < endHour; // نافذة عابرة لمنتصف الليل
  } catch {
    return false;
  }
}
