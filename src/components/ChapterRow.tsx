import { Link } from "react-router";
import { motion } from "framer-motion";
import type { LatestChapterData } from "@/lib/manga";
import { useLanguage } from "./LanguageProvider";

interface ChapterRowProps {
  item: LatestChapterData;
}

/** LatestChapterRow — صف فصل حديث: غلاف 56×84 + عنوان + شريحة فصل + وقت + مصدر */
export default function ChapterRow({ item }: ChapterRowProps) {
  const { t } = useLanguage();

  return (
    <motion.div whileHover={{ x: -4 }} transition={{ duration: 0.25 }}>
      <Link
        to={`/manga/${item.mangaSlug}/chapter/${item.chapter}`}
        className="glass group flex items-center gap-3 !rounded-2xl p-2.5 transition-colors hover:border-[var(--border-glow)]"
      >
        <img
          src={item.cover}
          alt={item.mangaTitle}
          loading="lazy"
          decoding="async"
          className="h-[84px] w-14 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-app transition-colors group-hover:text-primary">
            {item.mangaTitle}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="glass-chip !px-2.5 !py-0.5 !text-[11px] font-semibold text-primary">
              {t("فصل", "Ch.")} {item.chapter}
            </span>
            {item.isNew && (
              <span className="animate-pulse-soft rounded-full bg-accent-2 px-2 py-0.5 text-[10px] font-bold text-white">
                {t("جديد", "NEW")}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-app-3">
            <span>{item.timeAgo}</span>
            <span className="h-1 w-1 rounded-full bg-app-3 opacity-50" />
            <span className="truncate">{item.source}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
