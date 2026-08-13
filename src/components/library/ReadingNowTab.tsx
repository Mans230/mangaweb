import { useMemo } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { Play } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { useLanguage } from "@/components/LanguageProvider";
import type { HistoryItem } from "./data";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface ReadingNowTabProps {
  history: HistoryItem[];
}

/**
 * "أقرأها الآن" — أحدث فصل مقروء لكل عمل (مشتقة من readingProgress)،
 * مع زر استكمال مباشر من حيث توقفت.
 */
export default function ReadingNowTab({ history }: ReadingNowTabProps) {
  const { t } = useLanguage();

  // أحدث عنصر لكل مانجا — السجل مرتب تنازلياً من الخادم، أول ظهور هو الأحدث
  const items = useMemo(() => {
    const seen = new Set<number>();
    const out: HistoryItem[] = [];
    for (const entry of history) {
      if (seen.has(entry.manga.id)) continue;
      seen.add(entry.manga.id);
      out.push(entry);
    }
    return out;
  }, [history]);

  if (items.length === 0) {
    return (
      <EmptyState
        title={t("لا قراءة جارية", "Nothing in progress")}
        caption={t(
          "ابدأ بقراءة أي فصل وسيظهر هنا لتكمل من حيث توقفت.",
          "Start reading any chapter and it will appear here so you can resume.",
        )}
        ctaLabel={t("اكتشف أعمالاً جديدة", "Discover new titles")}
        ctaTo="/browse"
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5 xl:grid-cols-6">
      {items.map((entry, i) => (
        <motion.div
          key={entry.manga.id}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE, delay: (i % 6) * 0.06 }}
          className="glass group relative flex flex-col overflow-hidden !rounded-2xl transition-colors hover:border-[var(--border-glow)]"
        >
          <Link to={`/manga/${entry.manga.slug}`} className="relative block overflow-hidden">
            <img
              src={entry.manga.cover}
              alt={entry.manga.title}
              loading="lazy"
              decoding="async"
              className="aspect-[2/3] w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent" />
            <span className="glass-chip absolute end-2 top-2 !px-2.5 !py-0.5 !text-[10.5px] font-bold text-primary">
              {t("وصلت للفصل", "At ch.")} {entry.chapter.toLocaleString("ar")}
            </span>
          </Link>
          <div className="flex flex-1 flex-col gap-2 p-3">
            <Link
              to={`/manga/${entry.manga.slug}`}
              className="line-clamp-1 text-[13px] font-bold text-app transition-colors hover:text-primary"
            >
              {entry.manga.title}
            </Link>
            <Link
              to={`/manga/${entry.manga.slug}/chapter/${entry.chapter}`}
              className="btn-primary mt-auto w-full justify-center !py-2 text-xs"
            >
              <Play size={13} />
              {t(`استكمل فصل ${entry.chapter.toLocaleString("ar")}`, `Resume ch. ${entry.chapter}`)}
            </Link>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
