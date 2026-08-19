import { motion, useScroll, useTransform } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface BackdropHeroProps {
  cover: string;
  /** +18: تمويه إضافي حتى تأكيد العمر */
  extraBlurred?: boolean;
}

/** 8 نقاط عائمة فوق الخلفية */
const PARTICLES = [
  { top: "18%", insetStart: "12%", size: 5, delay: 0 },
  { top: "30%", insetStart: "78%", size: 4, delay: 0.8 },
  { top: "55%", insetStart: "22%", size: 6, delay: 1.6 },
  { top: "12%", insetStart: "55%", size: 3, delay: 2.4 },
  { top: "70%", insetStart: "85%", size: 5, delay: 3.2 },
  { top: "42%", insetStart: "45%", size: 4, delay: 1.2 },
  { top: "64%", insetStart: "62%", size: 3, delay: 2.0 },
  { top: "26%", insetStart: "32%", size: 4, delay: 2.8 },
];

/** خلفية الغلاف المموّهة أعلى صفحة التفاصيل مع parallax خفيف */
export default function BackdropHero({ cover, extraBlurred = false }: BackdropHeroProps) {
  const { scrollY } = useScroll();
  // parallax: تنزلق الخلفية للأسفل 20% أثناء التمرير
  const y = useTransform(scrollY, [0, 480], [0, 96]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden lg:h-[480px]" aria-hidden>
      <motion.div
        initial={{ scale: 1.15, opacity: 0 }}
        animate={{ scale: 1.02, opacity: 1 }}
        transition={{ duration: 1, ease: EASE }}
        style={{ y }}
        className="absolute inset-0"
      >
        <img
          src={cover}
          alt=""
          className={`h-full w-full scale-125 object-cover ${
            extraBlurred ? "blur-3xl saturate-150" : "blur-[40px] saturate-[1.3]"
          }`}
        />
        {/* تلاشي نحو خلفية الصفحة */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, transparent 20%, var(--bg) 95%)" }}
        />
      </motion.div>

      {/* جزيئات عائمة */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="animate-bob absolute rounded-full"
          style={{
            top: p.top,
            insetInlineStart: p.insetStart,
            width: p.size,
            height: p.size,
            background: "var(--primary-soft)",
            opacity: 0.55,
            boxShadow: "0 0 12px 2px rgba(244,241,236,0.5)",
            animationDelay: `${p.delay}s`,
            animationDuration: `${5 + (i % 3)}s`,
          }}
        />
      ))}
    </div>
  );
}
