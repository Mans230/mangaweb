/**
 * رفع ملفات (صور/فيديو) — catbox.moe أولاً ثم uguu.se كاحتياطي تلقائي.
 *
 * catbox أوقف الرفع المجهول من عناوين الـ datacenter ("Invalid uploader").
 * الحل الدائم: أنشئ حساباً مجانياً على catbox.moe وانسخ الـ userhash من
 * https://catbox.moe/user/manage.php ثم اضبط المتغير CATBOX_USERHASH في Railway —
 * عندها يعود الرفع الدائم عبر catbox. بدونها يُستخدم uguu.se تلقائياً (دائم، بلا حساب).
 */
export async function uploadToCatbox(
  bytes: Uint8Array | Blob,
  filename: string,
): Promise<string> {
  const userhash = (process.env.CATBOX_USERHASH ?? "").trim();

  // 1) catbox — فقط عند توفر userhash (المجهول مرفوض حالياً من سيرفراتهم)
  if (userhash) {
    try {
      return await uploadCatbox(bytes, filename, userhash);
    } catch (e) {
      console.warn(`[upload] catbox فشل (${(e as Error).message}) — تجربة uguu.se`);
    }
  }

  // 2) uguu.se — احتياطي دائم بلا حساب
  return uploadUguu(bytes, filename);
}

async function uploadCatbox(
  bytes: Uint8Array | Blob,
  filename: string,
  userhash: string,
): Promise<string> {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("userhash", userhash);
  const blob =
    bytes instanceof Blob ? bytes : new Blob([bytes.buffer as ArrayBuffer]);
  form.append("fileToUpload", blob, filename);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let resp: Response;
  try {
    resp = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
  } catch (e) {
    const isAbort = (e as Error).name === "AbortError";
    throw new Error(
      isAbort ? "انتهت مهلة الرفع إلى catbox" : `فشل الاتصال بـ catbox: ${(e as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const body = (await resp.text()).trim();
  if (!resp.ok) {
    throw new Error(`catbox رد بخطأ ${resp.status}: ${body.slice(0, 200)}`);
  }
  if (!/^https:\/\/files\.catbox\.moe\/\S+$/.test(body)) {
    throw new Error(`رد غير متوقع من catbox: ${body.slice(0, 200)}`);
  }
  return body;
}

/** uguu.se — pomf-compatible، روابط دائمة، بلا حساب */
async function uploadUguu(
  bytes: Uint8Array | Blob,
  filename: string,
): Promise<string> {
  const form = new FormData();
  const blob =
    bytes instanceof Blob ? bytes : new Blob([bytes.buffer as ArrayBuffer]);
  form.append("files[]", blob, filename);
  form.append("output", "json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let resp: Response;
  try {
    resp = await fetch("https://uguu.se/upload.php", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
  } catch (e) {
    const isAbort = (e as Error).name === "AbortError";
    throw new Error(
      isAbort ? "انتهت مهلة الرفع إلى uguu.se" : `فشل الاتصال بـ uguu.se: ${(e as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await resp.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* يُعالج بالأسفل */
  }
  const url = data?.files?.[0]?.url;
  if (!resp.ok || !data?.success || typeof url !== "string" || !/^https:\/\//.test(url)) {
    throw new Error(`رد غير متوقع من uguu.se (${resp.status}): ${text.slice(0, 200)}`);
  }
  return url;
}
