/**
 * Database-backed store for Telegram account-linking codes.
 * A logged-in user requests a 6-digit code, sends it to the Telegram bot,
 * and the bot calls /api/link/verify with { code, telegramId, username }.
 * Codes live in the `link_codes` table so they survive redeploys.
 */
import { eq, lt, or } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "../queries/connection";

const TTL_MS = 10 * 60 * 1000; // 10 minutes

function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createLinkCode(userId: number): Promise<{
  code: string;
  expiresAt: number;
}> {
  const db = getDb();
  // Invalidate previous codes for this user + opportunistically sweep expired ones
  await db
    .delete(schema.linkCodes)
    .where(
      or(
        eq(schema.linkCodes.userId, userId),
        lt(schema.linkCodes.expiresAt, new Date()),
      ),
    );

  const expiresAt = Date.now() + TTL_MS;
  // Retry a few times in the unlikely event of a code collision (PK)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      await db
        .insert(schema.linkCodes)
        .values({ code, userId, expiresAt: new Date(expiresAt) });
      return { code, expiresAt };
    } catch (err) {
      const isDup =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "ER_DUP_ENTRY";
      if (!isDup) throw err;
    }
  }
  throw new Error("Failed to allocate a unique link code");
}

export async function consumeLinkCode(code: string): Promise<number | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.linkCodes)
    .where(eq(schema.linkCodes.code, code))
    .limit(1);
  const entry = rows.at(0);
  if (!entry) return null;
  // Single-use: always delete once consumed
  await db
    .delete(schema.linkCodes)
    .where(eq(schema.linkCodes.code, entry.code));
  if (entry.expiresAt.getTime() < Date.now()) return null;
  return Number(entry.userId);
}
