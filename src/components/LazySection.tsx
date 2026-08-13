import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface LazySectionProps {
  children: ReactNode;
  /** ارتفاع تقديري للحجز قبل الرسم لتجنب قفز التمرير */
  minHeight?: number;
}

/**
 * يؤجّل رسم الأقسام الثقيلة حتى تقترب من نافذة العرض (IntersectionObserver).
 * يبدأ التحميل قبل الظهور بـ 400px لتجربة سلسة.
 */
export default function LazySection({ children, minHeight }: LazySectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <div ref={ref} style={!visible && minHeight ? { minHeight } : undefined}>
      {visible ? children : null}
    </div>
  );
}
