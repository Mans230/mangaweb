import { useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Flag, X, XCircle } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { LOGIN_PATH } from "@/const";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

type ReportReason = "porn" | "broken" | "wrong_translation" | "other";

const REASONS: { id: ReportReason; ar: string; en: string }[] = [
  { id: "porn", ar: "محتوى إباحي", en: "Pornographic content" },
  { id: "broken", ar: "صور مكسورة", en: "Broken images" },
  { id: "wrong_translation", ar: "ترجمة خاطئة", en: "Wrong translation" },
  { id: "other", ar: "أخرى", en: "Other" },
];

interface ReportDialogProps {
  /** مانجا الهدف (مطلوب أو chapterId) */
  mangaId?: number | null;
  /** فصل الهدف — لبلاغات صفحة القراءة */
  chapterId?: number | null;
  /** نص الزر (افتراضي: تبليغ) */
  label?: string;
  className?: string;
}

/**
 * زر تبليغ صغير (علم) يفتح مودال اختيار السبب وإرسال بلاغ عبر reports.create.
 * غير المسجّل يُوجَّه لصفحة تسجيل الدخول. التوست مدمج ذاتياً (لا توست عام في التطبيق).
 */
export default function ReportDialog({ mangaId, chapterId, label, className }: ReportDialogProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("broken");
  const [details, setDetails] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const createMut = trpc.reports.create.useMutation();

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 3400);
  };

  const openDialog = () => {
    if (!isAuthenticated) {
      navigate(LOGIN_PATH);
      return;
    }
    setOpen(true);
  };

  const submit = () => {
    createMut.mutate(
      {
        mangaId: mangaId ?? undefined,
        chapterId: chapterId ?? undefined,
        reason,
        details: details.trim() || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setDetails("");
          showToast(t("وصل بلاغك للإدارة", "Your report reached the admins"), true);
        },
        onError: (err) => {
          showToast(err.message || t("تعذّر إرسال البلاغ", "Couldn't send the report"), false);
        },
      },
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label={label ?? t("تبليغ", "Report")}
        title={label ?? t("تبليغ", "Report")}
        className={className ?? "btn-icon"}
      >
        <Flag size={18} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[84] bg-black/45 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="glass-strong fixed left-1/2 top-1/2 z-[85] w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-5"
              role="dialog"
              aria-modal="true"
              aria-label={label ?? t("تبليغ", "Report")}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display flex items-center gap-2 text-lg font-bold text-app">
                  <Flag size={17} className="text-danger" />
                  {label ?? t("تبليغ", "Report")}
                </h3>
                <button
                  className="btn-icon !h-8 !w-8"
                  onClick={() => setOpen(false)}
                  aria-label={t("إغلاق", "Close")}
                >
                  <X size={15} />
                </button>
              </div>

              {/* سبب البلاغ */}
              <span className="text-xs font-semibold text-app-3">
                {t("سبب البلاغ", "Report reason")}
              </span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReason(r.id)}
                    className={`glass-chip justify-center !rounded-2xl !py-2.5 text-xs font-bold ${
                      reason === r.id ? "!border-[var(--border-glow)] text-primary" : ""
                    }`}
                  >
                    {t(r.ar, r.en)}
                    {reason === r.id && <CheckCircle2 size={13} className="text-success" />}
                  </button>
                ))}
              </div>

              {/* تفاصيل اختيارية */}
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={t("تفاصيل إضافية (اختياري)…", "Extra details (optional)…")}
                className="input-glass mt-3 w-full resize-none text-sm"
              />

              <button
                type="button"
                onClick={submit}
                disabled={createMut.isPending}
                className="btn-primary mt-4 w-full !py-3 text-sm disabled:opacity-50"
              >
                <Flag size={15} />
                {createMut.isPending ? t("جارٍ الإرسال…", "Sending…") : t("إرسال البلاغ", "Send report")}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* توست ذاتي */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.3, ease: EASE }}
            className={`glass-strong fixed bottom-24 left-1/2 z-[86] flex w-max max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full px-5 py-2.5 text-center text-sm font-semibold md:bottom-auto md:top-20 ${
              toast.ok ? "text-success" : "text-danger"
            }`}
            role="status"
          >
            {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
