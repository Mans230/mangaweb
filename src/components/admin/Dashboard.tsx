import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import {
  BookOpen,
  GitMerge,
  Inbox,
  Layers,
  PlusCircle,
  RefreshCw,
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
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import {
  chaptersSeries30d,
  formatNum,
  kpiSparklines,
  mockActivity,
  mockStats,
  sourceDistribution,
} from "./adminMock";
import type { ActivityEvent } from "./adminMock";
import { EASE } from "./adminMock";

/* عدّاد تصاعدي */
function useCountUp(target: number, delay = 0, duration = 1000): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.min(Math.max((now - start) / duration, 0), 1);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, delay, duration]);
  return value;
}

const sparkConfig = { v: { label: "", color: "var(--primary)" } } satisfies ChartConfig;

function Sparkline({ data, index }: { data: number[]; index: number }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ChartContainer config={sparkConfig} className="!aspect-auto h-10 w-24">
      <AreaChart data={points} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <defs>
          <linearGradient id={`spark-${index}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke="var(--primary)"
          strokeWidth={1.8}
          fill={`url(#spark-${index})`}
          isAnimationActive
          animationDuration={1200}
        />
      </AreaChart>
    </ChartContainer>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  danger,
  spark,
  index,
}: {
  icon: typeof BookOpen;
  label: string;
  value: number;
  delta: string;
  danger?: boolean;
  spark: number[];
  index: number;
}) {
  const display = useCountUp(value, index * 100);
  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE, delay: index * 0.1 }}
      className="glass flex items-center gap-4 !rounded-2xl p-4"
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
          danger ? "bg-warning/15 text-warning" : "bg-primary-soft/15 text-primary"
        }`}
      >
        <Icon size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-2xl font-bold tabular-nums text-app">
          {formatNum(display)}
        </div>
        <div className="truncate text-xs text-app-3">{label}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={`glass-chip !px-2 !py-0.5 !text-[11px] font-semibold ${
            danger ? "!border-danger/40 text-danger" : "!border-accent-2/40 text-accent-2"
          }`}
        >
          <TrendingUp size={11} />
          {delta}
        </span>
        <Sparkline data={spark} index={index} />
      </div>
    </motion.div>
  );
}

const areaConfig = {
  chapters: { label: "الفصول المضافة", color: "var(--primary)" },
} satisfies ChartConfig;

const donutConfig = Object.fromEntries(
  sourceDistribution.map((s) => [s.name, { label: s.name, color: s.fill }]),
) satisfies ChartConfig;

const feedIcons: Record<ActivityEvent["icon"], typeof RefreshCw> = {
  scan: RefreshCw,
  user: UserPlus,
  request: Inbox,
  merge: GitMerge,
  add: PlusCircle,
};

const livePool: Omit<ActivityEvent, "id" | "time">[] = [
  { icon: "scan", text: "فحص مصدر azorafly: ‎+7 فصول جديدة" },
  { icon: "user", text: "مستخدم جديد: قارئ جديد انضم للتو" },
  { icon: "scan", text: "فحص مصدر 3asq: ‎+3 فصول جديدة" },
  { icon: "request", text: "طلب جديد وصل للتو" },
];

export default function AdminDashboard() {
  const { t } = useLanguage();
  const statsQuery = trpc.admin.stats.useQuery(undefined, { retry: false });
  // TODO: فصول اليوم والمستخدمون النشطون لا تدعمهما الـ API بعد — قيم mock
  const series = statsQuery.data?.manga ?? mockStats.series;
  const usersCount = statsQuery.data?.users ?? mockStats.activeUsers;
  const pending = statsQuery.data?.pendingRequests ?? mockStats.pendingRequests;
  const chaptersToday = mockStats.chaptersToday;

  const [feed, setFeed] = useState<ActivityEvent[]>(mockActivity);
  const liveIdx = useRef(0);

  // أحداث مباشرة محاكاة كل 12 ثانية
  useEffect(() => {
    const id = window.setInterval(() => {
      const ev = livePool[liveIdx.current % livePool.length];
      liveIdx.current += 1;
      setFeed((prev) => [
        { ...ev, id: Date.now(), time: "الآن" },
        ...prev.slice(0, 11),
      ]);
    }, 12000);
    return () => window.clearInterval(id);
  }, []);

  const donutTotal = useMemo(
    () => sourceDistribution.reduce((s, x) => s + x.value, 0),
    [],
  );

  const kpis = [
    { icon: BookOpen, label: t("إجمالي السلاسل", "Total series"), value: series, delta: "+4.2%" },
    { icon: Layers, label: t("فصول اليوم", "Chapters today"), value: chaptersToday, delta: "+8.1%" },
    { icon: Users, label: t("مستخدمون نشطون", "Active users"), value: usersCount, delta: "+2.6%" },
    { icon: Inbox, label: t("طلبات معلّقة", "Pending requests"), value: pending, delta: "+3", danger: true },
  ];

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} {...k} spark={kpiSparklines[i]} index={i} />
        ))}
      </div>

      {/* الرسوم */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.3 }}
          className="glass !rounded-2xl p-5 xl:col-span-3"
        >
          <h3 className="font-display text-sm font-bold text-app">
            {t("الفصول المضافة — 30 يوم", "Chapters added — 30 days")}
          </h3>
          <ChartContainer config={areaConfig} className="mt-4 !aspect-auto h-64 w-full">
            <AreaChart data={chaptersSeries30d} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
              <defs>
                <linearGradient id="chapters-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
                interval={5}
                reversed
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={36} orientation="right" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="chapters"
                stroke="var(--primary)"
                strokeWidth={2.2}
                fill="url(#chapters-fill)"
                animationDuration={1000}
              />
            </AreaChart>
          </ChartContainer>
        </motion.div>

        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.4 }}
          className="glass !rounded-2xl p-5 xl:col-span-2"
        >
          <h3 className="font-display text-sm font-bold text-app">
            {t("التوزيع حسب المصدر", "By source")}
          </h3>
          <div className="relative mt-2">
            <ChartContainer config={donutConfig} className="!aspect-auto mx-auto h-52 w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie
                  data={sourceDistribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={88}
                  paddingAngle={3}
                  cornerRadius={6}
                  animationDuration={800}
                >
                  {sourceDistribution.map((s) => (
                    <Cell key={s.name} fill={s.fill} stroke="transparent" />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-xl font-bold tabular-nums text-app">
                {formatNum(donutTotal)}
              </span>
              <span className="text-[11px] text-app-3">{t("سلسلة", "series")}</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {sourceDistribution.map((s) => (
              <span key={s.name} className="glass-chip !px-2.5 !py-1 !text-[11px]" dir="ltr">
                <span className="h-2 w-2 rounded-full" style={{ background: s.fill }} />
                {s.name}
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* سجل النشاط */}
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.5 }}
        className="glass !rounded-2xl p-5"
      >
        <div className="mb-4 flex items-center gap-3">
          <h3 className="font-display text-sm font-bold text-app">
            {t("آخر النشاطات", "Recent activity")}
          </h3>
          <span className="glass-chip !px-2.5 !py-0.5 !text-[11px] font-semibold text-success">
            <span className="animate-pulse-soft h-2 w-2 rounded-full bg-success" />
            {t("مباشر", "Live")}
          </span>
        </div>
        <ul className="space-y-1.5">
          {feed.slice(0, 10).map((ev, i) => {
            const Icon = feedIcons[ev.icon];
            return (
              <motion.li
                key={ev.id}
                layout="position"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE, delay: i < 10 ? i * 0.04 : 0 }}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-primary-soft/10"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft/15 text-primary">
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-app-2">{ev.text}</span>
                <span className="shrink-0 text-xs text-app-3">{ev.time}</span>
              </motion.li>
            );
          })}
        </ul>
      </motion.div>
    </div>
  );
}
