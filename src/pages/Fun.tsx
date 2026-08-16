import { useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { Clapperboard, Eye, Heart, UsersRound } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { useUiToggles } from "@/lib/uiToggles";
import { formatCount, type ReelFeedItem } from "@/components/reels/ReelItem";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

type FunTab = "communities" | "reels";

/** صفحة Fun — تبويبان: المجتمعات والريلز (كل تبويب يُخفى من إعدادات الأدمن) */
export default function Fun() {
  const { t } = useLanguage();
  const { hideCommunities, hideReels } = useUiToggles();
  const [tab, setTab] = useState<FunTab>("communities");

  const tabs: { key: FunTab; label: string; icon: typeof UsersRound }[] = [
    ...(hideCommunities
      ? []
      : [{ key: "communities" as FunTab, label: t("المجتمعات", "Communities"), icon: UsersRound }]),
    ...(hideReels
      ? []
      : [{ key: "reels" as FunTab, label: t("الريلز", "Reels"), icon: Clapperboard }]),
  ];

  // كلا القسمين مخفي → حالة فارغة ودّية بدل صفحة بيضاء
  if (tabs.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <span className="glass flex h-16 w-16 items-center justify-center rounded-3xl text-primary">
          <Clapperboard size={26} />
        </span>
        <h1 className="font-display text-xl font-bold text-app">
          {t("قسم Fun متوقف حالياً", "Fun is currently unavailable")}
        </h1>
        <p className="text-sm leading-relaxed text-app-3">
          {t(
            "أخفت الإدارة هذا القسم مؤقتاً — تصفّح المانجا أو ارجع للرئيسية.",
            "The team hid this section for now — browse manga or head back home.",
          )}
        </p>
        <Link to="/" className="btn-primary !px-6 !py-2.5 text-sm">
          {t("العودة للرئيسية", "Back to home")}
        </Link>
      </div>
    );
  }
  const activeTab = tabs.some((x) => x.key === tab) ? tab : tabs[0].key;

  return (
    <div className="relative mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
      {/* ambient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="animate-blob-a absolute -top-20 start-10 h-64 w-64 rounded-full bg-primary-soft/25 blur-3xl" />
        <div className="animate-blob-b absolute top-2/3 end-0 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative flex flex-col gap-6"
      >
        <h1 className="font-display text-2xl font-extrabold text-app md:text-3xl">
          {t("Fun", "Fun")} 🎮
        </h1>

        {/* tab bar */}
        <div className="glass flex !rounded-full p-1.5" role="tablist">
          {tabs.map((item) => {
            const active = activeTab === item.key;
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
                    layoutId="fun-tab-pill"
                    className="gradient-primary absolute inset-0 rounded-full shadow-md"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <item.icon size={15} className="relative z-10" />
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* tab content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          {activeTab === "communities" ? (
            <div className="glass flex flex-col items-center gap-4 !rounded-3xl p-8 text-center">
              <span className="gradient-primary flex h-14 w-14 items-center justify-center rounded-2xl text-white">
                <UsersRound size={24} />
              </span>
              <p className="text-sm leading-relaxed text-app-2">
                {t(
                  "انضم لمجتمعات المانجا ودردش مع القرّاء مباشرة.",
                  "Join manga communities and chat with readers live.",
                )}
              </p>
              <Link to="/communities" className="btn-primary !px-6 !py-2.5 text-sm">
                <UsersRound size={15} />
                {t("تصفّح المجتمعات", "Browse communities")}
              </Link>
            </div>
          ) : (
            <ReelsPreview />
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}

/** معاينة الريلز — أحدث 6 كشبكة مصغرة + زر فتح صفحة الريلز */
function ReelsPreview() {
  const { t } = useLanguage();
  const feedQ = trpc.reels.feed.useQuery({ tab: "new" }, { retry: false });
  const items = ((feedQ.data?.items ?? []) as ReelFeedItem[]).slice(0, 6);

  return (
    <div className="glass flex flex-col gap-4 !rounded-3xl p-5 md:p-6">
      {feedQ.isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton aspect-[9/14] !rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <Clapperboard size={24} />
          </span>
          <p className="text-sm font-bold text-app">{t("لا ريلز بعد", "No reels yet")}</p>
          <p className="max-w-xs text-xs leading-5 text-app-3">
            {t("كن أول من ينشر لحظة من عالم المانجا.", "Be the first to post a manga-world moment.")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.map((reel) => (
            <Link
              key={reel.id}
              to={`/fun/reels?r=${reel.id}`}
              className="group relative aspect-[9/14] overflow-hidden rounded-2xl bg-black"
            >
              <video
                src={reel.videoUrl}
                muted
                playsInline
                preload="metadata"
                className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white">
                  <span className="flex items-center gap-0.5">
                    <Heart size={10} />
                    {formatCount(reel.likesCount)}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Eye size={10} />
                    {formatCount(reel.viewsCount)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Link to="/fun/reels" className="btn-primary !px-6 !py-2.5 text-sm">
        <Clapperboard size={15} />
        {t("افتح الريلز", "Open reels")}
      </Link>
    </div>
  );
}
