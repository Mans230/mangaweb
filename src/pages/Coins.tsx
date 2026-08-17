import { useState } from "react";
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
  Star,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Link } from "react-router";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { useToast, ToastViewport } from "@/components/library/toast";
import { LOGIN_PATH } from "@/const";
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

export default function Coins() {
  const { t, lang } = useLanguage();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
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

      {/* ===== عجلة الحظ + دعوة الأصدقاء ===== */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="glass flex flex-col gap-3 !rounded-3xl p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-app">
            <Dices size={16} className="text-accent" />
            {t("عجلة الحظ", "Lucky Spin")}
          </p>
          <p className="text-xs leading-relaxed text-app-3">
            {t("لفّة يومية مجانية — من 5 إلى 100 كوين.", "One free spin daily — 5 to 100 coins.")}
          </p>
          <button
            onClick={() => spinMut.mutate()}
            disabled={!w?.canSpin || spinMut.isPending}
            className="btn-primary mt-auto w-full !py-2.5 text-sm disabled:opacity-50"
          >
            {spinMut.isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Dices size={15} />
            )}
            {w?.canSpin
              ? t("لفّ العجلة", "Spin now")
              : t("لفّيت النهاردة — تعالى بكرة", "Spun today — come back tomorrow")}
          </button>
        </div>

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
