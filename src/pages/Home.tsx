
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Flame,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  GENRES,
  adaptLatestChapter,
  adaptLatestGrouped,
  adaptMangaRow,
  formatNum,
  formatViews,
  mangaStatusLabel,
  typeLabel,
} from "@/lib/manga";
import type { LatestGroupedMangaData, MangaCardData, MangaStatus, MangaType } from "@/lib/manga";
import MangaCard from "@/components/MangaCard";
import LazySection from "@/components/LazySection";
import ContinueReading from "@/components/ContinueReading";
import AgeGateModal, { isAgeConfirmed } from "@/components/AgeGateModal";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const AUTOPLAY_MS = 6000;

/** مطابقة media query مع تحديث تفاعلي — لتفادي تحميل صور الديسكتوب على الموبايل */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/* ================= Ticker — شريط متحرك بأحدث الفصول ================= */
function ReleaseTicker() {
  const query = trpc.manga.latest.useQuery({ limit: 8 }, { retry: false });
  const items = (query.data ?? []).map((c) => adaptLatestChapter(c));
  if (items.length === 0) return null;
  const doubled = [...items, ...items];
  return (
    <div className="ed-marquee marquee-paused">
      <div className="animate-marquee flex w-max items-center gap-8 px-6" dir="ltr">
        {doubled.map((item, i) => (
          <Link
            key={`${item.id}-${i}`}
            to={`/manga/${item.mangaSlug}/chapter/${item.chapter}`}
            className="flex items-center gap-3 whitespace-nowrap"
          >
            <span className="font-ednum text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--ed-dim)]">
              CH.{item.chapter}
            </span>
            <span className="text-[12.5px] font-semibold text-[var(--ed-paper2)]">
              {item.mangaTitle}
            </span>
            <span className="h-1.5 w-1.5 rounded-[1px] bg-[var(--ed-accent)]" />
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ================= Section header ================= */
function SectionHeader({
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
  const { t } = useLanguage();
  return (
    <div className="ed-sec-head">
      <h2>{title}</h2>
      <div className="ed-rule" />
      {count && <span className="ed-count">{count}</span>}
      {extra}
      {moreTo && (
        <Link to={moreTo} className="ed-btn-ghost-sm">
          {t("عرض الكل", "View all")}
          <ArrowLeft size={13} className="rtl:-scale-x-100" />
        </Link>
      )}
    </div>
  );
}

/* ================= Hero — المثبّتة من الأدمن أولاً، وإلا الأعلى شعبية ================= */
function HeroSlider() {
  const { t } = useLanguage();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const featuredQuery = trpc.manga.featured.useQuery({ limit: 5 }, { retry: false });
  const popularQuery = trpc.manga.popular.useQuery({ limit: 5 }, { retry: false });
  const useFeatured = (featuredQuery.data?.length ?? 0) > 0;
  const query = useFeatured ? featuredQuery : popularQuery;
  const slides = (query.data ?? []).map((m) => adaptMangaRow(m));

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = slides.length;
  const go = useCallback(
    (dir: 1 | -1) => setIndex((i) => (count ? (i + dir + count) % count : 0)),
    [count],
  );

  useEffect(() => {
    if (paused || count < 2) return;
    const id = setInterval(() => go(1), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [paused, go, index, count]);

  if (query.isLoading) {
    return (
      <section className="border-b border-[var(--ed-line)] px-4 py-10 md:px-10">
        <div className="skeleton mx-auto h-[340px] max-w-6xl !rounded" />
      </section>
    );
  }
  // لا بيانات وهمية: بدون شعبية حقيقية يُخفى الهيرو
  if (count === 0) return null;

  const safeIndex = index % count;
  const slide = slides[safeIndex];

  return (
    <section
      className="border-b border-[var(--ed-line)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.15fr_0.85fr] md:items-center md:px-6 md:py-14">
        {/* النص */}
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.slug}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            transition={{ duration: 0.5, ease: EASE }}
            drag="x"
            style={{ touchAction: "pan-y" }}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={(_, info) => {
              // RTL: سحب لليمين = التالي
              if (info.offset.x > 60) go(1);
              else if (info.offset.x < -60) go(-1);
            }}
            className="min-w-0"
          >
            <div className="mb-4 flex items-center gap-3">
              <span className="ed-tag">{useFeatured ? t("مميز", "Featured") : t("الأكثر شعبية", "Trending")}</span>
              <span className="font-ednum text-[12px] uppercase tracking-[0.2em] text-[var(--ed-dim)]">
                {String(safeIndex + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
              </span>
            </div>
            <h1 className="font-ed text-[clamp(30px,5vw,52px)] font-extrabold leading-[1.15] text-[var(--ed-paper)]">
              {slide.title}
            </h1>
            {slide.synopsis && (
              <p className="mt-3 line-clamp-3 max-w-lg text-[14.5px] leading-8 text-[var(--ed-dim)]">
                {slide.synopsis}
              </p>
            )}
            {/* صف بيانات مقسّم بحدود رفيعة */}
            <div className="mt-5 flex flex-wrap items-center divide-x divide-[var(--ed-line)] divide-x-reverse text-[13px] text-[var(--ed-paper2)]">
              <span className="flex items-center gap-1.5 pe-4 font-bold text-[var(--ed-accent)]">
                <Star size={14} fill="currentColor" /> {slide.rating.toFixed(1)}
              </span>
              <span className="px-4">{slide.chapters} {t("فصل", "chapters")}</span>
              <span className="flex items-center gap-2 px-4">
                <span className={`h-2 w-2 rounded-[2px] ${slide.status === "مستمر" ? "bg-warning" : "bg-success"}`} />
                {slide.status}
              </span>
              <span className="px-4">{slide.type}</span>
            </div>
            {slide.genres.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {slide.genres.slice(0, 4).map((g) => (
                  <span key={g} className="ed-tag-outline">{g}</span>
                ))}
              </div>
            )}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to={`/manga/${slide.slug}/chapter/1`} className="ed-btn-primary">
                <BookOpen size={16} />
                {t("اقرأ الآن", "Read now")}
              </Link>
              <Link to={`/manga/${slide.slug}`} className="ed-btn-ghost">
                {t("التفاصيل", "Details")}
              </Link>
            </div>
            {/* مؤشرات + أسهم */}
            {count > 1 && (
              <div className="mt-8 flex items-center gap-3">
                <button onClick={() => go(1)} className="ed-arrow" aria-label="next">
                  <ChevronRight size={17} className="rtl:-scale-x-100" />
                </button>
                <button onClick={() => go(-1)} className="ed-arrow" aria-label="prev">
                  <ChevronLeft size={17} className="rtl:-scale-x-100" />
                </button>
                <div className="ms-2 flex items-center gap-2">
                  {slides.map((s, i) => (
                    <button
                      key={s.slug}
                      onClick={() => setIndex(i)}
                      aria-label={`slide ${i + 1}`}
                      className={`ed-dot ${i === safeIndex ? "ed-dot-active" : ""}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* الغلاف — إطار صلب بظل منزاح */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`cover-${slide.slug}`}
            initial={{ opacity: 0, x: isDesktop ? -24 : 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <Link
              to={`/manga/${slide.slug}`}
              className="group relative mx-auto block w-full max-w-[340px] border border-[var(--ed-line)] bg-[var(--ed-bg2)] p-2 transition-all duration-150 hover:-translate-x-1.5 hover:-translate-y-1.5 hover:border-[var(--ed-accent)] hover:shadow-[8px_8px_0_var(--ed-accent)]"
            >
              <div className="relative aspect-[2/3] overflow-hidden border border-[var(--ed-line)]">
                <img
                  src={slide.cover}
                  alt={slide.title}
                  decoding="async"
                  fetchPriority={safeIndex === 0 ? "high" : "auto"}
                  loading={safeIndex === 0 ? "eager" : "lazy"}
                  className="h-full w-full object-cover object-top"
                />
                <span className="ed-tag absolute bottom-3 start-3">
                  {t("فصل", "CH.")} {slide.chapters}
                </span>
              </div>
            </Link>
          </motion.div>
        </AnimatePresence>
      </div>
      {/* شريط تقدم التشغيل التلقائي */}
      {count > 1 && (
        <div className="h-[3px] bg-[var(--ed-bg2)]">
          <motion.div
            key={`prog-${safeIndex}-${paused}`}
            className="h-full bg-[var(--ed-accent)]"
            initial={{ width: "0%" }}
            animate={{ width: paused ? "0%" : "100%" }}
            transition={{ duration: AUTOPLAY_MS / 1000, ease: "linear" }}
          />
        </div>
      )}
    </section>
  );
}

/* ================= مختارة لك — ترشيحات حسب ذوقك (rec.forYou) ================= */
function ForYouSection() {
  const { t } = useLanguage();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const query = trpc.rec.forYou.useQuery(
    { limit: 12 },
    { enabled: isAuthenticated, retry: false, staleTime: 60_000 },
  );

  // rec.forYou يعيد نفس شكل mostViewed — نفس بناء البطاقات
  const items: MangaCardData[] = (query.data?.items ?? []).map((m) => ({
    id: Number(m.id),
    slug: m.slug,
    title: m.title,
    cover: m.coverUrl || "/cover-01.png",
    type: typeLabel(m.type) as MangaType,
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
  }));
  const fallback = query.data?.fallback ?? false;

  // للزائرين يُخفى القسم كلياً؛ أثناء التحميل skeleton خفيف
  if (authLoading) return null;
  if (!isAuthenticated) return null;
  if (query.isLoading) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <SectionHeader title={t("مختارة لك", "For You")} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton aspect-[2/3] !rounded" />
          ))}
        </div>
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
      <SectionHeader
        title={t("مختارة لك", "For You")}
        count={fallback ? t("حسب الشائع", 