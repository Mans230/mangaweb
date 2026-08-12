import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion, useInView } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Crown,
  Database,
  Layers,
  RefreshCw,
  Send,
  Star,
} from "lucide-react";
import {
  genres,
  heroSlides,
  latestAdditions,
  latestChapters,
  popularManga,
  quickStats,
  sources,
} from "@/data/mock";
import MangaCard from "@/components/MangaCard";
import ChapterRow from "@/components/ChapterRow";
import AgeGateModal, { isAgeConfirmed } from "@/components/AgeGateModal";
import { useLanguage } from "@/components/LanguageProvider";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const AUTOPLAY_MS = 6000;

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
function SectionHeader({ title, moreTo }: { title: string; moreTo?: string }) {
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
      {moreTo && (
        <Link to={moreTo} className="btn-glass shrink-0 !px-4 !py-2 text-xs font-semibold">
          {t("عرض الكل", "View all")}
          <ArrowLeft size={14} className="rtl:-scale-x-100" />
        </Link>
      )}
    </div>
  );
}

/* ================= 1. Hero slider ================= */
function HeroSlider() {
  const { t } = useLanguage();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const slide = heroSlides[index];

  const go = useCallback(
    (dir: 1 | -1) => setIndex((i) => (i + dir + heroSlides.length) % heroSlides.length),
    []
  );

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => go(1), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [paused, go, index]);

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
      className="relative m-3 mt-4 overflow-hidden rounded-[28px] md:m-4 md:mt-6"
      style={{ minHeight: "min(560px, calc(100svh - 88px))" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      {/* slides */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={index}
          className="absolute inset-0"
          initial={{ scale: 1.08, x: -60, opacity: 0.6 }}
          animate={{ scale: 1, x: 0, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={(_, info) => {
            // RTL: سحب لليمين = التالي
            if (info.offset.x > 60) go(1);
            else if (info.offset.x < -60) go(-1);
          }}
        >
          <img src={slide.image} alt={slide.title} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* watermark number */}
      <span
        className="font-display pointer-events-none absolute end-5 top-4 text-7xl font-extrabold text-transparent md:text-8xl"
        style={{ WebkitTextStroke: "2px rgba(255,255,255,0.35)", opacity: 0.5 }}
        dir="ltr"
      >
        {String(index + 1).padStart(2, "0")}
      </span>

      {/* content panel */}
      <div className="absolute inset-x-3 bottom-3 md:inset-x-6 md:bottom-6 md:max-w-2xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            variants={contentStagger}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            className="glass rounded-3xl p-5 md:p-7"
            style={{ background: "rgba(20,16,40,0.42)", borderColor: "rgba(255,255,255,0.14)" }}
          >
            <motion.div variants={contentItem} className="flex flex-wrap gap-2">
              {slide.genres.map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md"
                >
                  {g}
                </span>
              ))}
            </motion.div>
            <motion.h1
              variants={contentItem}
              className="font-display mt-3 text-[26px] font-extrabold leading-snug text-white md:text-4xl"
            >
              {slide.title}
            </motion.h1>
            <motion.p variants={contentItem} className="mt-2 line-clamp-2 text-sm text-white/80 md:text-[15px]">
              {slide.synopsis}
            </motion.p>
            <motion.div variants={contentItem} className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/85">
              <span className="flex items-center gap-1 font-bold text-warning">
                <Star size={14} fill="currentColor" /> {slide.rating.toFixed(1)}
              </span>
              <span>{slide.chapters} {t("فصل", "chapters")}</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-warning" />
                {slide.status}
              </span>
              <span>{slide.type}</span>
            </motion.div>
            <motion.div variants={contentItem} className="mt-5 flex items-center gap-2.5">
              <Link to={`/manga/${slide.mangaSlug}/chapter/1`} className="btn-primary !py-3 text-sm">
                <BookOpen size={16} />
                {t("اقرأ الآن", "Read now")}
              </Link>
              <Link
                to={`/manga/${slide.mangaSlug}`}
                className="btn-glass !border-white/25 !bg-white/10 !py-3 text-sm !text-white"
              >
                {t("التفاصيل", "Details")}
              </Link>
              <button className="btn-icon !border-white/25 !bg-white/10 !text-white" aria-label={t("حفظ", "Bookmark")}>
                <Bookmark size={17} />
              </button>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* indicators — bottom center mobile / right vertical desktop */}
      <div className="absolute bottom-6 end-1/2 translate-x-1/2 flex items-center gap-2 md:bottom-1/2 md:end-6 md:translate-x-0 md:translate-y-1/2 md:flex-col">
        {heroSlides.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`slide ${i + 1}`}
            className="relative h-2 overflow-hidden rounded-full transition-all duration-500 md:h-auto md:w-2"
            style={{
              width: i === index ? 28 : 8,
              height: undefined,
              ...(i === index ? {} : {}),
              background: i === index ? "transparent" : "rgba(255,255,255,0.4)",
            }}
          >
            {i === index && (
              <>
                <span className="absolute inset-0 rounded-full bg-white/30" />
                <motion.span
                  key={`p-${index}-${paused}`}
                  className="gradient-primary absolute inset-y-0 start-0 rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: paused ? "0%" : "100%" }}
                  transition={{ duration: AUTOPLAY_MS / 1000, ease: "linear" }}
                />
              </>
            )}
          </button>
        ))}
      </div>

      {/* desktop arrows */}
      <div className="absolute end-16 top-1/2 hidden -translate-y-1/2 flex-col gap-2 opacity-0 transition-opacity duration-300 group-hover/hero:opacity-100 md:flex">
        <button onClick={() => go(1)} className="btn-icon !border-white/20 !bg-black/25 !text-white" aria-label="next">
          <ChevronRight size={18} className="rtl:-scale-x-100" />
        </button>
        <button onClick={() => go(-1)} className="btn-icon !border-white/20 !bg-black/25 !text-white" aria-label="prev">
          <ChevronLeft size={18} className="rtl:-scale-x-100" />
        </button>
      </div>
    </section>
  );
}

/* ================= 2. Quick stats ================= */
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

const statIcons = { database: Database, "book-open": BookOpen, layers: Layers, "refresh-cw": RefreshCw };

function StatChip({ stat, delay }: { stat: (typeof quickStats)[number]; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });
  const value = useCountUp(stat.value, inView);
  const Icon = statIcons[stat.icon];
  const { t } = useLanguage();

  const formatted =
    stat.id === "series"
      ? value.toLocaleString("en-US")
      : stat.id === "chapters"
        ? `${value}`
        : `${value}`;

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
          {stat.suffix === "K+" ? `${formatted}K+` : `${stat.suffix}${formatted}`}
        </div>
        <div className="text-xs text-app-3">
          {stat.id === "refresh" ? t("تحديث كل 30 دقيقة", "Refresh every 30 min") : stat.label}
        </div>
      </div>
    </motion.div>
  );
}

function QuickStats() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-8 md:px-6">
      <div className="flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-4 md:overflow-visible">
        {quickStats.map((s, i) => (
          <StatChip key={s.id} stat={s} delay={i * 0.1} />
        ))}
      </div>
    </section>
  );
}

/* ================= 3. Latest chapters ================= */
function LatestChapters() {
  const { t } = useLanguage();
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20">
      <SectionHeader title={t("أحدث الفصول", "Latest chapters")} moreTo="/browse?sort=latest" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {latestChapters.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 0.55, ease: EASE, delay: (i % 6) * 0.06 }}
          >
            <ChapterRow item={item} />
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

  const scroll = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    // RTL: الاتجاه المرئي معكوس
    el.scrollBy({ left: dir * -el.clientWidth * 0.7, behavior: "smooth" });
  };

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
        {popularManga.map((manga, i) => (
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

/* ================= 5. Latest additions ================= */
function LatestAdditions() {
  const { t } = useLanguage();
  const [featured, ...rest] = latestAdditions;

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20">
      <SectionHeader title={t("أحدث الإضافات", "Latest additions")} moreTo="/browse?sort=new" />
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
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <span className="glass-chip absolute end-3 top-3 !border-accent-2/40 !text-[10.5px] font-bold text-accent-2">
                {t("أُضيفت اليوم", "Added today")}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="font-display text-lg font-bold text-app">{featured.title}</h3>
              <p className="mt-2 line-clamp-2 text-sm text-app-2">{featured.synopsis}</p>
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
              <span className="glass-chip mb-2 !px-2.5 !py-0.5 !text-[10.5px]">
                {i % 2 === 0 ? t("أُضيفت اليوم", "Today") : t("أمس", "Yesterday")}
              </span>
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
          {genres.map((g, i) => {
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
                <span className="text-[10.5px] font-medium opacity-70" dir="ltr">{g.count}</span>
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
              <Link key={g.name} to={`/browse?genre=${encodeURIComponent(g.name)}`}>
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

/* ================= 7. Sources marquee ================= */
function SourcesStrip() {
  const { t } = useLanguage();
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
            <span key={i} className="flex items-center gap-2.5 whitespace-nowrap">
              <span
                className={`h-2 w-2 rounded-full ${s.status === "نشط" ? "bg-success" : "bg-warning"}`}
              />
              <span className="text-sm font-semibold uppercase tracking-widest text-app-2" style={{ letterSpacing: "0.08em" }}>
                {s.name}
              </span>
            </span>
          ))}
        </div>
        <p className="mt-5 text-center text-sm text-app-3">
          {t("نجمع لك أحدث الفصول من 8 مصادر — تلقائياً كل 30 دقيقة", "We aggregate the latest chapters from 8 sources — automatically, every 30 minutes")}
        </p>
      </motion.div>
    </section>
  );
}

/* ================= 8. Telegram CTA ================= */
function TelegramCTA() {
  const { t } = useLanguage();
  const floatCovers = [
    { src: "/cover-03.png", className: "-top-6 start-[8%] -rotate-12", delay: "0s" },
    { src: "/cover-07.png", className: "bottom-[-14px] start-[16%] rotate-6", delay: "1.2s" },
    { src: "/cover-10.png", className: "top-[30%] start-[2%] rotate-12", delay: "2.4s" },
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 pb-4 md:px-6">
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.6, ease: EASE }}
        className="gradient-primary relative overflow-hidden rounded-[28px] p-8 shadow-[0_20px_60px_rgba(124,58,237,0.35)] md:p-12"
      >
        {/* decorative covers */}
        {floatCovers.map((c) => (
          <img
            key={c.src}
            src={c.src}
            alt=""
            aria-hidden
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
            href="https://t.me/zekomanga"
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
      <LatestAdditions />
      <GenreCloud />
      <SourcesStrip />
      <TelegramCTA />
    </>
  );
}
