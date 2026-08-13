import { useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, Check, Download, FileArchive, FileText, Send, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { chapterDownloadUrl, recordDownloadSafe } from "@/components/reader/DownloadModal";

/** اسم بوت التحميل على تليجرام */
const TELEGRAM_BOT = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? "egmangabot";
const PART_SIZE = 50;
/** حتى هذا العدد من الفصول المحددة يُحمَّل مباشرة من الموقع، وما زاد يبقى عبر البوت */
const DIRECT_MAX = 10;

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

  // بناء قائمة أرقام الفصول من المدخلات (نطاق أو قائمة مفصولة بفواصل)
  const customChapters = (() => {
    if (list.trim()) {
      const nums = list
        .split(/[,،\s]+/)
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n) && n > 0 && n <= chapterTotal);
      return [...new Set(nums)].sort((a, b) => a - b);
    }
    const a = Number(from);
    const b = Number(to);
    if (Number.isInteger(a) && a > 0 && Number.isInteger(b) && b >= a) {
      const hi = Math.min(b, chapterTotal);
      return Array.from({ length: hi - a + 1 }, (_, i) => a + i);
    }
    if (Number.isInteger(a) && a > 0 && !to.trim()) return [a];
    return [] as number[];
  })();

  // مقطع c… لرابط البوت (للنطاقات الكبيرة) — نطاق متصل يُكتب c1-50 وإلا قائمة c1,2,3
  const chapterSpec = (() => {
    if (!customChapters.length) return null;
    if (customChapters.length === 1) return `c${customChapters[0]}`;
    const first = customChapters[0];
    const last = customChapters[customChapters.length - 1];
    const contiguous = last - first + 1 === customChapters.length;
    return contiguous ? `c${first}-${last}` : `c${customChapters.join(",")}`;
  })();

  // فصول قليلة → تحميل مباشر من الموقع؛ نطاقات كبيرة → البوت
  const directChapters =
    mode === "custom" && customChapters.length > 0 && customChapters.length <= DIRECT_MAX
      ? customChapters
      : null;

  const botLink =
    mode === "parts"
      ? `https://t.me/${TELEGRAM_BOT}?start=dl_${slug}_p${part}_${format}`
      : !directChapters && chapterSpec
        ? `https://t.me/${TELEGRAM_BOT}?start=dl_${slug}_${chapterSpec}_${format}`
        : null;

  /** تحميل كل الفصول المحددة تباعاً (CBZ) */
  const downloadAll = () => {
    directChapters?.forEach((ch, i) => {
      window.setTimeout(() => {
        const a = document.createElement("a");
        a.href = chapterDownloadUrl(slug, ch, "cbz");
        a.download = "";
        a.rel = "noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
        void recordDownloadSafe({ slug, chapter: ch, format: "cbz" });
      }, i * 600);
    });
  };

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
                {directChapters ? (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-app-3">
                      {t("تحميل مباشر من الموقع", "Direct download from the site")}
                    </span>
                    <ul className="max-h-44 space-y-1.5 overflow-y-auto pe-1">
                      {directChapters.map((ch) => (
                        <li
                          key={ch}
                          className="glass flex items-center gap-2 !rounded-xl px-3 py-2 text-xs"
                        >
                          <span className="flex-1 font-bold text-app">
                            {t("فصل", "Ch.")} {ch}
                          </span>
                          {(["cbz", "zip"] as const).map((f) => (
                            <a
                              key={f}
                              href={chapterDownloadUrl(slug, ch, f)}
                              download
                              onClick={() => void recordDownloadSafe({ slug, chapter: ch, format: f })}
                              className="glass-chip !px-2.5 !py-1 !text-[10.5px] font-bold uppercase text-primary"
                            >
                              <Download size={11} />
                              {f}
                            </a>
                          ))}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={downloadAll}
                      className="btn-primary w-full !py-2.5 text-xs"
                    >
                      <Archive size={14} />
                      {t(`تحميل الكل (${directChapters.length} فصول CBZ)`, `Download all (${directChapters.length} ch CBZ)`)}
                    </button>
                  </div>
                ) : chapterSpec ? (
                  <div className="space-y-2">
                    <span className="glass-chip !px-3 !py-1 !text-[11px] text-success" dir="ltr">
                      <Check size={12} /> dl_{slug}_{chapterSpec}_{format}
                    </span>
                    <p className="text-[11px] leading-relaxed text-app-3">
                      {t(
                        `النطاقات الأكبر من ${DIRECT_MAX} فصول تُرسَل للبوت.`,
                        `Ranges larger than ${DIRECT_MAX} chapters are sent to the bot.`,
                      )}
                    </p>
                  </div>
                ) : null}
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

            {!directChapters && (
              <>
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
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
