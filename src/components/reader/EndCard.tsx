import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, Flag } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import StarRating from "@/components/StarRating";

interface EndCardProps {
  chapterNumber: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  rating: number;
  onRate: (stars: number) => void;
  onOpenDownload: () => void;
  /** مانجا إنجليزية — عرض النصوص بالإنجليزية حتى مع واجهة عربية */
  isEn?: boolean;
}

export default function EndCard({
  chapterNumber,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  rating,
  onRate,
  onOpenDownload,
  isEn = false,
}: EndCardProps) {
  const { t } = useLanguage();
  const tt = (ar: string, en: string) => (isEn ? en : t(ar, en));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="glass mx-3 my-10 flex flex-col items-center gap-5 p-6 text-center md:p-8"
    >
      <div className="flex items-center gap-2 text-primary">
        <Flag size={18} />
        <h3 className="font-display text-xl font-bold text-app">
          {tt("نهاية الفصل", "End of chapter")} {chapterNumber}
        </h3>
      </div>

      {/* rate this chapter */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-semibold text-app-2">{tt("قيّم هذا الفصل", "Rate this chapter")}</p>
        <StarRating value={rating} size={26} interactive onChange={onRate} />
        {rating > 0 && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-success"
          >
            {tt("شكراً! تم حفظ تقييمك", "Thanks! Your rating was saved")}
          </motion.p>
        )}
      </div>

      {/* prev / next big buttons */}
      <div className="flex w-full max-w-md flex-col gap-2.5 sm:flex-row">
        <button
          className="btn-glass flex-1 !py-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          onClick={onPrev}
          disabled={!hasPrev}
        >
          <ChevronRight size={17} />
          {tt("الفصل السابق", "Previous chapter")}
        </button>
        <button
          className="btn-primary flex-1 !py-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          onClick={onNext}
          disabled={!hasNext}
        >
          {tt("الفصل التالي", "Next chapter")}
          <ChevronLeft size={17} />
        </button>
      </div>

      <button className="btn-glass !py-2.5 text-sm" onClick={onOpenDownload}>
        <Download size={16} />
        {tt("تحميل الفصل (PDF / CBZ)", "Download chapter (PDF / CBZ)")}
      </button>
    </motion.div>
  );
}
