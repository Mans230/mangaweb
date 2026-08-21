import { eq, sql } from "drizzle-orm";
import { sources } from "@db/schema";
import { getDb } from "../queries/connection";

/**
 * تسجيل نتيجة دورة سكرابنغ لمصدر (بالاسم — فريد في جدول sources).
 * ينجح بصمت لو غاب المصدر أو فشل التحديث حتى لا يُوقف السكراب نفسه.
 *
 * ok=true  ⇒ lastRunAt=now, lastSuccessAt=now, successCount+1, lastError=null
 * ok=false ⇒ lastRunAt=now, errorCount+1, lastError=<الرسالة مقصوصة>
 */
export async function recordSourceHealth(
  name: string,
  ok: boolean,
  error?: string,
): Promise<void> {
  try {
    const db = getDb();
    if (ok) {
      await db
        .update(sources)
        .set({
          lastRunAt: new Date(),
          lastSuccessAt: new Date(),
          successCount: sql`${sources.successCount} + 1`,
          lastError: null,
        })
        .where(eq(sources.name, name));
    } else {
      await db
        .update(sources)
        .set({
          lastRunAt: new Date(),
          errorCount: sql`${sources.errorCount} + 1`,
          lastError: (error ?? "").slice(0, 1000),
        })
        .where(eq(sources.name, name));
    }
  } catch (e) {
    console.warn(`[source-health] ${name}: ${(e as Error).message}`);
  }
}
