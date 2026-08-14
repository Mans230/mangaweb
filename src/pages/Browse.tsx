import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, LayoutGrid, List, Loader2, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import type { MangaCardData } from "@/lib/manga";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import SearchHero from "@/components/browse/SearchHero";
import AdvancedFilters from "@/components/browse/AdvancedFilters";
import { TrendingRail, TrendingSidebar } from "@/components/browse/TrendingSidebar";
import { Pagination, ResultsGrid, ResultsSkeleton } from "@/components/browse/ResultsGrid";
import type { BrowseFilters, ViewMode } from "@/components/browse/constants";
import {
  CH_MAX_LIMIT,
  DEFAULT_FILTERS,
  PAGE_SIZE,
  adaptListItem,
  applyLocalOnlyFilters,
  filtersKey,
  filtersToParams,
  parseFilters,
} from "@/components/browse/constants";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const VIEW_STORAGE_KEY = "zeko-browse-view";

export default function Browse() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);
  const fKey = filtersKey(filters);

  const [inputValue, setInputValue] = useState(filters.q);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== "undefined" && window.sessionStorage.getItem(VIEW_STORAGE_KEY) === "list"
      ? "list"
      : "grid",
  );
  const [toastVisible, setToastVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsTopRef = useRef<HTMLDivElement | null>(null);
  const loadMoreClicked = useRef(false);
  const firstFilterChange = useRef(true);

  const updateFilters = (patch: Partial<BrowseFilters>, replace = false) => {
    setSearchParams(filtersToParams({ ...filters, ...patch }), { replace });
  };

  /* ====== بحث فوري: debounce 300ms من الحقل إلى الـ URL ====== */
  useEffect(() => {
    if (inputValue === filters.q) return;
    const timer = setTimeout(() => updateFilters({ q: inputValue.trim(), page: 1 }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  /* مزامنة الحقل عند تغيّر q من الـ URL (زر الرجوع / رقائق) */
  useEffect(() => {
    setInputValue(filters.q);
  }, [filters.q]);

  /* ====== اختصارات لوحة المفاتيح: / للتركيز، Esc للمسح/الإغلاق ====== */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape") {
        if (advancedOpen) setAdvancedOpen(false);
        else if (isTyping && inputValue) setInputValue("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [advancedOpen, inputValue]);

  /* ====== حفظ وضع العرض ====== */
  useEffect(() => {
    window.sessionStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  /* ====== استعلام tRPC الرئيسي ====== */
  const query = trpc.manga.list.useQuery(
    {
      page: filters.page,
      limit: PAGE_SIZE,
      search: filters.q || undefined,
      genre: filters.genres[0], // الـ API يدعم تصنيفاً واحداً — الباقي محلياً
      status: filters.status === "all" ? undefined : filters.status,
      minChapters: filters.chMin > 0 ? filters.chMin : undefined,
      maxChapters: filters.chMax < CH_MAX_LIMIT ? filters.chMax : undefined,
      sort: filters.sort === "alpha" ? "popular" : filters.sort, // alpha يُفرز محلياً
    },
    { retry: false },
  );

  const pageItems: MangaCardData[] = useMemo(() => {
    if (!query.data) return [];
    return applyLocalOnlyFilters(query.data.items.map(adaptListItem), filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, fKey, filters.page]);

  const total = query.data?.total ?? 0;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFetching = query.isFetching;

  /* ====== تجميع الصفحات لزر "تحميل المزيد" على الموبايل ====== */
  const [acc, setAcc] = useState<{ key: string; page: number; items: MangaCardData[] }>({
    key: "",
    page: 1,
    items: [],
  });

  useEffect(() => {
    if (isFetching) return; // انتظر اكتمال الجلب حتى لا تُخلط الصفحات
    setAcc((prev) => {
      const sameKey = prev.key === fKey;
      const shouldAppend =
        sameKey && loadMoreClicked.current && filters.page === prev.page + 1;
      loadMoreClicked.current = false;
      if (shouldAppend) {
        const ids = new Set(prev.items.map((i) => i.id));
        return {
          key: fKey,
          page: filters.page,
          items: [...prev.items, ...pageItems.filter((i) => !ids.has(i.id))],
        };
      }
      return { key: fKey, page: filters.page, items: pageItems };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetching, pageItems, fKey, filters.page]);

  const displayItems = acc.key === fKey ? acc.items : pageItems;

  /* ====== توست "تم تحديث النتائج" عند تغيّر الفلاتر ====== */
  useEffect(() => {
    if (firstFilterChange.current) {
      firstFilterChange.current = false;
      return;
    }
    setToastVisible(true);
    const timer = setTimeout(() => setToastVisible(false), 1800);
    return () => clearTimeout(timer);
  }, [fKey]);

  /* ====== تصحيح رقم صفحة خارج النطاق ====== */
  useEffect(() => {
    if (!isFetching && total > 0 && filters.page > totalPages) {
      updateFilters({ page: totalPages }, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetching, total, totalPages, filters.page]);

  /* ====== إجراءات ====== */
  const goToPage = (p: number) => {
    loadMoreClicked.current = false;
    updateFilters({ page: p });
    resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleLoadMore = () => {
    loadMoreClicked.current = true;
    updateFilters({ page: filters.page + 1 });
  };

  const resetAll = () => {
    setInputValue("");
    setSearchParams(filtersToParams(DEFAULT_FILTERS));
  };

  /** بحث جديد من الصفر (رقائق الاقتراحات) — يضبط الحقل والـ URL معاً */
  const searchFor = (q: string) => {
    setInputValue(q);
    setSearchParams(filtersToParams({ ...DEFAULT_FILTERS, q }));
  };

  /* ====== رقائق الفلاتر النشطة ====== */
  const activeChips: { key: string; label: string; remove: () => void }[] = [];
  if (filters.q) {
    activeChips.push({
      key: "q",
      label: `"${filters.q}"`,
      remove: () => {
        setInputValue("");
        updateFilters({ q: "", page: 1 });
      },
    });
  }
  filters.genres.forEach((g) =>
    activeChips.push({
      key: `g-${g}`,
      label: g,
      remove: () => updateFilters({ genres: filters.genres.filter((x) => x !== g), page: 1 }),
    }),
  );
  if (filters.status !== "all") {
    activeChips.push({
      key: "status",
      label: filters.status === "ongoing" ? t("مستمر", "Ongoing") : t("مكتمل", "Completed"),
      remove: () => updateFilters({ status: "all", page: 1 }),
    });
  }
  if (filters.chMin > 0 || filters.chMax < CH_MAX_LIMIT) {
    activeChips.push({
      key: "ch",
      label: `${t("الفصول", "Chapters")}: ${filters.chMin}–${filters.chMax >= CH_MAX_LIMIT ? `${CH_MAX_LIMIT}+` : filters.chMax}`,
      remove: () => updateFilters({ chMin: 0, chMax: CH_MAX_LIMIT, page: 1 }),
    });
  }
  filters.types.forEach((tp) =>
    activeChips.push({
      key: `t-${tp}`,
      label: tp,
      remove: () => updateFilters({ types: filters.types.filter((x) => x !== tp), page: 1 }),
    }),
  );
  filters.sources.forEach((s) =>
    activeChips.push({
      key: `s-${s}`,
      label: s,
      remove: () => updateFilters({ sources: filters.sources.filter((x) => x !== s), page: 1 }),
    }),
  );

  // أثناء الجلب: skeleton — إلا عند "تحميل المزيد" (تبقى القائمة المجمّعة ظاهرة)
  const showSkeleton = isFetching && !loadMoreClicked.current;
  const isEmpty =
    !showSkeleton && !isFetching && !query.isError && displayItems.length === 0;

  return (
    <div>
      <SearchHero
        q={inputValue}
        onQueryChange={setInputValue}
        advancedOpen={advancedOpen}
        onToggleAdvanced={() => setAdvancedOpen((v) => !v)}
        inputRef={inputRef}
      />

      <div className="mx-auto max-w-7xl px-4 pb-16 md:px-6">
        <AnimatePresence>
          {advancedOpen && (
            <AdvancedFilters
              filters={filters}
              onChange={(patch) => updateFilters(patch)}
              onApply={() => setAdvancedOpen(false)}
              onReset={resetAll}
            />
          )}
        </AnimatePresence>

        <div className="mt-6 flex items-start gap-6">
          {/* منطقة النتائج */}
          <div className="min-w-0 flex-1" ref={resultsTopRef}>
            <TrendingRail />

            {/* شريط الأدوات */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-app-2">
                {isFetching && displayItems.length === 0
                  ? t("جارٍ البحث…", "Searching…")
                  : t("وجدنا", "Found")}{" "}
                {!isFetching || displayItems.length > 0 ? (
                  <span className="gradient-text font-display font-extrabold">
                    {total.toLocaleString("ar-EG")}
                  </span>
                ) : null}{" "}
                {t("نتيجة", "results")}
              </p>

              <div className="glass ms-auto flex !rounded-full p-1">
                {(
                  [
                    { mode: "grid" as ViewMode, icon: LayoutGrid, ar: "شبكة", en: "Grid" },
                    { mode: "list" as ViewMode, icon: List, ar: "قائمة", en: "List" },
                  ]
                ).map((v) => {
                  const active = view === v.mode;
                  const Icon = v.icon;
                  return (
                    <button
                      key={v.mode}
                      type="button"
                      onClick={() => setView(v.mode)}
                      aria-label={t(v.ar, v.en)}
                      aria-pressed={active}
                      className="relative flex h-8 w-10 items-center justify-center rounded-full"
                    >
                      {active && (
                        <motion.span
                          layoutId="view-toggle-pill"
                          className="gradient-primary absolute inset-0 rounded-full"
                          transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        />
                      )}
                      <Icon size={16} className={`relative z-10 ${active ? "text-white" : "text-app-3"}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* رقائق الفلاتر النشطة */}
            <AnimatePresence>
              {activeChips.length > 0 && (
                <motion.div className="mb-4 flex flex-wrap gap-2">
                  {activeChips.map((chip) => (
                    <motion.button
                      key={chip.key}
                      type="button"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      onClick={chip.remove}
                      className="glass-chip !py-1 text-xs font-semibold text-app-2 hover:!border-[var(--border-glow)]"
                    >
                      {chip.label}
                      <X size={12} className="text-danger" />
                    </motion.button>
                  ))}
                  <motion.button
                    type="button"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    onClick={resetAll}
                    className="text-xs font-bold text-danger underline-offset-4 hover:underline"
                  >
                    {t("مسح الكل", "Clear all")}
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* المحتوى: skeleton / خطأ / نتائج / حالة فارغة */}
            {showSkeleton ? (
              <ResultsSkeleton view={view} />
            ) : query.isError ? (
              <div className="glass !rounded-3xl">
                <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
              </div>
            ) : isEmpty ? (
              <div className="glass !rounded-3xl">
                <EmptyState
                  title={t("لم نجد شيئاً…", "Nothing found…")}
                  caption={t(
                    "جرّب كلمات أبسط أو أزل بعض الفلاتر — أو اطلب إضافتها وسنجلبها لك.",
                    "Try simpler keywords or remove some filters — or request it and we'll fetch it.",
                  )}
                  ctaLabel={t("اطلب هذه المانجا", "Request this manga")}
                  ctaTo={`/request${filters.q ? `?title=${encodeURIComponent(filters.q)}` : ""}`}
                />
                <div className="flex flex-wrap items-center justify-center gap-2 px-6 pb-8">
                  <span className="text-xs text-app-3">{t("اقتراحات:", "Suggestions:")}</span>
                  {["أكشن", "رومانسي", "نظام"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => searchFor(s)}
                      className="glass-chip !px-3 !py-1 text-xs font-semibold"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <ResultsGrid items={displayItems} view={view} animKey={`${fKey}-${acc.page}`} />

                {/* ترقيم سطح المكتب */}
                <div className="hidden md:block">
                  <Pagination page={filters.page} totalPages={totalPages} onChange={goToPage} />
                </div>

                {/* تحميل المزيد — موبايل */}
                {filters.page < totalPages && (
                  <div className="mt-8 flex justify-center md:hidden">
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={isFetching}
                      className="btn-glass !px-6 !py-3 text-sm"
                    >
                      {isFetching ? <Loader2 size={16} className="animate-spin" /> : null}
                      {t("تحميل المزيد", "Load more")}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* رابط صفحة الطلب أسفل النتائج */}
            {!isEmpty && !showSkeleton && !query.isError && (
              <p className="mt-10 text-center text-xs text-app-3">
                {t("لم تجد ما تبحث عنه؟", "Can't find what you're looking for?")}{" "}
                <Link
                  to={`/request${filters.q ? `?title=${encodeURIComponent(filters.q)}` : ""}`}
                  className="font-bold text-primary underline-offset-4 hover:underline"
                >
                  {t("اطلب إضافته الآن", "Request it now")}
                </Link>
              </p>
            )}
          </div>

          <TrendingSidebar />
        </div>
      </div>

      {/* توست تحديث النتائج */}
      <AnimatePresence>
        {toastVisible && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="glass-strong fixed bottom-24 start-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 !rounded-full px-4 py-2 text-xs font-bold text-app shadow-lg lg:bottom-8"
            role="status"
          >
            <CheckCircle2 size={14} className="text-success" />
            {t("تم تحديث النتائج", "Results updated")}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
