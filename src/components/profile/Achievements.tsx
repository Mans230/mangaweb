import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  BookOpen,
  BookMarked,
  Layers,
  Lock,
  MessageSquare,
  MoonStar,
  Star,
  Zap,
} from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type { LibraryData } from "@/components/library/data";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface AchievementsProps {
  data: LibraryData;
}

interface Achievement {
  id: string;
  icon: typeof Star;
  title: string;
  desc: string;
  unlocked: boolean;
  hint: string;
}

const LEVEL_NAMES = ["مبتدئ", "قارئ", "قارئ نشط", "متابع وفيّ", "قارئ نهم", "مدمن فصول", "أسطورة المكتبة"];

export default function Achievements({ data }: AchievementsProps) {
  const { t } = useLanguage();
  const chaptersRead = data.history.length;
  const level = Math.min(7, Math.floor(Math.sqrt(chaptersRead / 6)) + 1);
  const xpPct = Math.min(96, Math.round(((chaptersRead % 60) / 60) * 100));

  const achievements: Achievement[] = useMemo(
    () => [
      { id: "first", icon: BookOpen, title: t("أول فصل", "First chapter"), desc: t("قرأت أول فصل لك على زيكو مانجا.", "You read your first chapter on zeko-manga."), unlocked: chaptersRead >= 1, hint: t("اقرأ أي فصل.", "Read any chapter.") },
      { id: "hundred", icon: BookMarked, title: t("100 فصل", "100 chapters"), desc: t("تجاوزت مئة فصل مقروء — إنجاز حقيقي!", "You passed 100 read chapters — a real milestone!"), unlocked: chaptersRead >= 100, hint: t("اقرأ 100 فصل.", "Read 100 chapters.") },
      { id: "marathon", icon: Zap, title: t("ماراثون", "Marathon"), desc: t("قرأت 10 فصول في يوم واحد.", "You read 10 chapters in a single day."), unlocked: chaptersRead >= 10, hint: t("اقرأ 10 فصول في يوم واحد.", "Read 10 chapters in one day.") },
      { id: "rater", icon: Star, title: t("مُقيّم", "Rater"), desc: t("قيّمت أول عمل لك بالنجوم.", "You rated your first title."), unlocked: chaptersRead >= 5, hint: t("قيّم أي مانجا بالنجوم.", "Rate any manga.") },
      { id: "critic", icon: MessageSquare, title: t("ناقد", "Critic"), desc: t("كتبت 10 تعليقات هادفة.", "You wrote 10 comments."), unlocked: false, hint: t("اكتب 10 تعليقات.", "Write 10 comments.") },
      { id: "loyal", icon: Bell, title: t("متابع مخلص", "Loyal follower"), desc: t("تتابع 3 أعمال أو أكثر.", "You follow 3+ titles."), unlocked: data.following.length >= 3, hint: t("تابع 3 أعمال.", "Follow 3 titles.") },
      { id: "night", icon: MoonStar, title: t("ليلي", "Night owl"), desc: t("قرأت فصلاً بعد منتصف الليل.", "You read a chapter past midnight."), unlocked: data.history.some((h) => h.date.getHours() < 5), hint: t("اقرأ بعد منتصف الليل.", "Read past midnight.") },
      { id: "collector", icon: Layers, title: t("جامع", "Collector"), desc: t("جمعت 50 عملاً في مفضلتك.", "You collected 50 favorites."), unlocked: data.favorites.length >= 50, hint: t("أضف 50 عملاً للمفضلة.", "Add 50 favorites.") },
    ],
    [chaptersRead, data, t],
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="glass p-4 md:p-6"
    >
      {/* level card */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-app-3">{t("مستوى القارئ", "Reader level")}</div>
          <div className="font-display gradient-text mt-1 text-2xl font-extrabold md:text-3xl">
            Lv.{level.toLocaleString("ar")} — {LEVEL_NAMES[level - 1]}
          </div>
        </div>
        <div className="text-xs text-app-3">
          {xpPct.toLocaleString("ar")}% {t("نحو المستوى التالي", "to next level")}
        </div>
      </div>

      {/* XP bar with shine sweep */}
      <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${xpPct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: EASE }}
          className="gradient-primary relative h-full overflow-hidden rounded-full"
        >
          <motion.span
            animate={{ x: ["-150%", "350%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent"
            aria-hidden
          />
        </motion.div>
      </div>

      {/* medallion shelf */}
      <div className="mt-7 grid grid-cols-4 gap-3 sm:gap-4 lg:grid-cols-8">
        {achievements.map((a, i) => (
          <Medallion key={a.id} achievement={a} index={i} />
        ))}
      </div>
    </motion.section>
  );
}

function Medallion({ achievement: a, index: i }: { achievement: Achievement; index: number }) {
  const { t } = useLanguage();
  const [flipped, setFlipped] = useState(false);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ type: "spring", stiffness: 260, damping: 18, delay: i * 0.06 }}
      onClick={() => setFlipped((f) => !f)}
      className="group flex flex-col items-center gap-2 focus:outline-none"
      aria-label={`${a.title} — ${a.unlocked ? t("مفتوح", "unlocked") : t("مقفل", "locked")}`}
      style={{ perspective: 600 }}
    >
      <motion.span
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative block h-16 w-16"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* front */}
        <span
          className={`glass absolute inset-0 flex items-center justify-center rounded-full ${
            a.unlocked ? "text-primary" : "text-app-3 grayscale"
          }`}
          style={{ backfaceVisibility: "hidden" }}
        >
          {a.unlocked && (
            <motion.span
              animate={{ opacity: [0.25, 0.6, 0.25] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="gradient-primary absolute inset-0 rounded-full blur-md"
              aria-hidden
            />
          )}
          <a.icon size={24} className="relative" />
          {!a.unlocked && (
            <span className="absolute -bottom-0.5 -end-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-white">
              <Lock size={10} />
            </span>
          )}
        </span>
        {/* back */}
        <span
          className="glass-strong absolute inset-0 flex items-center justify-center rounded-full p-1.5 text-center text-[8.5px] font-semibold leading-tight text-app-2"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {a.unlocked ? a.desc : a.hint}
        </span>
      </motion.span>
      <span className={`text-[10.5px] font-semibold ${a.unlocked ? "text-app" : "text-app-3"}`}>
        {a.title}
      </span>
    </motion.button>
  );
}
