import { useEffect, useMemo, useState } from "react";
import { proxyImg } from "@/lib/manga";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, MessageSquareText, Send } from "lucide-react";
import { Link } from "react-router";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { LOGIN_PATH } from "@/const";
import { trpc } from "@/providers/trpc";
import Reactions from "@/components/Reactions";

export interface ChapterComment {
  id: number | string;
  userName: string;
  avatar: string;
  content: string;
  isSpoiler: boolean;
  timeAgo: string;
}

/** Mock fallback comments (used when the API is unreachable). TODO: drop once API is always on. */
export const MOCK_CHAPTER_COMMENTS: ChapterComment[] = [
  {
    id: "m1",
    userName: "قارئ الظلال",
    avatar: "/placeholder-avatar.svg",
    content: "الفصل كان نار! المعركة الأخيرة رسمها خيالي 🔥",
    isSpoiler: false,
    timeAgo: "قبل 10 د",
  },
  {
    id: "m2",
    userName: "مانهوا_بالعربي",
    avatar: "/placeholder-avatar.svg",
    content: "لا تفتحوا التعليق إلا بعد ما تخلصون: موتة الشخصية في النهاية صدمتني، ما توقعتها أبداً.",
    isSpoiler: true,
    timeAgo: "قبل 32 د",
  },
  {
    id: "m3",
    userName: "نور",
    avatar: "/placeholder-avatar.svg",
    content: "الترجمة ممتازة والجودة عالية، شكراً زيكو مانجا ❤️",
    isSpoiler: false,
    timeAgo: "قبل ساعة",
  },
  {
    id: "m4",
    userName: "صياد الفصول",
    avatar: "/placeholder-avatar.svg",
    content: "الفصل الجاي بيكون نقطة تحول، من قرأ الرواية يعرف وش أقصد.",
    isSpoiler: true,
    timeAgo: "قبل 3 س",
  },
];

interface ChapterCommentsProps {
  mangaId: number | null;
  chapterId: number | null;
  /** real DB ids available (API mode) */
  fromApi: boolean;
  chapterNumber: number;
  onTotalChange?: (total: number) => void;
}

export default function ChapterComments({
  mangaId,
  chapterId,
  fromApi,
  chapterNumber,
  onTotalChange,
}: ChapterCommentsProps) {
  const { t } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const canQuery = fromApi && mangaId !== null;
  const listQuery = trpc.engagement.listComments.useQuery(
    { mangaId: mangaId ?? 0, chapterId: chapterId ?? undefined, page: 1, limit: 50 },
    { enabled: canQuery, retry: false, refetchOnWindowFocus: false },
  );

  // Local (guest / mock-mode) comments appended on top
  const [localComments, setLocalComments] = useState<ChapterComment[]>([]);
  const [draft, setDraft] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(true); // spoiler blur default ON in reader
  const [revealedIds, setRevealedIds] = useState<Set<number | string>>(new Set());

  const apiComments: ChapterComment[] = useMemo(() => {
    if (!canQuery || !listQuery.data) return [];
    return listQuery.data.items.map((c) => ({
      id: c.id,
      userName: c.user.name ?? t("قارئ", "Reader"),
      avatar: proxyImg(c.user.avatar) || "/placeholder-avatar.svg",
      content: c.content,
      isSpoiler: c.isSpoiler,
      timeAgo: new Date(c.createdAt).toLocaleDateString("ar"),
    }));
  }, [canQuery, listQuery.data, t]);

  const useMock = !canQuery || listQuery.isError;
  const comments = useMock
    ? [...localComments, ...MOCK_CHAPTER_COMMENTS]
    : [...localComments, ...apiComments];
  const total = useMock
    ? MOCK_CHAPTER_COMMENTS.length + localComments.length
    : (listQuery.data?.total ?? 0) + localComments.length;

  useEffect(() => {
    onTotalChange?.(total);
  }, [total, onTotalChange]);

  const addComment = trpc.engagement.addComment.useMutation({
    onSuccess: async () => {
      if (canQuery && mangaId !== null) {
        await utils.engagement.listComments.invalidate({ mangaId });
      }
    },
  });

  const submit = () => {
    const content = draft.trim();
    if (!content) return;
    if (canQuery && isAuthenticated && chapterId !== null) {
      addComment.mutate(
        { mangaId: mangaId, chapterId, content, isSpoiler },
        {
          onError: () => {
            // API failed — keep the comment locally so the user doesn't lose it
            setLocalComments((p) => [
              {
                id: `local-${Date.now()}`,
                userName: user?.name ?? t("أنا", "Me"),
                avatar: proxyImg(user?.avatarUrl) || "/placeholder-avatar.svg",
                content,
                isSpoiler,
                timeAgo: t("الآن", "now"),
              },
              ...p,
            ]);
          },
        },
      );
    } else {
      // Guest / mock mode: store locally only
      setLocalComments((p) => [
        {
          id: `local-${Date.now()}`,
          userName: user?.name ?? t("زائر", "Guest"),
          avatar: proxyImg(user?.avatarUrl) || "/placeholder-avatar.svg",
          content,
          isSpoiler,
          timeAgo: t("الآن", "now"),
        },
        ...p,
      ]);
    }
    setDraft("");
    setIsSpoiler(true);
  };

  const toggleReveal = (id: number | string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="mx-3 mb-28 md:mx-0" aria-label={t("تعليقات الفصل", "Chapter comments")}>
      {/* رياكشنات هذا الفصل */}
      {canQuery && chapterId !== null && (
        <div className="mb-4">
          <Reactions targetType="chapter" targetId={chapterId} title={t("ما رأيك في هذا الفصل؟", "What did you think of this chapter?")} />
        </div>
      )}
      <div className="glass p-4 md:p-6">
        <h3 className="font-display mb-4 flex items-center gap-2 text-lg font-bold text-app">
          <MessageSquareText size={19} className="text-primary" />
          {t("تعليقات الفصل", "Chapter comments")} {chapterNumber}
          <span className="text-sm font-medium text-app-3">({total})</span>
        </h3>

        {/* composer */}
        {isAuthenticated || useMock ? (
          <div className="mb-5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={t("شارك رأيك في الفصل…", "Share your thoughts on this chapter…")}
              className="input-glass w-full resize-none text-sm"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSpoiler((v) => !v)}
                className={`glass-chip text-xs ${isSpoiler ? "!border-[var(--border-glow)] text-primary" : ""}`}
              >
                {isSpoiler ? <EyeOff size={13} /> : <Eye size={13} />}
                {t("يحتوي حرق", "Contains spoiler")}
              </button>
              <button
                className="btn-primary ms-auto !px-5 !py-2 text-sm disabled:opacity-50"
                onClick={submit}
                disabled={!draft.trim() || addComment.isPending}
              >
                <Send size={14} />
                {t("نشر", "Post")}
              </button>
            </div>
            {!isAuthenticated && (
              <p className="mt-1.5 text-[11px] text-app-3">
                {t(
                  "تعليقك سيُحفظ محلياً — سجّل الدخول لمزامنته مع حسابك.",
                  "Your comment is stored locally — sign in to sync it with your account.",
                )}
              </p>
            )}
          </div>
        ) : (
          <div className="mb-5 rounded-2xl border border-app bg-app/40 p-4 text-center">
            <p className="mb-2 text-sm text-app-2">
              {t("سجّل الدخول للمشاركة في النقاش", "Sign in to join the discussion")}
            </p>
            <Link to={LOGIN_PATH} className="btn-glass !px-5 !py-2 text-sm">
              {t("دخول", "Sign in")}
            </Link>
          </div>
        )}

        {/* list */}
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {comments.map((c) => {
              const blurred = c.isSpoiler && !revealedIds.has(c.id);
              return (
                <motion.article
                  key={c.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex gap-3 rounded-2xl border border-app bg-app/30 p-3.5"
                >
                  <img
                    src={c.avatar}
                    alt={c.userName}
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded-full border border-app object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-app">{c.userName}</span>
                      <span className="shrink-0 text-[11px] text-app-3">{c.timeAgo}</span>
                      {c.isSpoiler && (
                        <span className="glass-chip shrink-0 !px-2 !py-0.5 text-[10px] text-warning">
                          {t("حرق", "Spoiler")}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => c.isSpoiler && toggleReveal(c.id)}
                      className={`mt-1 block w-full text-start text-sm leading-relaxed text-app-2 transition-all ${
                        blurred ? "select-none blur-sm" : ""
                      }`}
                      aria-label={blurred ? t("إظهار الحرق", "Reveal spoiler") : undefined}
                    >
                      {c.content}
                      {blurred && (
                        <span className="mt-1 block text-xs font-semibold text-primary">
                          {t("اضغط لإظهار الحرق", "Tap to reveal spoiler")}
                        </span>
                      )}
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
          {comments.length === 0 && (
            <p className="py-8 text-center text-sm text-app-3">
              {t("كن أول من يعلق على هذا الفصل", "Be the first to comment on this chapter")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
