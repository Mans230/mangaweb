/**
 * تخزين دائم لصفحات الفصول على Cloudflare R2 (S3-compatible).
 * الهدف: القراءة تخدم من R2 ولا تلمس المصدر أبداً — مناعة ضد تغيّر تشفير
 * المصدر أو تعطّله أو انتهاء توكناته. يُعطَّل الميرور تلقائياً إن نقصت الإعدادات.
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

let client: S3Client | null = null;

/** هل الميرور مُفعّل (كل مفاتيح R2 موجودة)؟ */
export function mirrorEnabled(): boolean {
  return !!(
    env.r2AccountId &&
    env.r2AccessKeyId &&
    env.r2SecretAccessKey &&
    env.r2Bucket &&
    env.r2PublicUrl
  );
}

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
      },
    });
  }
  return client;
}

/** هل الرابط مُخزَّن عندنا على R2 بالفعل؟ */
export function isMirrored(url: string): boolean {
  return !!env.r2PublicUrl && url.startsWith(env.r2PublicUrl);
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/** يرفع بايتات صورة إلى R2 تحت مفتاح ويعيد رابطها العام. */
export async function putImage(
  key: string,
  data: Buffer,
  ext: string,
): Promise<string> {
  const contentType = MIME_BY_EXT[ext.toLowerCase()] ?? "image/jpeg";
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return `${env.r2PublicUrl}/${key}`;
}
