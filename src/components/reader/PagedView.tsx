import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type { FitMode, FlipDirection, ImageQuality } from "./store";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface PagedViewProps {
  pages: string[];
  page: number; // 0-based index
  onPageChange: (page: number) => void;
  direction: FlipDirection;
  fit: FitMode;
  quality: ImageQuality;
  onToggleFit: () => void;
  /** center tap toggles the chrome */
  onTapCenter: () => void;
  /** report progress 0..1 for the progress bar */
  onProgress: (ratio: number) => void;
  chapterKey: string;
}

export default function PagedView({
  pages,
  page,
  onPageChange,
  direction,
  fit,
  quality,
  onToggleFit,
  onTapCenter,
  onProgress,
  chapterKey,
}: PagedViewProps) {
  const { t } = useLanguage();
  const total = pages.length;
  const lastTapRef = useRef(0);
  // transition direction: +1 = moving forward in reading order
  const dirRef = useRef(1);

  const go = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(total - 1, page + delta));
      if (next === page) return;
      dirRef.current = delta > 0 ? 1 : -1;
      onPageChange(next);
    },
    [page, total, onPageChange],
  );

  // In RTL reading order "next" lives on the LEFT side.
  const next = useCallback(() => go(1), [go]);
  const prev = useCallback(() => go(-1), [go]);

  // Progress reporting
  useEffect(() => {
    onProgress(total <= 1 ? 1 : page / (total - 1));
  }, [page, total, onProgress]);

  // Keyboard navigation (respects flip direction)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        direction === "rtl" ? next() : prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        direction === "rtl" ? prev() : next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [direction, next, prev]);

  // Preload next 2 pages
  useEffect(() => {
    for (let i = page + 1; i <= Math.min(total - 1, page + 2); i++) {
      const img = new Image();
      img.src = pages[i];
    }
  }, [page, pages, total]);

  // Tap zones: right/left thirds flip pages (direction-aware), center toggles chrome.
  // Single-tap navigation is delayed ~280ms so a double-tap can toggle zoom instead.
  const tapTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    },
    [],
  );

  const onZoneTap = (zone: "start" | "center" | "end") => {
    if (zone === "center") {
      onTapCenter();
      return;
    }
    // zone "start" = right third in RTL document, left third in LTR document
    const tappedNextZone =
      direction === "rtl" ? zone === "end" : zone === "start";
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // double-tap → toggle fit-width / fit-screen zoom
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
      lastTapRef.current = 0;
      onToggleFit();
      return;
    }
    lastTapRef.current = now;
    tapTimerRef.current = window.setTimeout(() => {
      tappedNextZone ? next() : prev();
    }, 280);
  };

  // Swipe with resistance; spring back under 80px
  const onDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    const x = info.offset.x;
    if (Math.abs(x) < 80) return;
    if (direction === "rtl") {
      x > 0 ? next() : prev();
    } else {
      x < 0 ? next() : prev();
    }
  };

  const slideDir = direction === "rtl" ? -dirRef.current : dirRef.current;

  return (
    <div className="group relative flex min-h-[100svh] w-full select-none items-center justify-center overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false} custom={slideDir}>
        <motion.img
          key={`${chapterKey}-${page}`}
          src={pages[page]}
          alt={t(`صفحة ${page + 1} من ${total}`, `Page ${page + 1} of ${total}`)}
          custom={slideDir}
          initial={{ x: `${100 * slideDir}%`, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: `${-100 * slideDir}%`, opacity: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={onDragEnd}
          draggable={false}
          className={`max-w-full cursor-grab active:cursor-grabbing ${
            fit === "screen"
              ? "max-h-[100svh] object-contain"
              : "w-full object-contain"
          } ${quality === "saver" ? "[filter:saturate(0.92)_contrast(0.98)]" : ""}`}
        />
      </AnimatePresence>

      {/* Tap zones (invisible thirds) */}
      <div className="absolute inset-0 z-10 flex" aria-hidden={false}>
        <button
          className="h-full flex-1 cursor-pointer"
          aria-label={t("المنطقة اليمنى", "Start zone")}
          onClick={() => onZoneTap("start")}
        />
        <button
          className="h-full flex-1 cursor-pointer"
          aria-label={t("تبديل الأشرطة", "Toggle chrome")}
          onClick={() => onZoneTap("center")}
        />
        <button
          className="h-full flex-1 cursor-pointer"
          aria-label={t("المنطقة اليسرى", "End zone")}
          onClick={() => onZoneTap("end")}
        />
      </div>

      {/* On-screen glass arrows (desktop hover) */}
      <button
        onClick={direction === "rtl" ? prev : next}
        aria-label={t("التالي", "Next")}
        className="btn-icon absolute start-3 top-1/2 z-20 hidden -translate-y-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 md:inline-flex"
      >
        {direction === "rtl" ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
      </button>
      <button
        onClick={direction === "rtl" ? next : prev}
        aria-label={t("السابق", "Previous")}
        className="btn-icon absolute end-3 top-1/2 z-20 hidden -translate-y-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 md:inline-flex"
      >
        {direction === "rtl" ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
      </button>

      {/* Page counter pill */}
      <div className="glass-strong pointer-events-none absolute bottom-20 left-1/2 z-20 -translate-x-1/2 overflow-hidden rounded-full px-4 py-1.5 text-sm font-semibold text-app">
        <span className="relative inline-flex h-5 items-center overflow-hidden" dir="ltr">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={page}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="tabular-nums"
            >
              {page + 1}
            </motion.span>
          </AnimatePresence>
          <span className="text-app-3"> / {total}</span>
        </span>
      </div>
    </div>
  );
}
