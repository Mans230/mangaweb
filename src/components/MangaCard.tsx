import { useState } from "react";
import { Link } from "react-router";
import { Lock, Star } from "lucide-react";
import type { MangaCardData } from "@/lib/manga";
import AgeGateModal, { isAgeConfirmed } from "./AgeGateModal";
import { useLanguage } from "./LanguageProvider";

interface MangaCardProps {
  manga: MangaCardData;
  rank?: number;
  className?: string;
}

export default function MangaCard({ manga, rank, className = "" }: MangaCardProps) {
  const { t } = useLanguage();
  const [gateOpen, setGateOpen] = useState(false);
  const [allowed, setAllowed] = useState(!manga.isAdult || isAgeConfirmed());
  const blurCover = manga.isAdult && !allowed;

  const card = (
    <div className={`ed-card group ${className}`}>
      {/* Cover */}
      <div className="ed-card-cover">
        <img
          src={manga.cover}
          alt={manga.title}
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover ${blurCover ? "scale-110 blur-lg" : ""}`}
        />
        {blurCover && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
            <Lock size={26} className="text-white" />
            <span className="ed-tag">+18</span>
          </div>
        )}
        {/* type badge */}
        <span className="ed-type-badge">{manga.type}</span>
        {/* status square */}
        <span
          className={`absolute start-2 top-2 h-2 w-2 rounded-[2px] border border-black/20 ${
            manga.status === "مستمر" ? "bg-warning" : "bg-success"
          }`}
        />
        {manga.isAdult && !blurCover && (
          <span className="absolute bottom-2 start-2 rounded-[2px] bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
            +18
          </span>
        )}
        {/* rank digit */}
        {rank !== undefined && <span className="ed-rank">{rank}</span>}
      </div>

      {/* Meta */}
      <div className="px-1 pb-1 pt-2.5">
        <h3 className="truncate text-sm font-bold text-app transition-colors group-hover:text-[var(--ed-accent)]">
          {manga.title}
        </h3>
        <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-app-3">
          <span className="flex items-center gap-1 font-semibold" style={{ color: "var(--ed-accent)" }}>
            <Star size={12} fill="currentColor" />
            {manga.rating.toFixed(1)}
          </span>
          <span className="ed-tag-outline !text-[10.5px]">
            {t("فصل", "Ch.")} {manga.chapters}
          </span>
          <span className="ms-auto max-w-[72px] truncate">{manga.source}</span>
        </div>
      </div>
    </div>
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
