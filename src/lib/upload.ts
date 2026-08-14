/**
 * رفع الملفات من الجهاز عبر الباكند (catbox) — صور (5MB) وفيديو (200MB).
 * يحوّل الملف إلى base64 ويرسله عبر upload.uploadImage / upload.uploadVideo
 * مع مؤشر تقدّم بسيط وترجمة رسائل الأخطاء للعربية.
 */
import { useRef, useState } from "react";
import { trpc } from "@/providers/trpc";

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

/** يحوّل ملفاً إلى base64 خام (بدون بادئة data:). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذّر قراءة الملف"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/** يترجم رسائل أخطاء الرفع الشائعة لرسالة عربية ودودة. */
export function translateUploadError(message?: string): string {
  const m = message ?? "";
  if (!m) return "فشل الرفع — حاول مرة أخرى";
  if (/PAYLOAD_TOO_LARGE|أكبر من الحد/.test(m)) return "الملف أكبر من الحد المسموح";
  if (/TOO_MANY_REQUESTS|كثيرة/.test(m)) return "رفعت ملفات كثيرة — جرّب بعد قليل";
  if (/غير مدعومة|غير مدعوم/.test(m)) return m;
  if (/UNAUTHORIZED|سجّل/.test(m)) return "سجّل الدخول أولاً لرفع الملفات";
  return m.length <= 120 ? m : "فشل الرفع — حاول مرة أخرى";
}

interface UploadState {
  uploading: boolean;
  /** 0..100 أثناء الرفع، null عند الخمول */
  progress: number | null;
  error: string | null;
}

/**
 * رفع مباشر multipart إلى POST /api/upload (حقل "file") — للفيديو والملفات
 * الكبيرة حيث يفشل base64 عبر tRPC. تقدّم حقيقي عبر xhr.upload.onprogress،
 * والمصادقة بكوكي الجلسة. يعيد {url} أو يرمي خطأً مترجماً من {error}.
 */
export function uploadFileDirect(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.withCredentials = true; // كوكي الجلسة
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      let data: { url?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText || "{}") as { url?: string; error?: string };
      } catch {
        /* رد غير JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.url) {
        resolve(data.url);
      } else {
        reject(new Error(translateUploadError(data.error ?? `HTTP ${xhr.status}`)));
      }
    };
    xhr.onerror = () => reject(new Error("فشل الاتصال بالخادم أثناء الرفع — تحقق من الشبكة"));
    xhr.onabort = () => reject(new Error("أُلغي الرفع"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

/**
 * هوك رفع مباشر (صورة ≤5MB أو فيديو ≤200MB) عبر /api/upload بتقدّم حقيقي.
 * يفضّل للملفات الكبيرة؛ دوال tRPC القديمة تبقى للصور الصغيرة.
 */
export function useDirectUpload(kind: "image" | "video") {
  const [state, setState] = useState<UploadState>({
    uploading: false,
    progress: null,
    error: null,
  });

  const upload = async (file: File): Promise<string | null> => {
    const types = kind === "image" ? IMAGE_TYPES : VIDEO_TYPES;
    const max = kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
    if (!types.includes(file.type)) {
      setState({
        uploading: false,
        progress: null,
        error:
          kind === "image"
            ? "صيغة الصورة غير مدعومة — المسموح: jpg, png, webp, gif"
            : "صيغة الفيديو غير مدعومة — المسموح: mp4, webm, mov",
      });
      return null;
    }
    if (file.size > max) {
      setState({
        uploading: false,
        progress: null,
        error: kind === "image" ? "الصورة أكبر من 5MB" : "الفيديو أكبر من 200MB",
      });
      return null;
    }
    setState({ uploading: true, progress: 0, error: null });
    try {
      const url = await uploadFileDirect(file, (pct) =>
        setState((s) => (s.uploading ? { ...s, progress: pct } : s)),
      );
      setState({ uploading: false, progress: 100, error: null });
      return url;
    } catch (e) {
      setState({
        uploading: false,
        progress: null,
        error: translateUploadError((e as Error).message),
      });
      return null;
    }
  };

  return { upload, ...state };
}

function useUploadBase() {
  const [state, setState] = useState<UploadState>({
    uploading: false,
    progress: null,
    error: null,
  });
  const timerRef = useRef<number | null>(null);

  const start = () => {
    setState({ uploading: true, progress: 5, error: null });
    // تقدّم تقديري حتى 90% — لا يوجد progress حقيقي مع base64 عبر HTTP
    let value = 5;
    timerRef.current = window.setInterval(() => {
      value = Math.min(90, value + Math.max(1, (90 - value) * 0.08));
      setState((s) => (s.uploading ? { ...s, progress: Math.round(value) } : s));
    }, 250);
  };

  const stop = (error: string | null) => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setState({ uploading: false, progress: error ? null : 100, error });
  };

  return { state, start, stop };
}

/** رفع صورة (jpg/png/webp/gif — 5MB) ويعيد رابطها من catbox. */
export function useImageUpload() {
  const { state, start, stop } = useUploadBase();
  const mut = trpc.upload.uploadImage.useMutation();

  const upload = async (file: File): Promise<string | null> => {
    if (!IMAGE_TYPES.includes(file.type)) {
      stop("صيغة الصورة غير مدعومة — المسموح: jpg, png, webp, gif");
      return null;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      stop("الصورة أكبر من 5MB");
      return null;
    }
    start();
    try {
      const dataBase64 = await fileToBase64(file);
      const { url } = await mut.mutateAsync({ dataBase64, filename: file.name });
      stop(null);
      return url;
    } catch (e) {
      stop(translateUploadError((e as Error).message));
      return null;
    }
  };

  return { upload, ...state };
}

/** رفع فيديو (mp4/webm/mov — 200MB) ويعيد رابطه من catbox. */
export function useVideoUpload() {
  const { state, start, stop } = useUploadBase();
  const mut = trpc.upload.uploadVideo.useMutation();

  const upload = async (file: File): Promise<string | null> => {
    if (!VIDEO_TYPES.includes(file.type)) {
      stop("صيغة الفيديو غير مدعومة — المسموح: mp4, webm, mov");
      return null;
    }
    if (file.size > VIDEO_MAX_BYTES) {
      stop("الفيديو أكبر من 200MB");
      return null;
    }
    start();
    try {
      const dataBase64 = await fileToBase64(file);
      const { url } = await mut.mutateAsync({ dataBase64, filename: file.name });
      stop(null);
      return url;
    } catch (e) {
      stop(translateUploadError((e as Error).message));
      return null;
    }
  };

  return { upload, ...state };
}
