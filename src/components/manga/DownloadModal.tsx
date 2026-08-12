import { useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Check, FileArchive, FileText, Send, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

/** اسم بوت التحميل على تليجرام */
const TELEGRAM_BOT = "zeko_manga_bot";
const PART_SIZE = 50;

interface DownloadModalProps {
  open: boolean;
  slug: string;
  chapterTotal: number;
  onClose: () => void;
}

/** مودال التحميل الكامل عبر بوت تليجرام — أجزاء من 50 فصلاً PDF/CBZ */
export default function DownloadModal({ open, slug, chapterTotal, onClose }: DownloadModalProps) {
  const { t } = useLanguage();
  const [format, setFormat] = useState<"pdf" | "cbz">("pdf");
  const parts = Math.max(1, Math.ceil(chapterTotal / PART_SIZE));
  const [part, setPart] = useState(1);

  const botLink = `https://t.me/${TELEGRAM_BOT}?start=dl_${slug}_p${part}_${format}`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("تحميل المانجا كاملة", "Download full manga")}
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-md"
            onClick={onClose}
          />

          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="glass-strong relative w-full max-w-md rounded-3xl p-6 md:p-7"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label={t("إغلاق", "Close")}
              className="btn-icon absolute end-4 top-4 !h-9 !w-9"
            >
              <X size={16} />
            </button>

            <h2 className="font-display text-xl font-bold text-app">
              {t("تحميل المانجا كاملة", "Download full manga")}
            </h2>
            <p className="mt-2 text-sm leading-7 text-app-2">
              {t(
                `يتم التحميل عبر بوت تليجرام على شكل أجزاء، كل جزء يضم ${PART_SIZE} فصلاً بصيغة PDF أو CBZ. اختر الصيغة والجزء ثم أرسل الطلب للبوت.`,
                `Downloads are delivered via our Telegram bot in parts of ${PART_SIZE} chapters each, as PDF or CBZ. Pick a format and part, then send the request to the bot.`
              )}
            </p>

            {/* الصيغة */}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {(
                [
                  { id: "pdf", label: "PDF", icon: FileText },
                  { id: "cbz", label: "CBZ", icon: FileArchive },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={`glass-chip justify-center !rounded-2xl !py-3 text-sm font-bold ${
                    format === f.id ? "!border-[var(--border-glow)] text-primary" : ""
                  }`}
                >
                  <f.icon size={16} />
                  {f.label}
                  {format === f.id && <Check size={14} className="text-success" />}
                </button>
              ))}
            </div>

            {/* اختيار الجزء */}
            <div className="mt-4">
              <span className="text-xs font-semibold text-app-3">
                {t(`الأجزاء (1–${parts}) — كل جزء ${PART_SIZE} فصلاً`, `Parts (1–${parts}) — ${PART_SIZE} chapters each`)}
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {Array.from({ length: parts }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPart(p)}
                    className={`glass-chip h-9 w-11 justify-center !px-0 text-xs font-bold ${
                      part === p ? "gradient-primary !border-transparent text-white" : ""
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <span className="mt-2 block text-[11px] text-app-3">
                {t(
                  `الجزء ${part}: الفصول ${(part - 1) * PART_SIZE + 1}–${Math.min(part * PART_SIZE, chapterTotal)}`,
                  `Part ${part}: chapters ${(part - 1) * PART_SIZE + 1}–${Math.min(part * PART_SIZE, chapterTotal)}`
                )}
              </span>
            </div>

            <a
              href={botLink}
              target="_blank"
              rel="noreferrer"
              className="btn-primary mt-6 w-full !py-3.5 text-sm"
            >
              <Send size={16} className="rtl:-scale-x-100" />
              {t("إرسال للبوت", "Send to bot")}
            </a>
            <p className="mt-3 text-center text-[11px] text-app-3">
              {t("يتطلب ربط الحساب بتليجرام —", "Requires linking your Telegram account —")}{" "}
              <Link to="/profile" className="font-bold text-primary hover:underline" onClick={onClose}>
                {t("الملف الشخصي", "Profile")}
              </Link>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
