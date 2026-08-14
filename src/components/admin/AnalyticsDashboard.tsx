import { useMemo } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Clock3,
  Film,
  Layers,
  Minus,
  Server,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { formatNum, timeAgo } from "@/lib/manga";
import { EASE } from "./adminUtils";

/* ---------- كرت رقم ---------- */
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  danger,
  index,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  sub?: React.ReactNode;
  danger?: boolean;
  index: number;
}) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay: index * 0.06 }}
      className="glass flex items-center gap-3.5 !rounded-2xl p-4"
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
          danger ? "bg-danger/15 text-danger" : "bg-primary-soft/15 text-primary"
        }`}
      >
        <Icon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={`font-display text-xl font-bold tabular-nums md:text-2xl ${
            danger && value > 0 ? "text-danger" : "text-app"
          }`}
        >
          {formatNum(value)}
        </div>
        <div className="truncate text-xs text-app-3">{label}</div>
        {sub && <div className="mt-0.5 text-[11px]">{sub}</div>}
      </div>
    </motion.div>
  );
}

/* ---------- غلاف رسم بياني ---------- */
function ChartCard({
  title,
  icon: Icon,
  children,
  wide,
  delay = 0.2,
}: {
  title: string;
  icon: typeof Activity;
  children: React.ReactNode;
  wide?: boolean;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      className={`glass !rounded-2xl p-4 md:p-5 ${wide ? "xl:col-span-2" : ""}`}
    >
      <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
        <Icon size={16} className="text-primary" />
        {title}
      </h3>
      {/* scroll أفقي على الموبايل عند الحاجة */}
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">{children}</div>
      </div>
    </motion.section>
  );
}

export default function AnalyticsDashboard() {
  const { t } = useLanguage();

  const overview = trpc.analytics.overview.useQuery(undefined, { retry: false });
  const timeseries = trpc.analytics.timeseries.useQuery(undefined, { retry: false });
  const topManga = trpc.analytics.topManga.useQuery({ limit: 10 }, { retry: false });
  const peakHours = trpc.analytics.peakHours.useQuery(undefined, { retry: false });
  const sourcesStatus = trpc.analytics.sourcesStatus.useQuery(undefined, { retry: false });

  const lineConfig = useMemo(
    () =>
      ({
        visits: { label: t("الزيارات", "Visits"), color: "#A78BFA" },
        newUsers: { label: t("أعضاء جدد", "New users"), color: "#E879F9" },
      }) satisfies ChartConfig,
    [t],
  );

  const hoursConfig = useMemo(
    () =>
      ({
        visits: { label: t("الزيارات", "Visits"), color: "#7C3AED" },
      }) satisfies ChartConfig,
    [t],
  );

  const tsData = useMemo(
    () =>
      (timeseries.data ?? []).map((d) => ({
        ...d,
        day: d.date.slice(5), // MM-DD
      })),
    [timeseries.data],
  );

  if (overview.isLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
        <div className="skeleton h-72" />
      </div>
    );
  }

  if (overview.isError || !overview.data) {
    return (
      <div className="glass">
        <ErrorState onRetry={() => overview.refetch()} retrying={overview.isRefetching} />
      </div>
    );
  }

  const ov = overview.data;
  const delta = ov.visitsToday - ov.visitsYesterday;
  const deltaPct =
    ov.visitsYesterday > 0 ? Math.round((delta / ov.visitsYesterday) * 100) : null;

  return (
    <div className="space-y-5">
      {/* كروت الأرقام */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Activity}
          label={t("زيارات اليوم", "Visits today")}
          value={ov.visitsToday}
          index={0}
          sub={
            <span
              className={`flex items-center gap-1 font-semibold ${
                delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-app-3"
              }`}
            >
              {delta > 0 ? (
                <ArrowUpRight size={12} />
              ) : delta < 0 ? (
                <ArrowDownRight size={12} />
              ) : (
                <Minus size={12} />
              )}
              {deltaPct !== null
                ? `${Math.abs(deltaPct)}%`
                : `${Math.abs(delta)}`}{" "}
              {t("عن أمس", "vs yesterday")}
            </span>
          }
        />
        <StatCard
          icon={UserPlus}
          label={t("أعضاء جدد (7 أيام)", "New users (7d)")}
          value={ov.newUsers7d}
          index={1}
          sub={
            <span className="text-app-3">
              {formatNum(ov.newUsers30d)} {t("خلال 30 يوم", "in 30d")}
            </span>
          }
        />
        <StatCard
          icon={Users}
          label={t("إجمالي المستخدمين", "Total users")}
          value={ov.totalUsers}
          index={2}
        />
        <StatCard
          icon={Film}
          label={t("ريلز بانتظار الموافقة", "Pending reels")}
          value={ov.pendingReels}
          danger
          index={3}
        />
        <StatCard
          icon={BookOpen}
          label={t("إجمالي المانهوا", "Total series")}
          value={ov.totalManga}
          index={4}
        />
        <StatCard
          icon={Layers}
          label={t("إجمالي الفصول", "Total chapters")}
          value={ov.totalChapters}
          index={5}
        />
      </div>

      {/* الرسوم */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title={t("الزيارات والأعضاء الجدد — 30 يوم", "Visits & new users — 30 days")} icon={TrendingUp} wide delay={0.15}>
          {timeseries.isLoading ? (
            <div className="skeleton h-64" />
          ) : (
            <ChartContainer config={lineConfig} className="!aspect-auto h-64 w-full">
              <AreaChart data={tsData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#A78BFA" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E879F9" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#E879F9" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(167,139,250,0.12)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={10} interval={4} />
                <YAxis tickLine={false} axisLine={false} fontSize={10} width={36} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="visits" stroke="#A78BFA" strokeWidth={2} fill="url(#gv)" />
                <Area type="monotone" dataKey="newUsers" stroke="#E879F9" strokeWidth={2} fill="url(#gu)" />
              </AreaChart>
            </ChartContainer>
          )}
        </ChartCard>

        <ChartCard title={t("ساعات الذروة", "Peak hours")} icon={Clock3} delay={0.25}>
          {peakHours.isLoading ? (
            <div className="skeleton h-64" />
          ) : (
            <ChartContainer config={hoursConfig} className="!aspect-auto h-64 w-full">
              <BarChart data={peakHours.data ?? []} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(167,139,250,0.12)" vertical={false} />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={10} interval={2} />
                <YAxis tickLine={false} axisLine={false} fontSize={10} width={36} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="visits" fill="#7C3AED" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </ChartCard>

        {/* أكثر 10 مانهوا قراءة */}
        <motion.section
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.3 }}
          className="glass !rounded-2xl p-4 md:p-5"
        >
          <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
            <BookOpen size={16} className="text-primary" />
            {t("أكثر المانهوا قراءة", "Most read series")}
          </h3>
          {topManga.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton h-12" />
              ))}
            </div>
          ) : (topManga.data ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-app-3">
              {t("لا بيانات قراءة بعد", "No reading data yet")}
            </p>
          ) : (
            <ol className="space-y-1.5">
              {(topManga.data ?? []).map((m, i) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-primary-soft/5"
                >
                  <span
                    className={`font-display w-6 shrink-0 text-center text-sm font-bold tabular-nums ${
                      i < 3 ? "text-primary" : "text-app-3"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-app">
                    {m.title}
                  </span>
                  <span className="glass-chip shrink-0 !px-2.5 !py-0.5 !text-[11px] tabular-nums">
                    {formatNum(m.readers)} {t("قارئ", "readers")}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </motion.section>

        {/* حالة المصادر */}
        <motion.section
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.35 }}
          className="glass !rounded-2xl p-4 md:p-5"
        >
          <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
            <Server size={16} className="text-primary" />
            {t("حالة المصادر", "Sources status")}
          </h3>
          {sourcesStatus.isLoading ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-20" />
              ))}
            </div>
          ) : (sourcesStatus.data ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-app-3">
              {t("لا مصادر مسجّلة", "No sources registered")}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(sourcesStatus.data ?? []).map((s) => {
                const up = s.status === "active";
                return (
                  <div key={s.id} className="glass flex items-center gap-3 !rounded-xl p-3">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        up ? "bg-success" : "bg-danger"
                      } ${up ? "animate-pulse-soft" : ""}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-app" dir="ltr">
                        {s.name}
                      </div>
                      <div className="text-[11px] text-app-3">
                        {up ? t("شغّال", "Up") : t("واقف", "Down")} ·{" "}
                        {t("آخر فحص", "Last check")}: {timeAgo(s.lastScanAt)}
                      </div>
                    </div>
                    <span className="glass-chip shrink-0 !px-2 !py-0.5 !text-[10px] tabular-nums">
                      {formatNum(s.mangaCount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </motion.section>
      </div>
    </div>
  );
}
