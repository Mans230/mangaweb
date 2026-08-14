import { env } from "./env";

/**
 * إرسال بريد عبر SMTP لو توفّر SMTP_URL (يتطلب حزمة nodemailer اختيارياً)،
 * وإلا يُسجَّل في اللوج. يعيد true لو أُرسل فعلياً عبر SMTP.
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<boolean> {
  if (!env.smtpUrl) {
    console.log(`[email] SMTP_URL غير مضبوط — بريد إلى ${to}: ${subject}\n${text}`);
    return false;
  }
  try {
    // nodemailer اعتمادية اختيارية — تحميل ديناميكي حتى لا يفشل البناء بدونها
    const load = new Function("m", "return import(m)") as (
      m: string,
    ) => Promise<{
      default?: {
        createTransport: (url: string) => {
          sendMail: (msg: {
            from: string;
            to: string;
            subject: string;
            text: string;
          }) => Promise<unknown>;
        };
      };
      createTransport?: (url: string) => {
        sendMail: (msg: {
          from: string;
          to: string;
          subject: string;
          text: string;
        }) => Promise<unknown>;
      };
    }>;
    const mod = await load("nodemailer");
    const createTransport = mod.default?.createTransport ?? mod.createTransport;
    if (!createTransport) throw new Error("nodemailer غير متوفرة");
    const transport = createTransport(env.smtpUrl);
    const from =
      process.env.MAIL_FROM ?? `Zeko <no-reply@${new URL(env.siteUrl || "https://zekospace.com").hostname}>`;
    await transport.sendMail({ from, to, subject, text });
    return true;
  } catch (e) {
    console.error(`[email] فشل الإرسال عبر SMTP: ${(e as Error).message}`);
    console.log(`[email] بريد إلى ${to}: ${subject}\n${text}`);
    return false;
  }
}
