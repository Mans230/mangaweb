import { Link } from "react-router";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import type { MangaCardData } from "@/lib/manga";
import MangaCard from "@/components/MangaCard";
import { useLanguage } from "@/components/LanguageProvider";
import type { ViewMode } from "./constants";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/* ================= Skeletons ================= */
export function ResultsSkeleton({ view }: { view: ViewMode }) {
  if (view === "list") {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass flex !rounded-2xl p-2.5">
            <div className="skeleton h-[126px] w-[84px] shrink-0 !rounded-xl" />
            <div className="flex flex-1 flex-col gap-2.5 p-3">
              <div className="skeleton h-4 w-2/5" />
              <div className="skeleton h-3 w-4/5" />
              <div className="skeleton mt-auto h-5 w-1/3 !rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5 lg:grid-cols-3 xl:grid-cols-4"
      aria-busy="true"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="glass !rounded-2xl p-2">
          <div className="skeleton aspect-[2/3] !rounded-[14px]" />
          <div className="flex flex-col gap-2 px-1.5 pb-1.5 pt-3">
            <div className="skeleton h-3.5 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================= صف عرض القائمة ================= */
function MangaListRow({ manga }: { manga: MangaCardData }) {
  const { t } = useLanguage();
  return (
    <motion.div whileHover={{ x: -4 }} transition={{ duration: 0.25 }}>
      <Link
        to={`/manga/${manga.slug}`}
        className="glass sheen group flex !rounded-2xl p-2.5 transition-colors hover:border-[var(--border-glow)]"
      >
        <div className="relative h-[126px] w-[84px] shrink-0 overflow-hidden rounded-xl">
          <img
            src={manga.cover}
            alt={manga.title}
            loading="lazy"
            className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
              manga.isAdult ? "scale-110 blur-md" : ""
            }`}
          />
          <span
            className={`absolute start-1.5 top-1.5 h-2 w-2 rounded-full ${
              manga.status === "مستمر" ? "animate-pulse-soft bg-warning" : "bg-success"
            }`}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col px-3.5 py-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-bold text-app transition-colors group-hover:text-primary md:text-base">
              {manga.title}
            </h3>
            <span className="glass-chip shrink-0 !border-0 !px-2 !py-0.5 !text-[10px] font-bold text-primary">
              {manga.type}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-app-3">{manga.synopsis}</p>
          <div className="mt-1.5 hidden flex-wrap gap-1.5 sm:flex">
            {manga.genres.slice(0, 3).map((g) => (
              <span key={g} className="glass-chip !px-2.5 !py-0.5 !text-[10.5px]">
                {g}
              </span>
            ))}
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[11.5px] text-app-3">
            <span className="flex items-center gap-1 font-semibold text-warning">
              <Star size={12} fill="currentColor" />
              {manga.rating.toFixed(1)}
            </span>
            <span className={manga.status === "مستمر" ? "text-warning" : "text-success"}>
              {manga.status}
            </span>
            <span>
              {manga.chapters} {t("فصل", "chapters")}
            </span>
            <span className="glass-chip ms-auto !border-0 !px-2.5 !py-0.5 !text-[10.5px] font-semibold text-accent-2">
              {t("أحدث فصل", "Latest")} {manga.chapters}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/* ================= شبكة/قائمة النتائج ================= */
interface ResultsGridProps {
  items: MangaCardData[];
  view: ViewMode;
  animKey: string;
}

export function ResultsGrid({ items, view, animKey }: ResultsGridProps) {
  return (
    <motion.div
      key={`${animKey}-${view}`}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.05 } },
      }}
      className={
        view === "grid"
          ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5 lg:grid-cols-3 xl:grid-cols-4"
          : "flex flex-col gap-3"
      }
    >
      {items.map((m) => (
        <motion.div
          key={m.id}
          layout="position"
          variants={{
            hidden: { y: 24, opacity: 0 },
            show: { y: 0, opacity: 1, transition: { duration: 0.45, ease: EASE } },
          }}
        >
          {view === "grid" ? <MangaCard manga={m} /> : <MangaListRow manga={m} />}
        </motion.div>
      ))}
    </motion.div>
  );
}

/* ================= ترقيم الصفحات ================= */
interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  const { t } = useLanguage();
  if (totalPages <= 1) return null;

  // نافذة من 5 أرقام حول الصفحة الحالية
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);

  return (
    <nav
      className="mt-8 flex items-center justify-center gap-2"
      aria-label={t("ترقيم الصفحات", "Pagination")}
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label={t("السابق", "Previous")}
        className="btn-icon disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronRight size={17} className="rtl:-scale-x-100" />
      </button>
      {pages.map((p) => (
        <motion.button
          key={p}
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => onChange(p)}
          aria-current={p === page ? "page" : undefined}
          className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-all ${
            p === page
              ? "gradient-primary text-white shadow-[0_6px_18px_rgba(224,86,31,0.4)]"
              : "glass-chip !justify-center !p-0 text-app-2"
          }`}
        >
          {p}
        </motion.button>
      ))}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label={t("التالي", "Next")}
        className="btn-icon disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronLeft size={17} className="rtl:-scale-x-100" />
      </button>
    </nav>
  );
}
