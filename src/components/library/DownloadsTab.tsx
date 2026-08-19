import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Trash2 } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import GlassModal from "./GlassModal";
import { useLanguage } from "@/components/LanguageProvider";
import {
  DOWNLOADS_EVENT,
  clearDownloads,
  getDownloads,
  removeDownload,
} from "@/lib/downloads";
import type { DownloadRecord } from "@/lib/downloads";
import { useToast } from "./toast";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/**
 * "التحميلات" — سجل محلي (localStorage) للفصول المحمّلة عبر /api/download.
 * يتحدث فورياً عبر حدث DOWNLOADS_EVENT الذي يبثه recordDownload().
 */
export default function DownloadsTab() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [items, setItems] = useState<DownloadRecord[]>(() => getDownloads());
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const sync = () => setItems(getDownloads());
    window.addEventListener(DOWNLOADS_EVENT, sync);
    // تزامن بين التبويبات/النوافذ الأخرى
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DOWNLOADS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const removeOne = (r: DownloadRecord) => {
    removeDownload(r.slug, r.chapter);
    toast(t("حُذف من سجل التحميلات", "Removed from downloads"));
  };

  const clearAll = () => {
    clearDownloads();
    setConfirmClear(false);
    toast(t("تم مسح سجل التحميلات", "Downloads history cleared"));
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-app">
          {t("سجل التحميلات", "Downloads history")}
        </h3>
        {items.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="glass-chip !py-1.5 text-xs font-semibold !text-danger hover:!border-danger/50"
          >
            <Trash2 size={13} />
            {t("مسح السجل", "Clear")}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={t("لا تحميلات بعد", "No downloads yet")}
          caption={t(
            "الفصول التي تحمّلها من صفحة المانجا أو القارئ ستُسجَّل هنا على جهازك.",
            "Chapters you download from the manga page or reader will be logged here on your device.",
          )}
          ctaLabel={t("تصفّح الأعمال", "Browse titles")}
          ctaTo="/browse"
        />
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout">
            {items.map((r, i) => (
              <motion.div
                key={`${r.slug}-${r.chapter}`}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -60, transition: { duration: 0.25 } }}
                transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 8) * 0.03 }}
                className="glass group flex items-center gap-3 !rounded-2xl p-3"
              >
                <span className="gradient-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <Download size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/manga/${r.slug}`}
                    className="block truncate text-sm font-bold text-app transition-colors hover:text-primary"
                  >
                    {r.title}
                  </Link>
                  <p className="mt-0.5 text-[11.5px] text-app-3">
                    {t("فصل", "Ch.")} {r.chapter.toLocaleString("ar")}
                    {" · "}
                    {new Date(r.at).toLocaleDateString(lang === "ar" ? "ar" : "en", {
                      day: "numeric",
                      month: "long",
                    })}
                  </p>
                </div>
                <Link
                  to={`/manga/${r.slug}/chapter/${r.chapter}`}
                  className="btn-glass shrink-0 !px-3.5 !py-1.5 text-xs font-semibold"
                >
                  {t("قراءة", "Read")}
                </Link>
                <button
                  onClick={() => removeOne(r)}
                  aria-label={t("حذف من السجل", "Remove record")}
                  className="btn-icon !h-9 !w-9 shrink-0 !text-danger opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                >
                  <Trash2 size={15} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <GlassModal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title={t("مسح سجل التحميلات؟", "Clear downloads history?")}
      >
        <p className="text-sm text-app-2">
          {t(
            "سيُمسح السجل المحلي على هذا الجهاز فقط — ملفاتك المحمّلة لا تتأثر.",
            "Only the local log on this device is cleared — your downloaded files are unaffected.",
          )}
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={clearAll}
            className="btn-primary flex-1 !py-2.5 text-sm !shadow-none"
            style={{ background: "var(--danger)" }}
          >
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
