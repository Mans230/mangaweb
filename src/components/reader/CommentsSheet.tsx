import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import ChapterComments from "./ChapterComments";

interface CommentsSheetProps {
  open: boolean;
  onClose: () => void;
  mangaId: number | null;
  chapterId: number | null;
  fromApi: boolean;
  chapterNumber: number;
  onTotalChange?: (total: number) => void;
}

/** Chapter comments as a bottom sheet (used in paged mode). */
export default function CommentsSheet({
  open,
  onClose,
  mangaId,
  chapterId,
  fromApi,
  chapterNumber,
  onTotalChange,
}: CommentsSheetProps) {
  const { t } = useLanguage();

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
            className="glass-strong fixed inset-x-0 bottom-0 z-[71] max-h-[80vh] overflow-y-auto rounded-t-3xl border-b-0 md:start-1/2 md:end-auto md:bottom-6 md:w-full md:max-w-2xl md:-translate-x-1/2 md:rounded-3xl md:border-b"
            role="dialog"
            aria-modal="true"
            aria-label={t("تعليقات الفصل", "Chapter comments")}
          >
            <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-app-3/40" />
            <div className="flex justify-end px-4 pt-2">
              <button className="btn-icon !h-9 !w-9" onClick={onClose} aria-label={t("إغلاق", "Close")}>
                <X size={17} />
              </button>
            </div>
            <ChapterComments
              mangaId={mangaId}
              chapterId={chapterId}
              fromApi={fromApi}
              chapterNumber={chapterNumber}
              onTotalChange={onTotalChange}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
