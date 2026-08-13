import type { Context } from "hono";
import { z } from "zod";
import { consumeLinkCode } from "./linkCodes";
import {
  findUserById,
  findUserByTelegramId,
  linkTelegramToUser,
} from "../queries/users";

const bodySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  telegramId: z.union([z.string(), z.number()]).transform(String),
  username: z.string().optional(),
});

function isDuplicateEntry(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "ER_DUP_ENTRY"
  );
}

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
    const userId = await consumeLinkCode(code);
    if (!userId) {
      return c.json({ error: "Invalid or expired code" }, 400);
    }

    const user = await findUserById(userId);
    if (!user) {
      return c.json({ error: "User not found" }, 400);
    }

    // One-link rule: user already linked to a *different* Telegram account
    if (user.telegramId && user.telegramId !== telegramId) {
      return c.json(
        { error: "This account is already linked to another Telegram account. Unlink it first." },
        409,
      );
    }

    // One-link rule: this Telegram account belongs to a different user
    const existing = await findUserByTelegramId(telegramId);
    if (existing && Number(existing.id) !== userId) {
      return c.json(
        { error: "This Telegram account is already linked to another user" },
        409,
      );
    }

    try {
      await linkTelegramToUser(userId, telegramId, username);
    } catch (err) {
      if (isDuplicateEntry(err)) {
        return c.json(
          { error: "This Telegram account is already linked to another user" },
          409,
        );
      }
      throw err;
    }
    return c.json({ success: true, userId });
  };
}
