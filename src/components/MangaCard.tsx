import { useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { Lock, Star } from "lucide-react";
import type { Manga } from "@/data/mock";
import AgeGateModal, { isAgeConfirmed } from "./AgeGateModal";
import { useLanguage } from "./LanguageProvider";

interface MangaCardProps {
  manga: Manga;
  rank?: number;
  className?: string;
}

const typeColors: Record<string, string> = {
  مانهوا: "var(--primary-soft)",
  مانجا: "var(--accent-2)",
  مانها: "var(--accent)",
};

export default function MangaCard({ manga, rank, className = "" }: MangaCardProps) {
  const { t } = useLanguage();
  const [gateOpen, setGateOpen] = useState(false);
  const [allowed, setAllowed] = useState(!manga.isAdult || isAgeConfirmed());
  const blurCover = manga.isAdult && !allowed;

  const card = (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`glass group relative overflow-hidden !rounded-2xl p-2 transition-shadow hover:shadow-[0_16px_40px_rgba(124,58,237,0.18)] ${className}`}
    >
      {/* Cover */}
      <div className="sheen relative aspect-[2/3] overflow-hidden rounded-[14px]">
        <img
          src={manga.cover}
          alt={manga.title}
          loading="lazy"
          className={`h-full w-full object-cover transition-transform duration-500 ease-expo-out group-hover:scale-[1.06] ${
            blurCover ? "scale-110 blur-lg" : ""
          }`}
        />
        {blurCover && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30">
            <Lock size={26} className="text-white" />
            <span className="glass-chip !text-[11px] font-bold text-white">+18</span>
          </div>
        )}
        {/* gradient overlay + title on hover */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        {/* type badge */}
        <span
          className="absolute end-2 top-2 rounded-full px-2.5 py-1 text-[10.5px] font-bold text-white shadow-md"
          style={{ background: typeColors[manga.type] ?? "var(--primary-soft)" }}
        >
          {manga.type}
        </span>
        {/* status dot */}
        <span className="absolute start-2.5 top-2.5 flex h-2.5 w-2.5">
          <span
            className={`h-full w-full rounded-full ${
              manga.status === "مستمر" ? "animate-pulse-soft bg-warning" : "bg-success"
            }`}
          />
        </span>
        {manga.isAdult && !blurCover && (
          <span className="absolute bottom-2 start-2 rounded-md bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
            +18
          </span>
        )}
        {/* rank digit */}
        {rank !== undefined && (
          <span
            className="absolute bottom-1 end-2 font-display text-5xl font-extrabold leading-none text-transparent opacity-90"
            style={{ WebkitTextStroke: "1.5px rgba(255,255,255,0.75)" }}
          >
            {rank}
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="px-1.5 pb-1.5 pt-2.5">
        <h3 className="truncate text-sm font-bold text-app">{manga.title}</h3>
        <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-app-3">
          <span className="flex items-center gap-1 font-semibold text-warning">
            <Star size={12} fill="currentColor" />
            {manga.rating.toFixed(1)}
          </span>
          <span className="glass-chip !border-0 !px-2 !py-0.5 !text-[10.5px]">
            {t("فصل", "Ch.")} {manga.chapters}
          </span>
          <span className="ms-auto flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            <span className="max-w-[72px] truncate">{manga.source}</span>
          </span>
        </div>
      </div>
    </motion.div>
  );

  if (manga.isAdult && !allowed) {
    return (
      <>
        <button
          type="button"
          className="block w-full text-start"
          onClick={() => setGateOpen(true)}
          aria-label={manga.title}
        >
          {card}
        </button>
        <AgeGateModal
          open={gateOpen}
          cover={manga.cover}
          onConfirm={() => {
            setAllowed(true);
            setGateOpen(false);
          }}
          onClose={() => setGateOpen(false)}
        />
      </>
    );
  }

  return <Link to={`/manga/${manga.slug}`} className="block">{card}</Link>;
}
