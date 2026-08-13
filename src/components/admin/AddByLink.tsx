import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ClipboardPaste,
  Link2,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { detectSourceFromUrl } from "@/lib/manga";
import { EASE } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

/** استخراج slug محتمل من رابط السلسلة (آخر جزء من المسار) */
function slugCandidate(raw: string): string | null {
  const v = raw.trim();
  if (v.length < 8) return null;
  try {
    const url = new URL(v.includes("://") ? v : `https://${v}`);
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (!last) return null;
    const slug = decodeURIComponent(last).toLowerCase().replace(/\s+/g, "-");
    return /^[\p{L}\p{N}-]{3,}$/u.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

function humanizeSlug(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** إضافة سلسلة بالاسم فقط عبر admin.addMangaByName — يبحث السكرابر ويستورد تلقائياً */
function AddByName() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const [name, setName] = useState("");
  const [result, setResult] = useState<{
    imported: boolean;
    title: string;
    slug: string;
    source: string;
    duplicate?: boolean;
  } | null>(null);

  const mutation = trpc.admin.addMangaByName.useMutation({
    onSuccess: (res) => {
      setResult(res);
      toast(
        res.duplicate
          ? t("السلسلة موجودة مسبقاً", "Series already exists")
          : t("تم الاستيراد بالاسم بنجاح", "Imported by name"),
        res.duplicate ? "info" : undefined,
      );
    },
    onError: () => toast(t("تعذّرت الإضافة بالاسم", "Couldn't add by name"), "danger"),
  });

  const submit = () => {
    const v = name.trim();
    if (!v || mutation.isPending) return;
    setResult(null);
    mutation.mutate({ name: v });
  };

  return (
    <div className="glass mb-8 !rounded-3xl p-6 md:p-7">
      <h2 className="font-display flex items-center gap-2 text-lg font-bold text-app">
        <Sparkles size={18} className="text-accent-2" />
        {t("إضافة بالاسم", "Add by name")}
      </h2>
      <p className="mt-1 text-sm text-app-3">
        {t("اكتب اسم السلسلة وسيبحث السكرابر عنها ويستوردها تلقائياً.", "Type the series name and the scraper will find and import it automatically.")}
      </p>
      <div className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={t("اسم السلسلة…", "Series name…")}
          className="input-glass w-full !py-3 text-sm"
        />
        <button
          onClick={submit}
          disabled={!name.trim() || mutation.isPending}
          className="btn-primary shrink-0 !px-5 !py-3 text-sm disabled:opacity-50"
        >
          {mutation.isPending ? t("جارٍ البحث…", "Searching…") : t("إضافة", "Add")}
        </button>
      </div>
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            className={`mt-4 flex flex-wrap items-center gap-3 rounded-2xl border p-3.5 ${
              result.duplicate ? "border-warning/40 bg-warning/10" : "border-success/40 bg-success/10"
            }`}
          >
            {result.duplicate ? (
              <XCircle size={18} className="shrink-0 text-warning" />
            ) : (
              <Check size={18} className="shrink-0 text-success" />
            )}
            <div className="flex-1 text-sm text-app-2">
              {result.duplicate ? t("موجودة بالفعل:", "Already exists:") : t("تم الاستيراد:", "Imported:")}{" "}
              <Link to={`/manga/${result.slug}`} className="font-semibold text-primary hover:underline">
                {result.title} ←
              </Link>
            </div>
            <span className="glass-chip !text-[11px]" dir="ltr">{result.source}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AddByLink() {
  const { t } = useLanguage();
  const toast = useAdminToast();

  const [step, setStep] = useState(0);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState<number | null>(null);
  const [matchedSource, setMatchedSource] = useState<string | null>(null);
  const [imported, setImported] = useState<{
    slug: string;
    title: string;
    chaptersAdded: number;
  } | null>(null);

  const addMutation = trpc.admin.addMangaByUrl.useMutation();
  const importMutation = trpc.import.importByUrl.useMutation();

  const detected = useMemo(() => detectSourceFromUrl(url), [url]);
  const candidate = useMemo(() => slugCandidate(url), [url]);

  // كشف تكرار حقيقي: هل يوجد slug مطابق في قاعدة البيانات؟
  const duplicateQuery = trpc.manga.getBySlug.useQuery(
    { slug: candidate ?? "" },
    { enabled: !!candidate, retry: false },
  );
  const duplicate = duplicateQuery.data ?? null;

  useEffect(() => {
    if (candidate && !title) setTitle(humanizeSlug(candidate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate]);

  const pasteUrl = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      // صلاحية الحافظة مرفوضة
    }
  };

  const goConfirm = () => {
    if (!url.trim()) return;
    setStep(1);
  };

  const startImport = () => {
    setStep(2);
    setRequestId(null);
    setImported(null);
    const fullUrl = url.trim().includes("://") ? url.trim() : `https://${url.trim()}`;
    importMutation.mutate(
      { url: fullUrl },
      {
        onSuccess: (res) => {
          setImported({
            slug: res.manga.slug,
            title: res.manga.title,
            chaptersAdded: res.chaptersAdded,
          });
          toast(t("تم الاستيراد بنجاح", "Imported successfully"));
        },
        onError: (err) => {
          // مصدر غير معروف/معطّل → المسار القديم: طلب يدوي pending
          if (err.data?.code === "BAD_REQUEST") {
            addMutation.mutate(
              {
                url: fullUrl,
                title: title.trim() || undefined,
                note: note.trim() || undefined,
              },
              {
                onSuccess: (res) => {
                  setRequestId(res.requestId);
                  setMatchedSource(res.matchedSource?.name ?? null);
                  toast(t("سُجّل طلب الاستيراد بنجاح", "Import request registered"));
                },
              },
            );
          }
        },
      },
    );
  };

  const reset = () => {
    setStep(0);
    setUrl("");
    setTitle("");
    setNote("");
    setRequestId(null);
    setMatchedSource(null);
    setImported(null);
  };

  const steps = [t("الرابط", "Link"), t("التأكيد", "Confirm"), t("التسجيل", "Submit")];

  return (
    <div className="mx-auto max-w-3xl">
      <AddByName />
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
                {t("من أي مصدر من المصادر المدعومة", "From any supported source")}
              </p>
              <div className="mt-5 flex gap-2">
                <div className="relative flex-1">
                  <Link2 size={17} className="absolute start-4 top-1/2 -translate-y-1/2 text-app-3" />
                  <input
                    dir="ltr"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && goConfirm()}
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
                    animate={{ y: 1, opacity: 1 }}
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
                onClick={goConfirm}
                disabled={!url.trim()}
                className="btn-primary mt-6 w-full !py-3.5 disabled:opacity-50"
              >
                {t("متابعة للتأكيد", "Continue to confirm")}
              </button>
            </motion.div>
          )}

          {/* الخطوة 2: التأكيد */}
          {step === 1 && (
            <motion.div
              key="s1"
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -60, opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              <h2 className="font-display text-lg font-bold text-app">
                {t("تأكيد قبل التسجيل", "Confirm before registering")}
              </h2>
              <p className="mt-1 text-sm text-app-3">
                {t("سيُسجَّل الرابط كطلب استيراد ويتولى السكرابر جلب البيانات.", "The link will be registered as an import request for the scraper to process.")}
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("الرابط", "URL")}</label>
                  <div className="glass-chip w-full !justify-start overflow-hidden !px-3.5 !py-2.5 text-xs" dir="ltr">
                    <span className="truncate">{url.trim()}</span>
                  </div>
                  {detected?.source && (
                    <span className="glass-chip mt-2 !border-success/40 !px-2.5 !py-1 !text-[11px] text-success">
                      <Check size={12} />
                      <span dir="ltr">{detected.source}</span>
                    </span>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("العنوان", "Title")}</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("عنوان السلسلة…", "Series title…")}
                    className="input-glass w-full font-display font-bold"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-app-2">
                    {t("ملاحظة", "Note")} <span className="font-normal text-app-3">({t("اختياري", "optional")})</span>
                  </label>
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t("مثال: النسخة الملونة إن توفرت…", "e.g. colored version if available…")}
                    className="input-glass w-full resize-none text-sm"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button onClick={() => setStep(0)} className="btn-glass flex-1 !py-3 text-sm">
                  {t("رجوع", "Back")}
                </button>
                <button onClick={startImport} className="btn-primary flex-1 !py-3 text-sm">
                  {t("تسجيل الاستيراد", "Register import")}
                </button>
              </div>
            </motion.div>
          )}

          {/* الخطوة 3: التسجيل */}
          {step === 2 && (
            <motion.div
              key="s2"
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -60, opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              {importMutation.isPending || addMutation.isPending ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <span className="h-12 w-12 animate-spin rounded-full border-4 border-primary-soft/40 border-t-primary" />
                  <h2 className="font-display mt-5 text-lg font-bold text-app">
                    {importMutation.isPending
                      ? t("جارٍ الاستيراد من المصدر…", "Importing from source…")
                      : t("جارٍ تسجيل الطلب…", "Registering request…")}
                  </h2>
                </div>
              ) : (importMutation.isError && importMutation.error.data?.code !== "BAD_REQUEST") ||
                addMutation.isError ? (
                <ErrorState
                  title={t("تعذّر الاستيراد", "Couldn't import")}
                  caption={t("تحقق من الرابط والاتصال بالخادم ثم أعد المحاولة.", "Check the link and server connection, then try again.")}
                  onRetry={startImport}
                />
              ) : imported ? (
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
                    {t("تم الاستيراد بنجاح", "Imported successfully")}
                  </h2>
                  <p className="mt-2 max-w-sm text-sm text-app-2">
                    «{imported.title}» —{" "}
                    {t(`${imported.chaptersAdded} فصل`, `${imported.chaptersAdded} chapters`)}
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <button onClick={reset} className="btn-glass !px-5 !py-2.5 text-sm">
                      <RotateCcw size={15} /> {t("إضافة أخرى", "Add another")}
                    </button>
                    <Link to={`/manga/${imported.slug}`} className="btn-primary !px-5 !py-2.5 text-sm">
                      {t("فتح صفحة المانجا", "Open manga page")}
                    </Link>
                  </div>
                </motion.div>
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
                    {t("سُجّل الطلب بنجاح", "Request registered")}
                  </h2>
                  <p className="mt-2 max-w-sm text-sm text-app-2">
                    {title.trim() ? `«${title.trim()}» — ` : ""}
                    {matchedSource
                      ? t(`سيُستورد من ${matchedSource} عند توفر السكرابر`, `Will be imported from ${matchedSource} once the scraper runs`)
                      : t("سيُراجع يدوياً لأن المصدر غير معروف", "Will be reviewed manually (unknown source)")}
                    {requestId ? ` · ${t("رقم التتبع", "Ref")} #${requestId}` : ""}
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <button onClick={reset} className="btn-glass !px-5 !py-2.5 text-sm">
                      <RotateCcw size={15} /> {t("إضافة أخرى", "Add another")}
                    </button>
                    <Link to="/browse" className="btn-primary !px-5 !py-2.5 text-sm">
                      {t("تصفّح المكتبة", "Browse library")}
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
