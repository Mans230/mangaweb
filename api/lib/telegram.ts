import { createHash, createHmac, timingSafeEqual } from "crypto";

export type TelegramAuthData = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

/**
 * Verifies Telegram Login Widget payload.
 * secret_key = SHA256(bot_token), then HMAC-SHA256(secret_key, data_check_string)
 * must equal the provided hash.
 * See https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramAuth(
  data: TelegramAuthData,
  botToken: string,
  maxAgeSeconds = 60 * 60 * 24,
): boolean {
  if (!botToken || !data.hash || !data.id || !data.auth_date) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(data.auth_date)) > maxAgeSeconds) {
    return false;
  }

  const checkString = Object.entries(data)
    .filter(([key, value]) => key !== "hash" && value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const computed = createHmac("sha256", secretKey)
    .update(checkString)
    .digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(data.hash, "hex");
  } catch {
    return false;
  }

  return (
    provided.length === computed.length && timingSafeEqual(provided, computed)
  );
}
