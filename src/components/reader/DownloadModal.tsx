import { AnimatePresence, motion } from "framer-motion";
import { Archive, Download, Send, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

/** اسم بوت التحميل على تليجرام */
const TELEGRAM_BOT = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? "egmangabot";

interface DownloadModalProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  chapterNumber: number;
}

/**
 * تسجيل التحميل محلياً عبر helper اختياري (recordDownload في src/lib)
 * يوفّره وكيل آخر — إن لم يوجد يُتجاوز بصمت.
 */
export async function recordDownloadSafe(info: { slug: string; chapter: number; format: string }) {
  try {
    const helperPath = "../../lib/downloads";
    const mod: { recordDownload?: (i: typeof info) => void } = await import(
      /* @vite-ignore */ helperPath
    );
    mod?.recordDownload?.(info);
  } catch {
    /* helper غير متوفر — لا شيء */
  }
}

/** رابط التحميل المباشر لفصل عبر الـ API */
export function chapterDownloadUrl(slug: string, chapter: number, format: "cbz" | "zip") {
  return `/api/download/${encodeURIComponent(slug)}/chapter/${chapter}?format=${format}`;
}

/** تحميل الفصل الحالي مباشرة من الموقع بصيغة CBZ أو ZIP */
export default function DownloadModal({ open, onClose, slug, chapterNumber }: DownloadModalProps) {
  const { t } = useLanguage();

  const botLink = `https://t.me/${TELEGRAM_BOT}?start=dl_${slug}_p1_cbz`;

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
                "حمّل الفصل مباشرة من الموقع بالصيغة التي تختارها.",
                "Download the chapter directly from the site in your chosen format.",
              )}
            </p>

            {/* تحميل مباشر */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <motion.a
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.95 }}
                href={chapterDownloadUrl(slug, chapterNumber, "cbz")}
                download
                onClick={() => void recordDownloadSafe({ slug, chapter: chapterNumber, format: "cbz" })}
                className="glass flex flex-col items-center gap-2 rounded-2xl px-4 py-5 text-app transition-colors hover:border-[var(--border-glow)]"
              >
                <span className="text-primary"><Archive size={26} /></span>
                <span className="flex items-center gap-1.5 text-base font-bold">
                  CBZ
                  <Download size={14} className="text-success" />
                </span>
              </motion.a>
              <motion.a
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.95 }}
                href={chapterDownloadUrl(slug, chapterNumber, "zip")}
                download
                onClick={() => void recordDownloadSafe({ slug, chapter: chapterNumber, format: "zip" })}
                className="glass flex flex-col items-center gap-2 rounded-2xl px-4 py-5 text-app transition-colors hover:border-[var(--border-glow)]"
              >
                <span className="text-primary"><Archive size={26} /></span>
                <span className="flex items-center gap-1.5 text-base font-bold">
                  ZIP
                  <Download size={14} className="text-success" />
                </span>
              </motion.a>
            </div>

            {/* المانجا كاملة تبقى عبر البوت */}
            <div className="mt-5 rounded-2xl border border-app/60 p-3.5 text-center">
              <p className="text-[11.5px] leading-relaxed text-app-2">
                {t(
                  "لتحميل المانجا كاملة أو أجزاء منها استخدم بوت تليجرام.",
                  "To download the full manga or parts of it, use our Telegram bot.",
                )}
              </p>
              <a
                href={botLink}
                target="_blank"
                rel="noreferrer"
                className="btn-glass mt-2.5 w-full !py-2.5 text-xs"
              >
                <Send size={14} className="rtl:-scale-x-100" />
                {t("المانجا كاملة عبر البوت", "Full manga via bot")}
              </a>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
