/**
 * «نزل اليوم» — فصول آخر 24 ساعة (يعود لأحدث الفصول عند فراغ اليوم).
 */
import { useMemo } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { CalendarClock, ChevronLeft } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useLanguage } from "@/components/LanguageProvider";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { fmtChapter } from "@/components/manga/types";
import { timeAgo } from "@/lib/manga";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const DAY_MS = 24 * 60 * 60 * 1000;

export default function Today() {
  const { t, lang } = useLanguage();
  const latestQ = trpc.manga.latest.useQuery({ limit: 50 }, { retry: false });

  const { todayItems, fallback } = useMemo(() => {
    const items = latestQ.data ?? [];
    const cutoff = Date.now() - DAY_MS;
    const fresh = items.filter((c) =>
      new Date(c.publishedAt ?? c.createdAt).getTime() >= cutoff,
    );
    // لو لا شيء خلال 24 ساعة نعرض الأحدث كقسم احتياطي
    return fresh.length
      ? { todayItems: fresh, fallback: false }
      : { todayItems: items.slice(0, 20), fallback: true };
  }, [latestQ.data]);

  return (
    <div className="relative mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
      {/* ambient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="animate-blob-a absolute -top-20 start-10 h-64 w-64 rounded-full bg-primary-soft/25 blur-3xl" />
        <div className="animate-blob-b absolute top-2/3 end-0 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative flex flex-col gap-5"
      >
        <div className="flex items-center gap-3">
          <span className="gradient-primary flex h-11 w-11 items-center justify-center rounded-2xl text-white">
            <CalendarClock size={19} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-extrabold text-app md:text-3xl">
              {t("نزل اليوم", "Released today")}
            </h1>
            <p className="text-xs text-app-3">
              {fallback
                ? t("لا جديد خلال ٢٤ ساعة — هذه أحدث الفصول", "Nothing in 24h — these are the latest chapters")
                : t("فصول آخر ٢٤ ساعة", "Chapters from the last 24 hours")}
            </p>
          </div>
        </div>

        {latestQ.isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-16 !rounded-2xl" />
            ))}
          </div>
        ) : latestQ.isError ? (
          <div className="glass">
            <ErrorState onRetry={() => latestQ.refetch()} retrying={latestQ.isRefetching} />
          </div>
        ) : todayItems.length === 0 ? (
          <EmptyState
            title={t("لا فصول بعد", "No chapters yet")}
            caption={t("تابع أعمالك لتصلك أحدث الفصول هنا.", "Follow titles to see their latest chapters here.")}
            ctaLabel={t("تصفّح الأعمال", "Browse works")}
            ctaTo="/browse"
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {todayItems.map((c, i) => (
              <motion.li
                key={c.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE, delay: Math.min(i * 0.04, 0.4) }}
              >
                <Link
                  to={`/manga/${c.manga.slug}/chapter/${fmtChapter(c.number)}`}
                  className="glass group flex items-center gap-3 !rounded-2xl p-2.5 transition-colors hover:border-primary/50"
                >
                  {c.manga.coverUrl ? (
                    <img
                      src={c.manga.coverUrl}
                      alt=""
                      className="h-14 w-10 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft/15 text-primary">
                      <CalendarClock size={16} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-app">
                      {c.manga.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-app-3">
                      {t("فصل", "Ch.")} {fmtChapter(c.number)}
                      {c.title ? ` — ${c.title}` : ""} ·{" "}
                      {timeAgo(new Date(c.publishedAt ?? c.createdAt), lang)}
                    </span>
                  </span>
                  <ChevronLeft
                    size={16}
                    className="shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100 rtl:-scale-x-100"
                  />
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </motion.div>
    </div>
  );
}
