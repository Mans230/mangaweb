import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Search, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type { ChapterItem } from "./store";

interface ChapterDrawerProps {
  open: boolean;
  onClose: () => void;
  chapters: ChapterItem[]; // sorted descending by number
  currentNumber: number;
  readSet: number[];
  onSelect: (chapter: ChapterItem) => void;
}

export default function ChapterDrawer({
  open,
  onClose,
  chapters,
  currentNumber,
  readSet,
  onSelect,
}: ChapterDrawerProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return chapters;
    return chapters.filter(
      (c) =>
        String(c.number).includes(q) ||
        (c.title ?? "").includes(q),
    );
  }, [chapters, query]);

  const read = useMemo(() => new Set(readSet), [readSet]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) onClose();
            }}
            className="glass-strong fixed inset-x-0 bottom-0 z-[71] flex max-h-[70vh] flex-col rounded-t-3xl border-b-0 md:start-1/2 md:end-auto md:bottom-6 md:w-full md:max-w-lg md:-translate-x-1/2 md:rounded-3xl md:border-b"
            role="dialog"
            aria-modal="true"
            aria-label={t("قائمة الفصول", "Chapter list")}
          >
            {/* drag handle */}
            <div className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-app-3/40" />

            <div className="flex items-center gap-2 px-4 pb-2 pt-3">
              <h3 className="font-display flex-1 text-lg font-bold text-app">
                {t("الفصول", "Chapters")}
                <span className="ms-2 text-sm font-medium text-app-3">({chapters.length})</span>
              </h3>
              <button className="btn-icon !h-9 !w-9" onClick={onClose} aria-label={t("إغلاق", "Close")}>
                <X size={17} />
              </button>
            </div>

            <div className="px-4 pb-3">
              <div className="relative">
                <Search size={16} className="absolute end-3.5 top-1/2 -translate-y-1/2 text-app-3" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("ابحث برقم الفصل…", "Search chapter number…")}
                  className="input-glass w-full !py-2.5 pe-10 text-sm"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-6">
              {filtered.length === 0 && (
                <p className="py-10 text-center text-sm text-app-3">
                  {t("لا توجد فصول مطابقة", "No matching chapters")}
                </p>
              )}
              {filtered.map((c, i) => {
                const isCurrent = c.number === currentNumber;
                const isRead = read.has(c.number);
                return (
                  <motion.button
                    key={c.id}
                    initial={i < 15 ? { opacity: 0, y: 10 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i < 15 ? i * 0.02 : 0 }}
                    onClick={() => {
                      onSelect(c);
                      onClose();
                      setQuery("");
                    }}
                    className={`mb-1.5 flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-start transition-colors ${
                      isCurrent
                        ? "border-[var(--primary)] bg-[rgba(244,241,236,0.12)]"
                        : "border-transparent hover:bg-[rgba(244,241,236,0.12)]"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums ${
                        isCurrent ? "gradient-primary" : "glass-chip !p-0 text-app-2"
                      }`}
                    >
                      {c.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-semibold ${isCurrent ? "text-app" : "text-app-2"}`}>
                        {t("الفصل", "Chapter")} {c.number}
                      </span>
                      {c.title && (
                        <span className="block truncate text-xs text-app-3">{c.title}</span>
                      )}
                    </span>
                    {isRead && <Check size={17} className="shrink-0 text-success" />}
                    {isCurrent && (
                      <span className="shrink-0 text-xs font-semibold text-primary">
                        {t("الحالي", "Current")}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
