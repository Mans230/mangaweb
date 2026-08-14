/**
 * رفع ملفات إلى catbox.moe — يعيد رابط الملف النصي (files.catbox.moe/...).
 * POST https://catbox.moe/user/api.php مع reqtype=fileupload و fileToUpload.
 */
export async function uploadToCatbox(
  bytes: Uint8Array,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append(
    "fileToUpload",
    new Blob([bytes.buffer as ArrayBuffer]),
    filename,
  );

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
