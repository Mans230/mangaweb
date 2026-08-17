import { useMemo } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { useRef } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/components/LanguageProvider";
import { proxyImg, timeAgo } from "@/lib/manga";
import { loadAllProgress } from "@/components/reader/store";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/** مدخل موحّد لبطاقة "تابع القراءة" — من السيرفر أو من التخزين المحلي */
interface ContinueEntry {
  slug: string;
  title: string;
  cover: string;
  chapter: number;
  /** 0..1 */
  ratio: number;
  ts: number;
}

interface Props {
  lang?: "ar" | "en";
  limit?: number;
  title?: string;
}

/**
 * قسم "تابع القراءة" — يدمج تقدم السيرفر (library.getLibrary history للمسجّل،
 * عبر الأجهزة) مع التقدم المحلي (localStorage للزائرين/أوفلاين). عند التعارض
 * على نفس الـ slug يفوز السيرفر. يُخفى القسم كلياً عندما لا توجد بيانات.
 */
export default function ContinueReading({ lang, limit = 10, title }: Props) {
  const { t, lang: ctxLang } = useLanguage();
  const effectiveLang = lang ?? ctxLang;
  const isEn = effectiveLang === "en";
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const trackRef = useRef<HTMLDivElement>(null);

  const libraryQ = trpc.library.getLibrary.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    staleTime: 30_000,
  });

  const entries = useMemo<ContinueEntry[]>(() => {
    const bySlug = new Map<string, ContinueEntry>();

    // 1) المحلي أولاً — إدخالات قديمة بلا title/cover تُستبعد (لا يمكن عرضها)
    const local = loadAllProgress();
    for (const [slug, p] of Object.entries(local)) {
      if (!p.title || !p.cover) continue;
      bySlug.set(slug, {
        slug,
        title: p.title,
        cover: p.cover,
        chapter: p.chapter,
        ratio: Math.min(1, Math.max(0, p.ratio)),
        ts: p.ts,
      });
    }

    // 2) السيرفر يفوز عند التعارض
    const history = libraryQ.data?.history ?? [];
    for (const h of history) {
      const slug = h.manga.slug;
      const pageCount = h.chapter.pageCount ?? 0;
      const ratio = pageCount > 0 ? Math.min(1, Math.max(0, h.lastPage / pageCount)) : 0;
      bySlug.set(slug, {
        slug,
        title: h.manga.title,
        cover: proxyImg(h.manga.coverUrl) || "/placeholder-cover.svg",
        chapter: Math.floor(h.chapter.number),
        ratio,
        ts: new Date(h.updatedAt).getTime(),
      });
    }

    return [...bySlug.values()].sort((a, b) => b.ts - a.ts).slice(0, limit);
  }, [libraryQ.data, limit]);

  const scroll = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    // RTL: الاتجاه المرئي معكوس
    el.scrollBy({ left: dir * (isEn ? 1 : -1) * el.clientWidth * 0.7, behavior: "smooth" });
  };

  const heading = title ?? t("تابع القراءة", "Continue Reading");
  const loading = authLoading || (isAuthenticated && libraryQ.isLoading && entries.length === 0);

  if (loading) {
    return (
      <section
        className="mx-auto max-w-6xl px-4 py-14 md:px-6"
        dir={isEn ? "ltr" : undefined}
        lang={isEn ? "en" : undefined}
      >
        <div className="mb-6"><div className="skeleton h-8 w-44 !rounded" /></div>
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="w-[70vw] shrink-0 sm:w-[46vw] md:w-[calc((100%-3*16px)/4)]">
              <div className="skeleton h-36 !rounded" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (entries.length === 0) return null;

  return (
    <section
      className="mx-auto max-w-6xl px-4 py-14 md:px-6"
      dir={isEn ? "ltr" : undefined}
      lang={isEn ? "en" : undefined}
    >
      <div className="ed-sec-head">
        <h2>{heading}</h2>
        <div className="ed-rule" />
        <span className="ed-count">
          {String(entries.length).padStart(2, "0")}
        </span>
        <div className="hidden gap-2 md:flex">
          <button onClick={() => scroll(1)} className="ed-arrow" aria-label="next">
            <ChevronRight size={17} className={isEn ? "" : "rtl:-scale-x-100"} />
          </button>
          <button onClick={() => scroll(-1)} className="ed-arrow" aria-label="prev">
            <ChevronLeft size={17} className={isEn ? "" : "rtl:-scale-x-100"} />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {entries.map((e, i) => {
          const pct = Math.round(e.ratio * 100);
          return (
            <motion.div
              key={e.slug}
              initial={{ y: 24, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.45, ease: EASE, delay: i * 0.05 }}
              className="w-[70vw] shrink-0 snap-start sm:w-[46vw] md:w-[calc((100%-3*16px)/4)]"
            >
              <Link
                to={`/manga/${e.slug}/chapter/${e.chapter}`}
                className="ed-card group flex h-full gap-3.5 p-3.5"
                aria-label={`${e.title} — ${isEn ? `Chapter ${e.chapter}` : `الفصل ${e.chapter}`}`}
              >
                {/* الغلاف */}
                <span className="block w-20 shrink-0 self-start overflow-hidden rounded-[3px] border border-[var(--ed-line)] bg-[var(--ed-bg2)]">
                  <img
                    src={e.cover}
                    alt={e.title}
                    loading="lazy"
                    decoding="async"
                    className="h-28 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </span>

                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-display text-[14.5px] font-bold text-[var(--ed-ink)] transition-colors group-hover:text-[var(--ed-accent)]">
                    {e.title}
                  </span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="ed-tag shrink-0">
                      {isEn ? `Chapter ${e.chapter}` : `${t("الفصل", "Chapter")} ${e.chapter}`}
                    </span>
                    <span className="flex items-center gap-1 text-[10.5px] text-[var(--ed-ink3)]">
                      <History size={11} />
                      {timeAgo(e.ts, isEn ? "en" : "ar")}
                    </span>
                  </span>

                  {/* شريط التقدم */}
                  <span className="mt-auto pt-3">
                    <span className="flex items-center justify-between text-[10.5px] font-semibold text-[var(--ed-ink3)]">
                      <span>{isEn ? "Progress" : t("التقدم", "Progress")}</span>
                      <span className="font-ednum tabular-nums" dir="ltr">{pct}%</span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--ed-bg2)]">
                      <span
                        className="gradient-primary block h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </span>
                </span>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
