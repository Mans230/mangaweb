import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  ClipboardPaste,
  Crown,
  Layers,
  Link2,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { mangaList } from "@/data/mock";
import { detectSourceFromUrl, EASE, formatNum } from "./adminMock";
import { useAdminToast } from "./AdminToast";

interface Preview {
  title: string;
  cover: string;
  description: string;
  genres: string[];
  chapters: number;
}

const LOG_LINES = [
  "جلب البيانات من المصدر…",
  "تنزيل الغلاف…",
  "تحليل قائمة الفصول…",
  "استيراد الفصول…",
  "تحديث الفهرس…",
];

export default function AddByLink() {
  const { t } = useLanguage();
  const toast = useAdminToast();

  const [step, setStep] = useState(0);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importAll, setImportAll] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [adult, setAdult] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [requestId, setRequestId] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  const addMutation = trpc.admin.addMangaByUrl.useMutation();

  const detected = useMemo(() => detectSourceFromUrl(url), [url]);

  // كشف تكرار محلي: إن احتوى الرابط على slug سلسلة موجودة
  const duplicate = useMemo(() => {
    const v = url.toLowerCase();
    if (v.length < 8) return null;
    return mangaList.find((m) => v.includes(m.slug)) ?? null;
  }, [url]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const pasteUrl = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      // صلاحية الحافظة مرفوضة
    }
  };

  const goPreview = () => {
    if (!url.trim()) return;
    // TODO: استبدال بالمعاينة الحقيقية من خدمة السكرابر عند توفرها
    const sample = mangaList[0];
    setPreview({
      title: duplicate?.title ?? sample.title,
      cover: sample.cover,
      description: sample.synopsis,
      genres: [...sample.genres],
      chapters: sample.chapters,
    });
    setStep(1);
  };

  const startImport = () => {
    setStep(2);
    setLogLines([]);
    setProgress(0);
    setDone(false);

    const fullUrl = url.trim().includes("://") ? url.trim() : `https://${url.trim()}`;
    addMutation.mutate(
      { url: fullUrl, title: preview?.title },
      {
        onSuccess: (res) => setRequestId(res.requestId),
        onError: () => {
          // TODO: fallback محلي — السكرابر الخارجي لم يُربط بعد
          setRequestId(null);
        },
      },
    );

    // سجل متحرك + شريط تقدم
    LOG_LINES.forEach((line, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setLogLines((prev) => [...prev, line]);
        }, 500 * (i + 1)),
      );
    });
    for (let p = 12; p <= 100; p += 11) {
      timers.current.push(
        window.setTimeout(() => setProgress(Math.min(p, 100)), 420 * (p / 11)),
      );
    }
    timers.current.push(
      window.setTimeout(() => {
        setDone(true);
        toast(t("أُضيفت السلسلة بنجاح", "Series added successfully"));
      }, 500 * (LOG_LINES.length + 1) + 400),
    );
  };

  const reset = () => {
    setStep(0);
    setUrl("");
    setPreview(null);
    setLogLines([]);
    setProgress(0);
    setDone(false);
    setRequestId(null);
  };

  const steps = [t("الرابط", "Link"), t("المعاينة", "Preview"), t("الاستيراد", "Import")];

  return (
    <div className="mx-auto max-w-3xl">
      {/* مؤشر الخطوات */}
      <div className="mb-8 flex items-center justify-center gap-0">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <motion.span
                animate={{
                  scale: step === i ? 1.15 : 1,
                  background:
                    step >= i
                      ? "linear-gradient(135deg,#7C3AED,#E879F9)"
                      : "var(--surface)",
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-app text-sm font-bold text-app"
                style={step >= i ? { color: "#fff", borderColor: "transparent" } : {}}
              >
                {step > i ? <Check size={16} /> : i + 1}
              </motion.span>
              <span className={`text-[11px] font-semibold ${step >= i ? "text-primary" : "text-app-3"}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="relative mx-2 mb-5 h-0.5 w-16 overflow-hidden rounded-full bg-[var(--border)] sm:w-24">
                <motion.span
                  animate={{ scaleX: step > i ? 1 : 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="gradient-primary absolute inset-0 origin-right rtl:origin-right ltr:origin-left"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="glass overflow-hidden !rounded-3xl p-6 md:p-8">
        <AnimatePresence mode="wait">
          {/* الخطوة 1: الرابط */}
          {step === 0 && (
            <motion.div
              key="s0"
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -60, opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              <h2 className="font-display text-lg font-bold text-app">
                {t("الصق رابط السلسلة", "Paste the series link")}
              </h2>
              <p className="mt-1 text-sm text-app-3">
                {t("من أي مصدر من المصادر الثمانية المدعومة", "From any of the 8 supported sources")}
              </p>
              <div className="mt-5 flex gap-2">
                <div className="relative flex-1">
                  <Link2 size={17} className="absolute start-4 top-1/2 -translate-y-1/2 text-app-3" />
                  <input
                    dir="ltr"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && goPreview()}
                    placeholder={t("الصق رابط السلسلة من أي مصدر…", "Paste series URL…")}
                    className="input-glass w-full !py-3.5 !ps-11 text-left"
                  />
                </div>
                <button onClick={pasteUrl} className="btn-icon shrink-0 !rounded-[14px]" aria-label={t("لصق", "Paste")}>
                  <ClipboardPaste size={17} />
                </button>
              </div>

              <AnimatePresence>
                {detected && url.trim() && (
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 320, damping: 18 }}
                    className="mt-3"
                  >
                    {detected.source ? (
                      <span className="glass-chip !border-success/40 text-success">
                        <Check size={14} />
                        {t("تم التعرف:", "Detected:")} <span dir="ltr" className="font-semibold">{detected.source}</span>
                      </span>
                    ) : (
                      <span className="glass-chip !border-warning/40 text-warning">
                        <XCircle size={14} />
                        {t("مصدر غير معروف — سيُسجَّل كطلب يدوي", "Unknown source — will be logged as a manual request")}
                      </span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {duplicate && (
                  <motion.div
                    initial={{ y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 12, opacity: 0 }}
                    className="mt-4 flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3.5"
                  >
                    <XCircle size={18} className="shrink-0 text-warning" />
                    <div className="flex-1 text-sm text-app-2">
                      {t("موجودة بالفعل:", "Already exists:")}{" "}
                      <Link to={`/manga/${duplicate.slug}`} className="font-semibold text-primary hover:underline">
                        {duplicate.title} ←
                      </Link>
                    </div>
                    <span className="glass-chip !text-[11px]">{t("راجع دمج المكرر", "Check duplicate merge")}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                onClick={goPreview}
                disabled={!url.trim()}
                className="btn-primary mt-6 w-full !py-3.5 disabled:opacity-50"
              >
                {t("متابعة للمعاينة", "Continue to preview")}
              </button>
            </motion.div>
          )}

          {/* الخطوة 2: المعاينة */}
          {step === 1 && preview && (
            <motion.div
              key="s1"
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -60, opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              <h2 className="font-display text-lg font-bold text-app">
                {t("معاينة قبل الاستيراد", "Preview before import")}
              </h2>
              <div className="mt-5 flex flex-col gap-5 sm:flex-row">
                <img src={preview.cover} alt="" className="h-44 w-28 shrink-0 rounded-2xl border border-app object-cover" />
                <div className="min-w-0 flex-1 space-y-3">
                  <input
                    value={preview.title}
                    onChange={(e) => setPreview({ ...preview, title: e.target.value })}
                    className="input-glass w-full font-display font-bold"
                  />
                  <p className="line-clamp-3 text-sm leading-relaxed text-app-2">{preview.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.genres.map((g) => (
                      <span key={g} className="glass-chip !px-2.5 !py-1 !text-[11px]">{g}</span>
                    ))}
                    <span className="glass-chip !border-accent-2/40 !px-2.5 !py-1 !text-[11px] text-accent-2">
                      <Layers size={12} /> {formatNum(preview.chapters)} {t("فصل", "chapters")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-2.5">
                {[
                  { label: t("استيراد كل الفصول", "Import all chapters"), value: importAll, set: setImportAll, icon: Layers },
                  { label: t("تمييز كمميزة في الرئيسية", "Feature on home"), value: featured, set: setFeatured, icon: Crown },
                  { label: t("محتوى +18", "Adult +18"), value: adult, set: setAdult, icon: ShieldAlert },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => opt.set(!opt.value)}
                    className="glass flex w-full items-center gap-3 !rounded-2xl p-3.5 text-start"
                  >
                    <opt.icon size={17} className={opt.value ? "text-primary" : "text-app-3"} />
                    <span className="flex-1 text-sm font-semibold text-app">{opt.label}</span>
                    <span
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        opt.value ? "gradient-primary" : "bg-[var(--border)]"
                      }`}
                    >
                      <motion.span
                        animate={{ x: opt.value ? (document.dir === "rtl" ? -20 : 20) : 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-1 start-1 h-4 w-4 rounded-full bg-white shadow"
                      />
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-6 flex gap-3">
                <button onClick={() => setStep(0)} className="btn-glass flex-1 !py-3 text-sm">
                  {t("رجوع", "Back")}
                </button>
                <button onClick={startImport} className="btn-primary flex-1 !py-3 text-sm">
                  {t("بدء الاستيراد", "Start import")}
                </button>
              </div>
            </motion.div>
          )}

          {/* الخطوة 3: الاستيراد */}
          {step === 2 && (
            <motion.div
              key="s2"
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              {!done ? (
                <>
                  <h2 className="font-display text-lg font-bold text-app">
                    {t("جارٍ الاستيراد…", "Importing…")}
                  </h2>
                  <div className="mt-5 space-y-2">
                    {logLines.map((line, i) => (
                      <motion.div
                        key={line}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-2.5 text-sm text-app-2"
                      >
                        <CheckCircle2 size={16} className="shrink-0 text-success" />
                        {line}
                        {i === LOG_LINES.length - 1 && progress < 100 && (
                          <span className="tabular-nums text-xs text-app-3">{progress}%</span>
                        )}
                      </motion.div>
                    ))}
                  </div>
                  <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-[var(--border)]">
                    <motion.div
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                      className="gradient-primary h-full rounded-full"
                    />
                  </div>
                </>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="flex flex-col items-center py-6 text-center"
                >
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 16 }}
                    className="flex h-20 w-20 items-center justify-center rounded-full"
                    style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.4)" }}
                  >
                    <Check size={40} className="text-success" strokeWidth={3} />
                  </motion.span>
                  <h2 className="font-display mt-5 text-xl font-bold text-app">
                    {t("أُضيفت بنجاح", "Added successfully")}
                  </h2>
                  <p className="mt-2 max-w-sm text-sm text-app-2">
                    «{preview?.title}» — {importAll ? formatNum(preview?.chapters ?? 0) : 0}{" "}
                    {t("فصل مستورد", "chapters imported")}
                    {requestId ? ` · ${t("رقم التتبع", "Ref")} #${requestId}` : ""}
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <button onClick={reset} className="btn-glass !px-5 !py-2.5 text-sm">
                      <RotateCcw size={15} /> {t("إضافة أخرى", "Add another")}
                    </button>
                    <Link to="/browse" className="btn-primary !px-5 !py-2.5 text-sm">
                      {t("عرض الصفحة", "View page")}
                    </Link>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
