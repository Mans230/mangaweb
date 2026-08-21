import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { errorLogs } from "@db/schema";
import { getDb } from "../queries/connection";

/**
 * يبني بصمة تجميع للأخطاء المتشابهة: نُطبّع الرسالة (نحذف الأرقام/الهيكس/
 * الـ UUID/الروابط التي تختلف بين الحالات) ونأخذ أعلى إطار من الـ stack،
 * ثم hash ثابت. هكذا تُجمَّع مئات التكرارات في صفٍّ واحد بعدّاد.
 */
export function computeFingerprint(
  level: string,
  message: string,
  stack?: string,
): string {
  const normMsg = (message || "unknown")
    .replace(/0x[0-9a-f]+/gi, "0x*")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "*")
    .replace(/https?:\/\/[^\s"')]+/gi, "*url*")
    .replace(/\d+/g, "#")
    .trim()
    .slice(0, 300);
  const topFrame =
    stack
      ?.split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("at ")) ?? "";
  const normFrame = topFrame
    .replace(/:\d+:\d+/g, "")
    .replace(/\d+/g, "#");
  return createHash("sha1")
    .update(`${level}\n${normMsg}\n${normFrame}`)
    .digest("hex")
    .slice(0, 64);
}

/**
 * يلتقط أخطاء الخادم (500) وأخطاء العميل في جدول error_logs لعرضها في لوحة
 * صحّة النظام. مُجمّع حسب البصمة: نفس الخطأ يزيد العدّاد بدل إنشاء صفّ جديد.
 * best-effort: أي فشل هنا لا يُوقف الطلب ولا يُرمى للأعلى.
 * لا يُخزّن سوى آخر رسالة/أثر مقصوصين لتفادي تضخّم الجدول.
 */
export async function captureError(
  message: string,
  opts?: {
    path?: string;
    stack?: string;
    level?: string;
    /** رابط الصفحة (لأخطاء العميل) — يُخزَّن في path */
    url?: string;
    /** User-Agent (لأخطاء العميل) — يُضاف كبادئة للأثر */
    userAgent?: string;
  },
): Promise<void> {
  try {
    const level = opts?.level ?? "error";
    const msg = (message || "Unknown error").slice(0, 1000);
    const path = (opts?.url ?? opts?.path)?.slice(0, 200) ?? null;
    let stack = opts?.stack ?? null;
    if (opts?.userAgent) {
      stack = `UA: ${opts.userAgent}\n${stack ?? ""}`;
    }
    stack = stack ? stack.slice(0, 8000) : null;
    const fingerprint = computeFingerprint(level, msg, opts?.stack);

    await getDb()
      .insert(errorLogs)
      .values({ fingerprint, level, status: "open", count: 1, path, message: msg, stack })
      .onDuplicateKeyUpdate({
        set: {
          count: sql`${errorLogs.count} + 1`,
          lastSeenAt: sql`now()`,
          message: msg,
          stack,
          path,
          level,
        },
      });
  } catch (e) {
    console.warn(`[error-log] فشل تسجيل الخطأ: ${(e as Error).message}`);
  }
}
