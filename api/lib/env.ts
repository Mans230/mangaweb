import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: process.env.JWT_SECRET || "",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME ?? "",
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  adminTelegramIds: (process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  siteUrl: (process.env.SITE_URL ?? "").replace(/\/$/, ""),
  smtpUrl: process.env.SMTP_URL ?? "",
  // Cloudflare R2 — mirroring دائم لصفحات الفصول (اختياري؛ يُعطَّل الميرور إن نقص أي منها)
  r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  r2Bucket: process.env.R2_BUCKET ?? "",
  r2PublicUrl: (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, ""),
};

if (!env.jwtSecret) {
  if (env.isProduction) {
    throw new Error("Missing required environment variable: JWT_SECRET");
  }
  env.jwtSecret = "zeko-dev-secret";
  console.warn("[env] JWT_SECRET not set — using insecure development secret.");
}
