import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  MessageSquareText,
  Rows3,
  Settings,
  SquareStack,
} from "lucide-react";
import { Link } from "react-router";
import { useLanguage } from "@/components/LanguageProvider";
import type { ReadingMode } from "./store";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface ReaderChromeProps {
  visible: boolean;
  slug: string;
  title: string;
  chapterNumber: number;
  /** 0..1 reading progress */
  progress: number;
  /** briefly show the floating % pill */
  showPct: boolean;
  mode: ReadingMode;
  onToggleMode: () => void;
  onOpenSettings: () => void;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onOpenChapters: () => void;
  commentsCount: number;
  onOpenComments: () => void;
  markedRead: boolean;
}

export default function ReaderChrome({
  visible,
  slug,
  title,
  chapterNumber,
  progress,
  showPct,
  mode,
  onToggleMode,
  onOpenSettings,
  bookmarked,
  onToggleBookmark,
  hasPrev,
  hasNext,
  onPrevChapter,
  onNextChapter,
  onOpenChapters,
  commentsCount,
  onOpenComments,
  markedRead,
}: ReaderChromeProps) {
  const { t, dir } = useLanguage();
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  return (
    <>
      {/* ===== Reading progress bar (always visible, GPU scaleX) ===== */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[65] h-[3px] bg-transparent">
        <div
          className="gradient-primary h-full w-full will-change-transform"
          style={{
            transform: `scaleX(${Math.max(0, Math.min(1, progress))})`,
            transformOrigin: dir === "rtl" ? "right" : "left",
            transition: "transform 0.15s linear",
          }}
        />
      </div>

      {/* ===== Floating % pill ===== */}
      <AnimatePresence>
        {showPct && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="glass-strong pointer-events-none fixed bottom-24 left-1/2 z-[64] -translate-x-1/2 rounded-full px-4 py-1.5 text-sm font-semibold text-app"
            dir="ltr"
          >
            {pct}%
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Top bar ===== */}
      <motion.div
        initial={false}
        animate={{ y: visible ? 0 : "-110%" }}
        transition={{ duration: 0.25, ease: EASE }}
        className="glass-strong fixed inset-x-0 top-0 z-[62] border-x-0 border-t-0"
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-3 md:px-4">
          <Link
            to={`/manga/${slug}`}
            className="btn-icon !h-9 !w-9 shrink-0"
            aria-label={t("عودة لصفحة المانجا", "Back to manga")}
          >
            <ArrowRight size={18} className="rtl:rotate-0 ltr:rotate-180" />
          </Link>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-app">
              {title}
              <span className="text-app-3"> — </span>
              <span className="text-primary">
                {t("فصل", "Ch.")} {chapterNumber}
              </span>
            </p>
          </div>

          <button
            className="btn-icon !h-9 !w-9"
            onClick={onToggleMode}
            aria-label={t("تبديل وضع القراءة", "Toggle reading mode")}
            title={mode === "webtoon" ? t("ويب تون", "Webtoon") : t("صفحة-صفحة", "Paged")}
          >
            {mode === "webtoon" ? <Rows3 size={18} /> : <SquareStack size={18} />}
          </button>
          <button
            className="btn-icon !h-9 !w-9"
            onClick={onToggleBookmark}
            aria-label={t("حفظ إشارة مرجعية", "Bookmark")}
          >
            {bookmarked ? <BookmarkCheck size={18} className="text-primary" /> : <Bookmark size={18} />}
          </button>
          <button
            className="btn-icon !h-9 !w-9"
            onClick={onOpenSettings}
            aria-label={t("إعدادات القارئ", "Reader settings")}
          >
            <Settings size={18} />
          </button>
        </div>
      </motion.div>

      {/* ===== Bottom bar ===== */}
      <motion.div
        initial={false}
        animate={{ y: visible ? 0 : "110%" }}
        transition={{ duration: 0.25, ease: EASE }}
        className="glass-strong fixed inset-x-0 bottom-0 z-[62] border-x-0 border-b-0"
      >
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-3 md:px-4">
          <button
            className="btn-glass !px-3 !py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 md:!px-4 md:text-sm"
            onClick={onPrevChapter}
            disabled={!hasPrev}
          >
            <ChevronRight size={16} />
            <span className="hidden sm:inline">{t("الفصل السابق", "Prev chapter")}</span>
            <span className="sm:hidden">{t("السابق", "Prev")}</span>
          </button>

          <button
            className="glass-chip mx-auto h-10 max-w-40 items-center justify-center !px-4 font-semibold text-app"
            onClick={onOpenChapters}
            aria-label={t("قائمة الفصول", "Chapter list")}
          >
            {markedRead && <CheckCheck size={15} className="text-success" />}
            <span className="truncate">
              {t("فصل", "Ch.")} {chapterNumber}
            </span>
            <ChevronsUpDown size={14} className="text-app-3" />
          </button>

          <button
            className="btn-icon relative !h-10 !w-10"
            onClick={onOpenComments}
            aria-label={t("تعليقات الفصل", "Chapter comments")}
          >
            <MessageSquareText size={18} />
            {commentsCount > 0 && (
              <span className="gradient-primary absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white">
                {commentsCount > 99 ? "99+" : commentsCount}
              </span>
            )}
          </button>

          <button
            className="btn-glass !px-3 !py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 md:!px-4 md:text-sm"
            onClick={onNextChapter}
            disabled={!hasNext}
          >
            <span className="hidden sm:inline">{t("الفصل التالي", "Next chapter")}</span>
            <span className="sm:hidden">{t("التالي", "Next")}</span>
            <ChevronLeft size={16} />
          </button>
        </div>
      </motion.div>
    </>
  );
}
