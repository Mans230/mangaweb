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
import AgeGateModal, { isAgeConfirmed } from "@/components/AgeGateModal";
import { useLanguage } from "@/components/LanguageProvider";

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

/* ================= آخر الفصول — فهرس TOC ================= */
function LatestMangaCard({ item, index }: { item: LatestGroupedMangaData; index: number }) {
  const { t } = useLanguage();
  return (
    <motion.article
      initial={{ y: 24, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.45, ease: EASE, delay: (index % 2) * 0.07 }}
      className="ed-card group flex h-full gap-3.5 p-3.5"
    >
      {/* الغلاف */}
      <Link
        to={`/manga/${item.slug}`}
        className="block w-20 shrink-0 self-start overflow-hidden rounded-[3px] border border-[var(--ed-line)] bg-[var(--ed-bg2)]"
        aria-label={item.title}
      >
        <img
          src={item.cover}
          alt={item.title}
          loading="lazy"
          decoding="async"
          className="h-28 w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* العنوان + الحالة */}
        <div className="flex items-start justify-between gap-2">
          <Link
            to={`/manga/${item.slug}`}
            className="min-w-0 truncate font-display text-[15px] font-bold text-[var(--ed-ink)] transition-colors hover:text-[var(--ed-accent)]"
          >
            {item.title}
          </Link>
          <span className="ed-tag shrink-0">{t(item.status, item.status)}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--ed-ink3)]">
          <Star size={11} className="fill-[var(--ed-accent)] text-[var(--ed-accent)]" />
          <span className="font-ednum font-semibold tabular-nums text-[var(--ed-ink2)]">{item.rating.toFixed(1)}</span>
          <span>· {t(item.type, item.type)}</span>
        </div>

        {/* صفوف الفصول — الأحدث أولاً */}
        <ul className="mt-2 flex flex-col border-t border-[var(--ed-line)]">
          {item.chapters.map((ch, i2) => (
            <li key={ch.id} className="border-b border-[var(--ed-line)] last:border-b-0">
              <Link
                to={`/manga/${item.slug}/chapter/${ch.number}`}
                className="flex items-baseline gap-2 px-1 py-1.5 text-xs transition-colors hover:bg-[var(--ed-bg2)]"
              >
                <span className="font-ednum shrink-0 text-[12px] font-bold tabular-nums text-[var(--ed-accent)]" dir="ltr">
                  CH.{ch.number}
                </span>
                {i2 === 0 && ch.isNew && (
                  <span className="ed-tag shrink-0 !bg-[var(--ed-accent)] !text-[var(--ed-bg)]">
                    {t("جديد", "NEW")}
                  </span>
                )}
                <span className="ed-toc-dots" />
                <span className="shrink-0 text-[10px] text-[var(--ed-ink3)]">{ch.timeAgo}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </motion.article>
  );
}

function LatestChapters() {
  const { t } = useLanguage();
  const query = trpc.manga.latestGrouped.useQuery({ limit: 8 }, { retry: false });
  const items = adaptLatestGrouped(query.data ?? []);

  if (query.isLoading) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <SectionHeader title={t("آخر الفصول", "Latest chapters")} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-44 !rounded" />
          ))}
        </div>
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
      <SectionHeader
        title={t("آخر الفصول", "Latest chapters")}
        moreTo="/browse?sort=latest"
        count={t("اليوم", "TODAY")}
        extra={
          <Link to="/today" className="ed-btn-ghost-sm !border-[var(--ed-accent)] !text-[var(--ed-accent)]">
            <CalendarClock size={13} />
            {t("نزل اليوم", "Today")}
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {items.map((item, i) => (
          <LatestMangaCard key={item.mangaId} item={item} index={i} />
        ))}
      </div>
    </section>
  );
}

/* ================= الأكثر شعبية — شريط أفقي ================= */
function PopularCarousel() {
  const { t } = useLanguage();
  const trackRef = useRef<HTMLDivElement>(null);
  const query = trpc.manga.popular.useQuery({ limit: 10 }, { retry: false });
  const items = (query.data ?? []).map((m) => adaptMangaRow(m));

  const scroll = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    // RTL: الاتجاه المرئي معكوس
    el.scrollBy({ left: dir * -el.clientWidth * 0.7, behavior: "smooth" });
  };

  if (query.isLoading) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <div className="mb-6"><div className="skeleton h-8 w-44 !rounded" /></div>
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="w-[42vw] shrink-0 sm:w-[30vw] md:w-[calc((100%-5*20px)/6)]">
              <div className="skeleton aspect-[2/3] !rounded" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
      <SectionHeader
        title={t("الأكثر شعبية", "Most popular")}
        count={`${String(items.length).padStart(2, "0")} ${t("عناوين", "TITLES")}`}
        extra={
          <div className="hidden gap-2 md:flex">
            <button onClick={() => scroll(1)} className="ed-arrow" aria-label="next">
              <ChevronRight size={17} className="rtl:-scale-x-100" />
            </button>
            <button onClick={() => scroll(-1)} className="ed-arrow" aria-label="prev">
              <ChevronLeft size={17} className="rtl:-scale-x-100" />
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
            transition={{ duration: 0.5, ease: EASE, delay: i * 0.06 }}
            className="w-[42vw] shrink-0 snap-start sm:w-[30vw] md:w-[calc((100%-5*16px)/6)]"
          >
            {i === 0 && <div className="ed-tag mb-2">{t("الأكثر قراءةً", "Most read")}</div>}
            {i > 0 && <div className="mb-2 h-[25px]" />}
            <MangaCard manga={manga} rank={i + 1} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ================= الأكثر مشاهدة ================= */
function MostViewed() {
  const { t } = useLanguage();
  const query = trpc.manga.mostViewed.useQuery({ limit: 10 }, { retry: false });

  // mostViewed يعيد حقولاً أقل من ApiMangaRow — نبني بطاقات العرض مباشرة
  const items: MangaCardData[] = (query.data ?? []).map((m) => ({
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

  if (query.isLoading) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <SectionHeader title={t("الأكثر مشاهدة", "Most viewed")} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton aspect-[2/3] !rounded" />
          ))}
        </div>
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
      <SectionHeader title={t("الأكثر مشاهدة", "Most viewed")} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {items.map((manga, i) => (
          <motion.div
            key={manga.id}
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.5, ease: EASE, delay: (i % 5) * 0.06 }}
          >
            <span className="mb-2 inline-flex items-center gap-1.5 border border-[var(--ed-line)] px-2.5 py-1 text-[11px] font-bold text-[var(--ed-paper2)]">
              <Flame size={11} className="text-[var(--ed-accent)]" />
              <span className="font-ednum text-[12px] tracking-wide" dir="ltr">{manga.views}</span>
              {t("مشاهدة", "views")}
            </span>
            {/* MangaCard تستخدم loading="lazy" داخلياً لكل الأغلفة */}
            <MangaCard manga={manga} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ================= أحدث الإضافات ================= */
function LatestAdditions() {
  const { t } = useLanguage();
  const query = trpc.manga.list.useQuery(
    { page: 1, limit: 9, sort: "latest" },
    { retry: false },
  );
  const items = (query.data?.items ?? []).map((m) => adaptMangaRow(m));

  if (query.isLoading) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <SectionHeader title={t("أحدث الإضافات", "Latest additions")} moreTo="/browse?sort=latest" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="skeleton aspect-[16/10] !rounded lg:col-span-1" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="skeleton aspect-[2/3] !rounded" />
            ))}
          </div>
        </div>
      </section>
    );
  }
  if (items.length === 0) return null;

  const [featured, ...rest] = items;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
      <SectionHeader title={t("أحدث الإضافات", "Latest additions")} moreTo="/browse?sort=latest" />
      <div className="grid gap-6 lg:grid-cols-3">
        {/* البطاقة الكبيرة */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.6, ease: EASE }}
          className="lg:col-span-1"
        >
          <Link
            to={`/manga/${featured.slug}`}
            className="group flex h-full flex-col border border-[var(--ed-line)] bg-[var(--ed-bg2)] p-2.5 transition-all duration-150 hover:-translate-x-1.5 hover:-translate-y-1.5 hover:border-[var(--ed-accent)] hover:shadow-[8px_8px_0_var(--ed-accent)]"
          >
            <div className="relative aspect-[16/10] overflow-hidden border border-[var(--ed-line)]">
              <img
                src={featured.cover}
                alt={featured.title}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
              <span className="ed-tag absolute end-3 top-3">{t("أحدث إضافة", "Latest")}</span>
            </div>
            <div className="flex flex-1 flex-col p-3">
              <h3 className="font-ed text-lg font-bold text-[var(--ed-paper)]">{featured.title}</h3>
              {featured.synopsis && (
                <p className="mt-2 line-clamp-2 text-sm leading-7 text-[var(--ed-dim)]">{featured.synopsis}</p>
              )}
              <div className="mt-auto flex items-center gap-3 pt-4 text-xs text-[var(--ed-paper2)]">
                <span className="flex items-center gap-1 font-bold text-[var(--ed-accent)]">
                  <Star size={12} fill="currentColor" /> {featured.rating.toFixed(1)}
                </span>
                <span>{featured.chapters} {t("فصل", "chapters")}</span>
                <span className="ed-tag-outline">{featured.type}</span>
              </div>
            </div>
          </Link>
        </motion.div>

        {/* شبكة الثمانية */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-4">
          {rest.map((manga, i) => (
            <motion.div
              key={manga.id}
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true, margin: "-15%" }}
              transition={{ duration: 0.5, ease: EASE, delay: (i % 4) * 0.06 }}
            >
              <MangaCard manga={manga} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================= تصفّح حسب التصنيف ================= */
function GenreCloud() {
  const { t } = useLanguage();
  const [gateOpen, setGateOpen] = useState(false);

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
      <SectionHeader title={t("تصفّح حسب التصنيف", "Browse by genre")} count={`${GENRES.length}`} />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.5, ease: EASE }}
        className="flex flex-wrap items-center gap-2.5"
      >
        {GENRES.map((g) => {
          const cls = `ed-chip ${g.popular ? "ed-chip-popular" : ""} ${g.adult ? "ed-chip-adult" : ""}`;
          if (g.adult) {
            return (
              <button
                key={g.name}
                type="button"
                className={cls}
                onClick={() => (isAgeConfirmed() ? undefined : setGateOpen(true))}
              >
                {g.name}
              </button>
            );
          }
          return (
            <Link key={g.name} to={`/browse?genres=${encodeURIComponent(g.name)}`} className={cls}>
              {g.name}
            </Link>
          );
        })}
      </motion.div>
      <AgeGateModal open={gateOpen} onConfirm={() => setGateOpen(false)} onClose={() => setGateOpen(false)} />
    </section>
  );
}

/* ================= شريط المصادر ================= */
function SourcesStrip() {
  const { t } = useLanguage();
  const query = trpc.manga.sources.useQuery(undefined, { retry: false });
  const sources = query.data ?? [];

  if (query.isLoading || query.isError || sources.length === 0) return null;

  const doubled = [...sources, ...sources];
  return (
    <section className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <div className="ed-marquee marquee-paused">
        <div className="animate-marquee flex w-max items-center gap-10 px-6" dir="ltr">
          {doubled.map((s, i) => (
            <span key={`${s.id}-${i}`} className="flex items-center gap-2.5 whitespace-nowrap">
              <span className={`h-2 w-2 rounded-[2px] ${s.status === "active" ? "bg-success" : "bg-warning"}`} />
              <span className="font-ednum text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ed-paper2)]">
                {s.name}
              </span>
            </span>
          ))}
        </div>
      </div>
      <p className="mt-4 text-center text-[12.5px] text-[var(--ed-dim)]">
        {t(
          `نجمع لك أحدث الفصول من ${formatNum(sources.length)} مصادر — تلقائياً كل 15 دقيقة`,
          `We aggregate the latest chapters from ${sources.length} sources — automatically, every 15 minutes`,
        )}
      </p>
    </section>
  );
}

/* ================= Telegram CTA ================= */
function TelegramCTA() {
  const { t } = useLanguage();
  return (
    <section className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.5, ease: EASE }}
        className="border border-[var(--ed-line)] bg-[var(--ed-bg2)] p-8 md:p-12"
      >
        <div className="flex flex-col items-start gap-7 md:flex-row md:items-center">
          <span className="flex h-[64px] w-[64px] shrink-0 items-center justify-center border border-[var(--ed-accent)] bg-[var(--ed-accent-soft)] text-[var(--ed-accent)]">
            <Send size={26} className="rtl:-scale-x-100" />
          </span>
          <div className="flex-1">
            <span className="font-ednum text-[11px] uppercase tracking-[0.22em] text-[var(--ed-dim)]">
              Telegram
            </span>
            <h2 className="font-ed mt-1 text-2xl font-extrabold text-[var(--ed-paper)] md:text-3xl">
              {t("لا يفوتك أي فصل جديد", "Never miss a new chapter")}
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-7 text-[var(--ed-dim)]">
              {t(
                "اشترك بقناة تليجرام واحصل على إشعار فوري بالغلاف والرابط",
                "Join the Telegram channel and get an instant notification with the cover and link"
              )}
            </p>
          </div>
          <a
            href="https://t.me/dateranime"
            target="_blank"
            rel="noreferrer"
            className="ed-btn-primary"
          >
            {t("اشترك الآن", "Subscribe now")}
            <Send size={15} className="rtl:-scale-x-100" />
          </a>
        </div>
      </motion.div>
    </section>
  );
}

/* ================= Page ================= */
export default function Home() {
  return (
    <div className="ed-home relative">
      {/* نمط هافتون خفيف جداً أعلى الصفحة */}
      <div
        aria-hidden
        className="ed-halftone pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <div className="relative">
        <ReleaseTicker />
        <HeroSlider />
        <LatestChapters />
        <PopularCarousel />
        <MostViewed />
        <LatestAdditions />
        <LazySection minHeight={200}>
          <GenreCloud />
        </LazySection>
        <LazySection minHeight={120}>
          <SourcesStrip />
        </LazySection>
        <TelegramCTA />
      </div>
    </div>
  );
}
