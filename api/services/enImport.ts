import { eq, inArray, sql } from "drizzle-orm";
import {
  chapters,
  comments,
  communities,
  communityMessages,
  favorites,
  follows,
  manga,
  ratings,
  readingProgress,
  reports,
  sources,
  updateRequests,
  userListItems,
} from "@db/schema";
import { getDb } from "../queries/connection";
import { getScraper } from "../scrapers";
import { importSeries } from "./importer";

/** مصادر القسم الإنجليزي */
export const EN_SOURCE_KEYS = ["mangadex", "asurascans", "vortexscans"] as const;
export type EnSourceKey = (typeof EN_SOURCE_KEYS)[number];

export interface EnImportJobState {
  running: boolean;
  target: number;
  processed: number;
  created: number;
  duplicates: number;
  skippedAdult: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
}

/** حالة مهمة الاستيراد الجماعي لكل مصدر إنجليزي (في الذاكرة) */
const jobs = new Map<EnSourceKey, EnImportJobState>();

function freshState(target: number): EnImportJobState {
  return {
    running: true,
    target,
    processed: 0,
    created: 0,
    duplicates: 0,
    skippedAdult: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
}

function isAdultRejection(e: unknown): boolean {
  return (e as Error).message?.includes("محتوى غير مسموح");
}

async function runEnBulkImport(sourceKey: EnSourceKey): Promise<void> {
  const state = jobs.get(sourceKey)!;
  const scraper = getScraper(sourceKey)!;
  const seen = new Set<string>();

  try {
    for (let page = 1; page <= 60; page++) {
      if (state.created + state.duplicates >= state.target) break;
      let items: Awaited<ReturnType<typeof scraper.getLatest>>;
      try {
        items = await scraper.getLatest(page);
      } catch (e) {
        console.warn(
          `[en-import] getLatest(${sourceKey}, page=${page}) فشل: ${(e as Error).message}`,
        );
        break; // فشل الصفحة = نهاية الترقيم غالباً
      }
      if (!items.length) break; // صفحة فارغة = نهاية الكتالوج

      for (const it of items) {
        if (!it.seriesUrl || seen.has(it.seriesUrl)) continue;
        if (state.created + state.duplicates >= state.target) break;
        seen.add(it.seriesUrl);
        state.processed += 1;
        try {
          const res = await importSeries(sourceKey, it.seriesUrl);
          if (res.manga.isAdult) {
            // سياسة الموقع آمن للعائلة — لا نحتفظ بمحتوى +18
            state.skippedAdult += 1;
            try {
              await deleteMangaCascade(res.manga.id);
            } catch (e) {
              console.warn(
                `[en-import] تعذّر حذف محتوى +18 (${res.manga.id}): ${(e as Error).message}`,
              );
            }
          } else if (res.created) {
            state.created += 1;
          } else {
            state.duplicates += 1;
          }
        } catch (e) {
          if (isAdultRejection(e)) {
            state.skippedAdult += 1;
          } else {
            state.failed += 1;
            console.warn(
              `[en-import] فشل استيراد ${it.seriesUrl}: ${(e as Error).message}`,
            );
          }
        }
        if (state.processed % 25 === 0) {
          console.log(
            `[en-import] ${sourceKey}: عولج ${state.processed} — أُنشئ ${state.created}، مكرر ${state.duplicates}، +18 ${state.skippedAdult}، فشل ${state.failed}`,
          );
        }
      }
    }
    console.log(
      `[en-import] ${sourceKey} اكتمل: عولج ${state.processed} — أُنشئ ${state.created}، مكرر ${state.duplicates}، +18 ${state.skippedAdult}، فشل ${state.failed}`,
    );
  } catch (e) {
    console.error(`[en-import] ${sourceKey} توقف بخطأ: ${(e as Error).message}`);
  } finally {
    state.running = false;
    state.finishedAt = new Date().toISOString();
  }
}

/**
 * استيراد جماعي لكتالوج مصدر إنجليزي في الخلفية: ترقيم getLatest صفحة بصفحة
 * (بحد أقصى 60 صفحة) واستيراد تسلسلي عبر importSeries حتى بلوغ target.
 * يرفض الإقلاع لو كانت مهمة لنفس المصدر تعمل.
 */
export function startEnBulkImport(
  sourceKey: string,
  target: number,
): { ok: boolean; reason?: "unknown_source" | "disabled" | "already_running"; state?: EnImportJobState } {
  if (!EN_SOURCE_KEYS.includes(sourceKey as EnSourceKey)) {
    return { ok: false, reason: "unknown_source" };
  }
  const scraper = getScraper(sourceKey);
  if (!scraper || !scraper.enabled) return { ok: false, reason: "disabled" };
  const existing = jobs.get(sourceKey as EnSourceKey);
  if (existing?.running) return { ok: false, reason: "already_running", state: existing };

  const capped = Math.max(1, Math.min(Math.round(target), 1200));
  const state = freshState(capped);
  jobs.set(sourceKey as EnSourceKey, state);
  void runEnBulkImport(sourceKey as EnSourceKey);
  return { ok: true, state };
}

/** حالة مهام الاستيراد الجماعي للمصادر الإنجليزية الثلاثة */
export function enImportStatus(): Record<EnSourceKey, EnImportJobState | null> {
  return {
    mangadex: jobs.get("mangadex") ?? null,
    asurascans: jobs.get("asurascans") ?? null,
    vortexscans: jobs.get("vortexscans") ?? null,
  };
}

/**
 * حذف مانجا وكل صفوفها التابعة بترتيب آمن للمفاتيح الأجنبية.
 * نفس نمط adminRouter.deleteManga مع تغطية الجداول الإضافية
 * (reports/communities تُصفَّر مراجعها، والبقية تُحذف أو تتبع cascade).
 */
export async function deleteMangaCascade(
  tx: Pick<ReturnType<typeof getDb>, "delete" | "update">,
  mangaId: number,
): Promise<void> {
  await tx.delete(readingProgress).where(eq(readingProgress.mangaId, mangaId));
  await tx.delete(comments).where(eq(comments.mangaId, mangaId));
  await tx.delete(ratings).where(eq(ratings.mangaId, mangaId));
  await tx.delete(favorites).where(eq(favorites.mangaId, mangaId));
  await tx.delete(follows).where(eq(follows.mangaId, mangaId));
  await tx.delete(userListItems).where(eq(userListItems.mangaId, mangaId));
  await tx.delete(communityMessages).where(eq(communityMessages.mangaId, mangaId));
  await tx.delete(updateRequests).where(eq(updateRequests.mangaId, mangaId));
  await tx
    .update(reports)
    .set({ mangaId: null })
    .where(eq(reports.mangaId, mangaId));
  await tx
    .update(communities)
    .set({ mangaId: null })
    .where(eq(communities.mangaId, mangaId));
  await tx.delete(chapters).where(eq(chapters.mangaId, mangaId));
  await tx.delete(manga).where(eq(manga.id, mangaId));
}

/**
 * تطهير كل المانجا +18 (كل المصادر — سياسة الموقع آمن للعائلة الآن):
 * يحذف المانجا والفصول وكل البيانات التابعة على دفعات، ويحدّث عدّادات المصادر.
 */
export async function purgeAdultManga(): Promise<{ deleted: number }> {
  const db = getDb();
  const rows = await db
    .select({ id: manga.id, sourceId: manga.sourceId })
    .from(manga)
    .where(eq(manga.isAdult, true));
  if (!rows.length) return { deleted: 0 };

  const affectedSources = new Set(rows.map((r) => r.sourceId));
  for (const row of rows) {
    await db.transaction((tx) => deleteMangaCascade(tx, row.id));
  }

  // حدّث عدّاد كل مصدر تأثر
  for (const sourceId of affectedSources) {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(manga)
      .where(eq(manga.sourceId, sourceId));
    await db
      .update(sources)
      .set({ mangaCount: Number(total) })
      .where(eq(sources.id, sourceId));
  }
  return { deleted: rows.length };
}

/** مرشّح where لمانجا المصادر الإنجليزية (join manga→sources) */
export function enSourceFilter() {
  return inArray(sources.name, [...EN_SOURCE_KEYS]);
}

/**
 * عكس enSourceFilter — يستبعد مصادر EN من الأقسام العربية (تظهر في /en فقط).
 * صيغة subquery على sourceId حتى تعمل بلا join على جدول sources.
 */
export function arabicSourceFilter() {
  return sql`${manga.sourceId} NOT IN (SELECT ${sources.id} FROM ${sources} WHERE ${sources.name} IN ('mangadex','asurascans','vortexscans'))`;
}
