import { useEffect, useRef } from "react";
import { proxyImg } from "@/lib/manga";
import { animate, motion, useInView } from "framer-motion";
import { Heart, Bell, History } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface LibraryHeaderProps {
  name: string;
  avatar: string;
  total: number;
  favCount: number;
  followCount: number;
  historyCount: number;
  catchUpPct: number; // 0..100 نسبة اللحاق بالفصول الجديدة
}

function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const controls = animate(0, value, {
      duration: 1.2,
      ease: EASE,
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = Math.round(v).toLocaleString("ar");
      },
    });
    return () => controls.stop();
  }, [inView, value]);
  return <span ref={ref}>0</span>;
}

export default function LibraryHeader({
  name,
  avatar,
  total,
  favCount,
  followCount,
  historyCount,
  catchUpPct,
}: LibraryHeaderProps) {
  const { t } = useLanguage();
  const R = 34;
  const CIRC = 2 * Math.PI * R;

  const chips = [
    { icon: Heart, count: favCount, label: t("مفضلة", "Favorites") },
    { icon: Bell, count: followCount, label: t("متابعة", "Following") },
    { icon: History, count: historyCount, label: t("في السجل", "In history") },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="glass gradient-hero-bg relative overflow-hidden p-4 md:p-6"
    >
      <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-start">
        {/* avatar + gradient ring showing catch-up % */}
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 80 80" className="absolute inset-0 h-full w-full -rotate-90">
            <defs>
              <linearGradient id="lib-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#E0561F" />
                <stop offset="55%" stopColor="#EA6A38" />
                <stop offset="100%" stopColor="#D9A441" />
              </linearGradient>
            </defs>
            <circle cx="40" cy="40" r={R} fill="none" stroke="var(--border)" strokeWidth="4" />
            <motion.circle
              cx="40"
              cy="40"
              r={R}
              fill="none"
              stroke="url(#lib-ring)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              initial={{ strokeDashoffset: CIRC }}
              animate={{ strokeDashoffset: CIRC * (1 - Math.min(100, Math.max(0, catchUpPct)) / 100) }}
              transition={{ duration: 1, ease: EASE, delay: 0.3 }}
            />
          </svg>
          <img
            src={proxyImg(avatar)}
            alt={name}
            className="absolute inset-2 h-20 w-20 rounded-full border-2 border-app object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-2xl font-bold text-app md:text-3xl">
            {t("مكتبة", "Library of")} {name}
          </h1>
          <p className="mt-1 text-sm text-app-3">
            {t("نسبة اللحاق بالفصول الجديدة", "New-chapter catch-up rate")}{" "}
            <span className="font-bold text-primary">{Math.round(catchUpPct)}%</span>
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            {chips.map((chip, i) => (
              <motion.span
                key={chip.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: 0.35 + i * 0.08 }}
                className="glass-chip !py-1.5 text-xs font-semibold"
              >
                <chip.icon size={13} className="text-primary" />
                {chip.count.toLocaleString("ar")} {chip.label}
              </motion.span>
            ))}
          </div>
        </div>

        <div className="shrink-0 text-center">
          <div className="font-display gradient-text text-5xl font-extrabold leading-none md:text-6xl">
            <CountUp value={total} />
          </div>
          <div className="mt-2 text-xs font-medium text-app-3">
            {t("مانجا في مكتبتك", "Titles in your library")}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
