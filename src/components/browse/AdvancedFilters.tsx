import { useState } from "react";
import { motion } from "framer-motion";
import { Check, RotateCcw, ShieldAlert } from "lucide-react";
import { GENRES } from "@/lib/manga";
import type { MangaType } from "@/lib/manga";
import { trpc } from "@/providers/trpc";
import AgeGateModal, { isAgeConfirmed } from "@/components/AgeGateModal";
import { useLanguage } from "@/components/LanguageProvider";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BrowseFilters, SortKey, StatusFilter } from "./constants";
import { CH_MAX_LIMIT } from "./constants";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const TYPE_OPTIONS: { value: MangaType; en: string }[] = [
  { value: "مانهوا", en: "Manhwa" },
  { value: "مانجا", en: "Manga" },
  { value: "مانها", en: "Manhua" },
];

const SORT_OPTIONS: { value: SortKey; ar: string; en: string }[] = [
  { value: "popular", ar: "الأكثر قراءةً", en: "Most read" },
  { value: "latest", ar: "الأحدث تحديثاً", en: "Recently updated" },
  { value: "rating", ar: "الأعلى تقييماً", en: "Top rated" },
  { value: "alpha", ar: "أبجدي", en: "A–Z" },
];

const STATUS_OPTIONS: { value: StatusFilter; ar: string; en: string }[] = [
  { value: "all", ar: "الكل", en: "All" },
  { value: "ongoing", ar: "مستمر", en: "Ongoing" },
  { value: "completed", ar: "مكتمل", en: "Completed" },
];

interface AdvancedFiltersProps {
  filters: BrowseFilters;
  onChange: (patch: Partial<BrowseFilters>) => void;
  onApply: () => void;
  onReset: () => void;
}

export default function AdvancedFilters({
  filters,
  onChange,
  onApply,
  onReset,
}: AdvancedFiltersProps) {
  const { t } = useLanguage();
  const [gateOpen, setGateOpen] = useState(false);

  // قائمة المصادر الحقيقية من الـ API
  const sourcesQuery = trpc.manga.sources.useQuery(undefined, { retry: false });

  const toggleGenre = (name: string, adult?: boolean) => {
    const selected = filters.genres.includes(name);
    if (!selected && adult && !isAgeConfirmed()) {
      setGateOpen(true);
      return;
    }
    onChange({
      genres: selected
        ? filters.genres.filter((g) => g !== name)
        : [...filters.genres, name],
      page: 1,
    });
  };

  const toggleIn = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const setChapterRange = (min: number, max: number) => {
    onChange({
      chMin: Math.min(min, max),
      chMax: Math.max(min, max),
      page: 1,
    });
  };

  const fieldLabel = "mb-2.5 block text-[13px] font-bold text-app-2";

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="overflow-hidden"
    >
      <div className="glass mx-auto mt-2 max-w-7xl !rounded-3xl p-5 md:p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* التصنيف — multi-select */}
          <div className="lg:col-span-2">
            <span className={fieldLabel}>{t("التصنيف", "Genres")}</span>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => {
                const selected = filters.genres.includes(g.name);
                return (
                  <motion.button
                    key={g.name}
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => toggleGenre(g.name, g.adult)}
                    aria-pressed={selected}
                    className={`glass-chip !px-3.5 !py-1.5 text-xs font-semibold transition-all ${
                      selected
                        ? "gradient-primary !border-transparent shadow-[0_4px_14px_rgba(244,241,236,0.35)]"
                        : ""
                    }`}
                  >
                    {selected && <Check size={12} />}
                    {g.adult && !selected && <ShieldAlert size={12} className="text-danger" />}
                    {g.name}
                  </motion.button>
                );
              })}
            </div>

            {/* عدد الفصول — dual slider */}
            <div className="mt-6">
              <span className={fieldLabel}>
                {t("عدد الفصول", "Chapter count")}{" "}
                <span className="font-normal text-app-3">
                  ({filters.chMin} – {filters.chMax >= CH_MAX_LIMIT ? `${CH_MAX_LIMIT}+` : filters.chMax})
                </span>
              </span>
              <div dir="ltr" className="px-2">
                <Slider
                  value={[filters.chMin, filters.chMax]}
                  min={0}
                  max={CH_MAX_LIMIT}
                  step={10}
                  minStepsBetweenThumbs={1}
                  onValueChange={([min, max]) => setChapterRange(min ?? 0, max ?? CH_MAX_LIMIT)}
                  aria-label={t("نطاق عدد الفصول", "Chapter range")}
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-app-3">
                  {t("من", "From")}
                  <input
                    type="number"
                    min={0}
                    max={filters.chMax}
                    value={filters.chMin}
                    onChange={(e) => setChapterRange(Number(e.target.value) || 0, filters.chMax)}
                    className="input-glass w-24 !rounded-xl !px-3 !py-1.5 text-center text-sm"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-app-3">
                  {t("إلى", "To")}
                  <input
                    type="number"
                    min={filters.chMin}
                    max={CH_MAX_LIMIT}
                    value={filters.chMax}
                    onChange={(e) =>
                      setChapterRange(filters.chMin, Number(e.target.value) || CH_MAX_LIMIT)
                    }
                    className="input-glass w-24 !rounded-xl !px-3 !py-1.5 text-center text-sm"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* عمود جانبي: الحالة + النوع + المصدر + الترتيب */}
          <div className="flex flex-col gap-5">
            {/* الحالة */}
            <div>
              <span className={fieldLabel}>{t("الحالة", "Status")}</span>
              <div className="glass flex !rounded-full p-1">
                {STATUS_OPTIONS.map((s) => {
                  const active = filters.status === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => onChange({ status: s.value, page: 1 })}
                      className="relative flex-1 rounded-full py-1.5 text-xs font-bold"
                    >
                      {active && (
                        <motion.span
                          layoutId="status-pill"
                          className="gradient-primary absolute inset-0 rounded-full"
                          transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        />
                      )}
                      <span className={`relative z-10 ${active ? "text-white" : "text-app-3"}`}>
                        {t(s.ar, s.en)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* النوع */}
            <div>
              <span className={fieldLabel}>{t("النوع", "Type")}</span>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {TYPE_OPTIONS.map((tp) => {
                  const checked = filters.types.includes(tp.value);
                  return (
                    <label
                      key={tp.value}
                      className="flex cursor-pointer items-center gap-2 text-sm text-app-2"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          onChange({ types: toggleIn(filters.types, tp.value), page: 1 })
                        }
                        aria-label={t(tp.value, tp.en)}
                      />
                      {t(tp.value, tp.en)}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* المصدر */}
            {sourcesQuery.isLoading ? (
              <div>
                <span className={fieldLabel}>{t("المصدر", "Source")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="skeleton h-6 w-20 !rounded-full" />
                  ))}
                </div>
              </div>
            ) : !sourcesQuery.isError && (sourcesQuery.data?.length ?? 0) > 0 ? (
              <div>
                <span className={fieldLabel}>{t("المصدر", "Source")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {(sourcesQuery.data ?? []).map((s) => {
                    const selected = filters.sources.includes(s.name);
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() =>
                          onChange({ sources: toggleIn(filters.sources, s.name), page: 1 })
                        }
                        aria-pressed={selected}
                        className={`glass-chip !px-2.5 !py-1 !text-[11px] font-semibold ${
                          selected ? "!border-[var(--border-glow)] text-primary" : ""
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            s.status === "active" ? "bg-success" : "animate-pulse-soft bg-warning"
                          }`}
                        />
                        {s.name}
                        {selected && <Check size={11} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* الترتيب */}
            <div>
              <span className={fieldLabel}>{t("الترتيب", "Sort by")}</span>
              <Select
                value={filters.sort}
                onValueChange={(v) => onChange({ sort: v as SortKey, page: 1 })}
              >
                <SelectTrigger className="input-glass w-full !rounded-xl text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {t(s.ar, s.en)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* أزرار الإجراءات */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-app pt-4">
          <button type="button" onClick={onReset} className="btn-glass !px-4 !py-2 text-xs">
            <RotateCcw size={14} />
            {t("إعادة تعيين", "Reset")}
          </button>
          <button type="button" onClick={onApply} className="btn-primary !px-5 !py-2 text-xs">
            <Check size={14} />
            {t("تطبيق الفلاتر", "Apply filters")}
          </button>
        </div>
      </div>

      <AgeGateModal
        open={gateOpen}
        onConfirm={() => {
          setGateOpen(false);
          onChange({ genres: [...filters.genres, "+18"], page: 1 });
        }}
        onClose={() => setGateOpen(false)}
      />
    </motion.div>
  );
}
