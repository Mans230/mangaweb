import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, FileText, Send, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

type Phase = "pick" | "progress" | "done";
type Format = "pdf" | "cbz";

interface DownloadModalProps {
  open: boolean;
  onClose: () => void;
  chapterNumber: number;
}

const SIZES: Record<Format, string> = { pdf: "~12MB", cbz: "~9MB" };

export default function DownloadModal({ open, onClose, chapterNumber }: DownloadModalProps) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<Phase>("pick");
  const [format, setFormat] = useState<Format>("pdf");
  const [pct, setPct] = useState(0);
  const timerRef = useRef<number | null>(null);

  // reset when reopened
  useEffect(() => {
    if (open) {
      setPhase("pick");
      setPct(0);
    }
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [open]);

  // TODO: hook to the real export endpoint; progress below is simulated per design.
  const startDownload = (fmt: Format) => {
    setFormat(fmt);
    setPhase("progress");
    setPct(0);
    const started = Date.now();
    timerRef.current = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / 1500);
      setPct(p);
      if (p >= 1 && timerRef.current) {
        window.clearInterval(timerRef.current);
        setPhase("done");
      }
    }, 50);
  };

  const R = 30;
  const CIRC = 2 * Math.PI * R;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[72] bg-black/45 backdrop-blur-sm"
            onClick={phase === "progress" ? undefined : onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong fixed left-1/2 top-1/2 z-[73] w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-5"
            role="dialog"
            aria-modal="true"
            aria-label={t("تحميل الفصل", "Download chapter")}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-app">
                {t("تحميل الفصل", "Download chapter")} {chapterNumber}
              </h3>
              <button className="btn-icon !h-8 !w-8" onClick={onClose} aria-label={t("إغلاق", "Close")}>
                <X size={15} />
              </button>
            </div>

            {phase === "pick" && (
              <div className="grid grid-cols-2 gap-3">
                <FormatTile
                  icon={<FileText size={26} />}
                  label="PDF"
                  size={SIZES.pdf}
                  onClick={() => startDownload("pdf")}
                />
                <FormatTile
                  icon={<Archive size={26} />}
                  label="CBZ"
                  size={SIZES.cbz}
                  onClick={() => startDownload("cbz")}
                />
              </div>
            )}

            {phase !== "pick" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="relative h-24 w-24">
                  <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
                    <circle
                      cx="36"
                      cy="36"
                      r={R}
                      fill="none"
                      stroke="var(--border)"
                      strokeWidth="5"
                    />
                    {phase === "progress" ? (
                      <circle
                        cx="36"
                        cy="36"
                        r={R}
                        fill="none"
                        stroke="url(#dl-grad)"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={CIRC}
                        strokeDashoffset={CIRC * (1 - pct)}
                        style={{ transition: "stroke-dashoffset 0.08s linear" }}
                      />
                    ) : (
                      <motion.circle
                        cx="36"
                        cy="36"
                        r={R}
                        fill="none"
                        stroke="var(--success)"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={CIRC}
                        initial={{ strokeDashoffset: CIRC }}
                        animate={{ strokeDashoffset: 0 }}
                        transition={{ duration: 0.4 }}
                      />
                    )}
                    <defs>
                      <linearGradient id="dl-grad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#7c3aed" />
                        <stop offset="55%" stopColor="#a78bfa" />
                        <stop offset="100%" stopColor="#e879f9" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    {phase === "progress" ? (
                      <span className="text-sm font-bold tabular-nums text-app" dir="ltr">
                        {Math.round(pct * 100)}%
                      </span>
                    ) : (
                      <motion.svg
                        viewBox="0 0 24 24"
                        className="h-8 w-8 text-success"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <motion.path
                          d="M4 12.5l5 5L20 6.5"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.4, delay: 0.15 }}
                        />
                      </motion.svg>
                    )}
                  </div>
                </div>
                <p className="text-sm font-semibold text-app">
                  {phase === "progress"
                    ? t("جارٍ تجهيز الملف…", "Preparing file…")
                    : t("تم الحفظ", "Saved")}
                </p>
                {phase === "done" && (
                  <p className="text-xs text-app-3" dir="ltr">
                    {t("الفصل", "chapter")} {chapterNumber}.{format}
                  </p>
                )}
              </div>
            )}

            {/* Telegram bot note */}
            <div className="mt-4 rounded-2xl border border-app bg-app/40 p-3">
              <p className="mb-2 text-xs leading-relaxed text-app-2">
                {t(
                  "لتحميل المانجا كاملة (50 فصل/جزء) استخدم بوت تليجرام الخاص بنا — يصلك التحميل هناك مباشرة.",
                  "To download the whole manga (50 chapters/part) use our Telegram bot — your download arrives there directly.",
                )}
              </p>
              {/* TODO: replace with the real bot username once provisioned */}
              <a
                href="https://t.me/zeko_manga_bot"
                target="_blank"
                rel="noreferrer"
                className="btn-glass w-full !py-2 text-xs"
              >
                <Send size={14} />
                {t("فتح بوت التحميل", "Open download bot")}
              </a>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function FormatTile({
  icon,
  label,
  size,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  size: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="glass flex flex-col items-center gap-2 rounded-2xl px-4 py-5 text-app transition-colors hover:border-[var(--border-glow)]"
    >
      <span className="text-primary">{icon}</span>
      <span className="text-base font-bold">{label}</span>
      <span className="text-xs text-app-3" dir="ltr">{size}</span>
    </motion.button>
  );
}
