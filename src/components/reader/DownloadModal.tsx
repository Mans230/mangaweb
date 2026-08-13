import { AnimatePresence, motion } from "framer-motion";
import { Archive, Check, FileText, Send, X } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";

type Format = "pdf" | "cbz";

/** اسم بوت التحميل على تليجرام */
const TELEGRAM_BOT = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? "egmangabot";

interface DownloadModalProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  chapterNumber: number;
}

/** تحميل الفصل الحالي عبر بوت تليجرام — deep link حقيقي بصيغة PDF أو CBZ */
export default function DownloadModal({ open, onClose, slug, chapterNumber }: DownloadModalProps) {
  const { t } = useLanguage();
  const [format, setFormat] = useState<Format>("pdf");

  const botLink = `https://t.me/${TELEGRAM_BOT}?start=dl_${slug}_c${chapterNumber}_${format}`;

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
            onClick={onClose}
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

            <p className="text-xs leading-relaxed text-app-2">
              {t(
                "يُرسل الفصل إليك عبر بوت تليجرام مباشرة بالصيغة التي تختارها.",
                "The chapter is delivered to you via our Telegram bot in your chosen format.",
              )}
            </p>

            {/* الصيغة */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <FormatTile
                icon={<FileText size={26} />}
                label="PDF"
                active={format === "pdf"}
                onClick={() => setFormat("pdf")}
              />
              <FormatTile
                icon={<Archive size={26} />}
                label="CBZ"
                active={format === "cbz"}
                onClick={() => setFormat("cbz")}
              />
            </div>

            <a
              href={botLink}
              target="_blank"
              rel="noreferrer"
              className="btn-primary mt-5 w-full !py-3 text-sm"
            >
              <Send size={15} className="rtl:-scale-x-100" />
              {t("استلام عبر البوت", "Receive via bot")}
            </a>
            <p className="mt-2 text-center text-[10.5px] text-app-3" dir="ltr">
              dl_{slug}_c{chapterNumber}_{format}
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function FormatTile({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`glass flex flex-col items-center gap-2 rounded-2xl px-4 py-5 text-app transition-colors hover:border-[var(--border-glow)] ${
        active ? "!border-[var(--border-glow)]" : ""
      }`}
    >
      <span className="text-primary">{icon}</span>
      <span className="flex items-center gap-1.5 text-base font-bold">
        {label}
        {active && <Check size={14} className="text-success" />}
      </span>
    </motion.button>
  );
}
