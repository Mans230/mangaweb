import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  BellRing,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  Eye,
  Heart,
  Layers,
  ListPlus,
  Lock,
  Play,
  Send,
  Share2,
  Users,
} from "lucide-react";
import StarRating from "@/components/StarRating";
import ReportDialog from "@/components/ReportDialog";
import { useLanguage } from "@/components/LanguageProvider";
import { useUiToggles } from "@/lib/uiToggles";
import AddToListModal from "./AddToListModal";
import ProgressRing from "./ProgressRing";
import type { DetailVM } from "./types";
import { fmtChapter } from "./types";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const typeColors: Record<string, string> = {
  مانهوا: "var(--primary-soft)",
  مانجا: "var(--accent-2)",
  مانها: "var(--accent)",
};

interface InfoCardProps {
  vm: DetailVM;
  /** +18 لم يُؤكَّد بعد: تمويه الغلاف */
  blurCover: boolean;
  isAuthenticated: boolean;
  userStars: number | null;
  ratingPending: boolean;
  isFavorite: boolean;
  isFollowing: boolean;
  followPending: boolean;
  favoritePending: boolean;
  onRate: (stars: number) => void;
  onToggleFavorite: () => void;
  onToggleFollow: () => void;
  onOpenDownload: () => void;
  onAuthRequired: () => void;
}

/** انفجار جزيئات صغير عند تفعيل المفضلة */
function FavoriteBurst({ trigger }: { trigger: number }) {
  return (
    <AnimatePresence>
      {trigger > 0 && (
        <span key={trigger} className="pointer-events-none absolute inset-0" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => {
            const angle = (i / 6) * Math.PI * 2;
            return (
              <motion.span
                key={i}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: Math.cos(angle) * 26,
                  y: Math.sin(angle) * 26,
                  opacity: 0,
                  scale: 0.4,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-accent"
              />
            );
          })}
        </span>
      )}
    </AnimatePresence>
  );
}

export default function InfoCard({
  vm,
  blurCover,
  isAuthenticated,
  userStars,
  ratingPending,
  isFavorite,
  isFollowing,
  followPending,
  favoritePending,
  onRate,
  onToggleFavorite,
  onToggleFollow,
  onOpenDownload,
  onAuthRequired,
}: InfoCardProps) {
  const { t } = useLanguage();
  const { hideCommunities, communityGroupUrl } = useUiToggles();
  const [descExpanded, setDescExpanded] = useState(false);
  const [genresExpanded, setGenresExpanded] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [burst, setBurst] = useState(0);
  const [listModalOpen, setListModalOpen] = useState(false);
  const ratingRef = useRef<HTMLDivElement>(null);

  // إغلاق نافذة التقييم عند النقر خارجها
  useEffect(() => {
    if (!ratingOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ratingRef.current && !ratingRef.current.contains(e.target as Node)) {
        setRatingOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ratingOpen]);

  const visibleGenres = genresExpanded ? vm.genres : vm.genres.slice(0, 8);
  const hiddenGenres = vm.genres.length - visibleGenres.length;
  const progress = vm.chapterTotal > 0 ? vm.readCount / vm.chapterTotal : 0;

  const continueLabel =
    vm.readCount > 0 && vm.nextChapter !== null
      ? t(`تابع القراءة — فصل ${fmtChapter(vm.nextChapter)}`, `Continue — Ch. ${fmtChapter(vm.nextChapter)}`)
      : t("اقرأ من البداية", "Read from start");
  const continueTarget =
    vm.readCount > 0 && vm.nextChapter !== null
      ? vm.nextChapter
      : (vm.chapters[vm.chapters.length - 1]?.number ?? 1);

  const share = async () => {
    const url = window.location.href;
    const nav = navigator as Navigator & {
      share?: (d: { title: string; text?: string; url: string }) => Promise<void>;
    };
    // Web Share API أولاً (الموبايل)، ثم نسخ الرابط كبديل
    if (nav.share) {
      try {
        await nav.share({ title: vm.title, text: vm.synopsis?.slice(0, 120) || undefined, url });
        return;
      } catch {
        // ألغى المستخدم المشاركة أو غير مدعومة — نكمل للنسخ
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareToast(true);
      window.setTimeout(() => setShareToast(false), 1800);
    } catch {
      // clipboard غير متاح — لا شيء
    }
  };

  const handleToggleFavorite = () => {
    if (!isAuthenticated) return onAuthRequired();
    if (!isFavorite) setBurst((b) => b + 1);
    onToggleFavorite();
  };

  const handleToggleFollow = () => {
    if (!isAuthenticated) return onAuthRequired();
    onToggleFollow();
  };

  const handleRateClick = () => {
    if (!isAuthenticated) return onAuthRequired();
    setRatingOpen((v) => !v);
  };

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { duration: 0.5, ease: EASE } },
  };

  return (
    <motion.section
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
      className="glass-strong relative z-10 mx-4 -mt-28 rounded-3xl p-5 md:mx-auto md:max-w-6xl md:p-8"
    >
      <div className="grid gap-6 md:grid-cols-[240px,1fr] md:gap-8">
        {/* ===== الغلاف ===== */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.2 }}
          className="mx-auto w-40 shrink-0 md:mx-0 md:w-60"
        >
          <div
            className="sheen relative aspect-[2/3] overflow-hidden rounded-2xl"
            style={{ boxShadow: "0 16px 48px rgba(224,86,31,0.3)" }}
          >
            <img
              src={vm.cover}
              alt={vm.title}
              className={`h-full w-full object-cover ${blurCover ? "scale-110 blur-xl" : ""}`}
            />
            {blurCover && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30">
                <Lock size={28} className="text-white" />
                <span className="glass-chip !text-[11px] font-bold text-white">+18</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* ===== المعلومات ===== */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.3 } } }}
          className="min-w-0"
        >
          {/* شارات النوع/الحالة/المصدر */}
          <motion.div variants={item} className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-[11px] font-bold text-white shadow-md"
              style={{ background: typeColors[vm.type] ?? "var(--primary-soft)" }}
            >
              {vm.type}
            </span>
            <span className="glass-chip !py-1 !text-[11px] font-semibold">
              <span
                className={`h-2 w-2 rounded-full ${
                  vm.status === "مستمر" ? "animate-pulse-soft bg-warning" : "bg-success"
                }`}
              />
              {vm.status}
            </span>
            <span className="glass-chip !py-1 !text-[11px] font-medium" dir="ltr">
              {vm.source}
            </span>
            {vm.isAdult && (
              <span className="rounded-full bg-danger px-2.5 py-1 text-[10.5px] font-bold text-white">+18</span>
            )}
          </motion.div>

          {/* العنوان */}
          <motion.div variants={item}>
            <h1 className="font-display mt-3 text-2xl font-extrabold leading-snug text-app md:text-4xl">
              {vm.title}
            </h1>
            {vm.altTitle && (
              <p className="mt-1 text-xs font-medium text-app-3 md:text-sm" dir="ltr">
                {vm.altTitle}
              </p>
            )}
          </motion.div>

          {/* التقييم — المتوسط + عدد المقيمين بشكل بارز (التوزيع غير متاح من getRating) */}
          <motion.div variants={item} className="relative mt-3 flex flex-wrap items-center gap-2.5" ref={ratingRef}>
            <span className="glass-chip !gap-2.5 !px-4 !py-2">
              <span className="font-display text-2xl font-extrabold leading-none text-app" dir="ltr">
                {vm.rating.toFixed(1)}
              </span>
              <span className="flex flex-col items-start gap-1">
                <StarRating value={vm.rating} size={16} />
                <span className="text-[10.5px] text-app-3">
                  {vm.ratingCount.toLocaleString("en-US")} {t("مقيّم", "raters")}
                </span>
              </span>
            </span>
            <button
              type="button"
              onClick={handleRateClick}
              className="glass-chip !px-3 !py-1 !text-[11px] font-semibold text-primary"
            >
              {userStars ? t(`تقييمك: ${userStars}/5`, `Your rating: ${userStars}/5`) : t("قيّم", "Rate")}
            </button>
            {!userStars && (
              <span className="w-full text-[11px] text-app-3">
                {t("قيّم لتساعد الآخرين على اكتشاف هذا العمل", "Rate to help others discover this title")}
              </span>
            )}

            <AnimatePresence>
              {ratingOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="glass-strong absolute start-0 top-full z-30 mt-2 flex flex-col items-center gap-2 rounded-2xl p-4"
                >
                  <span className="text-xs font-semibold text-app-2">{t("قيّم من 1 إلى 5", "Rate 1 to 5")}</span>
                  <StarRating
                    value={userStars ?? 0}
                    size={28}
                    interactive
                    onChange={(v) => {
                      onRate(v);
                      setRatingOpen(false);
                    }}
                  />
                  {ratingPending && <span className="text-[10px] text-app-3">{t("جارٍ الحفظ…", "Saving…")}</span>}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* عداد القراءة */}
          <motion.div variants={item} className="mt-3">
            <span className="glass-chip !gap-2.5 !py-1.5">
              <ProgressRing value={progress} size={34} stroke={4} />
              {vm.readCount > 0 ? (
                <span className="text-xs font-semibold text-app-2">
                  {t(`قرأت ${vm.readCount}/${vm.chapterTotal} فصل`, `Read ${vm.readCount}/${vm.chapterTotal} chapters`)}
                </span>
              ) : (
                <span className="text-xs font-semibold text-app-3">
                  {t("لم تبدأ القراءة بعد", "Not started yet")}
                </span>
              )}
            </span>
          </motion.div>

          {/* التصنيفات */}
          <motion.div variants={item} className="mt-4 flex flex-wrap items-center gap-2">
            {visibleGenres.map((g) => (
              <Link key={g} to={`/browse?genre=${encodeURIComponent(g)}`} className="glass-chip !px-3.5 !py-1.5 text-xs font-semibold">
                {g}
              </Link>
            ))}
            {hiddenGenres > 0 && (
              <button
                type="button"
                onClick={() => setGenresExpanded(true)}
                className="glass-chip !px-3 !py-1.5 text-xs font-bold text-primary"
              >
                +{hiddenGenres} {t("المزيد", "more")}
              </button>
            )}
          </motion.div>

          {/* الوصف */}
          <motion.div variants={item} className="mt-4">
            <p
              className={`text-sm leading-8 text-app-2 ${descExpanded ? "" : "line-clamp-4"}`}
            >
              {vm.synopsis}
            </p>
            <button
              type="button"
              onClick={() => setDescExpanded((v) => !v)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-primary transition-colors hover:text-primary-soft"
            >
              {descExpanded ? t("عرض أقل", "Show less") : t("قراءة المزيد", "Read more")}
              <ChevronDown size={14} className={`transition-transform duration-300 ${descExpanded ? "rotate-180" : ""}`} />
            </button>
          </motion.div>

          {/* الأزرار */}
          <motion.div variants={item} className="relative mt-5 flex flex-wrap items-center gap-2.5">
            <Link to={`/manga/${vm.slug}/chapter/${continueTarget}`} className="btn-primary !py-3 text-sm">
              {vm.readCount > 0 && vm.nextChapter !== null ? <Play size={16} /> : <BookOpen size={16} />}
              {continueLabel}
            </Link>

            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={handleToggleFollow}
              disabled={followPending}
              className={`!py-3 text-sm ${isFollowing ? "btn-primary" : "btn-glass"}`}
            >
              {isFollowing ? <BellRing size={16} /> : <Bell size={16} />}
              {isFollowing ? t("تتم المتابعة", "Following") : t("متابعة", "Follow")}
            </motion.button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={handleToggleFavorite}
              disabled={favoritePending}
              aria-label={t("مفضلة", "Favorite")}
              className={`btn-icon relative ${isFavorite ? "!border-accent/50 text-accent" : ""}`}
            >
              <FavoriteBurst trigger={burst} />
              <motion.span
                key={String(isFavorite)}
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 18 }}
                className="flex"
              >
                <Heart size={18} fill={isFavorite ? "currentColor" : "none"} />
              </motion.span>
            </motion.button>

            <button
              type="button"
              onClick={onOpenDownload}
              aria-label={t("تحميل كامل", "Full download")}
              className="btn-icon"
            >
              <Download size={18} />
            </button>

            <button
              type="button"
              onClick={share}
              aria-label={t("مشاركة", "Share")}
              className="btn-icon"
            >
              <Share2 size={18} />
            </button>

            {/* أضف إلى قائمة */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => (isAuthenticated ? setListModalOpen(true) : onAuthRequired())}
              aria-label={t("أضف إلى قائمة", "Add to list")}
              title={t("أضف إلى قائمة", "Add to list")}
              className="btn-icon"
            >
              <ListPlus size={18} />
            </motion.button>

            {/* رابط مجتمع العمل — يُخفى عند إيقاف المجتمعات من إعدادات الأدمن */}
            {!hideCommunities && (
              <Link
                to={`/manga/${vm.slug}/community`}
                aria-label={t("المجتمع", "Community")}
                title={t("المجتمع", "Community")}
                className="btn-icon"
              >
                <Users size={18} />
              </Link>
            )}

            {/* جروب المناقشة الخارجي (تليجرام…) — يظهر فقط عند ضبط رابطه من لوحة الأدمن */}
            {communityGroupUrl && (
              <a
                href={communityGroupUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("انضم لجروب المناقشة", "Join the discussion group")}
                title={t("انضم لجروب المناقشة", "Join the discussion group")}
                className="btn-icon !border-[var(--border-glow)] text-primary"
              >
                <Send size={18} />
              </a>
            )}

            <ReportDialog
              mangaId={vm.id}
              label={t("تبليغ عن المانهوا", "Report manga")}
            />

            {/* توست نسخ الرابط */}
            <AnimatePresence>
              {shareToast && (
                <motion.span
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="glass-strong absolute -top-11 start-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-success"
                >
                  <Check size={13} />
                  {t("تم نسخ الرابط", "Link copied")}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>

          {/* شريط البيانات الوصفية */}
          <motion.div
            variants={item}
            className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-app pt-4 text-[11.5px] text-app-3"
          >
            <span className="inline-flex items-center gap-1.5">
              <Eye size={13} className="text-primary-soft" />
              {vm.views} {t("مشاهدة", "views")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Layers size={13} className="text-primary-soft" />
              {vm.chapterTotal} {t("فصل", "chapters")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              {t("آخر تحديث", "Updated")}: {vm.updatedAgo}
            </span>
          </motion.div>
        </motion.div>
      </div>

      {/* مودال الإضافة لقائمة */}
      <AddToListModal
        open={listModalOpen}
        onClose={() => setListModalOpen(false)}
        mangaId={vm.id}
        mangaTitle={vm.title}
      />
    </motion.section>
  );
}
