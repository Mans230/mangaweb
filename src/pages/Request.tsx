import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  ClipboardPaste,
  Clock,
  Link2,
  LogIn,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { LOGIN_PATH } from "@/const";
import { typeLabel } from "@/lib/manga";
import { trpc } from "@/providers/trpc";
import { detectSourceFromUrl, timeAgo } from "@/lib/manga";
import type { SourceName } from "@/lib/manga";
import { requestStatusLabel } from "@/components/admin/adminUtils";
import type { AdminRequestRow, RequestStatus } from "@/components/admin/adminUtils";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const TYPE_OPTIONS = ["مانهوا", "مانجا", "مانها", "غير متأكد"] as const;

const FAQ = [
  {
    q: "كم يستغرق إضافة طلب؟",
    a: "عادة بين 24 و48 ساعة. الطلبات المرفقة برابط مصدر مباشر تُعالج أسرع لأن فريقنا يستورد الفصول مباشرة دون بحث يدوي.",
  },
  {
    q: "هل يمكن طلب مانجا +18؟",
    a: "نعم، لكن إظهارها يتطلب تفعيل خيار المحتوى البالغ من إعدادات حسابك وتأكيد أن عمرك 18 عاماً أو أكثر.",
  },
  {
    q: "طلبي مرفوض، لماذا؟",
    a: "أشهر الأسباب: العنوان موجود بالفعل على المنصة، المصدر توقف عن النشر، أو العمل غير متوفر بترجمة عربية. ستجد سبب الرفض في ملاحظة الطلب.",
  },
  {
    q: "هل يمكن التصويت على طلبات الآخرين؟",
    a: "نعمل على ميزة التصويت حالياً! قريباً ستتمكن من دعم طلبات المستخدمين الآخرين لتُضاف الأعمال الأكثر طلباً أولاً.",
  },
];

type StatusFilter = "all" | RequestStatus;

/* ================= Hero ================= */
function RequestHero() {
  const { t } = useLanguage();
  return (
    <div className="relative flex flex-col items-center px-4 pt-12 pb-8 text-center">
      <motion.img
        src="/empty-state.svg"
        alt=""
        className="animate-bob w-24 opacity-90"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.9, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
      />
      <h1 className="font-display mt-4 text-3xl font-bold text-app md:text-4xl">
        {t("لم تجد مانجا؟", "Can't find a manga?")}{" "}
        <span className="gradient-text">{t("اطلبها!", "Request it!")}</span>
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-app-2 md:text-base">
        {t(
          "أرسل لنا الاسم أو رابطها من أحد المصادر وسنضيفها خلال 24–48 ساعة",
          "Send us the title or a source link and we'll add it within 24–48 hours",
        )}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <motion.span
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.25 }}
          className="glass-chip"
        >
          <Sparkles size={14} className="text-accent" />
          {t("8 مصادر", "8 sources")}
        </motion.span>
        <motion.span
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.35 }}
          className="glass-chip"
        >
          <CheckCircle2 size={14} className="text-success" />
          {t("إضافة يومية", "Daily additions")}
        </motion.span>
      </div>
    </div>
  );
}

/* ================= نموذج الطلب ================= */
function RequestForm() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<(typeof TYPE_OPTIONS)[number]>("غير متأكد");
  const [note, setNote] = useState("");
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [authPrompt, setAuthPrompt] = useState(false);
  const [submittedId, setSubmittedId] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const blurTimer = useRef<number | null>(null);

  const utils = trpc.useUtils();
  const createMutation = trpc.request.create.useMutation();

  // اقتراحات التكرار من كتالوج الـ API الحقيقي (بحث مؤجل 300ms)
  const [debouncedTitle, setDebouncedTitle] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTitle(title.trim()), 300);
    return () => clearTimeout(timer);
  }, [title]);

  const suggestQuery = trpc.manga.list.useQuery(
    { page: 1, limit: 5, search: debouncedTitle || undefined },
    { enabled: debouncedTitle.length >= 2, retry: false },
  );
  const suggestions = (suggestQuery.data?.items ?? []).map((m) => ({
    id: Number(m.id),
    slug: m.slug,
    title: m.title,
    cover: m.coverUrl || "/cover-01.png",
    type: typeLabel(m.type),
    chapters: m.chapterCount,
  }));

  const exactDuplicate = useMemo(() => {
    const q = title.trim().toLowerCase();
    if (!q) return null;
    return (
      (suggestQuery.data?.items ?? []).find(
        (m) =>
          m.title.toLowerCase() === q ||
          (m.altTitles ?? []).some((a) => a.toLowerCase() === q),
      ) ?? null
    );
  }, [title, suggestQuery.data]);

  const detected = useMemo(() => detectSourceFromUrl(url), [url]);

  const pasteUrl = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      // صلاحية الحافظة مرفوضة — المستخدم يلصق يدوياً
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!title.trim()) return;
    if (exactDuplicate) {
      setLocalError(
        t("هذه المانجا موجودة بالفعل! افتحها من الاقتراحات.", "This manga already exists! Open it from the suggestions."),
      );
      return;
    }
    if (!isAuthenticated) {
      setAuthPrompt(true);
      return;
    }
    const typeNote = type === "غير متأكد" ? "" : `[النوع: ${type}] `;
    const sourceUrl = detected && url.trim() ? (url.trim().includes("://") ? url.trim() : `https://${url.trim()}`) : undefined;
    createMutation.mutate(
      { title: title.trim(), sourceUrl, note: (typeNote + note.trim()).trim() || undefined },
      {
        onSuccess: (res) => {
          setSubmittedId(res.id);
          void utils.request.myRequests.invalidate();
        },
        onError: () => {
          setLocalError(
            t("تعذّر إرسال الطلب — تحقق من اتصالك وحاول مجدداً.", "Couldn't send the request — check your connection and try again."),
          );
        },
      },
    );
  };

  const reset = () => {
    setTitle("");
    setUrl("");
    setNote("");
    setType("غير متأكد");
    setSubmittedId(null);
  };

  return (
    <motion.section
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.2 }}
      className="mx-auto w-full max-w-2xl px-4"
    >
      <div className="glass relative overflow-hidden p-6 md:p-8">
        <AnimatePresence mode="wait">
          {submittedId !== null ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="flex flex-col items-center py-8 text-center"
            >
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
                className="flex h-20 w-20 items-center justify-center rounded-full"
                style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.4)" }}
              >
                <Check size={40} className="text-success" strokeWidth={3} />
              </motion.span>
              <h2 className="font-display mt-5 text-2xl font-bold text-app">
                {t("وصلنا طلبك!", "Request received!")}
              </h2>
              <p className="mt-2 text-sm text-app-2">
                {t("رقم الطلب", "Request no.")}{" "}
                <span className="font-display font-bold text-primary">#{submittedId}</span>
              </p>
              <p className="mt-1 text-xs text-app-3">
                {t("تتبع طلباتك بالأسفل", "Track your requests below")}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button onClick={reset} className="btn-glass !px-5 !py-2.5 text-sm">
                  {t("طلب آخر", "Another request")}
                </button>
                <Link to="/browse" className="btn-primary !px-5 !py-2.5 text-sm">
                  {t("تصفّح المكتبة", "Browse library")}
                </Link>
              </div>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              onSubmit={submit}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col gap-5"
            >
              {/* اسم المانجا + autocomplete */}
              <div className="relative">
                <label className="mb-2 block text-sm font-semibold text-app">
                  {t("اسم المانجا", "Manga title")} <span className="text-danger">*</span>
                </label>
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setAutocompleteOpen(true);
                  }}
                  onFocus={() => setAutocompleteOpen(true)}
                  onBlur={() => {
                    blurTimer.current = window.setTimeout(() => setAutocompleteOpen(false), 150);
                  }}
                  placeholder={t("مثال: بداية النهاية…", "e.g. The Beginning After The End…")}
                  className="input-glass w-full"
                  required
                />
                <AnimatePresence>
                  {autocompleteOpen && suggestions.length > 0 && (
                    <motion.ul
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      className="glass-strong absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl p-1.5"
                    >
                      {suggestions.map((m, i) => (
                        <motion.li
                          key={m.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03, duration: 0.2 }}
                        >
                          <Link
                            to={`/manga/${m.slug}`}
                            className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-primary-soft/15"
                          >
                            <img src={m.cover} alt="" loading="lazy" decoding="async" className="h-12 w-8 rounded-md object-cover" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-app">{m.title}</span>
                              <span className="block text-xs text-app-3">{m.type} · {m.chapters} {t("فصل", "chapters")}</span>
                            </span>
                            <span className="glass-chip shrink-0 !py-1 !text-[11px] text-success">
                              {t("موجودة بالفعل!", "Already added!")}
                            </span>
                          </Link>
                        </motion.li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
                {exactDuplicate && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning">
                    <XCircle size={14} />
                    {t("موجودة بالفعل —", "Already exists —")}{" "}
                    <Link to={`/manga/${exactDuplicate.slug}`} className="underline underline-offset-2">
                      {t("افتح صفحتها", "open its page")}
                    </Link>
                  </p>
                )}
              </div>

              {/* رابط المصدر */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-app">
                  {t("رابط المصدر", "Source link")}{" "}
                  <span className="text-xs font-normal text-app-3">({t("اختياري", "optional")})</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 size={16} className="absolute start-4 top-1/2 -translate-y-1/2 text-app-3" />
                    <input
                      dir="ltr"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://azorafly.com/series/…"
                      className="input-glass w-full !ps-11 text-left"
                    />
                  </div>
                  <button type="button" onClick={pasteUrl} className="btn-icon shrink-0 !rounded-[14px]" aria-label={t("لصق", "Paste")}>
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
                      className="mt-2.5"
                    >
                      {detected.source ? (
                        <span className="glass-chip !border-success/40 text-success">
                          <Check size={14} />
                          {t("تم التعرف:", "Detected:")} <span dir="ltr" className="font-semibold">{detected.source}</span>
                        </span>
                      ) : (
                        <span className="glass-chip !border-warning/40 text-warning">
                          <XCircle size={14} />
                          {t("مصدر غير مدعوم حالياً — سنبحث عنها يدوياً", "Unsupported source — we'll search manually")}
                        </span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* النوع */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-app">{t("النوع", "Type")}</label>
                <div className="flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setType(opt)}
                      className={`glass-chip transition-all ${
                        type === opt ? "!border-transparent !bg-gradient-to-l !from-[#7C3AED] !via-[#A78BFA] !to-[#E879F9] !text-white shadow-md" : ""
                      }`}
                    >
                      {t(opt, opt === "مانهوا" ? "Manhwa" : opt === "مانجا" ? "Manga" : opt === "مانها" ? "Manhua" : "Not sure")}
                    </button>
                  ))}
                </div>
              </div>

              {/* ملاحظات */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-app">
                  {t("ملاحظات", "Notes")}{" "}
                  <span className="text-xs font-normal text-app-3">({t("اختياري", "optional")})</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder={t("مثال: النسخة الملونة، أو تكملة الموسم الثاني…", "e.g. the colored version, or season 2 sequel…")}
                  className="input-glass w-full resize-none"
                />
              </div>

              {localError && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-danger">
                  <XCircle size={16} /> {localError}
                </p>
              )}

              <motion.button
                type="submit"
                whileTap={{ scale: 0.95 }}
                disabled={createMutation.isPending}
                className="btn-primary w-full !py-3.5 disabled:opacity-70"
              >
                {createMutation.isPending ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <Send size={17} className="rtl:-scale-x-100" />
                )}
                {createMutation.isPending ? t("جارٍ الإرسال…", "Sending…") : t("إرسال الطلب", "Submit request")}
              </motion.button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>

      {/* نافذة تسجيل الدخول للزوار */}
      <AnimatePresence>
        {authPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[75] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
            onClick={() => setAuthPrompt(false)}
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong w-full max-w-md rounded-3xl p-6 text-center"
            >
              <img src="/empty-state.svg" alt="" className="mx-auto w-28 opacity-90" />
              <h3 className="font-display mt-4 text-xl font-bold text-app">
                {t("سجّل الدخول لإرسال طلبك", "Sign in to send your request")}
              </h3>
              <p className="mt-2 text-sm text-app-2">
                {t("لا تقلق — بيانات النموذج محفوظة وستعود إليها بعد الدخول.", "Don't worry — your form is preserved.")}
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <button onClick={() => setAuthPrompt(false)} className="btn-glass !px-5 !py-2.5 text-sm">
                  {t("لاحقاً", "Later")}
                </button>
                <button onClick={() => navigate(LOGIN_PATH)} className="btn-primary !px-5 !py-2.5 text-sm">
                  <LogIn size={16} />
                  {t("تسجيل الدخول", "Sign in")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/* ================= طلباتي ================= */
const statusIconMap: Record<RequestStatus, { icon: typeof Clock; cls: string }> = {
  pending: { icon: Clock, cls: "text-warning border-warning/40" },
  added: { icon: CheckCircle2, cls: "text-success border-success/40" },
  rejected: { icon: XCircle, cls: "text-danger border-danger/40" },
};

function MyRequests() {
  const { t } = useLanguage();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const query = trpc.request.myRequests.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });

  const rows: AdminRequestRow[] = useMemo(
    () =>
      (query.data ?? []).map((r) => {
        const det = r.sourceUrl ? detectSourceFromUrl(r.sourceUrl) : null;
        return {
          id: r.id,
          title: r.title,
          requester: "أنت",
          date: timeAgo(r.createdAt),
          sourceName: (det?.source ?? null) as SourceName | null,
          sourceUrl: r.sourceUrl ?? undefined,
          note: r.note ?? undefined,
          status: r.status,
        };
      }),
    [query.data],
  );

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: t("الكل", "All") },
    { key: "pending", label: t("قيد المراجعة", "Pending") },
    { key: "added", label: t("تمت", "Added") },
    { key: "rejected", label: t("مرفوض", "Rejected") },
  ];

  return (
    <section className="mx-auto mt-14 w-full max-w-2xl px-4">
      <h2 className="font-display text-xl font-bold text-app md:text-2xl">
        {t("طلباتي", "My requests")}
      </h2>
      <motion.span
        initial={{ width: 0 }}
        whileInView={{ width: 64 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: EASE }}
        className="gradient-primary mt-2 block h-1 rounded-full"
      />

      {authLoading ? (
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : !isAuthenticated ? (
        <div className="glass mt-6">
          <EmptyState
            title={t("سجّل الدخول لتتبع طلباتك", "Sign in to track your requests")}
            caption={t("طلباتك السابقة وحالتها تظهر هنا بعد تسجيل الدخول.", "Your previous requests and their status appear here after signing in.")}
            ctaLabel={t("تسجيل الدخول", "Sign in")}
            ctaTo={LOGIN_PATH}
          />
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`glass-chip relative !px-4 ${
                  filter === f.key ? "!text-white" : ""
                }`}
              >
                {filter === f.key && (
                  <motion.span
                    layoutId="req-filter-pill"
                    className="gradient-primary absolute inset-0 rounded-full"
                    transition={{ duration: 0.3, ease: EASE }}
                  />
                )}
                <span className="relative z-10">{f.label}</span>
              </button>
            ))}
          </div>

          {query.isError ? (
            <div className="glass mt-5">
              <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="glass mt-5">
              <EmptyState title={t("لم ترسل أي طلب بعد", "No requests yet")} caption={t("املأ النموذج بالأعلى وسيظهر طلبك هنا.", "Fill the form above and your request will appear here.")} />
            </div>
          ) : (
            <ul className="mt-5 space-y-3">
              <AnimatePresence initial={false}>
                {filtered.map((r, i) => {
                  const meta = statusIconMap[r.status];
                  const Icon = meta.icon;
                  return (
                    <motion.li
                      key={r.id}
                      layout
                      initial={{ x: -24, opacity: 0 }}
                      whileInView={{ x: 0, opacity: 1 }}
                      viewport={{ once: true, margin: "-10%" }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.4, ease: EASE, delay: i * 0.05 }}
                      className={`glass flex items-start gap-4 !rounded-2xl p-4 ${
                        r.status === "added" ? "border-glow" : ""
                      }`}
                    >
                      <motion.span
                        initial={{ scale: 0 }}
                        whileInView={{ scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.15 + i * 0.05 }}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-[var(--surface)] ${meta.cls}`}
                      >
                        <Icon size={20} />
                      </motion.span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-display font-bold text-app">{r.title}</span>
                          <span className="text-xs text-app-3">#{r.id} · {r.date}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className={`font-semibold ${meta.cls.split(" ")[0]}`}>
                            {t(requestStatusLabel(r.status), r.status)}
                          </span>
                          {r.sourceName && (
                            <span className="glass-chip !px-2.5 !py-0.5 !text-[11px]" dir="ltr">{r.sourceName}</span>
                          )}
                        </div>
                        {r.status === "added" && (
                          <Link
                            to={r.addedSlug ? `/manga/${r.addedSlug}` : "/browse"}
                            className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                          >
                            {t("أُضيفت! اقرأها الآن", "Added! Read it now")}
                            <span className="rtl:-scale-x-100">→</span>
                          </Link>
                        )}
                        {r.status === "rejected" && r.note && (
                          <p className="mt-1.5 text-xs text-app-3">{r.note}</p>
                        )}
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/* ================= FAQ ================= */
function RequestFaq() {
  const { t } = useLanguage();
  return (
    <section className="mx-auto mt-14 w-full max-w-2xl px-4 pb-20">
      <h2 className="font-display text-xl font-bold text-app md:text-2xl">
        {t("أسئلة شائعة", "FAQ")}
      </h2>
      <motion.span
        initial={{ width: 0 }}
        whileInView={{ width: 64 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: EASE }}
        className="gradient-primary mt-2 block h-1 rounded-full"
      />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.5, ease: EASE }}
        className="mt-5"
      >
        <Accordion type="single" collapsible className="space-y-3">
          {FAQ.map((f, i) => (
            <AccordionItem
              key={i}
              value={`faq-${i}`}
              className="glass overflow-hidden !rounded-2xl border-none px-5"
            >
              <AccordionTrigger className="py-4 text-start text-sm font-semibold text-app hover:no-underline [&>svg]:text-primary">
                {t(f.q, f.q)}
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-sm leading-relaxed text-app-2">
                {t(f.a, f.a)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </motion.div>
    </section>
  );
}

/* ================= الصفحة ================= */
export default function Request() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="gradient-hero-bg absolute inset-x-0 top-0 h-[480px]" />
        <div
          className="animate-blob-a absolute -top-10 end-[-8vw] h-[320px] w-[320px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(167,139,250,0.4), transparent 65%)", filter: "blur(70px)" }}
        />
        <div
          className="animate-blob-b absolute top-72 start-[-6vw] h-[260px] w-[260px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(232,121,249,0.3), transparent 65%)", filter: "blur(70px)" }}
        />
      </div>
      <RequestHero />
      <RequestForm />
      <MyRequests />
      <RequestFaq />
    </div>
  );
}
