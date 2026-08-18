import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  CalendarCheck,
  Check,
  Coins as CoinsIcon,
  Copy,
  Dices,
  Flame,
  Gift,
  History,
  Library,
  Loader2,
  MessageSquare,
  Palette,
  ShoppingBag,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { Link } from "react-router";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { useToast, ToastViewport } from "@/components/library/toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LOGIN_PATH } from "@/const";
import { proxyImg } from "@/lib/manga";
import { applyShopTheme } from "@/lib/shopThemes";
import { trpc } from "@/providers/trpc";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const KIND_LABELS: Record<string, { ar: string; en: string }> = {
  read: { ar: "قراءة فصل", en: "Chapter read" },
  checkin: { ar: "تسجيل حضور يومي", en: "Daily check-in" },
  mission: { ar: "مهمة", en: "Mission" },
  spin: { ar: "عجلة الحظ", en: "Lucky spin" },
  referral: { ar: "دعوة صديق", en: "Referral" },
  achievement: { ar: "إنجاز", en: "Achievement" },
  streak: { ar: "مكافأة السلسلة", en: "Streak reward" },
  shop_spend: { ar: "شراء من المتجر", en: "Shop purchase" },
  admin: { ar: "من الإدارة", en: "From admin" },
};

const MISSION_META: Record<string, { icon: typeof BookOpen; ar: string; en: string }> = {
  read: { icon: BookOpen, ar: "اقرأ {target} فصول", en: "Read {target} chapters" },
  comment: { icon: MessageSquare, ar: "اكتب تعليقاً", en: "Write a comment" },
  rate: { icon: Star, ar: "قيّم مانجا", en: "Rate a manga" },
  library: { icon: Library, ar: "أضف مانجا لمكتبتك", en: "Add a manga to your library" },
};

const SHOP_GROUPS: { type: string; icon: typeof Palette; ar: string; en: string }[] = [
  { type: "theme", icon: Palette, ar: "ثيمات", en: "Themes" },
  { type: "adfree", icon: Sparkles, ar: "مزايا", en: "Perks" },
];

const BADGE_EMOJI: Record<string, string> = {
  badge_star: "⭐",
  badge_fire: "🔥",
  badge_crown: "👑",
};

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

/* ===== عجلة الحظ المتحركة ===== */
const SPIN_SEGMENTS = [5, 10, 15, 20, 30, 50, 75, 100];

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function wedgePath(i: number, n: number, r: number, cx: number, cy: number): string {
  const [x0, y0] = polar(cx, cy, r, (360 / n) * i);
  const [x1, y1] = polar(cx, cy, r, (360 / n) * (i + 1));
  return `M${cx},${cy} L${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1} Z`;
}

function LuckySpinWheel({
  canSpin,
  pending,
  reward,
  onSpin,
}: {
  canSpin: boolean;
  pending: boolean;
  reward: number | undefined;
  onSpin: () => void;
}) {
  const { t } = useLanguage();
  const [rot, setRot] = useState(0);
  const last = useRef<number | undefined>(undefined);
  const n = SPIN_SEGMENTS.length;

  useEffect(() => {
    if (reward == null || reward === last.current) return;
    last.current = reward;
    const idx = SPIN_SEGMENTS.indexOf(reward);
    const seg = idx >= 0 ? idx : 0;
    const center = (360 / n) * seg + 360 / n / 2;
    setRot((prev) => prev - (prev % 360) + 360 * 5 + (360 - center));
  }, [reward, n]);

  return (
    <div className="glass flex flex-col items-center gap-3 !rounded-3xl p-5">
      <p className="flex items-center gap-2 self-start text-sm font-bold text-app">
        <Dices size={16} className="text-accent" />
        {t("عجلة الحظ", "Lucky Spin")}
      </p>
      <div className="relative h-44 w-44">
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2">
          <div className="h-0 w-0 border-x-8 border-t-[14px] border-x-transparent border-t-[var(--primary)]" />
        </div>
        <motion.svg
          viewBox="0 0 100 100"
          className="h-full w-full"
          animate={{ rotate: rot }}
          transition={{ duration: 3, ease: [0.16, 1, 0.3, 1] }}
        >
          {SPIN_SEGMENTS.map((v, i) => {
            const mid = (360 / n) * i + 360 / n / 2;
            const [tx, ty] = polar(50, 50, 48 * 0.62, mid);
            return (
              <g key={i}>
                <path
                  d={wedgePath(i, n, 48, 50, 50)}
                  fill={i % 2 ? "var(--surface-strong)" : "var(--primary)"}
                  stroke="var(--border)"
                  strokeWidth="0.5"
                />
                <text
                  x={tx}
                  y={ty}
                  fontSize="7"
                  fontWeight="700"
                  fill={i % 2 ? "var(--text)" : "#fff"}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {v}
                </text>
              </g>
            );
          })}
          <circle cx="50" cy="50" r="6" fill="var(--surface-strong)" stroke="var(--border)" strokeWidth="0.5" />
        </motion.svg>
      </div>
      <button
        onClick={onSpin}
        disabled={!canSpin || pending}
        className="btn-primary w-full !py-2.5 text-sm disabled:opacity-50"
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <Dices size={15} />}
        {canSpin
          ? t("لفّ العجلة", "Spin now")
          : t("لفّيت النهاردة — تعالى بكرة", "Spun today — come back tomorrow")}
      </button>
    </div>
  );
}

export default function Coins() {
  const { t, lang } = useLanguage();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [copied, setCopied] = useState(false);

  const walletQ = trpc.coins.wallet.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const txQ = trpc.coins.transactions.useQuery(
    { page: 1, limit: 20 },
    { enabled: isAuthenticated, retry: false },
  );
  const missionsQ = trpc.coins.missions.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const refQ = trpc.coins.referralInfo.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const shopQ = trpc.shop.list.useQuery(undefined, { retry: false });
  const mineQ = trpc.shop.mine.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const lbQ = trpc.shop.leaderboard.useQuery({ limit: 10 }, { retry: false });

  const checkinMut = trpc.coins.checkin.useMutation({
    onSuccess: (res) => {
      toast(t(`+${res.reward} كوين — حضور يوم ${res.checkinDays}`, `+${res.reward} coins — day ${res.checkinDays}`));
      void utils.coins.wallet.invalidate();
      void utils.coins.transactions.invalidate();
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const claimMut = trpc.coins.claimMission.useMutation({
    onSuccess: (res) => {
      toast(t(`+${res.reward} كوين`, `+${res.reward} coins`));
      void utils.coins.wallet.invalidate();
      void utils.coins.missions.invalidate();
      void utils.coins.transactions.invalidate();
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const spinMut = trpc.coins.spin.useMutation({
    onSuccess: (res) => {
      toast(t(`🎰 +${res.reward} كوين!`, `🎰 +${res.reward} coins!`));
      void utils.coins.wallet.invalidate();
      void utils.coins.transactions.invalidate();
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const buyMut = trpc.shop.buy.useMutation({
    onSuccess: () => {
      toast(t("تم الشراء!", "Purchased!"));
      void utils.shop.mine.invalidate();
      void utils.coins.wallet.invalidate();
      void utils.coins.transactions.invalidate();
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const resetThemeMut = trpc.shop.resetTheme.useMutation({
    onSuccess: () => {
      applyShopTheme(null);
      void utils.shop.mine.invalidate();
      toast(t("رجع للثيم الافتراضي", "Reset to default theme"));
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const equipMut = trpc.shop.equip.useMutation({
    onSuccess: (_res, vars) => {
      void utils.shop.mine.invalidate();
      const item = shopQ.data?.items.find((i) => i.itemKey === vars.itemKey);
      if (item?.type === "theme") applyShopTheme(vars.itemKey);
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  if (authLoading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-10">
        <div className="skeleton h-40 w-full" />
        <div className="skeleton h-28 w-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <CoinsIcon size={40} className="text-primary" />
        <h1 className="font-display text-2xl font-bold text-app">
          {t("سجّل الدخول لتجميع الكوينز", "Sign in to earn coins")}
        </h1>
        <p className="text-sm text-app-3">
          {t(
            "اقرأ الفصول، سجّل حضورك يومياً، وكمّل المهام — واكسب كوينز تصرفها على ثيمات ومزايا.",
            "Read chapters, check in daily, and complete missions — earn coins to spend on themes and perks.",
          )}
        </p>
        <Link to={LOGIN_PATH} className="btn-primary !px-8 !py-2.5 text-sm">
          {t("دخول", "Sign in")}
        </Link>
      </div>
    );
  }

  const w = walletQ.data;
  const txs = txQ.data?.items ?? [];
  const missions = missionsQ.data?.items ?? [];
  const info = refQ.data;
  const shopItems = shopQ.data?.items ?? [];
  const owned = mineQ.data?.itemKeys ?? [];
  const lb = lbQ.data?.items ?? [];

  const copyRefLink = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/login?ref=${info.code}`);
      setCopied(true);
      toast(t("تم النسخ", "Copied"));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(t("تعذّر النسخ", "Copy failed"), { kind: "info" });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 md:py-12"
    >
      <h1 className="font-display flex items-center gap-2 text-2xl font-bold text-app">
        <CoinsIcon size={24} className="text-primary" />
        {t("كوينز", "Coins")}
      </h1>

      {/* ===== الرصيد + المستوى ===== */}
      <div className="glass flex flex-col gap-4 !rounded-3xl p-6">
        {walletQ.isLoading || !w ? (
          <div className="skeleton h-24 w-full" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-app-3">{t("رصيدك", "Your balance")}</p>
                <p className="font-display flex items-center gap-2 text-4xl font-bold text-primary tabular-nums">
                  <CoinsIcon size={30} />
                  {w.coins.toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="glass-chip !py-2 text-sm font-bold text-app">
                  <Flame size={15} className="text-accent" />
                  {t(`${w.streakDays} يوم متتالي`, `${w.streakDays}-day streak`)}
                </span>
                <span className="glass-chip !py-2 text-sm font-bold text-app">
                  <Zap size={15} className="text-primary" />
                  {t(`المستوى ${w.level}`, `Level ${w.level}`)}
                </span>
              </div>
            </div>
            {/* شريط XP */}
            <div>
              <div className="mb-1 flex justify-between text-[11px] font-bold text-app-3">
                <span>{t("نقاط الخبرة XP", "XP")}</span>
                <span dir="ltr" className="tabular-nums">
                  {w.xpProgress}/{w.xpPerLevel}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-app-3/15">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (w.xpProgress / Math.max(w.xpPerLevel, 1)) * 100)}%` }}
                  transition={{ duration: 0.8, ease: EASE }}
                  className="gradient-primary h-full rounded-full"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ===== Check-in + قراءة اليوم ===== */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="glass flex flex-col gap-3 !rounded-3xl p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-app">
            <CalendarCheck size={16} className="text-success" />
            {t("تسجيل الحضور اليومي", "Daily check-in")}
          </p>
          <p className="text-xs leading-relaxed text-app-3">
            {t(
              "10 كوين يومياً وتزيد مع سلسلة الحضور — اليوم السابع = 70 كوين.",
              "10 coins daily, growing with your streak — day 7 = 70 coins.",
            )}
          </p>
          <button
            onClick={() => checkinMut.mutate()}
            disabled={!w?.canCheckin || checkinMut.isPending}
            className="btn-primary mt-auto w-full !py-2.5 text-sm disabled:opacity-50"
          >
            {checkinMut.isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <CalendarCheck size={15} />
            )}
            {w?.canCheckin
              ? t("سجّل حضورك", "Check in now")
              : t("سجّلت النهاردة ✅ — تعالى بكرة", "Checked in ✅ — come back tomorrow")}
          </button>
        </div>

        <div className="glass flex flex-col gap-3 !rounded-3xl p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-app">
            <BookOpen size={16} className="text-primary" />
            {t("كوينز القراءة اليوم", "Today's reading coins")}
          </p>
          {w && (
            <>
              <p className="text-xs text-app-3">
                {t(
                  `${w.read.perChapter} كوين لكل فصل جديد تكمله — بحد أقصى ${w.read.dailyCap} يومياً.`,
                  `${w.read.perChapter} coins per new chapter completed — up to ${w.read.dailyCap} daily.`,
                )}
              </p>
              <div className="mt-auto">
                <div className="mb-1 flex justify-between text-[11px] font-bold text-app-3">
                  <span>{t("اليوم", "Today")}</span>
                  <span dir="ltr" className="tabular-nums">
                    {w.read.todayEarned}/{w.read.dailyCap}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-app-3/15">
                  <div
                    className="gradient-primary h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (w.read.todayEarned / Math.max(w.read.dailyCap, 1)) * 100)}%` }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== مهام اليوم ===== */}
      <div className="glass flex flex-col gap-3 !rounded-3xl p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-app">
          <Target size={16} className="text-primary" />
          {t("مهام اليوم", "Daily missions")}
        </p>
        {missionsQ.isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12 w-full !rounded-xl" />
            ))}
          </div>
        ) : missions.length === 0 ? (
          <p className="py-4 text-center text-sm text-app-3">
            {t("لا مهام متاحة الآن", "No missions available right now")}
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {missions.map((m) => {
              const meta = MISSION_META[m.key] ?? { icon: Target, ar: m.key, en: m.key };
              const MIcon = meta.icon;
              const label = t(meta.ar, meta.en).replace("{target}", String(m.target));
              const pct = Math.min(100, (m.progress / Math.max(m.target, 1)) * 100);
              return (
                <div key={m.key} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <MIcon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-app">{label}</span>
                      <span dir="ltr" className="shrink-0 text-[11px] font-bold text-app-3 tabular-nums">
                        {m.progress}/{m.target}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-app-3/15">
                      <div
                        className="gradient-primary h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  {m.claimed ? (
                    <span className="glass-chip shrink-0 text-[11px] font-bold text-success">
                      {t("تم الاستلام ✓", "Claimed ✓")}
                    </span>
                  ) : m.claimable ? (
                    <button
                      onClick={() => claimMut.mutate({ key: m.key })}
                      disabled={claimMut.isPending}
                      className="btn-primary shrink-0 !px-4 !py-1.5 text-xs disabled:opacity-50"
                    >
                      {claimMut.isPending && claimMut.variables?.key === m.key ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : null}
                      {t("استلام", "Claim")}
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs font-bold text-app-3 tabular-nums" dir="ltr">
                      +{m.reward}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== المتجر ===== */}
      <div className="glass flex flex-col gap-4 !rounded-3xl p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-app">
          <ShoppingBag size={16} className="text-primary" />
          {t("المتجر", "Shop")}
        </p>
        {shopQ.isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12 w-full !rounded-xl" />
            ))}
          </div>
        ) : shopItems.length === 0 ? (
          <p className="py-4 text-center text-sm text-app-3">
            {t("لا عناصر متاحة الآن", "No items available right now")}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {SHOP_GROUPS.map((g) => {
              const items = shopItems
                .filter((i) => i.type === g.type && i.active)
                .sort((a, b) => a.sort - b.sort);
              if (items.length === 0) return null;
              const GIcon = g.icon;
              return (
                <div key={g.type} className="flex flex-col gap-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-app-3">
                    <GIcon size={13} />
                    {t(g.ar, g.en)}
                    {g.type === "theme" && isAuthenticated && mineQ.data?.equippedTheme && (
                      <button
                        onClick={() => resetThemeMut.mutate()}
                        disabled={resetThemeMut.isPending}
                        className="btn-glass ms-auto !px-3 !py-1 text-[10.5px] disabled:opacity-50"
                      >
                        {t("الثيم الافتراضي", "Default theme")}
                      </button>
                    )}
                  </p>
                  {items.map((item) => {
                    const isOwned = owned.includes(item.itemKey);
                    const isEquipped =
                      item.type === "theme"
                        ? mineQ.data?.equippedTheme === item.itemKey
                        : item.type === "badge"
                          ? mineQ.data?.equippedBadge === item.itemKey
                          : false;
                    return (
                      <div key={item.id} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-app">
                          {t(item.nameAr, item.nameEn)}
                        </span>
                        <span
                          className="glass-chip shrink-0 !py-1 text-[11px] font-bold text-primary tabular-nums"
                          dir="ltr"
                        >
                          <CoinsIcon size={11} />
                          {item.price}
                        </span>
                        {isAuthenticated && (
                          <>
                            {!isOwned ? (
                              <button
                                onClick={() => buyMut.mutate({ itemKey: item.itemKey })}
                                disabled={buyMut.isPending}
                                className="btn-primary shrink-0 !px-4 !py-1.5 text-xs disabled:opacity-50"
                              >
                                {buyMut.isPending && buyMut.variables?.itemKey === item.itemKey ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : null}
                                {t("شراء", "Buy")}
                              </button>
                            ) : item.type === "adfree" ? (
                              <span className="glass-chip shrink-0 text-[11px] font-bold text-success">
                                {t("مُفعَّل ✓", "Active ✓")}
                              </span>
                            ) : isEquipped ? (
                              <span className="glass-chip shrink-0 text-[11px] font-bold text-success">
                                {t("مُفعَّل ✓", "Equipped ✓")}
                              </span>
                            ) : (
                              <button
                                onClick={() => equipMut.mutate({ itemKey: item.itemKey })}
                                disabled={equipMut.isPending}
                                className="btn-glass shrink-0 !px-4 !py-1.5 text-xs disabled:opacity-50"
                              >
                                {equipMut.isPending && equipMut.variables?.itemKey === item.itemKey ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : null}
                                {t("تفعيل", "Equip")}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== متصدرو الأسبوع ===== */}
      <div className="glass flex flex-col gap-3 !rounded-3xl p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-app">
          <Trophy size={16} className="text-accent-2" />
          {t("متصدرو الأسبوع", "Weekly top readers")}
        </p>
        <p className="text-xs text-app-3">
          {t(
            "أكثر قراءة هذا الأسبوع — المراكز الثلاثة الأولى تاخذ شارة.",
            "Most chapters read this week — top 3 earn a badge.",
          )}
        </p>
        {lbQ.isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-10 w-full !rounded-xl" />
            ))}
          </div>
        ) : lb.length === 0 ? (
          <p className="py-4 text-center text-sm text-app-3">
            {t("لا بيانات هذا الأسبوع بعد", "No data for this week yet")}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {lb.map((entry, idx) => {
              const isMe = user?.id === entry.userId;
              return (
                <div
                  key={entry.userId}
                  className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 ${
                    isMe ? "bg-primary/10" : ""
                  }`}
                >
                  <span className="w-7 shrink-0 text-center text-sm font-bold tabular-nums">
                    {idx < 3 ? (
                      RANK_MEDALS[idx]
                    ) : (
                      <span className="text-app-3">{idx + 1}</span>
                    )}
                  </span>
                  <Avatar className="size-8">
                    <AvatarImage src={proxyImg(entry.avatarUrl)} alt={entry.name} />
                    <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                      {entry.name?.slice(0, 1) ?? "؟"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs font-semibold text-app">
                    <span className="truncate">{entry.name}</span>
                    {entry.badge && BADGE_EMOJI[entry.badge] ? (
                      <span>{BADGE_EMOJI[entry.badge]}</span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-app-3 tabular-nums">
                    <span dir="ltr">{entry.chapters}</span>
                    <BookOpen size={12} />
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-primary tabular-nums">
                    <span dir="ltr">{entry.coins}</span>
                    <CoinsIcon size={12} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== عجلة الحظ + دعوة الأصدقاء ===== */}
      <div className="grid gap-4 sm:grid-cols-2">
        <LuckySpinWheel
          canSpin={!!w?.canSpin}
          pending={spinMut.isPending}
          reward={spinMut.data?.reward}
          onSpin={() => spinMut.mutate()}
        />

        <div className="glass flex flex-col gap-3 !rounded-3xl p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-app">
            <Gift size={16} className="text-success" />
            {t("ادعُ أصحابك", "Invite friends")}
          </p>
          {refQ.isLoading || !info ? (
            <div className="flex flex-col gap-2">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-10 w-full !rounded-xl" />
            </div>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-app-3">
                {t(
                  `لك ${info.inviterReward} كوين ولصديقك ${info.inviteeReward} كوين بعد ما يقرأ ${info.threshold} فصول.`,
                  `You get ${info.inviterReward} coins and your friend gets ${info.inviteeReward} after they read ${info.threshold} chapters.`,
                )}
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  dir="ltr"
                  value={`${window.location.origin}/login?ref=${info.code}`}
                  className="input-glass min-w-0 flex-1 !py-2 text-xs"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  onClick={() => void copyRefLink()}
                  className="btn-glass shrink-0 !px-3 !py-2 text-xs"
                  aria-label={t("نسخ الرابط", "Copy link")}
                >
                  {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="glass-chip text-[11px] font-bold text-app">
                  {t(`${info.invited} دعوة`, `${info.invited} invited`)}
                </span>
                <span className="glass-chip text-[11px] font-bold text-app">
                  {t(`${info.rewarded} مكتملة`, `${info.rewarded} rewarded`)}
                </span>
                <span className="glass-chip text-[11px] font-bold text-app" dir="ltr">
                  {t(`+${info.earned} كوين`, `+${info.earned} coins`)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== سجل العمليات ===== */}
      <div className="glass !rounded-3xl p-5">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold text-app">
          <History size={16} className="text-app-3" />
          {t("آخر العمليات", "Recent activity")}
        </p>
        {txQ.isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-10 w-full !rounded-xl" />
            ))}
          </div>
        ) : txs.length === 0 ? (
          <p className="py-6 text-center text-sm text-app-3">
            {t("لا عمليات بعد — ابدأ القراءة واكسب أول كوينز!", "No activity yet — start reading and earn your first coins!")}
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-app/10">
            {txs.map((tx) => {
              const label = KIND_LABELS[tx.kind] ?? { ar: tx.kind, en: tx.kind };
              const positive = tx.amount >= 0;
              return (
                <div key={tx.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                      positive ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                    }`}
                  >
                    <TrendingUp size={14} style={positive ? undefined : { transform: "scaleY(-1)" }} />
                  </span>
                  <span className="flex-1 text-xs font-semibold text-app-2">
                    {t(label.ar, label.en)}
                  </span>
                  <span className="text-[10px] text-app-3">
                    {new Date(tx.createdAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}
                  </span>
                  <span
                    className={`text-sm font-bold tabular-nums ${positive ? "text-success" : "text-danger"}`}
                    dir="ltr"
                  >
                    {positive ? "+" : ""}
                    {tx.amount}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ToastViewport />
    </motion.div>
  );
}
