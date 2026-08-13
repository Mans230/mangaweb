import { useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Check, FileArchive, FileText, Send, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

/** اسم بوت التحميل على تليجرام */
const TELEGRAM_BOT = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? "egmangabot";
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

  // وضع الفصول المحددة: نطاق from/to أو قائمة مفصولة بفواصل
  const [mode, setMode] = useState<"parts" | "custom">("parts");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [list, setList] = useState("");

  // بناء مقطع الفصول c… من المدخلات (نطاق أو قائمة)
  const chapterSpec = (() => {
    if (list.trim()) {
      const nums = list
        .split(/[,،\s]+/)
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n) && n > 0 && n <= chapterTotal);
      const uniq = [...new Set(nums)].sort((a, b) => a - b);
      return uniq.length ? `c${uniq.join(",")}` : null;
    }
    const a = Number(from);
    const b = Number(to);
    if (Number.isInteger(a) && a > 0 && Number.isInteger(b) && b >= a) {
      return a === b ? `c${a}` : `c${a}-${Math.min(b, chapterTotal)}`;
    }
    if (Number.isInteger(a) && a > 0 && !to.trim()) return `c${a}`;
    return null;
  })();

  const botLink =
    mode === "parts"
      ? `https://t.me/${TELEGRAM_BOT}?start=dl_${slug}_p${part}_${format}`
      : chapterSpec
        ? `https://t.me/${TELEGRAM_BOT}?start=dl_${slug}_${chapterSpec}_${format}`
        : null;

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

            {/* وضع التحميل: أجزاء / فصول محددة */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(
                [
                  { id: "parts", label: t("أجزاء (50 فصل)", "Parts (50 ch)") },
                  { id: "custom", label: t("فصول محددة", "Specific chapters") },
                ] as const
              ).map((mo) => (
                <button
                  key={mo.id}
                  type="button"
                  onClick={() => setMode(mo.id)}
                  className={`glass-chip justify-center !rounded-2xl !py-2.5 text-xs font-bold ${
                    mode === mo.id ? "!border-[var(--border-glow)] text-primary" : ""
                  }`}
                >
                  {mo.label}
                  {mode === mo.id && <Check size={13} className="text-success" />}
                </button>
              ))}
            </div>

            {mode === "custom" && (
              <div className="mt-4 space-y-3">
                <div>
                  <span className="text-xs font-semibold text-app-3">
                    {t("نطاق الفصول (من – إلى)", "Chapter range (from – to)")}
                  </span>
                  <div className="mt-2 flex items-center gap-2" dir="ltr">
                    <input
                      inputMode="numeric"
                      value={from}
                      onChange={(e) => { setFrom(e.target.value.replace(/\D/g, "")); setList(""); }}
                      placeholder="1"
                      className="input-glass w-full !py-2.5 text-center text-sm"
                    />
                    <span className="text-app-3">—</span>
                    <input
                      inputMode="numeric"
                      value={to}
                      onChange={(e) => { setTo(e.target.value.replace(/\D/g, "")); setList(""); }}
                      placeholder={String(chapterTotal)}
                      className="input-glass w-full !py-2.5 text-center text-sm"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-xs font-semibold text-app-3">
                    {t("أو قائمة مفصولة بفواصل", "Or a comma-separated list")}
                  </span>
                  <input
                    dir="ltr"
                    inputMode="numeric"
                    value={list}
                    onChange={(e) => { setList(e.target.value); setFrom(""); setTo(""); }}
                    placeholder="1,2,3"
                    className="input-glass mt-2 w-full !py-2.5 text-left text-sm"
                  />
                </div>
                {chapterSpec && (
                  <span className="glass-chip !px-3 !py-1 !text-[11px] text-success" dir="ltr">
                    <Check size={12} /> dl_{slug}_{chapterSpec}_{format}
                  </span>
                )}
              </div>
            )}

            {/* اختيار الجزء */}
            {mode === "parts" && (
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
            )}

            <a
              href={botLink ?? undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!botLink}
              onClick={(e) => !botLink && e.preventDefault()}
              className={`btn-primary mt-6 w-full !py-3.5 text-sm ${!botLink ? "pointer-events-none opacity-50" : ""}`}
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
