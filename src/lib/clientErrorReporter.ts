/**
 * يلتقط أخطاء JS غير المُمسكة في المتصفح (window.error + unhandledrejection)
 * ويرسلها إلى /api/client-error. مع منع الإغراق: بصمة محليّة لكل خطأ +
 * سقف لكل جلسة، وتجاهل صامت لأي فشل شبكي (حتى لا يتكرر الخطأ ذاتياً).
 */

const seen = new Set<string>();
const MAX_PER_SESSION = 20;
let sent = 0;

function fingerprint(message: string, stack?: string): string {
  const firstFrame = stack?.split("\n").find((l) => l.trim().startsWith("at ")) ?? "";
  return `${message}|${firstFrame}`.slice(0, 300);
}

function report(message: string, stack?: string, extra?: { source?: string; line?: number; col?: number }) {
  if (!message || sent >= MAX_PER_SESSION) return;
  const fp = fingerprint(message, stack);
  if (seen.has(fp)) return;
  seen.add(fp);
  sent++;
  try {
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message.slice(0, 1000),
        stack: stack?.slice(0, 8000),
        url: location.href,
        source: extra?.source,
        line: extra?.line,
        col: extra?.col,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* تجاهل صامت */
  }
}

let installed = false;

export function installClientErrorReporter() {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (e) => {
    const err = e.error as Error | undefined;
    report(err?.message || e.message || "Uncaught error", err?.stack, {
      source: e.filename,
      line: e.lineno,
      col: e.colno,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason as unknown;
    if (reason instanceof Error) {
      report(reason.message || "Unhandled rejection", reason.stack);
    } else {
      report(`Unhandled rejection: ${String(reason)}`);
    }
  });
}
