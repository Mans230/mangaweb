import { motion } from "framer-motion";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";

const REACTIONS: { kind: string; emoji: string; ar: string; en: string }[] = [
  { kind: "upvote", emoji: "👍", ar: "إعجاب", en: "Upvote" },
  { kind: "funny", emoji: "😂", ar: "مضحك", en: "Funny" },
  { kind: "love", emoji: "❤️", ar: "حب", en: "Love" },
  { kind: "surprised", emoji: "😮", ar: "مندهش", en: "Surprised" },
  { kind: "angry", emoji: "😡", ar: "غاضب", en: "Angry" },
  { kind: "sad", emoji: "😢", ar: "حزين", en: "Sad" },
];

interface Props {
  targetType: "manga" | "chapter";
  targetId: number;
  title?: string;
}

/** شريط رياكشنات (6 مشاعر) لمانهوا أو فصل — رياكشن واحد لكل مستخدم. */
export default function Reactions({ targetType, targetId, title }: Props) {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const q = trpc.reactions.summary.useQuery({ targetType, targetId }, { retry: false });

  const setMut = trpc.reactions.set.useMutation({
    onSuccess: () => utils.reactions.summary.invalidate({ targetType, targetId }),
  });

  const counts = q.data?.counts ?? {};
  const total = q.data?.total ?? 0;
  const mine = q.data?.mine ?? null;

  return (
    <div className="glass !rounded-2xl p-5 text-center">
      <h3 className="font-display text-base font-bold text-app">
        {title ?? t("ما رأيك في هذا العمل؟", "What did you think of this?")}
      </h3>
      <p className="mb-4 text-xs text-app-3">
        {total.toLocaleString()} {t("تفاعل", "reactions")}
      </p>
      <div className="flex flex-wrap items-start justify-center gap-4 sm:gap-6">
        {REACTIONS.map((r) => {
          const active = mine === r.kind;
          return (
            <button
              key={r.kind}
              onClick={() => isAuthenticated && setMut.mutate({ targetType, targetId, kind: r.kind as never })}
              disabled={!isAuthenticated || setMut.isPending}
              title={!isAuthenticated ? t("سجّل الدخول للتفاعل", "Sign in to react") : t(r.ar, r.en)}
              className={`flex flex-col items-center gap-1 transition-transform disabled:cursor-default ${
                isAuthenticated ? "hover:-translate-y-0.5" : ""
              }`}
            >
              <motion.span
                animate={active ? { scale: [1, 1.35, 1] } : {}}
                transition={{ duration: 0.35 }}
                className={`flex h-11 w-11 items-center justify-center rounded-full text-2xl ${
                  active ? "bg-primary/20 ring-2 ring-primary" : ""
                }`}
              >
                {r.emoji}
              </motion.span>
              <span className={`text-sm font-bold ${active ? "text-primary" : "text-app"}`}>
                {(counts[r.kind] ?? 0).toLocaleString()}
              </span>
              <span className="text-[11px] text-app-3">{t(r.ar, r.en)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
