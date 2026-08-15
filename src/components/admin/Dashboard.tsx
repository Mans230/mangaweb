import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Cell, Pie, PieChart } from "recharts";
import { BookOpen, Inbox, Layers, Users } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { formatNum } from "@/lib/manga";
import { EASE } from "./adminUtils";

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

function KpiCard({
  icon: Icon,
  label,
  value,
  danger,
  index,
}: {
  icon: typeof BookOpen;
  label: string;
  value: number;
  danger?: boolean;
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
    </motion.div>
  );
}

const DONUT_COLORS = [
  "#E0561F",
  "#EA6A38",
  "#8A7F68",
  "#D9A441",
  "#7FA6A3",
  "#B0563A",
  "#8A7F68",
  "#A8552F",
];

export default function AdminDashboard() {
  const { t } = useLanguage();
  const statsQuery = trpc.admin.stats.useQuery(undefined, { retry: false });
  const sourcesQuery = trpc.admin.listSources.useQuery(undefined, { retry: false });

  /* توزيع السلاسل حسب المصدر — بيانات حقيقية من listSources */
  const sourceSlices = useMemo(
    () =>
      (sourcesQuery.data ?? [])
        .filter((s) => s.mangaCount > 0)
        .map((s, i) => ({
          name: s.name,
          value: s.mangaCount,
          fill: DONUT_COLORS[i % DONUT_COLORS.length],
        })),
    [sourcesQuery.data],
  );

  const donutConfig = useMemo(
    () =>
      Object.fromEntries(
        sourceSlices.map((s) => [s.name, { label: s.name, color: s.fill }]),
      ) satisfies ChartConfig,
    [sourceSlices],
  );

  const donutTotal = useMemo(
    () => sourceSlices.reduce((sum, x) => sum + x.value, 0),
    [sourceSlices],
  );

  if (statsQuery.isLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
        <div className="skeleton h-72" />
      </div>
    );
  }

  if (statsQuery.isError || !statsQuery.data) {
    return (
      <div className="glass">
        <ErrorState onRetry={() => statsQuery.refetch()} retrying={statsQuery.isRefetching} />
      </div>
    );
  }

  const stats = statsQuery.data;
  const kpis = [
    { icon: BookOpen, label: t("إجمالي السلاسل", "Total series"), value: stats.manga },
    { icon: Layers, label: t("إجمالي الفصول", "Total chapters"), value: stats.chapters },
    { icon: Users, label: t("المستخدمون", "Users"), value: stats.users },
    { icon: Inbox, label: t("طلبات معلّقة", "Pending requests"), value: stats.pendingRequests, danger: true },
  ];

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} {...k} index={i} />
        ))}
      </div>

      {/* التوزيع حسب المصدر */}
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.3 }}
        className="glass !rounded-2xl p-5"
      >
        <h3 className="font-display text-sm font-bold text-app">
          {t("التوزيع حسب المصدر", "By source")}
        </h3>
        {sourcesQuery.isLoading ? (
          <div className="skeleton mx-auto mt-4 h-52 w-52 !rounded-full" />
        ) : sourceSlices.length === 0 ? (
          <p className="py-10 text-center text-sm text-app-3">
            {t("لا توجد مصادر بسلاسل بعد", "No sources with series yet")}
          </p>
        ) : (
          <>
            <div className="relative mt-2">
              <ChartContainer config={donutConfig} className="!aspect-auto mx-auto h-56 w-full max-w-md">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={sourceSlices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={66}
                    outerRadius={94}
                    paddingAngle={3}
                    cornerRadius={6}
                    animationDuration={800}
                  >
                    {sourceSlices.map((s) => (
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
              {sourceSlices.map((s) => (
                <span key={s.name} className="glass-chip !px-2.5 !py-1 !text-[11px]" dir="ltr">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.fill }} />
                  {s.name}
                </span>
              ))}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
