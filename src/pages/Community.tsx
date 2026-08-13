import { Link, useParams, useSearchParams } from "react-router";
import { motion } from "framer-motion";
import { ArrowRight, MessagesSquare, Radio } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/components/LanguageProvider";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import DiscussionTab from "@/components/community/DiscussionTab";
import LiveChatTab from "@/components/community/LiveChatTab";
import { ToastViewport } from "@/components/library/toast";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

type TabId = "discussion" | "chat";

export default function Community() {
  const { slug = "" } = useParams();
  const { t } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: TabId = params.get("tab") === "chat" ? "chat" : "discussion";

  const detailQ = trpc.manga.getBySlug.useQuery(
    { slug },
    { enabled: !!slug, retry: false },
  );

  const setTab = (key: TabId) => {
    setParams(key === "discussion" ? {} : { tab: key }, { replace: true });
  };

  // تحميل
  if (detailQ.isLoading) {
    return (
      <div className="relative mx-auto max-w-3xl px-4 py-10 md:py-14">
        <div className="skeleton h-28 w-full !rounded-3xl" />
        <div className="skeleton mt-6 h-12 w-full !rounded-full" />
        <div className="mt-6 flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16 !rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // فشل غير «غير موجودة»
  if (detailQ.isError && detailQ.error?.data?.code !== "NOT_FOUND") {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-20">
        <div className="glass">
          <ErrorState onRetry={() => detailQ.refetch()} retrying={detailQ.isRefetching} />
        </div>
      </div>
    );
  }

  const manga = detailQ.data;
  if (!manga) {
    return (
      <EmptyState
        title={t("المانجا غير موجودة", "Manga not found")}
        caption={t("ربما حُذفت أو أن الرابط غير صحيح.", "It may have been removed or the link is wrong.")}
        ctaLabel={t("تصفّح الأعمال", "Browse works")}
        ctaTo="/browse"
      />
    );
  }

  const tabs: { id: TabId; label: string; icon: typeof MessagesSquare }[] = [
    { id: "discussion", label: t("النقاش", "Discussion"), icon: MessagesSquare },
    { id: "chat", label: t("الشات المباشر", "Live chat"), icon: Radio },
  ];

  return (
    <div className="relative mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
      {/* ambient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="animate-blob-a absolute -top-24 end-8 h-72 w-72 rounded-full bg-primary-soft/25 blur-3xl" />
        <div className="animate-blob-b absolute top-1/2 start-0 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
      </div>

      <div className="relative flex flex-col gap-6">
        {/* رأس: غلاف + عنوان + رجوع لصفحة المانجا */}
        <motion.header
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="glass relative flex items-center gap-4 overflow-hidden !rounded-3xl p-4 md:p-5"
        >
          {manga.coverUrl && (
            <>
              <img
                src={manga.coverUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl"
              />
              <div className="absolute inset-0 bg-gradient-to-l from-transparent via-[var(--bg)]/60 to-[var(--bg)]/85" />
            </>
          )}
          <Link to={`/manga/${manga.slug}`} className="relative shrink-0">
            <img
              src={manga.coverUrl || "/cover-01.png"}
              alt={manga.title}
              className="h-24 w-16 rounded-xl border border-app object-cover shadow-md md:h-28 md:w-20"
            />
          </Link>
          <div className="relative min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-app-3">
              {t("مجتمع", "Community of")}
            </p>
            <h1 className="font-display line-clamp-2 text-lg font-extrabold text-app md:text-2xl">
              {t(`مجتمع ${manga.title}`, `${manga.title} community`)}
            </h1>
            <Link
              to={`/manga/${manga.slug}`}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary transition-colors hover:text-primary-soft"
            >
              {t("العودة لصفحة العمل", "Back to title page")}
              <ArrowRight size={13} />
            </Link>
          </div>
        </motion.header>

        {/* التبويبان */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.12 }}
          className="glass flex !rounded-full p-1.5"
          role="tablist"
        >
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`relative flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-xs font-bold transition-colors sm:text-sm ${
                  active ? "text-white" : "text-app-3 hover:text-app-2"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="community-tab-pill"
                    className="gradient-primary absolute inset-0 rounded-full shadow-md"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <item.icon size={15} className="relative z-10" />
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </motion.div>

        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          {tab === "discussion" ? (
            <DiscussionTab
              mangaId={manga.id}
              isAuthenticated={isAuthenticated}
              isAdmin={user?.role === "admin"}
              currentUserId={user ? Number(user.id) : null}
              userAvatar={user?.avatarUrl}
            />
          ) : (
            <LiveChatTab
              mangaId={manga.id}
              isAuthenticated={isAuthenticated}
              isAdmin={user?.role === "admin"}
              currentUserId={user ? Number(user.id) : null}
              userAvatar={user?.avatarUrl}
            />
          )}
        </motion.div>
      </div>

      <ToastViewport />
    </div>
  );
}
