/**
 * تحديد معدل بسيط في الذاكرة (in-memory) لحماية إجراءات auth الحساسة.
 * Map<key, timestamps[]> — بدون اعتماديات خارجية.
 */

const buckets = new Map<string, number[]>();

/** تنظيف كسول حتى لا يتضخم الـ Map مع الوقت */
let lastSweep = Date.now();
function sweep(windowMs: number) {
  const now = Date.now();
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, stamps] of buckets) {
    const fresh = stamps.filter((t) => now - t < windowMs);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}

/**
 * يعيد true إذا كانت المحاولة ضمن الحد، ويسجّلها.
 * لكل إجراء key مستقل (مثلاً `login:1.2.3.4`).
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  sweep(windowMs);
  const now = Date.now();
  const stamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (stamps.length >= limit) {
    buckets.set(key, stamps);
    return false;
  }
  stamps.push(now);
  buckets.set(key, stamps);
  return true;
}

/** استخراج IP العميل: أول قيمة من x-forwarded-for، ثم socket كـ fallback */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  // fallback: raw node socket إن توفّر (hono node-server)
  const maybeSocket = (
    req as unknown as { socket?: { remoteAddress?: string } }
  ).socket;
  return maybeSocket?.remoteAddress ?? "unknown";
}
