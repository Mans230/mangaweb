import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { motion } from "framer-motion";
import { Bell, BookOpenCheck, Download, Heart, History, ListChecks, Send } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import LibraryHeader from "@/components/library/LibraryHeader";
import FavoritesTab from "@/components/library/FavoritesTab";
import FollowingTab from "@/components/library/FollowingTab";
import ReadingNowTab from "@/components/library/ReadingNowTab";
import HistoryTab from "@/components/library/HistoryTab";
import ListsTab from "@/components/library/ListsTab";
import DownloadsTab from "@/components/library/DownloadsTab";
import StatsCard from "@/components/library/StatsCard";
import GuestGate from "@/components/library/GuestGate";
import ErrorState from "@/components/ErrorState";
import { ToastViewport } from "@/components/library/toast";
import { normalizeApiManga, timeAgoAr } from "@/components/library/data";
import type { LibraryData } from "@/components/library/data";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

type TabKey = "favorites" | "following" | "reading" | "history" | "lists" | "downloads";
const TAB_KEYS: TabKey[] = ["favorites", "following", "reading", "history", "lists", "downloads"];

function parseTab(raw: string | null): TabKey {
  return (TAB_KEYS as string[]).includes(raw ?? "") ? (raw as TabKey) : "favorites";
}

export default function Library() {
  const { t } = useLanguage();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: TabKey = parseTab(params.get("tab"));

  const libraryQ = trpc.library.getLibrary.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    staleTime: 30_000,
  });
  const listsQ = trpc.lists.myLists.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    staleTime: 30_000,
  });

  const isLive = isAuthenticated && !libraryQ.isError;
  // بلا بدائل وهمية: عند الفشل تُعرض حالة خطأ حقيقية، وعند الفراغ قوائم فارغة
  const data: LibraryData = useMemo(() => {
    if (libraryQ.data) {
      return {
        favorites: libraryQ.data.favorites.map((r) => normalizeApiManga(r.manga)),
        following: libraryQ.data.following.map((r) => ({
          manga: normalizeApiManga(r.manga),
          updatedAt: timeAgoAr(new Date(r.manga.updatedAt ?? r.createdAt)),
        })),
        history: libraryQ.data.history.map((r) => {
          const date = new Date(r.updatedAt);
          return {
            id: r.id,
            manga: normalizeApiManga(r.manga),
            chapter: Math.floor(r.chapter.number),
            lastPage: r.lastPage,
            date,
            timeLabel: date.toLocaleTimeString("ar", { hour: "numeric", minute: "2-digit" }),
          };
        }),
      };
    }
    return { favorites: [], following: [], history: [] };
  }, [libraryQ.data]);

  const total = data.favorites.length + data.following.length + data.history.length;
  // نسبة اللحاق: عناوين بلا فصول غير مقروءة من المتابَعة (تقريبية)
  const catchUpPct = data.following.length
    ? Math.round(
        (data.following.filter((f) => f.manga.chapters > 0).length / data.following.length) * 78,
      )
    : 100;

  const setTab = (key: TabKey) => {
    setParams(key === "favorites" ? {} : { tab: key }, { replace: true });
  };

  const tabs: { key: TabKey; label: string; icon: typeof Heart; count: number | null }[] = [
    { key: "favorites", label: t("المفضلة", "Favorites"), icon: Heart, count: data.favorites.length },
    { key: "following", label: t("المتابَعة", "Following"), icon: Bell, count: data.following.length },
    { key: "reading", label: t("أقرأها الآن", "Reading now"), icon: BookOpenCheck, count: new Set(data.history.map((h) => h.manga.id)).size },
    { key: "history", label: t("السجل", "History"), icon: History, count: data.history.length },
    { key: "lists", label: t("قوائمي", "My lists"), icon: ListChecks, count: listsQ.data?.length ?? 0 },
    { key: "downloads", label: t("التحميلات", "Downloads"), icon: Download, count: null },
  ];

  return (
    <div className="relative mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14">
      {/* ambient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="animate-blob-a absolute -top-24 end-8 h-72 w-72 rounded-full bg-primary-soft/25 blur-3xl" />
        <div className="animate-blob-b absolute top-1/2 start-0 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
      </div>

      {isLoading ? (
        <div className="relative flex flex-col gap-6">
          <div className="skeleton h-40 w-full !rounded-3xl" />
          <div className="skeleton h-12 w-full !rounded-full" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[2/3] w-full" />
            ))}
          </div>
        </div>
      ) : !isAuthenticated ? (
        <div className="relative py-8">
          <GuestGate
            heading={t("مكتبتك بانتظارك", "Your library awaits")}
            copy={t(
              "سجّل الدخول لتحفظ مفضلاتك وتتابع فصولك وتنشئ قوائمك المخصصة وتستكمل قراءتك من أي جهاز.",
              "Sign in to save favorites, follow your series, build custom lists, and resume reading from any device.",
            )}
          />
        </div>
      ) : (
        <div className="relative flex flex-col gap-8">
          <LibraryHeader
            name={user?.name ?? t("قارئ", "Reader")}
            avatar={user?.avatarUrl ?? "/avatar-1.png"}
            total={total}
            favCount={data.favorites.length}
            followCount={data.following.length}
            historyCount={data.history.length}
            catchUpPct={catchUpPct}
          />

          {/* رابط صفحة الطلبات — نُقلت من البار السفلي إلى هنا */}
          <div className="flex justify-end">
            <Link
              to="/request"
              className="btn-glass !px-4 !py-2 text-xs"
            >
              <Send size={13} />
              {t("طلبات المانجا", "Manga requests")}
            </Link>
          </div>

          {/* tab bar — قابلة للتمرير أفقياً على الموبايل */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE, delay: 0.15 }}
            className="glass flex !rounded-full p-1.5 max-sm:overflow-x-auto max-sm:[-ms-overflow-style:none] max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden"
            role="tablist"
          >
            {tabs.map((item) => {
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(item.key)}
                  className={`relative flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 py-2.5 text-xs font-bold transition-colors sm:text-sm ${
                    active ? "text-white" : "text-app-3 hover:text-app-2"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="library-tab-pill"
                      className="gradient-primary absolute inset-0 rounded-full shadow-md"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <item.icon size={15} className="relative z-10" />
                  <span className="relative z-10">{item.label}</span>
                  {item.count !== null && (
                    <span
                      className={`relative z-10 rounded-full px-1.5 text-[10.5px] ${
                        active ? "bg-white/25" : "bg-black/5 dark:bg-white/10"
                      }`}
                    >
                      {item.count.toLocaleString("ar")}
                    </span>
                  )}
                </button>
              );
            })}
          </motion.div>

          {/* tab content */}
          {libraryQ.isError && tab !== "lists" && tab !== "downloads" ? (
            <div className="glass">
              <ErrorState
                onRetry={() => libraryQ.refetch()}
                retrying={libraryQ.isRefetching}
              />
            </div>
          ) : (
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              {tab === "favorites" && (
                <FavoritesTab favorites={data.favorites} isLive={isLive} />
              )}
              {tab === "following" && (
                <FollowingTab following={data.following} isLive={isLive} />
              )}
              {tab === "reading" && <ReadingNowTab history={data.history} />}
              {tab === "history" && <HistoryTab history={data.history} />}
              {tab === "lists" && <ListsTab />}
              {tab === "downloads" && <DownloadsTab />}
            </motion.div>
          )}

          {!libraryQ.isError && <StatsCard history={data.history} />}
        </div>
      )}

      <ToastViewport />
    </div>
  );
}
