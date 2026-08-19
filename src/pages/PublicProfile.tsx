import { useParams } from "react-router";
import { motion } from "framer-motion";
import {
  BookOpen,
  Crown,
  Flame,
  MessageSquare,
  UserMinus,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { proxyImg, timeAgo } from "@/lib/manga";
import { trpc } from "@/providers/trpc";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const ACT_LABEL: Record<string, [string, string]> = {
  read: ["قرأ فصلاً", "Read a chapter"],
  checkin: ["تسجيل حضور يومي", "Daily check-in"],
  mission: ["أكمل مهمة", "Completed a mission"],
  spin: ["لفّ عجلة الحظ", "Spun the wheel"],
  referral: ["دعا صديقاً", "Referred a friend"],
  achievement: ["حقّق إنجازاً", "Unlocked an achievement"],
  streak: ["مكافأة سلسلة", "Streak reward"],
  shop_spend: ["شراء من المتجر", "Shop purchase"],
  admin: ["من الإدارة", "From admin"],
};

export default function PublicProfile() {
  const { username = "" } = useParams();
  const { t, lang } = useLanguage();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const q = trpc.users.publicProfile.useQuery({ username }, { retry: false });

  const followMut = trpc.users.follow.useMutation({
    onSuccess: () => utils.users.publicProfile.invalidate({ username }),
  });
  const unfollowMut = trpc.users.unfollow.useMutation({
    onSuccess: () => utils.users.publicProfile.invalidate({ username }),
  });

  if (q.isLoading) {
    return <div className="mx-auto max-w-3xl px-4 py-8"><div className="skeleton h-64 !rounded-2xl" /></div>;
  }
  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-xl font-bold text-app">{t("المستخدم غير موجود", "User not found")}</h1>
      </div>
    );
  }

  const { user, wallet, stats, activity, isFollowing, isSelf, isPremium } = q.data;
  const xpInLevel = wallet.xp % 100;
  const pct = Math.min(100, Math.round((xpInLevel / 100) * 100));
  const busy = followMut.isPending || unfollowMut.isPending;

  const tiles = [
    { icon: BookOpen, value: stats.chaptersRead, label: t("فصول مقروءة", "Chapters read") },
    { icon: MessageSquare, value: stats.comments, label: t("تعليقات", "Comments") },
    { icon: Users, value: stats.followers, label: t("متابِعون", "Followers") },
    { icon: UserPlus, value: stats.following, label: t("يتابع", "Following") },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="mx-auto max-w-3xl px-4 py-6 md:px-6"
    >
      {/* رأس البروفايل */}
      <div className="glass relative overflow-hidden !rounded-2xl">
        {user.bannerUrl && (
          <img src={proxyImg(user.bannerUrl)} alt="" className="absolute inset-x-0 top-0 h-28 w-full object-cover" />
        )}
        <div className={`relative flex flex-wrap items-center gap-4 p-5 ${user.bannerUrl ? "pt-20" : ""}`}>
          <img
            src={proxyImg(user.avatarUrl) || "/placeholder-avatar.svg"}
            alt=""
            onError={(e) => {
              if (!e.currentTarget.src.endsWith("/placeholder-avatar.svg"))
                e.currentTarget.src = "/placeholder-avatar.svg";
            }}
            className="h-20 w-20 shrink-0 rounded-full border-2 border-app object-cover"
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-display flex items-center gap-1.5 truncate text-xl font-bold text-app">
              {user.name ?? user.username}
              {isPremium && (
                <span className="glass-chip !py-0.5 text-[10px] font-bold text-warning" title="Premium">
                  <Crown size={11} /> {t("مميّز", "Premium")}
                </span>
              )}
            </h1>
            {user.username && <p className="text-xs text-app-3" dir="ltr">@{user.username}</p>}
            <p className="mt-1 text-[11px] text-app-3">
              {t("عضو منذ", "Member since")} {new Date(user.createdAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}
            </p>
          </div>
          {!isSelf && (
            <button
              onClick={() =>
                isFollowing ? unfollowMut.mutate({ userId: user.id }) : followMut.mutate({ userId: user.id })
              }
              disabled={busy || !isAuthenticated}
              className={`${isFollowing ? "btn-glass" : "btn-primary"} shrink-0 !px-5 !py-2.5 text-sm disabled:opacity-50`}
              title={!isAuthenticated ? t("سجّل الدخول للمتابعة", "Sign in to follow") : undefined}
            >
              {isFollowing ? <UserMinus size={15} /> : <UserPlus size={15} />}
              {isFollowing ? t("إلغاء المتابعة", "Unfollow") : t("متابعة", "Follow")}
            </button>
          )}
        </div>
      </div>

      {/* المستوى + XP + الستريك */}
      <div className="glass mt-4 flex flex-wrap items-center gap-4 !rounded-2xl p-4">
        <span className="flex items-center gap-1.5 text-sm font-bold text-primary">
          <Zap size={15} />
          {t("المستوى", "Level")} {wallet.level}
        </span>
        <div className="min-w-[140px] flex-1">
          <div className="mb-1 flex justify-between text-[11px] text-app-3">
            <span>XP {xpInLevel}/100</span>
            <span>{wallet.xp} {t("إجمالي", "total")}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-app-3/20">
            <div className="h-full gradient-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-sm font-bold text-warning">
          <Flame size={15} />
          {wallet.streakDays} {t("يوم", "days")}
        </span>
      </div>

      {/* الإحصائيات */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="glass !rounded-2xl p-3 text-center">
            <span className="gradient-primary mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-xl">
              <tile.icon size={16} />
            </span>
            <div className="font-display text-lg font-extrabold text-app">{tile.value}</div>
            <div className="text-[10.5px] text-app-3">{tile.label}</div>
          </div>
        ))}
      </div>

      {/* النشاط الأخير */}
      <h2 className="font-display mb-3 mt-6 text-base font-bold text-app">{t("النشاط الأخير", "Recent activity")}</h2>
      {activity.length === 0 ? (
        <p className="glass !rounded-2xl px-4 py-8 text-center text-sm text-app-3">{t("لا نشاط بعد.", "No activity yet.")}</p>
      ) : (
        <div className="glass flex flex-col divide-y divide-[var(--border)] !rounded-2xl">
          {activity.map((a, i) => {
            const label = ACT_LABEL[a.kind] ?? [a.kind, a.kind];
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 text-sm text-app-2">{t(label[0], label[1])}</span>
                {a.amount > 0 && (
                  <span className="glass-chip !py-0.5 text-[10.5px] font-bold text-success" dir="ltr">+{a.amount} XP</span>
                )}
                <span className="text-[11px] text-app-3">{timeAgo(a.createdAt, lang)}</span>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
