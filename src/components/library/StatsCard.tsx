import { useMemo } from "react";
import { motion } from "framer-motion";
import { BookOpen, Clock, Flame } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type { HistoryItem } from "./data";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface StatsCardProps {
  history: HistoryItem[];
}

/** بطاقة إحصائيات القراءة: فصول مقروءة + ساعات + سلسلة يومية + رسم 7 أيام. */
export default function StatsCard({ history }: StatsCardProps) {
  const { t } = useLanguage();

  const stats = useMemo(() => {
    const chaptersRead = history.length;
    const hours = Math.round((chaptersRead * 8) / 60); // ~8 دقائق لكل فصل

    // أطول سلسلة يومية متتالية
    const days = new Set(
      history.map((h) => new Date(h.date.getFullYear(), h.date.getMonth(), h.date.getDate()).getTime()),
    );
    let streak = 0;
    let best = 0;
    const sorted = [...days].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      streak = i > 0 && sorted[i] - sorted[i - 1] === 86400000 ? streak + 1 : 1;
      best = Math.max(best, streak);
    }

    // فصول كل يوم من آخر 7 أيام
    const perDay: { label: string; count: number }[] = [];
    for (let d = 6; d >= 0; d--) {
      const day = new Date();
      day.setDate(day.getDate() - d);
      const key = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
      const count = history.filter(
        (h) => new Date(h.date.getFullYear(), h.date.getMonth(), h.date.getDate()).getTime() === key,
      ).length;
      perDay.push({
        label: day.toLocaleDateString("ar", { weekday: "narrow" }),
        count,
      });
    }

    return { chaptersRead, hours, best, perDay };
  }, [history]);

  const maxDay = Math.max(1, ...stats.perDay.map((d) => d.count));

  const tiles = [
    { icon: BookOpen, value: stats.chaptersRead.toLocaleString("ar"), label: t("فصول مقروءة", "Chapters read") },
    { icon: Clock, value: stats.hours.toLocaleString("ar"), label: t("ساعات قراءة", "Reading hours") },
    { icon: Flame, value: `${stats.best.toLocaleString("ar")} ${t("يوم", "days")}`, label: t("أطول سلسلة يومية", "Longest daily streak") },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="glass p-6 md:p-8"
    >
      <h3 className="font-display mb-5 text-base font-bold text-app">
        {t("إحصائيات القراءة", "Reading stats")}
      </h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
        {tiles.map((tile, i) => (
          <motion.div
            key={tile.label}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, ease: EASE, delay: i * 0.08 }}
            className="glass !rounded-2xl p-4 text-center"
          >
            <span className="gradient-primary mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md">
              <tile.icon size={18} />
            </span>
            <div className="font-display text-2xl font-extrabold text-app">{tile.value}</div>
            <div className="mt-0.5 text-[11.5px] text-app-3">{tile.label}</div>
          </motion.div>
        ))}
      </div>

      {/* mini 7-day bar chart */}
      <div className="mt-6">
        <div className="mb-2 text-[11.5px] font-medium text-app-3">
          {t("فصولك في آخر 7 أيام", "Your chapters over the last 7 days")}
        </div>
        <div className="flex h-10 items-end justify-between gap-2">
          {stats.perDay.map((day, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <motion.div
                initial={{ scaleY: 0 }}
                whileInView={{ scaleY: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease: EASE, delay: i * 0.08 }}
                style={{ height: `${Math.max(8, (day.count / maxDay) * 100)}%` }}
                className="gradient-primary w-full origin-bottom rounded-t-md opacity-80"
                title={`${day.count}`}
              />
              <span className="text-[9.5px] text-app-3">{day.label}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
