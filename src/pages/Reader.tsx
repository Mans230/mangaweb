import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import AgeGateModal, { isAgeConfirmed } from "@/components/AgeGateModal";
import ReaderChrome from "@/components/reader/ReaderChrome";
import WebtoonView from "@/components/reader/WebtoonView";
import PagedView from "@/components/reader/PagedView";
import ChapterDrawer from "@/components/reader/ChapterDrawer";
import ReaderSettingsPanel from "@/components/reader/ReaderSettingsPanel";
import DownloadModal from "@/components/reader/DownloadModal";
import ReportDialog from "@/components/ReportDialog";
import CommentsSheet from "@/components/reader/CommentsSheet";
import ChapterComments from "@/components/reader/ChapterComments";
import EndCard from "@/components/reader/EndCard";
import {
  isChapterBookmarked,
  loadChapterRating,
  loadProgress,
  loadReadSet,
  markChapterRead,
  saveChapterRating,
  saveProgress,
  toggleChapterBookmark,
  useReaderSettings,
} from "@/components/reader/store";
import type { ChapterItem, ReaderManga, SavedProgress } from "@/components/reader/store";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function Reader() {
  const { slug = "", n = "1" } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const chapterNumber = Number.parseFloat(n) || 1;
  const chapterKey = `${slug}:${chapterNumber}`;

  /* ===== Data: live API (real scraped manga) ===== */
  const apiQuery = trpc.manga.getBySlug.useQuery(
    { slug },
    { retry: false, refetchOnWindowFocus: false, staleTime: 60_000 },
  );

  const manga: ReaderManga | null = useMemo(() => {
    if (!apiQuery.data) return null;
    const d = apiQuery.data;
    return {
      id: d.id,
      slug: d.slug,
      title: d.title,
      cover: d.coverUrl ?? "/cover-01.png",
      isAdult: d.isAdult,
      fromApi: true,
      chapters: d.chapters.map((c) => ({
        id: c.id,
        number: c.number,
        title: c.title,
        pageCount: c.pageCount,
      })),
    };
  }, [apiQuery.data]);

  const loading = apiQuery.isLoading;
  const chapters = useMemo(() => manga?.chapters ?? [], [manga]);

  const current = useMemo(
    () => chapters.find((c) => c.number === chapterNumber) ?? null,
    [chapters, chapterNumber],
  );
  const prevChapter = useMemo(
    () =>
      chapters
        .filter((c) => c.number < chapterNumber)
        .sort((a, b) => b.number - a.number)[0] ?? null,
    [chapters, chapterNumber],
  );
  const nextChapter = useMemo(
    () =>
      chapters
        .filter((c) => c.number > chapterNumber)
        .sort((a, b) => a.number - b.number)[0] ?? null,
    [chapters, chapterNumber],
  );

  /* ===== Real chapter pages from the source (proxied via /api/img) ===== */
  const pagesQuery = trpc.manga.getChapterPages.useQuery(
    { chapterId: current?.id ?? 0 },
    {
      enabled: !!current,
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10 * 60_000,
    },
  );
  const rawPages = useMemo(() => pagesQuery.data?.pages ?? [], [pagesQuery.data]);
  const pages = useMemo(
    () => rawPages.map((u) => `/api/img?u=${encodeURIComponent(u)}`),
    [rawPages],
  );
  const pagesLoading = !!current && pagesQuery.isLoading;
  const pagesError = !!current && pagesQuery.isError;

  /* ===== Reader state ===== */
  const [settings, updateSettings] = useReaderSettings();
  const [progress, setProgress] = useState(0);
  const [showPct, setShowPct] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [page, setPage] = useState(0);
  const [markedRead, setMarkedRead] = useState(false);
  const [readSet, setReadSet] = useState<number[]>([]);
  const [bookmarked, setBookmarked] = useState(false);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [rating, setRating] = useState(0);
  const [ageOk, setAgeOk] = useState(isAgeConfirmed);

  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [resume, setResume] = useState<SavedProgress | null>(null);

  const progressRef = useRef(0);
  const pageRef = useRef(0);
  pageRef.current = settings.mode === "paged"
    ? page
    : Math.round(progressRef.current * Math.max(0, pages.length - 1));

  const overlayOpen = chaptersOpen || settingsOpen || downloadOpen || commentsOpen;

  /* ===== Immersive mode: hide global chrome (navbar / bottom nav) via local CSS ===== */
  useEffect(() => {
    document.body.classList.add("reader-immersive");
    return () => document.body.classList.remove("reader-immersive");
  }, []);

  /* ===== Chrome auto-hide controller ===== */
  const hideTimerRef = useRef<number | null>(null);
  const showChrome = useCallback((timeout = 3000) => {
    setChromeVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), timeout);
  }, []);
  const toggleChrome = useCallback(() => {
    setChromeVisible((v) => {
      if (v) {
        if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
        return false;
      }
      showChrome();
      return true;
    });
  }, [showChrome]);

  // Keep chrome pinned while any overlay is open
  useEffect(() => {
    if (overlayOpen) {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      setChromeVisible(true);
    } else {
      showChrome();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayOpen]);

  // Webtoon: hide on scroll-down >200px, reveal on scroll-up
  useEffect(() => {
    if (settings.mode !== "webtoon") return;
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      if (dy > 8 && y > 200) setChromeVisible(false);
      else if (dy < -8) showChrome();
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [settings.mode, showChrome]);

  /* ===== Progress reporting from the active view ===== */
  const pctTimerRef = useRef<number | null>(null);
  const handleProgress = useCallback((ratio: number) => {
    progressRef.current = ratio;
    setProgress((prev) => {
      if (Math.abs(prev - ratio) < 0.002) return prev;
      return ratio;
    });
    setShowPct(true);
    if (pctTimerRef.current) window.clearTimeout(pctTimerRef.current);
    pctTimerRef.current = window.setTimeout(() => setShowPct(false), 1200);
  }, []);

  /* ===== Chapter-change lifecycle ===== */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    progressRef.current = 0;
    setProgress(0);
    setPage(0);
    setRating(loadChapterRating(slug, chapterNumber));
    setBookmarked(isChapterBookmarked(slug, chapterNumber));
    const rs = loadReadSet(slug);
    setReadSet(rs);
    setMarkedRead(rs.includes(chapterNumber));
    const saved = loadProgress(slug);
    setResume(
      saved && saved.chapter === chapterNumber && saved.ratio > 0.03 && saved.ratio < 0.98
        ? saved
        : null,
    );
    showChrome(2500); // teaching affordance on entry
  }, [chapterKey, slug, chapterNumber, showChrome]);

  /* ===== Auto-save (localStorage always, API when authenticated) — every 2s ===== */
  const updateProgressMut = trpc.library.updateProgress.useMutation();
  const updateProgressRef = useRef(updateProgressMut.mutate);
  updateProgressRef.current = updateProgressMut.mutate;

  /* ===== عند فتح الفصل: سجّل التقدم فوراً لو كان المستخدم مسجّلاً ===== */
  useEffect(() => {
    if (!manga || !current || !isAuthenticated) return;
    updateProgressRef.current({
      mangaId: manga.id,
      chapterId: current.id,
      lastPage: 0,
    });
  }, [chapterKey, manga, current, isAuthenticated]);

  useEffect(() => {
    if (!manga || !current) return;
    const id = window.setInterval(() => {
      saveProgress(slug, {
        chapter: chapterNumber,
        page: pageRef.current,
        ratio: progressRef.current,
        ts: Date.now(),
      });
      if (isAuthenticated && manga.fromApi) {
        updateProgressRef.current({
          mangaId: manga.id,
          chapterId: current.id,
          lastPage: pageRef.current,
        });
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [manga, current, slug, chapterNumber, isAuthenticated]);

  /* ===== Mark read at 90% ===== */
  useEffect(() => {
    if (!manga || !current || markedRead) return;
    if (progress >= 0.9) {
      markChapterRead(slug, chapterNumber);
      setMarkedRead(true);
      setReadSet(loadReadSet(slug));
    }
  }, [progress, manga, current, markedRead, slug, chapterNumber]);

  /* ===== Toast helper ===== */
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  /* ===== Navigation between chapters ===== */
  const goChapter = useCallback(
    (c: ChapterItem) => navigate(`/manga/${slug}/chapter/${c.number}`),
    [navigate, slug],
  );
  const handlePrev = useCallback(() => {
    if (prevChapter) goChapter(prevChapter);
    else showToast(t("هذا أول فصل", "This is the first chapter"));
  }, [prevChapter, goChapter, showToast, t]);
  const handleNext = useCallback(() => {
    if (nextChapter) goChapter(nextChapter);
    else
      showToast(
        t(
          "لا يوجد فصل تالٍ — تابع المانجا ليصلك الجديد",
          "No next chapter — follow the manga to get updates",
        ),
      );
  }, [nextChapter, goChapter, showToast, t]);

  /* ===== Resume ===== */
  const resumeNow = useCallback(() => {
    if (!resume) return;
    if (settings.mode === "webtoon") {
      requestAnimationFrame(() => {
        const max = Math.max(
          1,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        window.scrollTo({ top: resume.ratio * max, behavior: "smooth" });
      });
    } else {
      setPage(Math.min(resume.page, Math.max(0, pages.length - 1)));
    }
    setResume(null);
  }, [resume, settings.mode, pages.length]);

  const startOver = useCallback(() => {
    saveProgress(slug, { chapter: chapterNumber, page: 0, ratio: 0, ts: Date.now() });
    window.scrollTo({ top: 0, behavior: "smooth" });
    setPage(0);
    setResume(null);
  }, [slug, chapterNumber]);

  /* ===== Misc actions ===== */
  const rateMut = trpc.engagement.rate.useMutation();
  const handleRate = useCallback(
    (stars: number) => {
      setRating(stars);
      saveChapterRating(slug, chapterNumber, stars);
      if (isAuthenticated && manga?.fromApi) {
        rateMut.mutate({ mangaId: manga.id, stars });
      }
    },
    [slug, chapterNumber, isAuthenticated, manga, rateMut],
  );

  const handleBookmark = useCallback(() => {
    setBookmarked(toggleChapterBookmark(slug, chapterNumber));
  }, [slug, chapterNumber]);

  const openComments = useCallback(() => {
    if (settings.mode === "paged") {
      setCommentsOpen(true);
    } else {
      document
        .getElementById("chapter-comments")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [settings.mode]);

  /* ===== Background override (reader-local) ===== */
  const bgStyle: CSSProperties =
    settings.bg === "oled"
      ? { backgroundColor: "#000000" }
      : settings.bg === "dark"
        ? { backgroundColor: "#0C0A18" }
        : settings.bg === "light"
          ? { backgroundColor: "#F5F3FF" }
          : {};

  const needsGate = !!manga?.isAdult && !ageOk;

  /* ===== Render ===== */
  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4">
        <style>{IMMERSIVE_CSS}</style>
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-[60vh] w-full max-w-[800px]" />
      </div>
    );
  }

  if (!manga || !current) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4 text-center">
        <style>{IMMERSIVE_CSS}</style>
        <BookOpen size={40} className="text-app-3" />
        <h1 className="font-display text-2xl font-bold text-app">
          {t("الفصل غير متوفر", "Chapter unavailable")}
        </h1>
        <p className="max-w-md text-sm text-app-3">
          {t(
            "تعذّر العثور على هذا الفصل — ربما لم يُجمع بعد من المصدر.",
            "This chapter could not be found — it may not have been collected from the source yet.",
          )}
        </p>
        <Link to={manga ? `/manga/${manga.slug}` : "/browse"} className="btn-glass !px-6 !py-2.5 text-sm">
          {manga ? t("عودة لصفحة المانجا", "Back to manga") : t("تصفّح المانجا", "Browse manga")}
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh]" style={bgStyle}>
      {/* reader-local CSS: strip global chrome + bottom-nav padding without touching Layout */}
      <style>{IMMERSIVE_CSS}</style>

      <ReaderChrome
        visible={chromeVisible}
        slug={manga.slug}
        title={manga.title}
        chapterNumber={chapterNumber}
        progress={progress}
        showPct={showPct}
        mode={settings.mode}
        onToggleMode={() =>
          updateSettings({ mode: settings.mode === "webtoon" ? "paged" : "webtoon" })
        }
        onOpenSettings={() => setSettingsOpen(true)}
        bookmarked={bookmarked}
        onToggleBookmark={handleBookmark}
        hasPrev
        hasNext
        onPrevChapter={handlePrev}
        onNextChapter={handleNext}
        onOpenChapters={() => setChaptersOpen(true)}
        commentsCount={commentsTotal}
        onOpenComments={openComments}
        markedRead={markedRead}
      />

      {/* زر تبليغ عن الفصل — عائم أسفل شريط الأدوات، يظهر/يختفي معه */}
      <motion.div
        initial={false}
        animate={{ y: chromeVisible ? 0 : -72, opacity: chromeVisible ? 1 : 0 }}
        transition={{ duration: 0.25, ease: EASE }}
        className={`fixed end-3 top-16 z-[61] ${chromeVisible ? "" : "pointer-events-none"}`}
      >
        <ReportDialog
          mangaId={manga.id}
          chapterId={current.id}
          label={t("تبليغ عن الفصل", "Report chapter")}
          className="btn-icon !h-9 !w-9 glass-strong"
        />
      </motion.div>

      {/* ===== Reading surface (mode switch crossfades) ===== */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${settings.mode}-${chapterKey}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          {pagesLoading ? (
            <div className="mx-auto flex w-full max-w-[800px] flex-col gap-3 px-2 pt-6">
              <div className="skeleton h-[60vh] w-full" />
              <div className="skeleton h-[60vh] w-full" />
              <p className="py-4 text-center text-sm text-app-3">
                {t("جارٍ جلب صفحات الفصل من المصدر…", "Fetching chapter pages from the source…")}
              </p>
            </div>
          ) : pagesError ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
              <BookOpen size={36} className="text-app-3" />
              <p className="max-w-md text-sm text-app-3">
                {t(
                  "تعذّر جلب صفحات هذا الفصل من المصدر — حاول مجدداً بعد قليل.",
                  "Couldn't fetch this chapter's pages from the source — try again shortly.",
                )}
              </p>
              <button onClick={() => pagesQuery.refetch()} className="btn-glass !px-6 !py-2.5 text-sm">
                {t("إعادة المحاولة", "Retry")}
              </button>
            </div>
          ) : settings.mode === "webtoon" ? (
            <WebtoonView
              pages={pages}
              quality={settings.quality}
              onProgress={handleProgress}
              onTapSurface={toggleChrome}
              chapterKey={chapterKey}
            >
              <EndCard
                chapterNumber={chapterNumber}
                hasPrev={!!prevChapter}
                hasNext={!!nextChapter}
                onPrev={handlePrev}
                onNext={handleNext}
                rating={rating}
                onRate={handleRate}
                onOpenDownload={() => setDownloadOpen(true)}
              />
              <div id="chapter-comments">
                <ChapterComments
                  mangaId={manga.fromApi ? manga.id : null}
                  chapterId={manga.fromApi ? current.id : null}
                  fromApi={manga.fromApi}
                  chapterNumber={chapterNumber}
                  onTotalChange={setCommentsTotal}
                />
              </div>
            </WebtoonView>
          ) : (
            <PagedView
              pages={pages}
              page={page}
              onPageChange={setPage}
              direction={settings.direction}
              fit={settings.fit}
              quality={settings.quality}
              onToggleFit={() =>
                updateSettings({ fit: settings.fit === "width" ? "screen" : "width" })
              }
              onTapCenter={toggleChrome}
              onProgress={handleProgress}
              chapterKey={chapterKey}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ===== Overlays ===== */}
      <ChapterDrawer
        open={chaptersOpen}
        onClose={() => setChaptersOpen(false)}
        chapters={chapters}
        currentNumber={chapterNumber}
        readSet={readSet}
        onSelect={goChapter}
      />
      <ReaderSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={updateSettings}
        onOpenDownload={() => setDownloadOpen(true)}
      />
      <DownloadModal
        open={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        slug={slug}
        chapterNumber={chapterNumber}
      />
      <CommentsSheet
        open={commentsOpen && settings.mode === "paged"}
        onClose={() => setCommentsOpen(false)}
        mangaId={manga.fromApi ? manga.id : null}
        chapterId={manga.fromApi ? current.id : null}
        fromApi={manga.fromApi}
        chapterNumber={chapterNumber}
        onTotalChange={setCommentsTotal}
      />

      {/* ===== Resume prompt ===== */}
      <AnimatePresence>
        {resume && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="glass-strong fixed bottom-24 left-1/2 z-[74] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-3 rounded-3xl p-4"
            role="dialog"
            aria-label={t("استئناف القراءة", "Resume reading")}
          >
            <p className="text-sm font-semibold text-app">
              {t("استئناف من حيث توقفت؟", "Resume where you left off?")}
              <span className="ms-2 text-xs text-app-3" dir="ltr">
                {Math.round(resume.ratio * 100)}%
              </span>
            </p>
            <div className="flex gap-2">
              <button className="btn-primary flex-1 !py-2 text-sm" onClick={resumeNow}>
                {t("استئناف", "Resume")}
              </button>
              <button className="btn-glass flex-1 !py-2 text-sm" onClick={startOver}>
                {t("من البداية", "From start")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Toast ===== */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="glass-strong fixed bottom-24 left-1/2 z-[76] w-max max-w-[92vw] -translate-x-1/2 rounded-full px-5 py-2.5 text-center text-sm font-semibold text-app md:bottom-auto md:top-20"
            role="status"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== +18 age gate ===== */}
      <AgeGateModal
        open={needsGate}
        cover={manga.cover}
        onConfirm={() => setAgeOk(true)}
        onClose={() => setAgeOk(false)}
      />
    </div>
  );
}

/**
 * Reader-local immersive overrides — hide the global sticky navbar + mobile
 * bottom nav and strip the layout's bottom-nav padding while the reader is
 * mounted. Scoped via a body class added/removed by this page; Layout is not
 * modified.
 */
const IMMERSIVE_CSS = `
  body.reader-immersive main { padding-bottom: 0 !important; }
  body.reader-immersive header.sticky { display: none !important; }
  body.reader-immersive nav.fixed.bottom-3 { display: none !important; }
`;
