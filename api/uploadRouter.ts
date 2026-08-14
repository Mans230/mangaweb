import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { uploadToCatbox } from "./lib/catbox";
import { checkRateLimit } from "./lib/rateLimit";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif"] as const;
const VIDEO_EXTS = ["mp4", "webm", "mov"] as const;

function extOf(filename: string): string {
  return (filename.split(".").pop() ?? "").toLowerCase();
}

function decodeBase64(data: string, maxBytes: number): Uint8Array {
  // base64 يتضخم ~4/3 — رفض مبكر قبل فك الترميز
  if (data.length > Math.ceil(maxBytes / 3) * 4 + 8) {
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: "الملف أكبر من الحد المسموح",
    });
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(data, "base64");
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "بيانات base64 غير صالحة" });
  }
  if (!buf.length || buf.length > maxBytes) {
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: "الملف أكبر من الحد المسموح",
    });
  }
  return new Uint8Array(buf);
}

function rateLimitOrThrow(key: string, limit: number, windowMs: number) {
  if (!checkRateLimit(key, limit, windowMs)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "رفعت ملفات كثيرة، جرب بعد شوية",
    });
  }
}

const imageInput = z.object({
  dataBase64: z.string().min(8),
  filename: z.string().trim().min(1).max(200),
});

export const uploadRouter = createRouter({
  /** رفع صورة (jpg/jpeg/png/webp/gif — حد 5MB) إلى catbox */
  uploadImage: authedQuery
    .input(imageInput)
    .mutation(async ({ ctx, input }) => {
      // حد صارم: 10 صور / 10 دقائق لكل مستخدم
      rateLimitOrThrow(`upload:image:${ctx.user.id}`, 10, 10 * 60 * 1000);
      if (!(IMAGE_EXTS as readonly string[]).includes(extOf(input.filename))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "صيغة الصورة غير مدعومة — المسموح: jpg, jpeg, png, webp, gif",
        });
      }
      const bytes = decodeBase64(input.dataBase64, MAX_IMAGE_BYTES);
      try {
        const url = await uploadToCatbox(bytes, input.filename);
        return { url };
      } catch (e) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: (e as Error).message,
        });
      }
    }),

  /** رفع فيديو (mp4/webm/mov — حد 200MB) إلى catbox */
  uploadVideo: authedQuery
    .input(imageInput)
    .mutation(async ({ ctx, input }) => {
      // حد صارم: 3 فيديوهات / ساعة لكل مستخدم
      rateLimitOrThrow(`upload:video:${ctx.user.id}`, 3, 60 * 60 * 1000);
      if (!(VIDEO_EXTS as readonly string[]).includes(extOf(input.filename))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "صيغة الفيديو غير مدعومة — المسموح: mp4, webm, mov",
        });
      }
      const bytes = decodeBase64(input.dataBase64, MAX_VIDEO_BYTES);
      try {
        const url = await uploadToCatbox(bytes, input.filename);
        return { url };
      } catch (e) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: (e as Error).message,
        });
      }
    }),
});
