import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion, useInView } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Crown,
  Database,
  Flame,
  Layers,
  RefreshCw,
  Send,
  Star,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  GENRES,
  adaptLatestChapter,
  adaptMangaRow,
  formatNum,
  formatViews,
  mangaStatusLabel,
  typeLabel,
} from "@/lib/manga";
import type { LatestChapterData, MangaCardData, MangaStatus, MangaType } from "@/lib/manga";
import MangaCard from "@/components/MangaCard";
import ChapterRow from "@/components/ChapterRow";
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

/* ================= Ambient background ================= */
function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="gradient-hero-bg absolute inset-0" />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="animate-blob-a absolute -top-[10vw] end-[-8vw] h-[40vw] w-[40vw] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(167,139,250,0.45), transparent 65%)", filter: "blur(80px)" }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.2 }}
        className="animate-blob-b absolute bottom-[-12vw] start-[-6vw] h-[30vw] w-[30vw] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(232,121,249,0.35), transparent 65%)", filter: "blur(80px)" }}
      />
    </div>
  );
}

/* ================= Section header ================= */
function SectionHeader({ title, moreTo, extra }: { title: string; moreTo?: string; extra?: React.ReactNode }) {
  const { t } = useLanguage();
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-xl font-bold text-app md:text-2xl">{title}</h2>
        <motion.span
          initial={{ width: 0 }}
          whileInView={{ width: 64 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
          className="gradient-primary mt-2 block h-1 rounded-full"
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {extra}
        {moreTo && (
          <Link to={moreTo} className="btn-glass shrink-0 !px-4 !py-2 text-xs font-semibold">
            {t("عرض الكل", "View all")}
            <ArrowLeft size={14} className="rtl:-scale-x-100" />
          </Link>
        )}
      </div>
    </div>
  );
}

/* ================= 1. Hero slider — المثبّتة من الأدمن أولاً، وإلا الأعلى شعبية ================= */
function HeroSlider() {
  const { t } = useLanguage();
  // على الموبايل لا تُرسم نسخ الديسكتوب المكررة من الغلاف إطلاقاً (توفير تحميل)
  const isDesktop = useMediaQuery("(min-width: 768px)");
  // الأدمن يثبّت ما يعجبه (إدارة المحتوى → تمييز) — تظهر هنا فوراً
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
      <section className="m-3 mt-4 md:m-4 md:mt-6">
        <div className="skeleton !rounded-[28px]" style={{ minHeight: "min(560px, calc(100svh - 88px))" }} />
      </section>
    );
  }
  // لا بيانات وهمية: بدون شعبية حقيقية يُخفى الهيرو
  if (count === 0) return null;

  const safeIndex = index % count;
  const slide = slides[safeIndex];

  const contentStagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
  };
  const contentItem = {
    hidden: { y: 24, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { duration: 0.6, ease: EASE } },
  };

  return (
    <section
      className="group/hero relative m-3 mt-4 min-h-[min(600px,78svh)] overflow-hidden rounded-[28px] md:m-4 md:mt-6 md:min-h-[min(640px,calc(100svh_-_88px))]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      {/* slides */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={slide.slug}
          className="absolute inset-0"
          initial={{ scale: 1.06, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
          drag="x"
          style={{ touchAction: "pan-y" }}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={(_, info) => {
            // RTL: سحب لليمين = التالي
            if (info.offset.x > 60) go(1);
            else if (info.offset.x < -60) go(-1);
          }}
        >
          {/* الموبايل: نسخة واحدة فقط من الغلاف + تدرج غامق قوي من الأسفل */}
          {!isDesktop && (
            <>
              <img
                src={slide.cover}
                alt={slide.title}
                decoding="async"
                fetchPriority={safeIndex === 0 ? "high" : "auto"}
                loading={safeIndex === 0 ? "eager" : "lazy"}
                className="h-full w-full object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/10" />
            </>
          )}
          {/* الديسكتوب: خلفية ambient blur من نفس الغلاف — بلا تمديد للبورتريه */}
          {isDesktop && (
            <div className="absolute inset-0">
              <img
                src={slide.cover}
                alt=""
                aria-hidden
                loading="lazy"
                decoding="async"
                className="h-full w-full scale-125 object-cover opacity-40 blur-3xl"
              />
              <div className="absolute inset-0 bg-black/55" />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* محتوى الموبايل — مباشرة على التدرج الغامق بلا بطاقة glass */}
      <div className="absolute inset-x-0 bottom-0 p-5 md:hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.slug}
            variants={contentStagger}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            className="flex flex-col"
          >
            {slide.genres.length > 0 && (
              <motion.div variants={contentItem} className="flex flex-wrap gap-2">
                {slide.genres.slice(0, 3).map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md"
                  >
                    {g}
                  </span>
                ))}
              </motion.div>
            )}
            <motion.h1
              variants={contentItem}
              className="font-display mt-3 text-[26px] font-extrabold leading-snug text-white"
            >
              {slide.title}
            </motion.h1>
            <motion.div variants={contentItem} className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/85">
              <span className="flex items-center gap-1 font-bold text-warning">
                <Star size={14} fill="currentColor" /> {slide.rating.toFixed(1)}
              </span>
              <span>{slide.chapters} {t("فصل", "chapters")}</span>
              <span className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${slide.status === "مستمر" ? "animate-pulse-soft bg-warning" : "bg-success"}`} />
                {slide.status}
              </span>
              <span>{slide.type}</span>
            </motion.div>
            <motion.div variants={contentItem} className="mt-5">
              <Link to={`/manga/${slide.slug}/chapter/1`} className="btn-primary w-full justify-center !py-3 text-sm">
                <BookOpen size={16} />
                {t("اقرأ الآن", "Read now")}
              </Link>
            </motion.div>
            {/* dots — تحت المحتوى جهة start */}
            {count > 1 && (
              <motion.div variants={contentItem} className="mt-4 flex items-center gap-2">
                {slides.map((s, i) => (
                  <button
                    key={s.slug}
                    onClick={() => setIndex(i)}
                    aria-label={`slide ${i + 1}`}
                    className={`relative h-2 overflow-hidden rounded-full transition-all duration-500 ${
                      i === safeIndex ? "w-7" : "w-2 bg-white/40"
                    }`}
                  >
                    {i === safeIndex && (
                      <>
                        <span className="absolute inset-0 rounded-full bg-white/30" />
                        <motion.span
                          key={`p-${safeIndex}-${paused}`}
                          className="gradient-primary absolute inset-y-0 start-0 rounded-full"
                          initial={{ width: "0%" }}
                          animate={{ width: paused ? "0%" : "100%" }}
                          transition={{ duration: AUTOPLAY_MS / 1000, ease: "linear" }}
                        />
                      </>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* بطاقة Featured — ديسكتوب: نص + غلاف بورتريه (لا تُرسم على الموبايل لتفادي تحميل الغلاف مرتين) */}
      {isDesktop && (
      <div className="absolute inset-x-6 bottom-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.slug}
            variants={contentStagger}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            className="glass grid grid-cols-[1fr_auto] items-center gap-8 rounded-3xl p-7"
            style={{ background: "rgba(20,16,40,0.42)", borderColor: "rgba(255,255,255,0.14)" }}
          >
            <div className="min-w-0">
              {slide.genres.length > 0 && (
                <motion.div variants={contentItem} className="flex flex-wrap gap-2">
                  {slide.genres.slice(0, 4).map((g) => (
                    <span
                      key={g}
                      className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md"
                    >
                      {g}
                    </span>
                  ))}
                </motion.div>
              )}
              <motion.h1
                variants={contentItem}
                className="font-display mt-3 text-4xl font-extrabold leading-snug text-white"
              >
                {slide.title}
              </motion.h1>
              {slide.synopsis && (
                <motion.p variants={contentItem} className="mt-2 line-clamp-3 text-[15px] text-white/80">
                  {slide.synopsis}
                </motion.p>
              )}
              <motion.div variants={contentItem} className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/85">
                <span className="flex items-center gap-1 font-bold text-warning">
                  <Star size={14} fill="currentColor" /> {slide.rating.toFixed(1)}
                </span>
                <span>{slide.chapters} {t("فصل", "chapters")}</span>
                <span className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${slide.status === "مستمر" ? "animate-pulse-soft bg-warning" : "bg-success"}`} />
                  {slide.status}
                </span>
                <span>{slide.type}</span>
              </motion.div>
              <motion.div variants={contentItem} className="mt-5 flex items-center gap-2.5">
                <Link to={`/manga/${slide.slug}/chapter/1`} className="btn-primary !py-3 text-sm">
                  <BookOpen size={16} />
                  {t("اقرأ الآن", "Read now")}
                </Link>
                <Link
                  to={`/manga/${slide.slug}`}
                  className="btn-glass !border-white/25 !bg-white/10 !py-3 text-sm !text-white"
                >
                  {t("التفاصيل", "Details")}
                </Link>
              </motion.div>
            </div>
            <motion.div variants={contentItem} className="relative">
              {/* ambient blur من نفس الغلاف خلف البورتريه */}
              <img
                src={slide.cover}
                alt=""
                aria-hidden
                loading="lazy"
                decoding="async"
                className="absolute inset-0 scale-110 rounded-2xl object-cover opacity-60 blur-2xl"
              />
              <img
                src={slide.cover}
                alt={slide.title}
                decoding="async"
                fetchPriority={safeIndex === 0 ? "high" : "auto"}
                className="relative aspect-[2/3] w-[min(340px,calc((100svh_-_240px)*2/3))] rounded-2xl object-cover ring-1 ring-white/25 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
              />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
      )}

      {/* مؤشرات الديسكتوب العمودية — بلا style inline متعارض */}
      {count > 1 && (
        <div className="absolute end-6 top-1/2 hidden -translate-y-1/2 flex-col items-center gap-2 md:flex">
          {slides.map((s, i) => (
            <button
              key={s.slug}
              onClick={() => setIndex(i)}
              aria-label={`slide ${i + 1}`}
              className={`relative w-2 overflow-hidden rounded-full transition-all duration-500 ${
                i === safeIndex ? "h-8" : "h-2 bg-white/40"
              }`}
            >
              {i === safeIndex && (
                <>
                  <span className="absolute inset-0 rounded-full bg-white/30" />
                  <motion.span
                    key={`pd-${safeIndex}-${paused}`}
                    className="gradient-primary absolute inset-x-0 top-0 rounded-full"
                    initial={{ height: "0%" }}
                    animate={{ height: paused ? "0%" : "100%" }}
                    transition={{ duration: AUTOPLAY_MS / 1000, ease: "linear" }}
                  />
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {/* desktop arrows — تظهر عبر group-hover/hero على الـsection */}
      {count > 1 && (
        <div className="absolute start-5 top-5 hidden flex-row gap-2 opacity-0 transition-opacity duration-300 group-hover/hero:opacity-100 md:flex">
          <button onClick={() => go(1)} className="btn-icon !border-white/20 !bg-black/25 !text-white" aria-label="next">
            <ChevronRight size={18} className="rtl:-scale-x-100" />
          </button>
          <button onClick={() => go(-1)} className="btn-icon !border-white/20 !bg-black/25 !text-white" aria-label="prev">
            <ChevronLeft size={18} className="rtl:-scale-x-100" />
          </button>
        </div>
      )}
    </section>
  );
}

/* ================= 2. Quick stats — إحصاءات حقيقية من manga.publicStats ================= */
function useCountUp(target: number, active: boolean, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);
  return value;
}

function StatChip({
  icon: Icon,
  label,
  value,
  delay,
}: {
  icon: typeof Database;
  label: string;
  value: number;
  delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });
  const display = useCountUp(value, inView);

  return (
    <motion.div
      ref={ref}
      initial={{ y: 30, opacity: 0 }}
      animate={inView ? { y: 0, opacity: 1 } : {}}
      transition={{ duration: 0.6, ease: EASE, delay }}
      className="glass flex shrink-0 items-center gap-3 !rounded-2xl px-5 py-4"
    >
      <span className="gradient-primary flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md">
        <Icon size={18} />
      </span>
      <div>
        <div className="font-display text-lg font-extrabold leading-tight text-app" dir="ltr">
          {display.toLocaleString("en-US")}
        </div>
        <div className="text-xs text-app-3">{label}</div>
      </div>
    </motion.div>
  );
}

function QuickStats() {
  const { t } = useLanguage();
  const query = trpc.manga.publicStats.useQuery(undefined, { retry: false });

  if (query.isLoading) {
    return (
      <section className="mx-auto max-w-7xl px-4 pt-8 md:px-6">
        <div className="flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-4 md:overflow-visible">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-[74px] min-w-44 flex-1 !rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }
  // عند الفشل يُخفى الشريط بدل أرقام مزيفة
  if (query.isError || !query.data) return null;

  const { sourceCount, mangaCount, chapterCount } = query.data;
  const stats = [
    { icon: Database, label: t("مصادر نشطة", "Active sources"), value: sourceCount },
    { icon: BookOpen, label: t("سلسلة متاحة", "Series available"), value: mangaCount },
    { icon: Layers, label: t("فصل مفهرس", "Indexed chapters"), value: chapterCount },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 pt-8 md:px-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s, i) => (
          <StatChip key={s.label} icon={s.icon} label={s.label} value={s.value} delay={i * 0.1} />
        ))}
        {/* معلومة ثابتة عن دورية التحديث */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, margin: "-20% 0px" }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.3 }}
          className="glass flex shrink-0 items-center gap-3 !rounded-2xl px-5 py-4"
        >
          <span className="gradient-primary flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md">
            <RefreshCw size={18} />
          </span>
          <div>
            <div className="font-display text-lg font-extrabold leading-tight text-app" dir="ltr">
              30 {t("دقيقة", "min")}
            </div>
            <div className="text-xs text-app-3">{t("تحديث تلقائي للفصول", "Auto chapter refresh")}</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ================= 3. Latest chapters ================= */
/** بطاقة فصل عمودية للموبايل: غلاف فوق + عنوان + رقم الفصل تحت */
function ChapterTile({ item }: { item: LatestChapterData }) {
  const { t } = useLanguage();
  return (
    <Link
      to={`/manga/${item.mangaSlug}/chapter/${item.chapter}`}
      className="glass group flex h-full flex-col overflow-hidden !rounded-2xl transition-colors hover:border-[var(--border-glow)]"
    >
      <div className="relative overflow-hidden">
        <img
          src={item.cover}
          alt={item.mangaTitle}
          loading="lazy"
          decoding="async"
          className="aspect-[2/3] w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {item.isNew && (
          <span className="animate-pulse-soft absolute end-2 top-2 rounded-full bg-accent-2 px-2 py-0.5 text-[10px] font-bold text-white">
            {t("جديد", "NEW")}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-1 text-[13px] font-bold text-app transition-colors group-hover:text-primary">
          {item.mangaTitle}
        </h3>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="glass-chip !px-2.5 !py-0.5 !text-[11px] font-semibold text-primary">
            {t("فصل", "Ch.")} {item.chapter}
          </span>
          <span className="text-[10.5px] text-app-3">{item.timeAgo}</span>
        </div>
      </div>
    </Link>
  );
}

function LatestChapters() {
  const { t } = useLanguage();
  const query = trpc.manga.latest.useQuery({ limit: 8 }, { retry: false });
  const items = (query.data ?? []).map((c) => adaptLatestChapter(c));

  if (query.isLoading) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20">
        <SectionHeader title={t("أحدث الفصول", "Latest chapters")} moreTo="/browse?sort=latest" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="skeleton aspect-[3/4] !rounded-2xl sm:aspect-auto sm:h-[104px]" />
          ))}
        </div>
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20">
      <SectionHeader
        title={t("أحدث الفصول", "Latest chapters")}
        moreTo="/browse?sort=latest"
        extra={
          <Link to="/today" className="btn-glass shrink-0 !px-4 !py-2 text-xs font-semibold !text-primary">
            <CalendarClock size={14} />
            {t("نزل اليوم", "Today")}
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {items.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.55, ease: EASE, delay: (i % 6) * 0.06 }}
          >
            {/* موبايل: بطاقة عمودية — sm فما فوق: صف أفقي */}
            <div className="h-full sm:hidden">
              <ChapterTile item={item} />
            </div>
            <div className="hidden sm:block">
              <ChapterRow item={item} />
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ================= 4. Most popular carousel ================= */
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
      <section className="mx-auto max-w-7xl px-4 py-2 md:px-6">
        <div className="mb-6"><div className="skeleton h-7 w-40" /></div>
        <div className="flex gap-3 overflow-hidden md:gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="w-[42vw] shrink-0 sm:w-[30vw] md:w-[calc((100%-5*20px)/6)]">
              <div className="skeleton aspect-[2/3] !rounded-2xl" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-2 md:px-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-app md:text-2xl">
            {t("الأكثر شعبية", "Most popular")}
          </h2>
          <motion.span
            initial={{ width: 0 }}
            whileInView={{ width: 64 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
            className="gradient-primary mt-2 block h-1 rounded-full"
          />
        </div>
        <div className="hidden gap-2 md:flex">
          <button onClick={() => scroll(1)} className="btn-icon" aria-label="next">
            <ChevronRight size={18} className="rtl:-scale-x-100" />
          </button>
          <button onClick={() => scroll(-1)} className="btn-icon" aria-label="prev">
            <ChevronLeft size={18} className="rtl:-scale-x-100" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:gap-5"
      >
        {items.map((manga, i) => (
          <motion.div
            key={manga.id}
            initial={{ y: 40, opacity: 0, rotate: 2 }}
            whileInView={{ y: 0, opacity: 1, rotate: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.6, ease: EASE, delay: i * 0.08 }}
            className="w-[42vw] shrink-0 snap-start sm:w-[30vw] md:w-[calc((100%-5*20px)/6)]"
          >
            {i === 0 && (
              <div className="glass-chip mb-2 !border-warning/40 !text-[11px] font-bold text-warning">
                <Crown size={13} />
                {t("الأكثر قراءةً", "Most read")}
              </div>
            )}
            {i > 0 && <div className="mb-2 h-[30px]" />}
            <MangaCard manga={manga} rank={i + 1} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ================= 4.5 Most viewed — manga.mostViewed ================= */
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
      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20">
        <SectionHeader title={t("الأكثر مشاهدة 🔥", "Most viewed 🔥")} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton aspect-[2/3] !rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20">
      <SectionHeader title={t("الأكثر مشاهدة 🔥", "Most viewed 🔥")} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5 xl:grid-cols-5">
        {items.map((manga, i) => (
          <motion.div
            key={manga.id}
            initial={{ y: 40, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.55, ease: EASE, delay: (i % 5) * 0.07 }}
          >
            <span className="glass-chip mb-2 inline-flex !px-2.5 !py-0.5 !text-[10.5px] font-bold text-warning">
              <Flame size={11} />
              {manga.views} {t("مشاهدة", "views")}
            </span>
            {/* MangaCard تستخدم loading="lazy" داخلياً لكل الأغلفة */}
            <MangaCard manga={manga} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ================= 5. Latest additions ================= */
function LatestAdditions() {
  const { t } = useLanguage();
  const query = trpc.manga.list.useQuery(
    { page: 1, limit: 9, sort: "latest" },
    { retry: false },
  );
  const items = (query.data?.items ?? []).map((m) => adaptMangaRow(m));

  if (query.isLoading) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20">
        <SectionHeader title={t("أحدث الإضافات", "Latest additions")} moreTo="/browse?sort=latest" />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="skeleton aspect-[16/10] !rounded-3xl lg:col-span-1" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:col-span-2 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="skeleton aspect-[2/3] !rounded-2xl" />
            ))}
          </div>
        </div>
      </section>
    );
  }
  if (items.length === 0) return null;

  const [featured, ...rest] = items;

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20">
      <SectionHeader title={t("أحدث الإضافات", "Latest additions")} moreTo="/browse?sort=latest" />
      <div className="grid gap-5 lg:grid-cols-3">
        {/* large showcase card */}
        <motion.div
          initial={{ x: 60, opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.7, ease: EASE }}
          className="lg:col-span-1"
        >
          <Link
            to={`/manga/${featured.slug}`}
            className="glass sheen group flex h-full flex-col overflow-hidden !rounded-3xl transition-transform hover:-translate-y-1.5"
          >
            <div className="relative aspect-[16/10] overflow-hidden">
              <img
                src={featured.cover}
                alt={featured.title}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <span className="glass-chip absolute end-3 top-3 !border-accent-2/40 !text-[10.5px] font-bold text-accent-2">
                {t("أحدث إضافة", "Latest addition")}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="font-display text-lg font-bold text-app">{featured.title}</h3>
              {featured.synopsis && (
                <p className="mt-2 line-clamp-2 text-sm text-app-2">{featured.synopsis}</p>
              )}
              <div className="mt-auto flex items-center gap-3 pt-4 text-xs text-app-3">
                <span className="flex items-center gap-1 font-semibold text-warning">
                  <Star size={12} fill="currentColor" /> {featured.rating.toFixed(1)}
                </span>
                <span>{featured.chapters} {t("فصل", "chapters")}</span>
                <span className="glass-chip !px-2.5 !py-0.5 !text-[10.5px]">{featured.type}</span>
              </div>
            </div>
          </Link>
        </motion.div>

        {/* grid of 8 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:col-span-2 lg:grid-cols-4">
          {rest.map((manga, i) => (
            <motion.div
              key={manga.id}
              initial={{ y: 40, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true, margin: "-15%" }}
              transition={{ duration: 0.55, ease: EASE, delay: (i % 4) * 0.08 }}
            >
              <MangaCard manga={manga} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================= 6. Browse by genre ================= */
function GenreCloud() {
  const { t } = useLanguage();
  const [gateOpen, setGateOpen] = useState(false);

  const chipVariants = {
    hidden: { scale: 0.6, opacity: 0 },
    show: (i: number) => ({
      scale: 1,
      opacity: 1,
      transition: { type: "spring" as const, stiffness: 320, damping: 18, delay: ((i * 7) % 14) * 0.05 },
    }),
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-2 md:px-6">
      <SectionHeader title={t("تصفّح حسب التصنيف", "Browse by genre")} />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.6, ease: EASE }}
        className="glass rounded-3xl p-6 md:p-8"
      >
        <div className="flex flex-wrap items-center gap-2.5 md:gap-3">
          {GENRES.map((g, i) => {
            const chip = (
              <motion.span
                custom={i}
                variants={chipVariants}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-10%" }}
                whileHover={{ y: -3 }}
                className={`glass-chip cursor-pointer font-semibold transition-colors ${
                  g.popular ? "!px-5 !py-2.5 text-base" : ""
                } ${g.adult ? "!border-danger/50 !text-danger" : "hover:!bg-[rgba(167,139,250,0.2)]"}`}
                style={g.popular && !g.adult ? { borderColor: "var(--border-glow)" } : undefined}
              >
                {g.name}
              </motion.span>
            );
            if (g.adult) {
              return (
                <button key={g.name} type="button" onClick={() => (isAgeConfirmed() ? undefined : setGateOpen(true))}>
                  {chip}
                </button>
              );
            }
            return (
              <Link key={g.name} to={`/browse?genres=${encodeURIComponent(g.name)}`}>
                {chip}
              </Link>
            );
          })}
        </div>
      </motion.div>
      <AgeGateModal open={gateOpen} onConfirm={() => setGateOpen(false)} onClose={() => setGateOpen(false)} />
    </section>
  );
}

/* ================= 7. Sources marquee — مصادر حقيقية من manga.sources ================= */
function SourcesStrip() {
  const { t } = useLanguage();
  const query = trpc.manga.sources.useQuery(undefined, { retry: false });
  const sources = query.data ?? [];

  if (query.isLoading || query.isError || sources.length === 0) return null;

  const doubled = [...sources, ...sources];
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20">
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.8 }}
        className="glass marquee-paused overflow-hidden rounded-3xl py-6"
      >
        <div className="animate-marquee flex w-max items-center gap-10 px-6" dir="ltr">
          {doubled.map((s, i) => (
            <span key={`${s.id}-${i}`} className="flex items-center gap-2.5 whitespace-nowrap">
              <span
                className={`h-2 w-2 rounded-full ${s.status === "active" ? "bg-success" : "bg-warning"}`}
              />
              <span className="text-sm font-semibold uppercase tracking-widest text-app-2" style={{ letterSpacing: "0.08em" }}>
                {s.name}
              </span>
            </span>
          ))}
        </div>
        <p className="mt-5 text-center text-sm text-app-3">
          {t(
            `نجمع لك أحدث الفصول من ${formatNum(sources.length)} مصادر — تلقائياً كل 30 دقيقة`,
            `We aggregate the latest chapters from ${sources.length} sources — automatically, every 30 minutes`,
          )}
        </p>
      </motion.div>
    </section>
  );
}

/* ================= 8. Telegram CTA ================= */
/** مواضع الأغلفة الزخرفية العائمة (ديسكتوب فقط) */
const FLOAT_POSITIONS = [
  { className: "-top-6 start-[8%] -rotate-12", delay: "0s" },
  { className: "bottom-[-14px] start-[16%] rotate-6", delay: "1.2s" },
  { className: "top-[30%] start-[2%] rotate-12", delay: "2.4s" },
  { className: "top-[-10px] end-[10%] rotate-6", delay: "0.6s" },
  { className: "bottom-[-18px] end-[20%] -rotate-6", delay: "1.8s" },
  { className: "top-[36%] end-[3%] -rotate-12", delay: "3s" },
];
/** صور احتياطية ثابتة إن تعذّر جلب الأغلفة الحقيقية */
const FALLBACK_COVERS = ["/cover-03.png", "/cover-07.png", "/cover-10.png"];

function TelegramCTA() {
  const { t } = useLanguage();
  // نفس استعلام PopularCarousel تماماً ({ limit: 10 }) → يُقرأ من كاش react-query بلا طلب شبكة إضافي
  const popularQ = trpc.manga.popular.useQuery({ limit: 10 }, { retry: false });
  const realCovers = (popularQ.data ?? [])
    .map((m) => adaptMangaRow(m).cover)
    .filter(Boolean)
    .slice(0, FLOAT_POSITIONS.length);
  const covers = (realCovers.length > 0 ? realCovers : FALLBACK_COVERS).map(
    (src, i) => ({ src, ...FLOAT_POSITIONS[i % FLOAT_POSITIONS.length] }),
  );
  return (
    <section className="mx-auto max-w-7xl px-4 pb-4 md:px-6">
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.6, ease: EASE }}
        className="gradient-primary relative overflow-hidden rounded-[28px] p-8 shadow-[0_20px_60px_rgba(124,58,237,0.35)] md:p-12"
      >
        {/* decorative covers — أغلفة أشهر الأعمال من بيانات الموقع */}
        {covers.map((c) => (
          <img
            key={c.src}
            src={c.src}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            style={{ animationDelay: c.delay }}
            className={`animate-bob absolute hidden h-24 w-16 rounded-lg object-cover opacity-80 shadow-[0_12px_30px_rgba(0,0,0,0.35)] blur-[0.5px] md:block ${c.className}`}
          />
        ))}
        <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center">
          <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white backdrop-blur-md">
            <Send size={30} className="rtl:-scale-x-100" />
          </span>
          <div className="flex-1">
            <h2 className="font-display text-2xl font-extrabold text-white md:text-3xl">
              {t("لا يفوتك أي فصل جديد", "Never miss a new chapter")}
            </h2>
            <p className="mt-2 max-w-lg text-sm text-white/85 md:text-base">
              {t(
                "اشترك بقناة تليجرام واحصل على إشعار فوري بالغلاف والرابط",
                "Join the Telegram channel and get an instant notification with the cover and link"
              )}
            </p>
          </div>
          <motion.a
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            href="https://t.me/dateranime"
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 font-bold text-[#7C3AED] shadow-xl transition-colors hover:bg-[#EDE9FE]"
          >
            {t("اشترك الآن", "Subscribe now")}
            <Send size={16} className="transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" />
          </motion.a>
        </div>
      </motion.div>
    </section>
  );
}

/* ================= Page ================= */
export default function Home() {
  return (
    <>
      <AmbientBackground />
      <HeroSlider />
      <QuickStats />
      <LatestChapters />
      <PopularCarousel />
      <MostViewed />
      <LatestAdditions />
      <LazySection minHeight={260}>
        <GenreCloud />
      </LazySection>
      <LazySection minHeight={220}>
        <SourcesStrip />
      </LazySection>
      <TelegramCTA />
    </>
  );
}
