import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { motion } from "framer-motion";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const PLACEHOLDER_PHRASES = [
  "ابحث عن Solo Leveling…",
  "ابحث عن برج الإله…",
  "جرّب: نظام، أكشن…",
  "ابحث عن عودة الملك المدمّر…",
];

/** placeholder يكتب ويمسح نفسه بشكل متكرر */
function useTypingPlaceholder(active: boolean): string {
  const [text, setText] = useState("");
  const state = useRef({ phrase: 0, char: 0, deleting: false });

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const s = state.current;
      const full = PLACEHOLDER_PHRASES[s.phrase];
      if (!s.deleting) {
        s.char++;
        if (s.char >= full.length) {
          s.deleting = true;
          return 1600; // توقف قبل المسح
        }
        return 60;
      }
      s.char--;
      if (s.char <= 0) {
        s.deleting = false;
        s.phrase = (s.phrase + 1) % PLACEHOLDER_PHRASES.length;
        return 400;
      }
      return 28;
    };
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      const delay = tick();
      setText(PLACEHOLDER_PHRASES[state.current.phrase].slice(0, state.current.char));
      timer = setTimeout(loop, delay);
    };
    timer = setTimeout(loop, 500);
    return () => clearTimeout(timer);
  }, [active]);

  return text;
}

interface SearchHeroProps {
  q: string;
  onQueryChange: (q: string) => void;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export default function SearchHero({
  q,
  onQueryChange,
  advancedOpen,
  onToggleAdvanced,
  inputRef,
}: SearchHeroProps) {
  const { t } = useLanguage();
  const typed = useTypingPlaceholder(q === "");

  const quickChips = [
    { ar: "رينكانايشن", en: "reincarnation", query: "إعادة تجسد" },
    { ar: "نظام", en: "system", query: "نظام" },
    { ar: "murim", en: "murim", query: "موريم" },
  ];

  return (
    <section className="gradient-hero-bg relative overflow-hidden">
      {/* توهجات زخرفية خفيفة */}
      <div
        aria-hidden
        className="animate-blob-a pointer-events-none absolute -top-16 end-[8%] h-56 w-56 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(224,86,31,0.35), transparent 65%)", filter: "blur(60px)" }}
      />
      <div
        aria-hidden
        className="animate-blob-b pointer-events-none absolute -bottom-20 start-[4%] h-48 w-48 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(217,164,65,0.25), transparent 65%)", filter: "blur(60px)" }}
      />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-10 md:py-14">
        <motion.h1
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="font-display text-center text-2xl font-extrabold text-app md:text-3xl"
        >
          {t("ابحث في", "Search")}{" "}
          <span className="gradient-text">{t("مكتبة زيكو", "the zeko library")}</span>
        </motion.h1>

        {/* حقل البحث الكبير */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.15 }}
          className="group relative mt-6 w-full"
        >
          <div className="glass flex h-14 items-center gap-2 !rounded-[18px] px-4 transition-shadow focus-within:shadow-[0_0_0_2px_var(--border-glow),0_10px_32px_rgba(224,86,31,0.18)]">
            <Search size={20} className="shrink-0 text-app-3 transition-colors group-focus-within:text-primary" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={q === "" ? typed : t("ابحث…", "Search…")}
              aria-label={t("بحث", "Search")}
              className="w-full bg-transparent text-[15px] text-app outline-none placeholder:text-app-3"
            />
            {q && (
              <motion.button
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                type="button"
                onClick={() => {
                  onQueryChange("");
                  inputRef.current?.focus();
                }}
                aria-label={t("مسح البحث", "Clear search")}
                className="btn-icon !h-8 !w-8 shrink-0"
              >
                <X size={15} />
              </motion.button>
            )}
          </div>
          {/* حدود متدرجة متحركة عند التركيز */}
          <span
            aria-hidden
            className="gradient-primary pointer-events-none absolute -inset-px -z-10 rounded-[19px] opacity-0 blur-[6px] transition-opacity duration-300 group-focus-within:opacity-60"
          />
        </motion.div>

        {/* رقائق سريعة + زر البحث المتقدم */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs font-medium text-app-3">{t("شائع الآن:", "Trending:")}</span>
          {quickChips.map((chip, i) => (
            <motion.button
              key={chip.en}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: EASE, delay: 0.3 + i * 0.06 }}
              type="button"
              onClick={() => onQueryChange(chip.query)}
              className="glass-chip !px-3.5 !py-1.5 text-xs font-semibold"
            >
              {t(chip.ar, chip.en)}
            </motion.button>
          ))}
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: EASE, delay: 0.5 }}
            type="button"
            onClick={onToggleAdvanced}
            aria-expanded={advancedOpen}
            className={`glass-chip !px-3.5 !py-1.5 text-xs font-bold ${
              advancedOpen ? "!border-[var(--border-glow)] text-primary" : ""
            }`}
          >
            <SlidersHorizontal size={13} />
            {t("البحث المتقدم", "Advanced search")}
          </motion.button>
        </div>
      </div>
    </section>
  );
}
