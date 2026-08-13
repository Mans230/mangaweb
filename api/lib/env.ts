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
};

if (!env.jwtSecret) {
  if (env.isProduction) {
    throw new Error("Missing required environment variable: JWT_SECRET");
  }
  env.jwtSecret = "zeko-dev-secret";
  console.warn("[env] JWT_SECRET not set — using insecure development secret.");
}
