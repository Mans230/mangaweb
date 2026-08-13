import { motion } from "framer-motion";
import MangaCard from "@/components/MangaCard";
import type { MangaCardData } from "@/lib/manga";
import { useLanguage } from "@/components/LanguageProvider";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface SimilarTabProps {
  items: MangaCardData[];
}

/** شبكة أعمال مشابهة (6 بطاقات) */
export default function SimilarTab({ items }: SimilarTabProps) {
  const { t } = useLanguage();

  if (!items.length) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-sm text-app-3">
        {t("لا توجد أعمال مشابهة حالياً", "No similar works yet")}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5 lg:grid-cols-6">
      {items.map((m, i) => (
        <motion.div
          key={m.id}
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: EASE, delay: i * 0.06 }}
        >
          <MangaCard manga={m} />
        </motion.div>
      ))}
    </div>
  );
}
