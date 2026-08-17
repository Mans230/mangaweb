import { useRef } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dices,
  Flame,
  Gem,
  Library,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  formatViews,
  mangaStatusLabel,
  proxyImg,
  timeAgo,
} from "@/lib/manga";
import type { MangaCardData, MangaStatus, MangaType } from "@/lib/manga";
import MangaCard from "@/components/MangaCard";
import LazySection from "@/components/LazySection";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/** Source names that mark a manga as English-language */
export const EN_SOURCE_NAMES = ["mangadex", "asurascans", "vortexscans"];

/** Row shape returned by every trpc.en.* card query (same as manga.mostViewed) */
interface EnCardRow {
  id: number;
  slug: string;
  title: string;
  coverUrl: string | null;
  type: string;
  status: string;
  genres: string[] | null;
  rating: number;
  viewCount: number | null;
  siteViewCount: number | null;
  chapterCount: number;
  source: { id: number; name: string } | null;
  latestChapter?: {
    id: number;
    number: number;
    publishedAt?: Date | string | null;
    createdAt: Date | string;
  } | null;
}

const TYPE_EN: Record<string, string> = {
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
};

/** EN card row → MangaCardData (English type badge; status kept Arabic internally for the dot color — never rendered as text) */
function adaptEnCard(m: EnCardRow): MangaCardData {
  return {
    id: Number(m.id),
    slug: m.slug,
    title: m.title,
    cover: proxyImg(m.coverUrl) || "/cover-01.png",
    type: (TYPE_EN[m.type] ?? "Manga") as MangaType,
    status: mangaStatusLabel(m.status) as MangaStatus,
    rating: m.rating ?? 0,
    ratingCount: 0,
    chapters: m.chapterCount ?? 0,
    views: formatViews(m.viewCount ?? 0),
    genres: m.genres ?? [],
    synopsis: "",
    source: m.source?.name ?? "",
    isAdult: false,
    updatedAt: "",
  };
}

/* ================= Section header (LTR twin of Home's SectionHeader) ================= */
function EnSectionHeader({
  title,
  moreTo,
  extra,
  count,
}: {
  title: string;
  moreTo?: string;
  extra?: React.ReactNode;
  count?: string;
}) {
  return (
    <div className="ed-sec-head">
      <h2>{title}</h2>
      <div className="ed-rule" />
      {count && <span className="ed-count">{count}</span>}
      {extra}
      {moreTo && (
        <Link to={moreTo} className="ed-btn-ghost-sm">
          View all
          <ArrowRight size={13} />
        </Link>
      )}
    </div>
  );
}

/* ================= Shared skeletons ================= */
function GridSkeleton({ n = 5 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton aspect-[2/3] !rounded" />
      ))}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="w-[42vw] shrink-0 sm:w-[30vw] md:w-[calc((100%-5*20px)/6)]">
          <div className="skeleton aspect-[2/3] !rounded" />
        </div>
      ))}
    </div>
  );
}

/* ================= Horizontal carousel (same pattern as Home's PopularCarousel) ================= */
function EnCarousel({
  title,
  icon,
  items,
  loading,
  ranked = false,
}: {
  title: string;
  icon?: React.ReactNode;
  items: MangaCardData[];
  loading: boolean;
  ranked?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  if (loading) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <div className="mb-6"><div className="skeleton h-8 w-44 !rounded" /></div>
        <RowSkeleton />
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
      <EnSectionHeader
        title={title}
        count={`${String(items.length).padStart(2, "0")} TITLES`}
        extra={
          <div className="hidden items-center gap-2 md:flex">
            {icon}
            <button onClick={() => scroll(1)} className="ed-arrow" aria-label="next">
              <ChevronRight size={17} />
            </button>
            <button onClick={() => scroll(-1)} className="ed-arrow" aria-label="prev">
              <ChevronLeft size={17} />
            </button>
          </div>
        }
      />
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((manga, i) => (
          <motion.div
            key={manga.id}
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.5, ease: EASE, delay: i * 0.05 }}
            className="w-[42vw] shrink-0 snap-start sm:w-[30vw] md:w-[calc((100%-5*16px)/6)]"
          >
            <MangaCard manga={manga} rank={ranked ? i + 1 : undefined} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ================= Grid section (same pattern as Home's MostViewed) ================= */
function EnGrid({
  title,
  badge,
  items,
  loading,
}: {
  title: string;
  badge?: (manga: MangaCardData) => React.ReactNode;
  items: MangaCardData[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <EnSectionHeader title={title} />
        <GridSkeleton />
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
      <EnSectionHeader title={title} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {items.map((manga, i) => (
          <motion.div
            key={manga.id}
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.5, ease: EASE, delay: (i % 6) * 0.05 }}
          >
            {badge?.(manga)}
            <MangaCard manga={manga} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ================= Page header with stats ================= */
function EnHeader() {
  const statsQuery = trpc.en.stats.useQuery(undefined, { retry: false });
  const stats = statsQuery.data;

  return (
    <header className="border-b border-[var(--ed-line)] px-4 py-12 md:px-10 md:py-16">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <span className="ed-tag">EN</span>
          <h1 className="font-display mt-3 text-[clamp(30px,5vw,52px)] font-extrabold leading-[1.15] text-app">
            EN Manga
          </h1>
          <p className="mt-3 max-w-xl text-[14.5px] leading-7 text-app-3">
            English manga from MangaDex, AsuraScans &amp; VortexScans
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <span className="glass-chip text-xs font-bold">
              <Library size={13} className="text-primary" />
              {stats ? (
                <span className="tabular-nums">{stats.total.toLocaleString("en-US")} titles</span>
              ) : (
                <span className="skeleton inline-block h-3 w-16 !rounded" />
              )}
            </span>
            {(stats?.sources ?? []).map((s) => (
              <span key={s.name} className="glass-chip text-xs font-semibold text-app-2">
                {s.name}
                <span className="tabular-nums text-primary">{s.count.toLocaleString("en-US")}</span>
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </header>
  );
}

/* ================= Just Updated — latest chapter badge like Home's flames row ================= */
function JustUpdated() {
  const query = trpc.en.justUpdated.useQuery({ limit: 18 }, { retry: false });
  const rows = (query.data ?? []) as EnCardRow[];
  const items = rows.map(adaptEnCard);
  const chapterById = new Map(rows.map((r) => [Number(r.id), r.latestChapter ?? null]));

  return (
    <EnGrid
      title="Just Updated"
      items={items}
      loading={query.isLoading}
      badge={(manga) => {
        const ch = chapterById.get(manga.id);
        return (
          <span className="mb-2 inline-flex items-center gap-1.5 border border-[var(--ed-line)] px-2.5 py-1 text-[11px] font-bold text-[var(--ed-paper2)]">
            <Clock size={11} className="text-[var(--ed-accent)]" />
            {ch ? (
              <>
                <span className="font-ednum text-[12px] tracking-wide" dir="ltr">
                  CH.{ch.number}
                </span>
                <span className="text-[10px] font-semibold text-[var(--ed-ink3)]">
                  {timeAgo(ch.publishedAt ?? ch.createdAt, "en")}
                </span>
              </>
            ) : (
              <span className="font-ednum text-[12px] tracking-wide">Updated</span>
            )}
          </span>
        );
      }}
    />
  );
}

/* ================= Random Pick — one wide card ================= */
function RandomPick() {
  const query = trpc.en.randomPick.useQuery(undefined, { retry: false });
  const row = (query.data ?? null) as EnCardRow | null;

  if (query.isLoading) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <EnSectionHeader title="Random Pick" />
        <div className="skeleton h-48 !rounded" />
      </section>
    );
  }
  if (!row) return null;
  const manga = adaptEnCard(row);

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
      <EnSectionHeader title="Random Pick" extra={<Dices size={16} className="text-[var(--ed-accent)]" />} />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.55, ease: EASE }}
        className="glass flex flex-col gap-6 p-5 sm:flex-row sm:items-center md:p-8"
      >
        <Link
          to={`/manga/${manga.slug}`}
          className="block w-32 shrink-0 self-start overflow-hidden rounded-[3px] border border-[var(--ed-line)] bg-[var(--ed-bg2)] sm:w-40"
          aria-label={manga.title}
        >
          <img
            src={manga.cover}
            alt={manga.title}
            loading="lazy"
            decoding="async"
            className="aspect-[2/3] w-full object-cover"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <span className="ed-tag">{manga.source || "EN"}</span>
          <h3 className="font-display mt-2 text-xl font-extrabold text-app md:text-2xl">
            {manga.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-app-2">
            <span className="flex items-center gap-1.5 font-bold text-[var(--ed-accent)]">
              <Star size={14} fill="currentColor" /> {manga.rating.toFixed(1)}
            </span>
            <span>{manga.chapters} chapters</span>
            <span className="flex items-center gap-1.5">
              <Flame size={13} className="text-[var(--ed-accent)]" />
              <span className="tabular-nums">{manga.views}</span> views
            </span>
          </div>
          {manga.genres.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {manga.genres.slice(0, 5).map((g) => (
                <span key={g} className="ed-tag-outline">{g}</span>
              ))}
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link to={`/manga/${manga.slug}/chapter/1`} className="btn-primary">
              <BookOpen size={16} />
              Read now
            </Link>
            <Link to={`/manga/${manga.slug}`} className="btn-glass">
              Details
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/* ================= Page ================= */
export default function EnHome() {
  const trendingQ = trpc.en.trending.useQuery({ limit: 18 }, { retry: false });
  const popularQ = trpc.en.popular.useQuery({ limit: 18 }, { retry: false });
  const newReleasesQ = trpc.en.newReleases.useQuery({ limit: 18 }, { retry: false });
  const topRatedQ = trpc.en.topRated.useQuery({ limit: 10 }, { retry: false });
  const gemsQ = trpc.en.hiddenGems.useQuery({ limit: 12 }, { retry: false });

  return (
    <div dir="ltr" lang="en" className="ed-home relative">
      <div
        aria-hidden
        className="ed-halftone pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <div className="relative">
        <EnHeader />

        <EnCarousel
          title="Trending Now"
          icon={<Flame size={16} className="text-[var(--ed-accent)]" />}
          items={((trendingQ.data ?? []) as EnCardRow[]).map(adaptEnCard)}
          loading={trendingQ.isLoading}
        />

        <JustUpdated />

        <LazySection minHeight={420}>
          <EnGrid
            title="Most Popular"
            items={((popularQ.data ?? []) as EnCardRow[]).map(adaptEnCard)}
            loading={popularQ.isLoading}
          />
        </LazySection>

        <LazySection minHeight={420}>
          <EnGrid
            title="New Releases"
            items={((newReleasesQ.data ?? []) as EnCardRow[]).map(adaptEnCard)}
            loading={newReleasesQ.isLoading}
          />
        </LazySection>

        <LazySection minHeight={380}>
          <EnCarousel
            title="Top 10 Today"
            icon={<Trophy size={16} className="text-[var(--ed-accent)]" />}
            items={((topRatedQ.data ?? []) as EnCardRow[]).map(adaptEnCard)}
            loading={topRatedQ.isLoading}
            ranked
          />
        </LazySection>

        <LazySection minHeight={380}>
          <EnGrid
            title="Hidden Gems"
            items={((gemsQ.data ?? []) as EnCardRow[]).map(adaptEnCard)}
            loading={gemsQ.isLoading}
          />
        </LazySection>

        <LazySection minHeight={260}>
          <RandomPick />
        </LazySection>

        <section className="mx-auto max-w-6xl px-4 pb-16 pt-4 md:px-6">
          <p className="flex items-center justify-center gap-2 text-center text-[12.5px] text-app-3">
            <Sparkles size={13} className="text-[var(--ed-accent)]" />
            Your reading progress is saved automatically — pick up where you left off from any manga page.
          </p>
        </section>
      </div>
    </div>
  );
}
