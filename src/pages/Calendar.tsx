/**
 * «تقويم الإصدارات» — فصول آخر N يوم مجمّعة باليوم + فيد المانجا المتابَعة.
 */
import { useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { Bell, CalendarDays, ChevronLeft } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { fmtChapter } from "@/components/manga/types";
import { proxyImg, timeAgo } from "@/lib/manga";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

type CalItem = {
  mangaId: number;
  slug: string;
  title: string;
  coverUrl: string | null;
  chapterId: number;
  number: number;
  publishedAt: string | Date;
  sourceName: string;
};

function DayCard({ item, lang, t }: { item: CalItem; lang: string; t: (a: string, b: string) => string }) {
  return (
    <Link
      to={`/manga/${item.slug}/chapter/${fmtChapter(item.number)}`}
      className="glass group flex w-44 shrink-0 snap-start flex-col gap-2 !rounded-2xl p-2.5 transition-colors hover:border-primary/50"
    >
      {item.coverUrl ? (
        <img
          src={proxyImg(item.coverUrl)}
          alt=""
          loading="lazy"
          className="h-36 w-full rounded-xl object-cover"
        />
      ) : (
        <span className="flex h-36 w-full items-center justify-center rounded-xl bg-primary-soft/15 text-primary">
          <CalendarDays size={20} />
        </span>
      )}
      <span className="line-clamp-1 text-xs font-bold text-app">{item.title}</span>
      <span className="flex items-center justify-between text-[11px] text-app-3">
        <span className="glass-chip !px-2 !py-0.5 text-[10px] font-bold text-primary">
          {t("فصل", "Ch.")} {fmtChapter(item.number)}
        </span>
        <span>{timeAgo(new Date(item.publishedAt), lang)}</span>
      </span>
    </Link>
  );
}

export default function Calendar() {
  const { t, lang } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [days, setDays] = useState(7);
  const [libraryOnly, setLibraryOnly] = useState(false);

  const calendarQ = trpc.rec.calendar.useQuery(
    { days, libraryOnly: isAuthenticated && libraryOnly },
    { retry: false },
  );
  const followingQ = trpc.rec.following.useQuery(
    { limit: 10 },
    { enabled: isAuthenticated, retry: false },
  );

  const dayGroups = calendarQ.data?.days ?? [];
  const following = followingQ.data?.items ?? [];

  return (
    <div className="relative mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-14">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative flex flex-col gap-6"
      >
        {/* الترويسة */}
        <div className="flex items-center gap-3">
          <span className="gradient-primary flex h-11 w-11 items-center justify-center rounded-2xl text-white">
            <CalendarDays size={19} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-extrabold text-app md:text-3xl">
              {t("تقويم الإصدارات", "Release Calendar")}
            </h1>
            <p className="text-xs text-app-3">
              {t("فصول آخر أيام مجمّعة باليوم", "Recent chapters grouped by day")}
            </p>
          </div>
        </div>

        {/* الفلاتر */}
        <div className="flex flex-wrap items-center gap-2">
          {[3, 7, 14].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`glass-chip text-xs font-bold transition-colors ${
                days === d ? "bg-primary/15 text-primary" : "text-app-3 hover:text-app-2"
              }`}
            >
              {t(`${d} أيام`, `${d} days`)}
            </button>
          ))}
          {isAuthenticated && (
            <button
              onClick={() => setLibraryOnly((v) => !v)}
              className={`glass-chip text-xs font-bold transition-colors ${
                libraryOnly ? "bg-primary/15 text-primary" : "text-app-3 hover:text-app-2"
              }`}
            >
              {t("مكتبتي فقط", "My library only")}
            </button>
          )}
        </div>

        {/* مانجا أتابعها */}
        {isAuthenticated && following.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-app">
              <Bell size={15} className="text-primary" />
              {t("مانجا أتابعها", "Following")}
            </h2>
            <div className="flex snap-x gap-3 overflow-x-auto pb-2">
              {following.map((it) => (
                <DayCard key={`fol-${it.chapterId}`} item={it as CalItem} lang={lang} t={t} />
              ))}
            </div>
          </section>
        )}

        {/* الأيام */}
        {calendarQ.isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-32 !rounded-2xl" />
            ))}
          </div>
        ) : calendarQ.isError ? (
          <div className="glass">
            <ErrorState onRetry={() => calendarQ.refetch()} retrying={calendarQ.isRefetching} />
          </div>
        ) : dayGroups.length === 0 ? (
          <EmptyState
            title={t("لا فصول في هذه الفترة", "No chapters in this range")}
            caption={t("وسّع المدة أو ألغِ فلتر المكتبة.", "Widen the range or disable the library filter.")}
            ctaLabel={t("تصفّح الأعمال", "Browse works")}
            ctaTo="/browse"
          />
        ) : (
          dayGroups.map((g, gi) => (
            <motion.section
              key={g.date}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: Math.min(gi * 0.05, 0.3) }}
              className="flex flex-col gap-3"
            >
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-app">
                  {new Date(`${g.date}T00:00:00Z`).toLocaleDateString(
                    lang === "ar" ? "ar-EG" : "en-US",
                    { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" },
                  )}
                </h2>
                <span className="glass-chip !px-2 !py-0.5 text-[10px] font-bold text-app-3 tabular-nums">
                  {g.items.length}
                </span>
                <ChevronLeft size={14} className="text-app-3 rtl:-scale-x-100" />
              </div>
              <div className="flex snap-x gap-3 overflow-x-auto pb-2">
                {g.items.map((it) => (
                  <DayCard key={it.chapterId} item={it as CalItem} lang={lang} t={t} />
                ))}
              </div>
            </motion.section>
          ))
        )}
      </motion.div>
    </div>
  );
}
