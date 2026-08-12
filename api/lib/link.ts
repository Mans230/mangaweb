import type { Context } from "hono";
import { z } from "zod";
import { consumeLinkCode } from "./linkCodes";
import { findUserByTelegramId, linkTelegramToUser } from "../queries/users";

const bodySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  telegramId: z.union([z.string(), z.number()]).transform(String),
  username: z.string().optional(),
});

/**
 * POST /api/link/verify
 * Called by the external Telegram bot with { code, telegramId, username }
 * after a user submits their 6-digit link code to the bot.
 * If LINK_API_SECRET is set, the bot must send it in the `x-link-secret` header.
 */
export function linkVerifyHandler() {
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

    const { code, telegramId, username } = parsed.data;
    const userId = consumeLinkCode(code);
    if (!userId) {
      return c.json({ error: "Invalid or expired code" }, 400);
    }

    const existing = await findUserByTelegramId(telegramId);
    if (existing && Number(existing.id) !== userId) {
      return c.json(
        { error: "This Telegram account is already linked to another user" },
        409,
      );
    }

    await linkTelegramToUser(userId, telegramId, username);
    return c.json({ success: true, userId });
  };
}
