import { memo, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { ImageQuality } from "./store";

interface WebtoonViewProps {
  pages: string[];
  quality: ImageQuality;
  /** called (rAF-throttled) with scroll ratio 0..1 */
  onProgress: (ratio: number) => void;
  /** tapping the reading surface toggles the chrome */
  onTapSurface: () => void;
  /** chapter-scoped key: resets reveal state */
  chapterKey: string;
  /** إعدادات العرض من المستخدم (تنطبق على كل الفصول) */
  containerWidth?: number;
  imageWidth?: number;
  brightness?: number;
  gap?: number;
  /** end-card + comments rendered after the pages */
  children?: ReactNode;
}

export default function WebtoonView({
  pages,
  quality,
  onProgress,
  onTapSurface,
  chapterKey,
  containerWidth = 900,
  imageWidth = 100,
  brightness = 100,
  gap = 0,
  children,
}: WebtoonViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  // Scroll-driven progress (rAF-throttled)
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      onProgressRef.current(Math.max(0, Math.min(1, window.scrollY / max)));
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [chapterKey]);

  return (
    <div ref={rootRef} className="mx-auto w-full" style={{ maxWidth: containerWidth }}>
      {/* tapping the reading surface toggles the chrome (not end-card/comments) */}
      <div
        className="mx-auto flex flex-col"
        style={{ width: `${imageWidth}%`, gap: `${gap}px`, filter: `brightness(${brightness}%)` }}
        onClick={onTapSurface}
        role="presentation"
      >
        {pages.map((src, i) => (
          <WebtoonPage
            key={`${chapterKey}-${i}`}
            src={src}
            index={i}
            quality={quality}
          />
        ))}
      </div>
      {children}
    </div>
  );
}

/** Single webtoon page: blur-up lazy load + IntersectionObserver reveal (once) */
const WebtoonPage = memo(function WebtoonPage({
  src,
  index,
  quality,
}: {
  src: string;
  index: number;
  quality: ImageQuality;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(index < 2);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (revealed) return;
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { rootMargin: "200% 0px" }, // start revealing ~2 screens ahead
    );
    io.observe(el);
    return () => io.disconnect();
  }, [revealed]);

  return (
    <motion.div
      ref={wrapRef}
      initial={{ opacity: 0, y: 20 }}
      animate={revealed ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full overflow-hidden"
    >
      {/* blur-up placeholder */}
      {!loaded && <div className="skeleton aspect-[1/3] w-full !rounded-none" />}
      <img
        src={src}
        alt={`صفحة ${index + 1}`}
        loading={index < 2 ? "eager" : "lazy"}
        fetchPriority={index === 0 ? "high" : "auto"}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={`w-full select-none transition-opacity duration-500 ${
          loaded ? "opacity-100" : "absolute inset-0 opacity-0"
        } ${quality === "saver" ? "[image-rendering:auto] [filter:saturate(0.92)_contrast(0.98)]" : ""}`}
      />
    </motion.div>
  );
});
