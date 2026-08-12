/**
 * Temporary in-memory store for Telegram account-linking codes.
 * A logged-in user requests a 6-digit code, sends it to the Telegram bot,
 * and the bot calls /api/link/verify with { code, telegramId, username }.
 */
type LinkCodeEntry = {
  userId: number;
  expiresAt: number;
};

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const codes = new Map<string, LinkCodeEntry>();

function sweep() {
  const now = Date.now();
  for (const [code, entry] of codes) {
    if (entry.expiresAt < now) codes.delete(code);
  }
}

export function createLinkCode(userId: number): {
  code: string;
  expiresAt: number;
} {
  sweep();
  // Invalidate previous codes for this user
  for (const [code, entry] of codes) {
    if (entry.userId === userId) codes.delete(code);
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + TTL_MS;
  codes.set(code, { userId, expiresAt });
  return { code, expiresAt };
}

export function consumeLinkCode(code: string): number | null {
  sweep();
  const entry = codes.get(code);
  if (!entry) return null;
  codes.delete(code);
  return entry.userId;
}
