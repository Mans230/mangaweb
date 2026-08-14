/**
 * «جلساتي» — قائمة جلسات الحساب (جهاز/IP/آخر نشاط) مع إنهاء أي جلسة أخرى.
 */
import { motion } from "framer-motion";
import { Loader2, LogOut, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useLanguage } from "@/components/LanguageProvider";
import { useToast } from "@/components/library/toast";
import { timeAgo } from "@/lib/manga";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/** يستخرج وصفاً مختصراً للجهاز من userAgent */
function deviceLabel(ua: string | null): string {
  if (!ua) return "جهاز غير معروف";
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  if (/android/i.test(ua)) return "Android";
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os|macintosh/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return ua.slice(0, 40);
}

export default function SessionsCard() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const sessionsQ = trpc.auth.sessions.useQuery(undefined, { retry: false });
  const revokeMut = trpc.auth.revokeSession.useMutation({
    onSuccess: () => {
      toast(t("أُنهيت الجلسة", "Session revoked"));
      void utils.auth.sessions.invalidate();
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const sessions = sessionsQ.data ?? [];

  return (
    <motion.section
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="glass p-6 md:p-8"
    >
      <h3 className="font-display mb-5 flex items-center gap-2 text-base font-bold text-app">
        <ShieldCheck size={17} className="text-primary" />
        {t("جلساتي", "My sessions")}
      </h3>

      {sessionsQ.isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-14 !rounded-2xl" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-app-3">{t("لا جلسات نشطة", "No active sessions")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="glass flex items-center gap-3 !rounded-2xl px-3.5 py-3"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft/15 text-primary">
                <MonitorSmartphone size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-bold text-app">
                  {deviceLabel(s.userAgent)}
                  {s.current && (
                    <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">
                      {t("هذا الجهاز", "This device")}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-app-3" dir="ltr">
                  {s.ip ?? "—"}
                </span>
                <span className="block text-[11px] text-app-3">
                  {t("آخر نشاط:", "Last active:")}{" "}
                  {s.lastSeenAt ? timeAgo(s.lastSeenAt, lang) : "—"}
                </span>
              </span>
              {!s.current && (
                <button
                  onClick={() => revokeMut.mutate({ id: s.id })}
                  disabled={revokeMut.isPending}
                  className="btn-glass shrink-0 !px-3 !py-2 text-xs !text-danger !border-danger/40 disabled:opacity-50"
                >
                  {revokeMut.isPending ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <LogOut size={13} className="rtl:-scale-x-100" />
                  )}
                  {t("إنهاء", "Revoke")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
