import { adminLogs } from "@db/schema";
import { getDb } from "../queries/connection";

/** تسجيل عملية أدمن في admin_logs — لا يُفشل العملية الأصلية عند الخطأ */
export async function logAdminAction(
  adminId: number,
  action: string,
  opts: {
    targetType?: string;
    targetId?: string | number;
    meta?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    await getDb()
      .insert(adminLogs)
      .values({
        adminId,
        action,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId !== undefined ? String(opts.targetId) : null,
        meta: opts.meta ?? null,
      });
  } catch (e) {
    console.warn(`[admin-logs] فشل تسجيل ${action}: ${(e as Error).message}`);
  }
}
