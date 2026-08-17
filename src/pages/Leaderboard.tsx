import { Link } from "react-router";
import { motion } from "framer-motion";
import { BookOpen, Coins as CoinsIcon, Crown, Medal, Trophy } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { proxyImg } from "@/lib/manga";
import { trpc } from "@/providers/trpc";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const BADGE_EMOJI: Record<string, string> = {
  badge_star: "⭐",
  badge_fire: "🔥",
  badge_crown: "👑",
};

type Entry = {
  userId: number;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  chapters: number;
  coins: number;
  badge: string | null;
};

function avatarOf(e: Entry): string {
  return proxyImg(e.avatarUrl) || "/placeholder-avatar.svg";
}

/** الاسم يربط لصفحة البروفايل العام إن وُجد username */
function NameLink({ e, className }: { e: Entry; className?: string }) {
  const label = e.name ?? `#${e.userId}`;
  if (!e.username) return <span className={className}>{label}</span>;
  return (
    <Link to={`/u/${e.username}`} className={`${className ?? ""} hover:text-primary`}>
      {label}
    </Link>
  );
}

/** بطاقة منصّة التتويج (أول/ثاني/ثالث) */
function PodiumCard({ e, rank }: { e: Entry; rank: 1 | 2 | 3 }) {
  const { t } = useLanguage();
  const meta = {
    1: { ring: "border-warning", label: t("الأول", "1st"), icon: Crown, tint: "text-warning", size: "h-24 w-24", order: "order-1 sm:order-2 sm:-mt-6" },
    2: { ring: "border-app-3", label: t("الثاني", "2nd"), icon: Medal, tint: "text-app-2", size: "h-20 w-20", order: "order-2 sm:order-1" },
    3: { ring: "border-primary", label: t("الثالث", "3rd"), icon: Medal, tint: "text-primary", size: "h-20 w-20", order: "order-3" },
  }[rank];
  const Icon = meta.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: rank * 0.08 }}
      className={`glass flex flex-1 flex-col items-center gap-2 !rounded-2xl p-4 text-center ${meta.order}`}
    >
      <span className={`glass-chip !py-0.5 text-[11px] font-bold ${meta.tint}`}>
        <Icon size={13} />
        {meta.label}
      </span>
      <img
        src={avatarOf(e)}
        alt=""
        onError={(ev) => {
          if (!ev.currentTarget.src.endsWith("/placeholder-avatar.svg"))
            ev.currentTarget.src = "/placeholder-avatar.svg";
        }}
        className={`${meta.size} rounded-full border-2 object-cover ${meta.ring}`}
      />
      <div className="flex items-center gap-1 text-sm font-bold text-app">
        <NameLink e={e} />
        {e.badge && BADGE_EMOJI[e.badge] && <span>{BADGE_EMOJI[e.badge]}</span>}
      </div>
      <div className="flex items-center gap-3 text-[11px] text-app-3">
        <span className="flex items-center gap-1">
          <BookOpen size={12} className="text-primary" />
          {e.chapters}
        </span>
        <span className="flex items-center gap-1" dir="ltr">
          <CoinsIcon size={12} className="text-accent-2" />
          {e.coins}
        </span>
      </div>
    </motion.div>
  );
}

export default function Leaderboard() {
  const { t } = useLanguage();
  const q = trpc.shop.leaderboard.useQuery({ limit: 50 }, { retry: false });
  const items = (q.data?.items ?? []) as Entry[];
  const [first, second, third, ...rest] = items;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="mx-auto max-w-3xl px-4 py-8 md:px-6"
    >
      <h1 className="font-display mb-1 flex items-center gap-2 text-2xl font-bold text-app">
        <Trophy size={22} className="text-warning" />
        {t("لوحة المتصدّرين", "Leaderboard")}
      </h1>
      <p className="mb-6 text-xs text-app-3">
        {t("ترتيب القرّاء حسب فصول هذا الأسبوع والكوينز المكتسبة.", "Readers ranked by chapters read this week and coins earned.")}
      </p>

      {q.isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-16 w-full !rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="glass !rounded-2xl px-4 py-12 text-center text-sm text-app-3">
          {t("لا ترتيب بعد هذا الأسبوع — ابدأ القراءة لتظهر هنا!", "No rankings yet this week — start reading to appear here!")}
        </p>
      ) : (
        <>
          {/* منصّة التتويج */}
          <div className="mb-6 flex items-end gap-3">
            {second && <PodiumCard e={second} rank={2} />}
            {first && <PodiumCard e={first} rank={1} />}
            {third && <PodiumCard e={third} rank={3} />}
          </div>

          {/* بقية الترتيب */}
          {rest.length > 0 && (
            <div className="glass flex flex-col divide-y divide-[var(--border)] !rounded-2xl">
              {rest.map((e, i) => (
                <div key={e.userId} className="flex items-center gap-3 px-4 py-3">
                  <span className="font-ednum w-7 shrink-0 text-center text-sm font-bold text-app-3">
                    {i + 4}
                  </span>
                  <img
                    src={avatarOf(e)}
                    alt=""
                    onError={(ev) => {
                      if (!ev.currentTarget.src.endsWith("/placeholder-avatar.svg"))
                        ev.currentTarget.src = "/placeholder-avatar.svg";
                    }}
                    className="h-10 w-10 shrink-0 rounded-full border border-app object-cover"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-app">
                    <NameLink e={e} />
                    {e.badge && BADGE_EMOJI[e.badge] && <span className="ms-1">{BADGE_EMOJI[e.badge]}</span>}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-app-3">
                    <BookOpen size={13} className="text-primary" />
                    {e.chapters}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-app-3" dir="ltr">
                    <CoinsIcon size={13} className="text-accent-2" />
                    {e.coins}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
