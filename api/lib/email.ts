import tls from "node:tls";
import net from "node:net";
import { env } from "./env";

/** سطر واحد من استجابة SMTP: { code, text, done } */
interface SmtpReply {
  code: number;
  text: string;
}

/** عميل SMTP مصغّر بدون اعتماديات — يدعم smtps:// (TLS ضمني) و smtp:// (STARTTLS) */
async function smtpSend(
  smtpUrl: string,
  msg: { from: string; to: string; subject: string; text: string },
): Promise<void> {
  const url = new URL(smtpUrl);
  const host = url.hostname;
  const user = decodeURIComponent(url.username);
  const pass = decodeURIComponent(url.password);
  const implicitTls = url.protocol === "smtps:";
  const port = Number(url.port) || (implicitTls ? 465 : 587);

  let buffer = "";
  let resolver: ((r: SmtpReply) => void) | null = null;

  const waitReply = (): Promise<SmtpReply> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SMTP timeout")), 20000);
      resolver = (r) => {
        clearTimeout(timer);
        resolve(r);
      };
    });

  const onData = (chunk: Buffer): void => {
    buffer += chunk.toString("utf8");
    // رسائل SMTP قد تكون متعددة الأسطر: "250-..." ثم "250 ..."
    const m = buffer.match(/^(\d{3})[ -]((?:.|\r?\n(?!^\d{3} ))*?)\r?\n/);
    if (m && resolver) {
      const r = { code: Number(m[1]), text: buffer.trim() };
      buffer = "";
      resolver(r);
    }
  };

  let socket: tls.TLSSocket = implicitTls
    ? tls.connect({ host, port, servername: host })
    : (net.connect({ host, port }) as unknown as tls.TLSSocket);
  socket.setEncoding("utf8");
  socket.on("data", onData);

  const send = (line: string): void => {
    socket.write(line + "\r\n");
  };
  const expect = async (cmd: string | null, ok: number[]): Promise<SmtpReply> => {
    if (cmd !== null) send(cmd);
    const r = await waitReply();
    if (!ok.includes(r.code)) throw new Error(`SMTP ${cmd ?? "greeting"}: ${r.text}`);
    return r;
  };

  try {
    await expect(null, [220]); // الترحيب
    await expect(`EHLO zekospace`, [250]);

    if (!implicitTls) {
      await expect("STARTTLS", [220]);
      // ترقية الاتصال إلى TLS
      await new Promise<void>((resolve, reject) => {
        socket = tls.connect(
          { socket, host, servername: host },
          () => resolve(),
        );
        socket.on("data", onData);
        socket.on("error", reject);
      });
      await expect(`EHLO zekospace`, [250]);
    }

    // AUTH LOGIN
    await expect("AUTH LOGIN", [334]);
    await expect(Buffer.from(user).toString("base64"), [334]);
    await expect(Buffer.from(pass).toString("base64"), [235]);

    // msg.from بصيغة "Name <email>" أو بريد صرف — MAIL FROM يتطلب البريد وحده
    const fromMatch = msg.from.match(/<([^>]+)>/);
    const fromEmail = (fromMatch ? fromMatch[1] : msg.from).trim();
    const fromHeader = msg.from;
    await expect(`MAIL FROM:<${fromEmail}>`, [250]);
    await expect(`RCPT TO:<${msg.to}>`, [250, 251]);
    await expect("DATA", [354]);

    const headers = [
      `From: ${fromHeader}`,
      `To: ${msg.to}`,
      `Subject: =?UTF-8?B?${Buffer.from(msg.subject, "utf8").toString("base64")}?=`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: base64",
    ];
    const body = Buffer.from(msg.text, "utf8").toString("base64");
    // إنهاء جسم الرسالة بسطر نقطة
    await expect(headers.join("\r\n") + "\r\n\r\n" + body + "\r\n.", [250]);
    send("QUIT");
  } finally {
    socket.end();
  }
}

/**
 * إرسال بريد عبر SMTP لو توفّر SMTP_URL، وإلا يُسجَّل في اللوج.
 * يعيد true لو أُرسل فعلياً عبر SMTP.
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
    // Gmail يرفض From مختلف عن الحساب — نستخدم نفس مستخدم SMTP افتراضياً
    const smtpUser = decodeURIComponent(new URL(env.smtpUrl).username);
    const from =
      process.env.MAIL_FROM ??
      (smtpUser.includes("@") ? `Zeko Space <${smtpUser}>` : `Zeko <no-reply@${new URL(env.siteUrl || "https://zekospace.com").hostname}>`);
    await smtpSend(env.smtpUrl, { from, to, subject, text });
    return true;
  } catch (e) {
    console.error(`[email] فشل الإرسال عبر SMTP: ${(e as Error).message}`);
    console.log(`[email] بريد إلى ${to}: ${subject}\n${text}`);
    return false;
  }
}
