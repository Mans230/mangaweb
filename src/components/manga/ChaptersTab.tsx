import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CheckCheck,
  ChevronLeft,
  Play,
  Search,
  X,
} from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type { ChapterVM } from "./types";
import { fmtChapter } from "./types";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const ROW_H = 68;
const VIRTUALIZE_AFTER = 100;
const ANIMATE_FIRST = 20;

interface ChaptersTabProps {
  slug: string;
  title: string;
  cover: string;
  chapters: ChapterVM[];
  /** رقم آخر فصل مقروء — null إن لم تبدأ القراءة */
  lastReadNumber: number | null;
  nextChapter: number | null;
  markAllPending: boolean;
  onMarkAllRead: () => void;
  onMarkAllUnread: () => void;
}

/** علامة صح تُرسم عند القراءة */
function ReadCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <motion.path
        d="M4 12.5l5 5L20 6.5"
        stroke="var(--success)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: EASE }}
      />
    </svg>
  );
}

export default function ChaptersTab({
  slug,
  title,
  cover,
  chapters,
  lastReadNumber,
  nextChapter,
  markAllPending,
  onMarkAllRead,
  onMarkAllUnread,
}: ChaptersTabProps) {
  const { t } = useLanguage();
  const [newestFirst, setNewestFirst] = useState(true);
  const [query, setQuery] = useState("");
  const [confirmMark, setConfirmMark] = useState(false);
  const [confirmUnmark, setConfirmUnmark] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 40 });
  const [barVisible, setBarVisible] = useState(false);

  // الفصول المفلترة والمرتبة
  const items = useMemo(() => {
    const q = query.trim();
    let list = chapters;
    if (q) {
      list = list.filter(
        (c) => fmtChapter(c.number).includes(q) || (c.title ?? "").includes(q),
      );
    }
    return newestFirst ? list : [...list].reverse();
  }, [chapters, query, newestFirst]);

  // virtualization: نافذة عرض بعد 100 عنصر
  const virtualized = items.length > VIRTUALIZE_AFTER;
  useEffect(() => {
    if (!virtualized) return;
    const update = () => {
      const el = listRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const start = Math.max(0, Math.floor((window.scrollY - top - 800) / ROW_H));
      const end = Math.min(
        items.length,
        Math.ceil((window.scrollY + window.innerHeight - top + 800) / ROW_H),
      );
      setRange((r) => {
        const next = { start, end: Math.max(end, Math.min(items.length, start + 15)) };
        return r.start === next.start && r.end === next.end ? r : next;
      });
    };
    const id = requestAnimationFrame(update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [virtualized, items.length]);
  const visibleRange = virtualized ? range : { start: 0, end: items.length };

  // الشريط اللاصق بعد تمرير 400px
  useEffect(() => {
    const onScroll = () => setBarVisible(window.scrollY > 400);
    const id = requestAnimationFrame(onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const continueNumber = nextChapter ?? items[items.length - 1]?.number ?? null;

  const handleMarkAll = () => {
    if (!confirmMark) {
      setConfirmMark(true);
      window.setTimeout(() => setConfirmMark(false), 3000);
      return;
    }
    setConfirmMark(false);
    onMarkAllRead();
  };

  const handleUnmarkAll = () => {
    if (!confirmUnmark) {
      setConfirmUnmark(true);
      window.setTimeout(() => setConfirmUnmark(false), 3000);
      return;
    }
    setConfirmUnmark(false);
    onMarkAllUnread();
  };

  const renderRow = (c: ChapterVM, index: number) => {
    const isRead = lastReadNumber !== null && c.number <= lastReadNumber;
    const isNext = nextChapter !== null && c.number === nextChapter;
    const row = (
      <Link
        to={`/manga/${slug}/chapter/${fmtChapter(c.number)}`}
        className={`group flex h-[60px] items-center gap-3 rounded-2xl border px-3 transition-colors ${
          isNext
            ? "border-[rgba(224,86,31,0.35)] bg-[rgba(224,86,31,0.12)]"
            : "border-transparent hover:bg-[rgba(224,86,31,0.08)]"
        } ${isRead ? "opacity-55" : ""}`}
      >
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
            isRead
              ? "border-[rgba(52,211,153,0.45)] bg-[rgba(52,211,153,0.12)] text-[#34d399]"
              : "border-[var(--glass-border)] bg-[rgba(10,12,20,0.55)] text-app-3"
          }`}
        >
          {t("فصل", "Ch.")} {fmtChapter(c.number)}
        </span>
        <span className={`min-w-0 flex-1 truncate text-sm font-medium text-app ${isRead ? "line-through decoration-app-3/40" : ""}`}>
          {c.title || t(`الفصل ${fmtChapter(c.number)}`, `Chapter ${fmtChapter(c.number)}`)}
        </span>
        {isNext && (
          <span className="gradient-primary shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white">
            {t("تابع من هنا", "Continue here")}
          </span>
        )}
        {c.isNew && !isRead && !isNext && (
          <span className="shrink-0 rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-white">
            {t("جديد", "NEW")}
          </span>
        )}
        <span className="shrink-0 text-[11px] text-app-3">{c.timeAgo}</span>
        <span className="hidden shrink-0 text-[11px] text-app-3 md:inline">
          {c.pageCount > 0 ? `${c.pageCount} ${t("صفحة", "pages")}` : ""}
        </span>
        {isRead && <ReadCheck />}
        <ChevronLeft
          size={16}
          className="shrink-0 text-primary opacity-0 transition-all duration-200 group-hover:-translate-x-0.5 group-hover:opacity-100 rtl:-scale-x-100"
        />
      </Link>
    );

    return index < ANIMATE_FIRST ? (
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: EASE, delay: index * 0.03 }}
        className="h-full"
      >
        {row}
      </motion.div>
    ) : (
      row
    );
  };

  return (
    <div>
      {/* ===== شريط الأدوات ===== */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-app">
          {items.length} {t("فصل", "chapters")}
        </span>
        <div className="ms-auto flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-app-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("ابحث برقم الفصل…", "Search chapter #…")}
              className="input-glass w-40 !py-2 ps-8 text-xs md:w-52"
              dir="auto"
            />
          </div>
          <button
            type="button"
            onClick={() => setNewestFirst((v) => !v)}
            className="btn-icon !h-10 !w-10"
            aria-label={newestFirst ? t("الأقدم أولاً", "Oldest first") : t("الأحدث أولاً", "Newest first")}
            title={newestFirst ? t("الأحدث", "Newest") : t("الأقدم", "Oldest")}
          >
            {newestFirst ? <ArrowDownWideNarrow size={16} /> : <ArrowUpNarrowWide size={16} />}
          </button>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={markAllPending}
            className={`glass-chip !py-2 text-[11px] font-semibold ${confirmMark ? "!border-[var(--border-glow)] text-primary" : ""}`}
          >
            <CheckCheck size={14} />
            {confirmMark ? t("تأكيد؟", "Confirm?") : t("تحديد الكل كمقروء", "Mark all read")}
          </button>
          {lastReadNumber !== null && lastReadNumber > 0 && (
            <button
              type="button"
              onClick={handleUnmarkAll}
              disabled={markAllPending}
              className={`glass-chip !py-2 text-[11px] font-semibold text-app-3 ${confirmUnmark ? "!border-danger/60 !text-danger" : ""}`}
            >
              <X size={14} />
              {confirmUnmark ? t("تأكيد؟", "Confirm?") : t("إلغاء تحديد الكل", "Unmark all")}
            </button>
          )}
        </div>
      </div>

      {/* ===== القائمة ===== */}
      {items.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-app-3">
          {t("لا توجد فصول مطابقة", "No matching chapters")}
        </div>
      ) : virtualized ? (
        <div ref={listRef} className="relative" style={{ height: items.length * ROW_H }}>
          {items.slice(visibleRange.start, visibleRange.end).map((c, i) => {
            const index = visibleRange.start + i;
            return (
              <div
                key={c.id}
                className="absolute inset-x-0 py-1"
                style={{ top: index * ROW_H, height: ROW_H }}
              >
                {renderRow(c, index)}
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          {items.map((c, i) => (
            <div key={c.id} className="py-1" style={{ height: ROW_H }}>
              {renderRow(c, i)}
            </div>
          ))}
        </div>
      )}

      {/* ===== شريط "تابع القراءة" اللاصق ===== */}
      <AnimatePresence>
        {barVisible && continueNumber !== null && (
          <div className="fixed inset-x-3 bottom-20 z-40 lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-20 lg:w-[560px] lg:-translate-x-1/2">
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="glass-strong flex items-center gap-3 rounded-2xl p-2.5"
            >
              <img src={cover} alt={title} className="h-12 w-9 shrink-0 rounded-lg object-cover" />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-app">{title}</span>
              <Link
                to={`/manga/${slug}/chapter/${fmtChapter(continueNumber)}`}
                className="btn-primary shrink-0 !px-4 !py-2 text-xs"
              >
                <Play size={13} />
                {nextChapter !== null
                  ? t("تابع القراءة", "Continue")
                  : t("اقرأ من البداية", "Start reading")}
              </Link>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
