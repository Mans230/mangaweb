import { and, desc, eq } from "drizzle-orm";
import { sessions } from "@db/schema";
import { getDb } from "../queries/connection";
import { clientIp } from "./rateLimit";

/** تحديث lastSeenAt كحد أقصى مرة كل 60 ثانية لكل جلسة */
const TOUCH_THROTTLE_MS = 60 * 1000;

/** تسجيل جلسة جديدة في جدول sessions عند أي تسجيل دخول */
export async function recordSession(
  userId: number,
  token: string,
  req: Request,
): Promise<void> {
  try {
    await getDb()
      .insert(sessions)
      .values({
        userId,
        token,
        userAgent: (req.headers.get("user-agent") ?? "").slice(0, 500) || null,
        ip: clientIp(req),
      });
  } catch (e) {
    // لا نُفشل تسجيل الدخول لو فشل تسجيل الجلسة
    console.warn(`[sessions] recordSession failed: ${(e as Error).message}`);
  }
}

/** التحقق من أن الجلسة ما زالت قائمة (لم تُلغَ) + تحديث lastSeenAt بشكل مخنوق */
export async function touchSession(token: string): Promise<boolean> {
  const db = getDb();
  const row = await db.query.sessions.findFirst({
    where: eq(sessions.token, token),
  });
  if (!row) return false;
  if (Date.now() - new Date(row.lastSeenAt).getTime() > TOUCH_THROTTLE_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, row.id));
  }
  return true;
}

/** حذف جلسة بالتوكن (logout) */
export async function deleteSessionByToken(token: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.token, token));
}

/** قائمة جلسات مستخدم — الأحدث نشاطاً أولاً، مع تعليم الجلسة الحالية */
export async function listUserSessions(userId: number, currentToken?: string) {
  const rows = await getDb()
    .select({
      id: sessions.id,
      token: sessions.token,
      userAgent: sessions.userAgent,
      ip: sessions.ip,
      lastSeenAt: sessions.lastSeenAt,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.lastSeenAt));
  return rows.map(({ token, ...r }) => ({
    ...r,
    current: currentToken !== undefined && token === currentToken,
  }));
}

/** إلغاء جلسة يملكها المستخدم */
export async function revokeUserSession(
  userId: number,
  sessionId: number,
): Promise<boolean> {
  const db = getDb();
  const row = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, userId)),
  });
  if (!row) return false;
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  return true;
}
