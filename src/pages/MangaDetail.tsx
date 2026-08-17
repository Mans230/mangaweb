
import { useMemo, useState } from "react";
import { proxyImg } from "@/lib/manga";
import { useParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/components/LanguageProvider";
import AgeGateModal, { isAgeConfirmed } from "@/components/AgeGateModal";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import BackdropHero from "@/components/manga/BackdropHero";
import InfoCard from "@/components/manga/InfoCard";
import ChaptersTab from "@/components/manga/ChaptersTab";
import CommentsTab from "@/components/manga/CommentsTab";
import SimilarTab from "@/components/manga/SimilarTab";
import ReviewsSection from "@/components/manga/ReviewsSection";
import DownloadModal from "@/components/manga/DownloadModal";
import AuthPrompt from "@/components/manga/AuthPrompt";
import type { CommentVM, DetailVM } from "@/components/manga/types";
import {
  computeReadState,
  dbChapterToVM,
  dbMangaToCard,
  timeAgo,
} from "@/components/manga/types";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/** أسماء مصادر المانجا الإنجليزية — لكشف أعمال EN وقلب الاتجاه LTR */
const EN_SOURCES = ["mangadex", "asurascans", "vortexscans"];

type TabId = "chapters" | "comments" | "similar";

export default function MangaDetail() {
  const { slug = "" } = useParams();
  const { t, lang } = useLanguage();
  const { user, isAuthenticated } = useAuth();

  /* ================= البيانات — API فقط، بلا بدائل وهمية ================= */
  const detailQuery = trpc.manga.getBySlug.useQuery(
    { slug },
    { enabled: !!slug, retry: false },
  );

  const vm: DetailVM | null = useMemo(() => {
    const d = detailQuery.data;
    if (!d) return null;
    const chapters = d.chapters.map((c) => dbChapterToVM(c, lang));
    const card = dbMangaToCard(d, lang);
    return {
      id: d.id,
      slug: d.slug,
      title: d.title,
      altTitle: card.altTitle,
      cover: card.cover,
      type: card.type,
      status: card.status,
      rating: d.rating ?? 0,
      ratingCount: d.ratingCount ?? 0,
      chapterTotal: d.chapterCount ?? chapters.length,
      views: card.views,
      genres: d.genres ?? [],
      synopsis: d.description ?? "",
      source: card.source,
      isAdult: d.isAdult,
      updatedAgo: card.updatedAt,
      chapters,
      isFavorite: d.userState.isFavorite,
      isFollowing: d.userState.isFollowing,
      lastReadNumber: d.userState.progress?.chapter?.number ?? null,
      ...computeReadState(chapters, d.userState.progress?.chapter?.number ?? null),
    };
  }, [detailQuery.data, lang]);

  /** عمل إنجليزي؟ — يُكشف من source.name الذي يعيده getBySlug */
  const isEn = !!vm && EN_SOURCES.includes(vm.source);

  /* ================= حالة القراءة ================= */
  const progressQuery = trpc.library.getProgress.useQuery(
    { mangaId: vm?.id ?? 0 },
    { enabled: isAuthenticated && !!vm, retry: false },
  );
  const [lastReadOverride, setLastReadOverride] = useState<number | null | undefined>(undefined);
  const serverLastRead = progressQuery.data?.readChapters ?? vm?.lastReadNumber ?? null;
  const lastRead = lastReadOverride !== undefined ? lastReadOverride : serverLastRead;

  const { readCount, nextChapter } = useMemo(
    () => (vm ? computeReadState(vm.chapters, lastRead) : { readCount: 0, nextChapter: null }),
    [vm, lastRead],
  );

  /* ================= متابعة / مفضلة ================= */
  const [isFavorite, setIsFavorite] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  // مزامنة الحالة الأولية من الخادم عند تغيّر المانجا (render-adjust)
  const [syncedVmId, setSyncedVmId] = useState<number | null>(null);
  if (vm && vm.id !== syncedVmId) {
    setSyncedVmId(vm.id);
    setIsFavorite(vm.isFavorite);
    setIsFollowing(vm.isFollowing);
  }

  const [authPrompt, setAuthPrompt] = useState(false);
  const requireAuth = () => setAuthPrompt(true);

  const favMutation = trpc.library.toggleFavorite.useMutation({
    onError: () => setIsFavorite((v) => !v), // تراجع عند الفشل
  });
  const folMutation = trpc.library.toggleFollow.useMutation({
    onError: () => setIsFollowing((v) => !v),
  });

  const toggleFavorite = () => {
    if (!vm) return;
    setIsFavorite((v) => !v);
    favMutation.mutate({ mangaId: vm.id });
  };
  const toggleFollow = () => {
    if (!vm) return;
    setIsFollowing((v) => !v);
    folMutation.mutate({ mangaId: vm.id });
  };

  /* ================= التقييم ================= */
  const ratingQuery = trpc.engagement.getRating.useQuery(
    { mangaId: vm?.id ?? 0 },
    { enabled: !!vm, retry: false },
  );
  const [userStars, setUserStars] = useState<number | null>(null);
  const [ratingOverride, setRatingOverride] = useState<{ rating: number; count: number } | null>(null);
  // مزامنة تقييم المستخدم من الخادم (render-adjust)
  const fetchedStars = ratingQuery.data?.userStars ?? null;
  const [prevFetchedStars, setPrevFetchedStars] = useState<number | null>(null);
  if (fetchedStars !== prevFetchedStars) {
    setPrevFetchedStars(fetchedStars);
    setUserStars(fetchedStars);
  }

  const rateMutation = trpc.engagement.rate.useMutation({
    onSuccess: (r) => setRatingOverride({ rating: r.average, count: r.count }),
  });
  const handleRate = (stars: number) => {
    if (!vm) return;
    setUserStars(stars);
    rateMutation.mutate({ mangaId: vm.id, stars });
  };

  /* ================= التعليقات ================= */
  const [commentLimit, setCommentLimit] = useState(20);
  const commentsQuery = trpc.engagement.listComments.useQuery(
    { mangaId: vm?.id ?? 0, page: 1, limit: commentLimit },
    { enabled: !!vm, retry: false },
  );
  const [localComments, setLocalComments] = useState<CommentVM[]>([]);

  // عند فشل جلب التعليقات تُعرض قائمة فارغة حقيقية بدل تعليقات وهمية
  const serverComments: CommentVM[] = useMemo(() => {
    if (commentsQuery.isError) return [];
    return (commentsQuery.data?.items ?? []).map((c) => ({
      id: c.id,
      author: c.user.name ?? t("مستخدم", "User"),
      avatar: proxyImg(c.user.avatar) || "/placeholder-avatar.svg",
      badge: "عضو",
      timeAgo: timeAgo(c.createdAt, lang),
      content: c.content,
      isSpoiler: c.isSpoiler,
      likes: 0,
    }));
  }, [commentsQuery.isError, commentsQuery.data, lang, t]);

  const commentTotal = commentsQuery.data?.total ?? 0;
  const allComments = [...localComments, ...serverComments];

  const addCommentMutation = trpc.engagement.addComment.useMutation({
    onSuccess: (row) => {
      if (!row) return;
      setLocalComments((prev) => [
        {
          id: row.id,
          author: row.user.name ?? t("مستخدم", "User"),
          avatar: proxyImg(row.user.avatar) || "/placeholder-avatar.svg",
          badge: "عضو",
          timeAgo: t("الآن", "now"),
          content: row.content,
          isSpoiler: row.isSpoiler,
          likes: 0,
        },
        ...prev,
      ]);
    },
  });

  const submitComment = (content: string, isSpoiler: boolean) => {
    if (!vm) return;
    addCommentMutation.mutate({ mangaId: vm.id, content, isSpoiler });
  };

  /* ================= أعمال مشابهة ================= */
  const similarQuery = trpc.manga.similar.useQuery(
    { slug, limit: 6 },
    { enabled: !!slug, retry: false },
  );
  // عند الفشل: قائمة فارغة حقيقية بدل أعمال وهمية
  const similarItems = useMemo(() => {
    if (similarQuery.isError) return [];
    return (similarQuery.data ?? []).map((m) => dbMangaToCard(m, lang));
  }, [similarQuery.isError, similarQuery.data, lang]);

  /* ================= تحديد الكل كمقروء ================= */
  const progressMutation = trpc.library.updateProgress.useMutation();
  const clearProgressMutation = trpc.library.clearProgress.useMutation();
  const markAllRead = () => {
    if (!vm) return;
    if (!isAuthenticated) return requireAuth();
    const latest = vm.chapters[0]; // مرتبة من الأحدث
    if (!latest) return;
    setLastReadOverride(latest.number);
    progressMutation.mutate({ mangaId: vm.id, chapterId: latest.id, lastPage: 0 });
  };
  const markAllUnread = () => {
    if (!vm) return;
    if (!isAuthenticated) return requireAuth();
    setLastReadOverride(0);
    clearProgressMutation.mutate({ mangaId: vm.id });
  };

  /* ================= +18 ================= */
  const [confirmedAdult, setConfirmedAdult] = useState<Record<string, boolean>>({});
  const [dismissedGates, setDismissedGates] = useState<Record<string, boolean>>({});
  const ageAllowed = !vm?.isAdult || (vm ? (confirmedAdult[vm.slug] ?? isAgeConfirmed()) : true);
  const blurAdult = !!vm?.isAdult && !ageAllowed;
  const gateOpen = blurAdult && !!vm && !dismissedGates[vm.slug];

  /* ================= واجهة ================= */
  const [activeTab, setActiveTab] = useState<TabId>("chapters");
  const [downloadOpen, setDownloadOpen] = useState(false);

  // إعادة ضبط الحالة المحلية عند الانتقال لمانجا أخرى ضمن نفس المسار (render-adjust)
  const [prevSlug, setPrevSlug] = useState(slug);
  if (slug !== prevSlug) {
    setPrevSlug(slug);
    setLocalComments([]);
    setCommentLimit(20);
    setLastReadOverride(undefined);
    setRatingOverride(null);
    setUserStars(null);
    setActiveTab("chapters");
  }

  // تحميل
  if (detailQuery.isLoading) {
    return (
      <div className="relative">
        <div className="skeleton h-[420px] !rounded-none lg:h-[480px]" />
        <div className="glass-strong relative z-10 mx-4 -mt-28 grid gap-6 rounded-3xl p-5 md:mx-auto md:max-w-6xl md:grid-cols-[240px,1fr] md:p-8">
          <div className="skeleton mx-auto aspect-[2/3] w-40 md:w-60" />
          <div className="space-y-4">
            <div className="skeleton h-6 w-2/3" />
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-12 w-64" />
          </div>
        </div>
      </div>
    );
  }

  // فشل الجلب: NOT_FOUND → صفحة غير موجودة، وغيره → حالة خطأ مع إعادة محاولة
  if (detailQuery.isError) {
    const code = detailQuery.error?.data?.code;
    if (code !== "NOT_FOUND") {
      return (
        <div className="mx-auto max-w-2xl px-4 pt-20">
          <div className="glass">
            <ErrorState
              onRetry={() => detailQuery.refetch()}
              retrying={detailQuery.isRefetching}
            />
          </div>
        </div>
      );
    }
  }

  // غير موجودة
  if (!vm) {
    return (
      <EmptyState
        title={t("المانجا غير موجودة", "Manga not found")}
        caption={t("ربما حُذفت أو أن الرابط غير صحيح.", "It may have been removed or the link is wrong.")}
        ctaLabel={t("تصفّح الأعمال", "Browse works")}
        ctaTo="/browse"
      />
    );
  }

  const displayVm: DetailVM = {
    ...vm,
    rating: ratingOverride?.rating ?? ratingQuery.data?.average ?? vm.rating,
    ratingCount: ratingOverride?.count ?? ratingQuery.data?.count ?? vm.ratingCount,
    readCount,
    nextChapter,
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "chapters", label: isEn ? `Chapters (${vm.chapterTotal})` : `${t("الفصول", "Chapters")} (${vm.chapterTotal})` },
    { id: "comments", label: isEn ? `Comments (${commentTotal})` : `${t("التعليقات", "Comments")} (${commentTotal})` },
    { id: "similar", label: isEn ? "Similar" : t("أعمال مشابهة", "Similar") },
  ];

  return (
    <div className="relative pb-14" dir={isEn ? "ltr" : undefined} lang={isEn ? "en" : undefined}>
      {/* هالة محيطة واحدة (مخفّضة للأداء) */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div
          className="animate-blob-a absolute -top-[8vw] end-[-6vw] h-[32vw] w-[32vw] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(224,86,31,0.4), transparent 65%)", filter: "blur(80px)" }}
        />
      </div>

      <BackdropHero cover={vm.cover} extraBlurred={blurAdult} />

      {/* spacer بارتفاع الخلفية */}
      <div className="h-[420px] lg:h-[480px]" aria-hidden />

      <InfoCard
        vm={displayVm}
        blurCover={blurAdult}
        isAuthenticated={isAuthenticated}
        userStars={userStars}
        ratingPending={rateMutation.isPending}
        isFavorite={isFavorite}
        isFollowing={isFollowing}
        followPending={folMutation.isPending}
        favoritePending={favMutation.isPending}
        onRate={handleRate}
        onToggleFavorite={toggleFavorite}
        onToggleFollow={toggleFollow}
        onOpenDownload={() => setDownloadOpen(true)}
        onAuthRequired={requireAuth}
      />

      {/* ===== التبويبات ===== */}
      <section className="relative z-10 mx-4 mt-8 md:mx-auto md:max-w-6xl">
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.3 }}
          className="glass mb-5 flex rounded-full p-1.5"
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="relative flex-1 rounded-full py-2.5 text-xs font-bold transition-colors sm:text-sm"
              >
                {active && (
                  <motion.span
                    layoutId="manga-tab-pill"
                    className="gradient-primary absolute inset-0 rounded-full"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className={`relative z-10 ${active ? "text-white" : "text-app-3 hover:text-app-2"}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {activeTab === "chapters" && (
              <ChaptersTab
                slug={vm.slug}
                title={vm.title}
                cover={vm.cover}
                chapters={vm.chapters}
                lastReadNumber={lastRead}
                nextChapter={nextChapter}
                markAllPending={progressMutation.isPending || clearProgressMutation.isPending}
                onMarkAllRead={markAllRead}
                onMarkAllUnread={markAllUnread}
              />
            )}
            {activeTab === "comments" && (
              <CommentsTab
                isAuthenticated={isAuthenticated}
                userAvatar={user?.avatarUrl}
                comments={allComments}
                total={commentTotal + localComments.length}
                hasMore={allComments.length < commentTotal}
                loadingMore={commentsQuery.isFetching}
                submitPending={addCommentMutation.isPending}
                onLoadMore={() => setCommentLimit((l) => Math.min(100, l + 20))}
                onSubmit={submitComment}
              />
            )}
            {activeTab === "similar" && <SimilarTab items={similarItems} />}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* ===== المراجعات النصية ===== */}
      <ReviewsSection mangaId={vm.id} isEn={isEn} />

      <DownloadModal
        open={downloadOpen}
        slug={vm.slug}
        chapterTotal={vm.chapterTotal}
        onClose={() => setDownloadOpen(false)}
      />
      <AuthPrompt open={authPrompt} onClose={() => setAuthPrompt(false)} />
      <AgeGateModal
        open={gateOpen}
        cover={vm.cover}
        onConfirm={() => setConfirmedAdult((p) => ({ ...p, [vm.slug]: true }))}
        onClose={() => setDismissedGates((p) => ({ ...p, [vm.slug]: true }))}
      />
    </div>
  );
}
