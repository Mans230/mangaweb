import { errorLogs } from "@db/schema";
import { getDb } from "../queries/connection";

/**
 * يلتقط أخطاء الخادم (500) في جدول error_logs لعرضها في لوحة صحّة النظام.
 * best-effort: أي فشل هنا لا يُوقف الطلب ولا يُرمى للأعلى.
 * لا يُخزّن سوى آخر رسالة/أثر مقصوصين لتفادي تضخّم الجدول.
 */
export async function captureError(
  message: string,
  opts?: { path?: string; stack?: string; level?: string },
): Promise<void> {
  try {
    await getDb()
      .insert(errorLogs)
      .values({
        level: opts?.level ?? "error",
        path: opts?.path ? opts.path.slice(0, 200) : null,
        message: (message || "Unknown error").slice(0, 1000),
        stack: opts?.stack ? opts.stack.slice(0, 8000) : null,
      });
  } catch (e) {
    console.warn(`[error-log] فشل تسجيل الخطأ: ${(e as Error).message}`);
  }
}
