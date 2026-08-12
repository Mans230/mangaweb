import type { CookieOptions } from "hono/utils/cookie";
import { env } from "./env";

/**
 * خيارات كوكي الجلسة — يجب أن تتطابق السمات (path/sameSite/secure)
 * بين الإنشاء والمسح حتى يلتزم المتصفح بحذف الكوكي فعلياً.
 *
 * `secure` يُحدَّد من ترويسة `x-forwarded-proto` (بروكسي Railway) أول قيمة،
 * مع الرجوع إلى `env.isProduction` عند غيابها (تطوير محلي مباشر).
 */
export function getSessionCookieOptions(headers: Headers): CookieOptions {
  const forwardedProto = headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  const secure = forwardedProto ? forwardedProto === "https" : env.isProduction;

  return {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure,
  };
}
