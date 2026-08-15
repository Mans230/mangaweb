import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Trash2 } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import GlassModal from "./GlassModal";
import { useLanguage } from "@/components/LanguageProvider";
import type { HistoryItem } from "./data";
import { groupByDay } from "./data";
import { useToast } from "./toast";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface HistoryTabProps {
  history: HistoryItem[];
}

export default function HistoryTab({ history }: HistoryTabProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [items, setItems] = useState<HistoryItem[]>(history);
  const [confirmClear, setConfirmClear] = useState(false);

  // مزامنة عند تحدّث البيانات من الأعلى
  useEffect(() => setItems(history), [history]);

  const groups = groupByDay(items);

  const removeOne = (id: number) => {
    // TODO(api): ربط حذف عنصر السجل بـ endpoint عند توفره
    setItems((prev) => prev.filter((x) => x.id !== id));
    toast(t("حُذف من السجل", "Removed from history"));
  };

  const clearAll = () => {
    // TODO(api): ربط مسح السجل الكامل بـ endpoint عند توفره
    setItems([]);
    setConfirmClear(false);
    toast(t("تم مسح سجل القراءة", "Reading history cleared"));
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-app">
          {t("سجل القراءة", "Reading history")}
        </h3>
        {items.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="glass-chip !py-1.5 text-xs font-semibold !text-danger hover:!border-danger/50"
          >
            <Trash2 size={13} />
            {t("مسح السجل", "Clear history")}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={t("سجلك فارغ", "Your history is empty")}
          caption={t("الفصول التي تقرؤها ستظهر هنا لتستكمل من حيث توقفت.", "Chapters you read will appear here so you can pick up where you left off.")}
          ctaLabel={t("ابدأ القراءة", "Start reading")}
          ctaTo="/browse"
        />
      ) : (
        <div className="relative">
          {/* timeline line */}
          <motion.span
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease: EASE }}
            className="gradient-primary absolute bottom-4 start-[7px] top-4 w-0.5 origin-top rounded-full opacity-40"
            aria-hidden
          />

          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="sticky top-16 z-10 mb-3 flex items-center gap-3">
                  <span className="glass-strong rounded-full px-3.5 py-1 text-xs font-bold text-app shadow-sm">
                    {group.label}
                  </span>
                </div>
                <div className="flex flex-col gap-2 ps-6">
                  <AnimatePresence mode="popLayout">
                    {group.items.map((entry, i) => (
                      <motion.div
                        key={entry.id}
                        layout
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -60, transition: { duration: 0.25 } }}
                        transition={{ duration: 0.35, ease: EASE, delay: i * 0.04 }}
                        className="group relative"
                      >
                        {/* timeline node */}
                        <span
                          className="absolute -start-6 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-primary bg-app"
                          aria-hidden
                        />
                        <div className="glass flex items-center gap-3 !rounded-2xl p-2.5">
                          <Link to={`/manga/${entry.manga.slug}`} className="shrink-0">
                            <img
                              src={entry.manga.cover}
                              alt={entry.manga.title}
                              loading="lazy"
                              className="h-[72px] w-12 rounded-lg border border-app object-cover"
                            />
                          </Link>
                          <div className="min-w-0 flex-1">
                            <Link
                              to={`/manga/${entry.manga.slug}`}
                              className="block truncate text-sm font-bold text-app transition-colors hover:text-primary"
                            >
                              {entry.manga.title}
                            </Link>
                            <p className="mt-0.5 text-[11.5px] text-app-3">
                              {t("فصل", "Ch.")} {entry.chapter.toLocaleString("ar")}
                              {entry.lastPage > 0 && (
                                <> — {t("وصلت للصفحة", "reached page")} {entry.lastPage.toLocaleString("ar")}</>
                              )}
                              {" · "}
                              {entry.timeLabel}
                            </p>
                          </div>
                          <Link
                            to={`/manga/${entry.manga.slug}/chapter/${entry.chapter}`}
                            aria-label={t("استكمال القراءة", "Continue reading")}
                            className="btn-icon !h-9 !w-9 shrink-0 ltr:rotate-180"
                          >
                            <ChevronLeft size={16} />
                          </Link>
                          <button
                            onClick={() => removeOne(entry.id)}
                            aria-label={t("حذف من السجل", "Delete from history")}
                            className="btn-icon !h-9 !w-9 shrink-0 !text-danger opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* confirm clear modal */}
      <GlassModal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title={t("مسح سجل القراءة؟", "Clear reading history?")}
      >
        <p className="text-sm text-app-2">
          {t(
            "سيُحذف سجل كل الفصول التي قرأتها ولن تتمكن من استرجاعه.",
            "All your read-chapter history will be deleted and cannot be restored.",
          )}
        </p>
        <div className="mt-5 flex gap-3">
          <button onClick={clearAll} className="btn-primary flex-1 !py-2.5 text-sm !shadow-none" style={{ background: "var(--danger)" }}>
            {t("نعم، امسح السجل", "Yes, clear it")}
          </button>
          <button onClick={() => setConfirmClear(false)} className="btn-glass flex-1 !py-2.5 text-sm">
            {t("إلغاء", "Cancel")}
          </button>
        </div>
      </GlassModal>
    </div>
  );
}
