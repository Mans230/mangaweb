import { motion } from "framer-motion";
import {
  BookOpen,
  CalendarCheck,
  Coins as CoinsIcon,
  Flame,
  History,
  Loader2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Link } from "react-router";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/library/toast";
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

export default function Coins() {
  const { t, lang } = useLanguage();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const walletQ = trpc.coins.wallet.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const txQ = trpc.coins.transactions.useQuery(
    { page: 1, limit: 20 },
    { enabled: isAuthenticated, retry: false },
  );

  const checkinMut = trpc.coins.checkin.useMutation({
    onSuccess: (res) => {
      toast(t(`+${res.reward} كوين — حضور يوم ${res.checkinDays}`, `+${res.reward} coins — day ${res.checkinDays}`));
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
    </motion.div>
  );
}
