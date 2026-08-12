import { Link } from "react-router";
import { motion } from "framer-motion";
import { Flame, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { latestChapters, popularManga } from "@/data/mock";
import type { LatestChapter, Manga } from "@/data/mock";
import { useLanguage } from "@/components/LanguageProvider";
import type { LatestChapterItem } from "./constants";
import { adaptPopularItem, timeAgo } from "./constants";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

function adaptLatest(item: LatestChapterItem): LatestChapter {
  const published = item.publishedAt ? new Date(item.publishedAt) : new Date();
  return {
    id: Number(item.id),
    mangaSlug: item.manga.slug,
    mangaTitle: item.manga.title,
    cover: item.manga.coverUrl || "/cover-01.png",
    chapter: item.number,
    timeAgo: timeAgo(published),
    source: "kawaiimanga", // TODO(backend): latest لا يعيد اسم المصدر
    isNew: Date.now() - published.getTime() < 24 * 3600 * 1000,
  };
}

function useTrending(): { trending: Manga[]; fresh: LatestChapter[] } {
  const popularQuery = trpc.manga.popular.useQuery({ limit: 10 }, { retry: 1 });
  const latestQuery = trpc.manga.latest.useQuery({ limit: 5 }, { retry: 1 });

  const trending =
    popularQuery.data && popularQuery.data.length > 0
      ? popularQuery.data.map(adaptPopularItem)
      : popularManga; // TODO: fallback مؤقت على mock عند غياب بيانات API
  const fresh =
    latestQuery.data && latestQuery.data.length > 0
      ? latestQuery.data.map(adaptLatest)
      : latestChapters.slice(0, 5); // TODO: fallback مؤقت
  return { trending, fresh };
}

/** سهم اتجاه الرائج — اتجاه حتمي مشتق من الترتيب */
function TrendArrow({ rank }: { rank: number }) {
  const up = rank % 3 !== 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <motion.span
      animate={{ y: [0, -3, 0] }}
      transition={{ duration: 2.4, repeat: Infinity, delay: rank * 0.2, ease: "easeInOut" }}
      className={up ? "text-accent-2" : "text-danger"}
    >
      <Icon size={15} />
    </motion.span>
  );
}

function RankRow({ manga, rank }: { manga: Manga; rank: number }) {
  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      whileInView={{ x: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, ease: EASE, delay: rank * 0.05 }}
    >
      <Link
        to={`/manga/${manga.slug}`}
        className="group flex items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-[rgba(167,139,250,0.12)]"
      >
        <span
          className={`font-display w-5 shrink-0 text-center text-sm font-extrabold ${
            rank <= 3 ? "gradient-text" : "text-app-3"
          }`}
        >
          {rank}
        </span>
        <img
          src={manga.cover}
          alt={manga.title}
          loading="lazy"
          className="h-[60px] w-10 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-[13px] font-bold text-app transition-colors group-hover:text-primary">
            {manga.title}
          </h4>
          <p className="mt-0.5 text-[11px] text-app-3">
            {manga.views} · ★ {manga.rating.toFixed(1)}
          </p>
        </div>
        <TrendArrow rank={rank} />
      </Link>
    </motion.div>
  );
}

function FreshRow({ item }: { item: LatestChapter }) {
  const { t } = useLanguage();
  return (
    <Link
      to={`/manga/${item.mangaSlug}/chapter/${item.chapter}`}
      className="group flex items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-[rgba(167,139,250,0.12)]"
    >
      <img
        src={item.cover}
        alt={item.mangaTitle}
        loading="lazy"
        className="h-[60px] w-10 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-[13px] font-bold text-app transition-colors group-hover:text-primary">
          {item.mangaTitle}
        </h4>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="glass-chip !border-0 !px-2 !py-0 !text-[10.5px] font-semibold text-primary">
            {t("فصل", "Ch.")} {item.chapter}
          </span>
          {item.isNew && (
            <span className="rounded-full bg-accent-2 px-1.5 text-[9.5px] font-bold text-white">
              {t("جديد", "NEW")}
            </span>
          )}
        </div>
      </div>
      <span className="shrink-0 text-[10.5px] text-app-3">{item.timeAgo}</span>
    </Link>
  );
}

/** قائمة الفصول الطازجة — مشتركة بين السايدبار وشريط الموبايل */
function FreshList({ items }: { items: LatestChapter[] }) {
  const { t } = useLanguage();
  return (
    <>
      <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
        <Sparkles size={15} className="text-accent-2" />
        {t("فصول صدرت للتو", "Just released")}
      </h3>
      <div className="flex flex-col gap-1">
        {items.map((c) => (
          <FreshRow key={c.id} item={c} />
        ))}
      </div>
    </>
  );
}

/** سايدبار الرائج — سطح المكتب فقط (lg+) */
export function TrendingSidebar() {
  const { t } = useLanguage();
  const { trending, fresh } = useTrending();

  return (
    <motion.aside
      initial={{ x: -30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
      className="sticky top-24 hidden w-72 shrink-0 flex-col gap-4 self-start lg:flex xl:w-80"
    >
      <div className="glass !rounded-3xl p-4">
        <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
          <Flame size={15} className="text-accent" />
          {t("الأكثر بحثاً اليوم", "Most searched today")}
        </h3>
        <div className="flex flex-col gap-1">
          {trending.slice(0, 10).map((m, i) => (
            <RankRow key={m.id} manga={m} rank={i + 1} />
          ))}
        </div>
      </div>
      <div className="glass !rounded-3xl p-4">
        <FreshList items={fresh} />
      </div>
    </motion.aside>
  );
}

/** شريط الرائج الأفقي — موبايل فقط، قابل للتمرير */
export function TrendingRail() {
  const { t } = useLanguage();
  const { trending } = useTrending();

  return (
    <div className="mb-5 lg:hidden">
      <h3 className="font-display mb-2.5 flex items-center gap-2 text-sm font-bold text-app">
        <Flame size={15} className="text-accent" />
        {t("الرائج الآن", "Trending now")}
      </h3>
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {trending.slice(0, 10).map((m, i) => (
          <Link
            key={m.id}
            to={`/manga/${m.slug}`}
            className="glass flex w-40 shrink-0 items-center gap-2 !rounded-2xl p-2"
          >
            <span
              className={`font-display text-base font-extrabold ${i < 3 ? "gradient-text" : "text-app-3"}`}
            >
              {i + 1}
            </span>
            <img
              src={m.cover}
              alt={m.title}
              loading="lazy"
              className="h-14 w-10 shrink-0 rounded-lg object-cover"
            />
            <span className="min-w-0 flex-1 truncate text-xs font-bold text-app">{m.title}</span>
            <TrendArrow rank={i + 1} />
          </Link>
        ))}
      </div>
    </div>
  );
}
