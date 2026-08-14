/**
 * مودال الترحيب لأول زيارة — 3 سلايدات زجاجية، يُحفظ علم onboarded محلياً.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Clapperboard, UsersRound, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const KEY = "onboarded";

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

export default function Onboarding() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(() => !isOnboarded());
  const [slide, setSlide] = useState(0);

  const slides = [
    {
      icon: BookOpen,
      title: t("اقرأ بلا حدود", "Read without limits"),
      desc: t(
        "آلاف فصول المانجا والمانهوا من مصادر متعددة — بقارئ سريع وأنيق.",
        "Thousands of manga & manhwa chapters from multiple sources — in a fast, elegant reader.",
      ),
    },
    {
      icon: UsersRound,
      title: t("مجتمعات حيّة", "Live communities"),
      desc: t(
        "دردش مع القرّاء، شارك نظرياتك، وانضم لمجتمعات أعمالك المفضلة.",
        "Chat with readers, share your theories, and join communities of your favorite titles.",
      ),
    },
    {
      icon: Clapperboard,
      title: t("ريلز المانجا", "Manga reels"),
      desc: t(
        "مقاطع قصيرة من مجتمع القرّاء — شاهد وانشر لحظاتك.",
        "Short clips from the reader community — watch and share your moments.",
      ),
    },
  ];

  const finish = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const current = slides[slide];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={t("مرحباً بك", "Welcome")}
        >
          <motion.div
            initial={{ scale: 0.94, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 20 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="glass-strong relative w-full max-w-sm !rounded-3xl p-6 text-center"
          >
            <button
              onClick={finish}
              className="btn-icon absolute end-3 top-3 !h-8 !w-8"
              aria-label={t("تخطي", "Skip")}
            >
              <X size={15} />
            </button>

            <AnimatePresence mode="wait">
              <motion.div
                key={slide}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="flex flex-col items-center gap-3 py-4"
              >
                <span className="gradient-primary flex h-16 w-16 items-center justify-center rounded-3xl text-white shadow-lg">
                  <current.icon size={28} />
                </span>
                <h2 className="font-display text-xl font-extrabold text-app">{current.title}</h2>
                <p className="max-w-xs text-sm leading-6 text-app-2">{current.desc}</p>
              </motion.div>
            </AnimatePresence>

            {/* نقاط التقدّم */}
            <div className="mt-2 flex items-center justify-center gap-1.5">
              {slides.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === slide ? "gradient-primary w-5" : "w-1.5 bg-app-3/40"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={() => (slide < slides.length - 1 ? setSlide((s) => s + 1) : finish())}
              className="btn-primary mt-5 w-full !py-3 text-sm"
            >
              {slide < slides.length - 1 ? t("التالي", "Next") : t("ابدأ الآن", "Get started")}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
