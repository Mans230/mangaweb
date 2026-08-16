/**
 * مصادقة Telegram Login Widget — بناء جديد من الصفر.
 *
 * المرجع: https://core.telegram.org/widgets/login#checking-authorization
 * 1) data-check-string: كل الحقول (ما عدا hash) مرتبة أبجدياً بصيغة key=value ومفصولة بـ \n
 * 2) secret = SHA256(bot_token)
 * 3) hash === HMAC_SHA256(secret, data-check-string)  (مقارنة timing-safe)
 * 4) auth_date لا يتجاوز 24 ساعة (حماية من إعادة التشغيل)
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

/** مخطط الحمولة القادمة من ودجت تليجرام (يُستخدم في auth.telegramLogin) */
export const telegramWidgetSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().max(128).optional(),
  last_name: z.string().max(128).optional(),
  username: z.string().max(64).optional(),
  photo_url: z.string().url().max(600).optional(),
  auth_date: z.number().int().positive(),
  hash: z.string().length(64),
});

export type TelegramWidgetPayload = z.infer<typeof telegramWidgetSchema>;

/** أقصى عمر مقبول للتوقيع — 24 ساعة */
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

/** يبني data-check-string بالترتيب الأبجدي الإلزامي */
function buildCheckString(payload: TelegramWidgetPayload): string {
  return Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

export type TelegramVerifyResult =
  | { ok: true }
  | { ok: false; reason: "stale" | "bad_signature" | "malformed" };

/** يتحقق من توقيع الحمولة وحداثتها — النتيجة مفصّلة لتسهيل التشخيص في اللوجز */
export function verifyTelegramWidget(
  payload: TelegramWidgetPayload,
  botToken: string,
): TelegramVerifyResult {
  if (!botToken || !payload?.hash || !payload.id || !payload.auth_date) {
    return { ok: false, reason: "malformed" };
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - Number(payload.auth_date);
  if (ageSeconds < -300 || ageSeconds > MAX_AUTH_AGE_SECONDS) {
    return { ok: false, reason: "stale" };
  }

  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(buildCheckString(payload)).digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(payload.hash, "hex");
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}

/** اسم العرض من بيانات تليجرام: الاسم الكامل ثم username ثم tg_<id> */
export function telegramDisplayName(p: TelegramWidgetPayload): string {
  return (
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    (p.username ? `@${p.username}` : "") ||
    `tg_${p.id}`
  );
}
