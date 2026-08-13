import type { Context } from "hono";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { users } from "@db/schema";
import { getDb } from "../queries/connection";
import { findUserByTelegramId } from "../queries/users";

const bodySchema = z.object({
  telegramId: z.union([z.string(), z.number()]).transform(String),
});

/**
 * POST /api/auth/telegram-reset
 * يستدعيه بوت تيليجرام الخارجي مع { telegramId } لاستعادة كلمة المرور.
 * يولّد كلمة مرور مؤقتة عشوائية، يخزّن bcrypt hash (12 rounds)، ويعيدها
 * للبوت ليرسلها للمستخدم داخل تيليجرام.
 * إن كانت LINK_API_SECRET مضبوطة يجب إرسالها في ترويسة `x-link-secret`.
 */
export function telegramResetHandler() {
  return async (c: Context) => {
    const secret = process.env.LINK_API_SECRET ?? "";
    if (secret && c.req.header("x-link-secret") !== secret) {
      return c.json({ error: "Forbidden" }, 403);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid payload" }, 400);
    }

    const user = await findUserByTelegramId(parsed.data.telegramId);
    if (!user) {
      return c.json({ error: "No linked account" }, 404);
    }

    // كلمة مرور مؤقتة: 10 أحرف base64url عشوائية
    const tempPassword = randomBytes(8).toString("base64url").slice(0, 10);
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await getDb()
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, user.id));

    return c.json({ success: true, tempPassword });
  };
}
