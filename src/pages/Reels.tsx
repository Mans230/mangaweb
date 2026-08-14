/**
 * صفحة الريلز — /fun/reels: تمرير عمودي ملء الشاشة (snap scroll) ستايل تيك توك،
 * تبويبا «جديد/تريند»، وزر نشر (+) للموثّقين.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Clapperboard, Flame, Loader2, Plus, Sparkles } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/components/LanguageProvider";
import EmptyState from "@/components/EmptyState";
import { ToastViewport } from "@/components/library/toast";
import { LOGIN_PATH } from "@/const";
import ReelItem, { type ReelFeedItem } from "@/components/reels/ReelItem";
import ReelCommentsSheet from "@/components/reels/ReelCommentsSheet";
import UploadReelModal from "@/components/reels/UploadReelModal";

type ReelsTab = "new" | "trending";

export default function Reels() {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<ReelsTab>("new");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [commentsFor, setCommentsFor] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const feedQ = trpc.reels.feed.useInfiniteQuery(
    { tab },
    {
      retry: false,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    },
  );

  const items = (feedQ.data?.pages.flatMap((p) => p.items) ?? []) as ReelFeedItem[];

  // ريل محدد عبر ?r= (من زر المشاركة) — مرّر إليه بعد الجلب
  const targetId = Number(params.get("r") ?? 0) || null;
  useEffect(() => {
    if (!targetId || !items.length) return;
    const el = scrollRef.current?.querySelector(`[data-reel-id="${targetId}"]`);
    el?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, feedQ.isSuccess]);

  /* جلب المزيد عند الاقتراب من نهاية التمرير */
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || !feedQ.hasNextPage || feedQ.isFetchingNextPage) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - el.clientHeight * 1.5) {
      void feedQ.fetchNextPage();
    }
  };

  // عند تبديل التبويب أعِد التمرير للأعلى
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  return (
    <div className="fixed inset-x-0 top-16 bottom-0 z-30 bg-black md:bottom-0">
      {/* التبويبات + زر النشر */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-center gap-5 bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-3">
        {(
          [
            { key: "new", label: t("جديد", "New"), icon: Sparkles },
            { key: "trending", label: t("تريند", "Trending"), icon: Flame },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
              tab === item.key ? "bg-white/15 text-white backdrop-blur" : "text-white/60 hover:text-white"
            }`}
          >
            <item.icon size={14} />
            {item.label}
          </button>
        ))}
        <button
          onClick={() =>
            isAuthenticated ? setUploadOpen(true) : undefined
          }
          className="pointer-events-auto absolute end-3 top-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-transform hover:scale-105"
          aria-label={t("انشر ريل", "Post a reel")}
          title={t("انشر ريل", "Post a reel")}
          {...(!isAuthenticated ? { role: "link" } : {})}
        >
          {isAuthenticated ? (
            <Plus size={20} />
          ) : (
            <Link to={LOGIN_PATH} className="flex h-full w-full items-center justify-center" aria-label={t("سجّل الدخول للنشر", "Sign in to post")}>
              <Plus size={20} />
            </Link>
          )}
        </button>
      </div>

      {/* الفيد */}
      {feedQ.isLoading ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 size={30} className="animate-spin text-white/70" />
        </div>
      ) : feedQ.isError ? (
        <div className="flex h-full items-center justify-center px-6">
          <EmptyState
            title={t("تعذّر تحميل الريلز", "Could not load reels")}
            caption={t("تحقق من اتصالك وحاول مجدداً.", "Check your connection and try again.")}
          />
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 text-white">
            <Clapperboard size={28} />
          </span>
          <p className="text-sm font-bold text-white">{t("لا ريلز بعد", "No reels yet")}</p>
          <p className="max-w-xs text-xs leading-5 text-white/60">
            {t("كن أول من ينشر لحظة من عالم المانجا.", "Be the first to post a manga-world moment.")}
          </p>
          {isAuthenticated && (
            <button onClick={() => setUploadOpen(true)} className="btn-primary !px-6 !py-2.5 text-sm">
              <Plus size={15} />
              {t("انشر أول ريل", "Post the first reel")}
            </button>
          )}
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
        >
          {items.map((reel) => (
            <div key={reel.id} className="h-full w-full" data-reel-id={reel.id}>
              <ReelItem reel={reel} onOpenComments={(r) => setCommentsFor(r.id)} />
            </div>
          ))}
          {feedQ.isFetchingNextPage && (
            <div className="flex h-24 items-center justify-center">
              <Loader2 size={22} className="animate-spin text-white/60" />
            </div>
          )}
        </div>
      )}

      <ReelCommentsSheet reelId={commentsFor} onClose={() => setCommentsFor(null)} />
      <UploadReelModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <ToastViewport />
    </div>
  );
}
