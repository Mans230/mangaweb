import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  Eye,
  EyeOff,
  Flag,
  ImagePlus,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Reply as ReplyIcon,
  Send,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { LOGIN_PATH } from "@/const";
import { proxyImg, timeAgo } from "@/lib/manga";
import { useImageUpload } from "@/lib/upload";
import { trpc } from "@/providers/trpc";

type SortKey = "best" | "newest" | "oldest";

interface Props {
  mangaId: number;
  chapterId?: number;
  /** يُستدعى بالعدد الكلي (لعدّاد قائمة القارئ) */
  onTotalChange?: (total: number) => void;
  title?: string;
}

/** عنصر مشترك: كومنت رئيسي أو رد. */
type ApiComment = {
  id: number;
  content: string;
  imageUrl: string | null;
  isSpoiler: boolean;
  createdAt: string | Date;
  user: { id: number; name: string | null; avatar: string | null };
  likes: number;
  dislikes: number;
  score: number;
  myVote: number;
};

export default function CommentsSection({
  mangaId,
  chapterId,
  onTotalChange,
  title,
}: Props) {
  const { t } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [sort, setSort] = useState<SortKey>("best");
  const [limit, setLimit] = useState(20);
  const [rulesOpen, setRulesOpen] = useState(true);

  const listQuery = trpc.engagement.listComments.useQuery(
    { mangaId, chapterId, sort, page: 1, limit },
    { retry: false, refetchOnWindowFocus: false },
  );

  const total = listQuery.data?.total ?? 0;
  const items = listQuery.data?.items ?? [];

  useEffect(() => {
    onTotalChange?.(total);
  }, [total, onTotalChange]);

  const invalidate = () =>
    utils.engagement.listComments.invalidate({ mangaId, chapterId });

  const sorts: { key: SortKey; ar: string; en: string }[] = [
    { key: "best", ar: "الأفضل", en: "Best" },
    { key: "newest", ar: "الأحدث", en: "Newest" },
    { key: "oldest", ar: "الأقدم", en: "Oldest" },
  ];

  return (
    <section className="mx-auto w-full max-w-3xl" aria-label={t("التعليقات", "Comments")}>
      {/* رأس: العدد + الترتيب */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-bold text-app">
          {title ?? t("التعليقات", "Comments")}{" "}
          <span className="text-app-3">({total.toLocaleString()})</span>
        </h3>
        <div className="flex items-center gap-1 rounded-full border border-app bg-[var(--surface)] p-0.5 text-xs">
          {sorts.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`rounded-full px-3 py-1 font-semibold transition-colors ${
                sort === s.key
                  ? "bg-primary text-[var(--primary-ink)]"
                  : "text-app-3 hover:text-app"
              }`}
            >
              {t(s.ar, s.en)}
            </button>
          ))}
        </div>
      </div>

      {/* محرّر التعليق الرئيسي */}
      <Composer
        mangaId={mangaId}
        chapterId={chapterId}
        parentId={null}
        onDone={invalidate}
      />

      {/* شريط القواعد */}
      <AnimatePresence>
        {rulesOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 mt-3 flex items-center gap-3 overflow-hidden rounded-xl border border-app bg-[var(--surface)] px-4 py-3 text-sm text-app-2"
          >
            <span className="flex-1">
              {t(
                "بتعليقك فإنك توافق على احترام قواعد النقاش — لا حرق، لا إساءة.",
                "By commenting you agree to keep it civil — no spoilers, no abuse.",
              )}
            </span>
            <button
              onClick={() => setRulesOpen(false)}
              className="shrink-0 text-app-3 hover:text-app"
              aria-label={t("إغلاق", "Dismiss")}
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* القائمة */}
      {listQuery.isLoading ? (
        <div className="flex justify-center py-10 text-app-3">
          <Loader2 className="animate-spin" size={22} />
        </div>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-app-3">
          {t("كن أول من يعلّق", "Be the first to comment")}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {items.map((c) => (
            <CommentNode
              key={c.id}
              comment={c}
              replies={c.replies}
              mangaId={mangaId}
              chapterId={chapterId}
              currentUserId={(user as { id?: number } | null)?.id ?? null}
              isAuthenticated={isAuthenticated}
              onChanged={invalidate}
            />
          ))}
        </div>
      )}

      {total > items.length && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setLimit((l) => l + 20)}
            className="btn-glass !px-6 !py-2.5 text-xs"
          >
            {t("عرض المزيد", "Load more")}
          </button>
        </div>
      )}
    </section>
  );
}

/* ============================ محرّر ============================ */

function Composer({
  mangaId,
  chapterId,
  parentId,
  autoFocus,
  placeholder,
  onDone,
  onCancel,
}: {
  mangaId: number;
  chapterId?: number;
  parentId: number | null;
  autoFocus?: boolean;
  placeholder?: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [draft, setDraft] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useImageUpload();

  const add = trpc.engagement.addComment.useMutation({
    onSuccess: () => {
      setDraft("");
      setIsSpoiler(false);
      setImageUrl(null);
      onDone();
      onCancel?.();
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-app bg-[var(--surface)] p-4">
        <span className="text-sm text-app-2">
          {t("سجّل الدخول للمشاركة في النقاش", "Sign in to join the discussion")}
        </span>
        <Link to={LOGIN_PATH} className="btn-primary ms-auto !px-5 !py-2 text-sm">
          {t("دخول", "Sign in")}
        </Link>
      </div>
    );
  }

  const pickImage = async (f: File | undefined) => {
    if (!f) return;
    const url = await upload(f);
    if (url) setImageUrl(url);
  };

  const submit = () => {
    const content = draft.trim();
    if ((!content && !imageUrl) || add.isPending) return;
    add.mutate({
      mangaId,
      chapterId,
      parentId,
      content,
      imageUrl: imageUrl ?? undefined,
      isSpoiler,
    });
  };

  return (
    <div className="rounded-2xl border border-app bg-[var(--surface)] p-3">
      <textarea
        autoFocus={autoFocus}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={parentId ? 2 : 3}
        maxLength={2000}
        placeholder={placeholder ?? t("اكتب تعليقاً…", "Write a comment…")}
        className="w-full resize-none bg-transparent text-sm text-app outline-none placeholder:text-app-3"
      />
      {imageUrl && (
        <div className="relative mt-2 inline-block">
          <img src={imageUrl} alt="" className="max-h-40 rounded-lg border border-app" />
          <button
            onClick={() => setImageUrl(null)}
            className="absolute -end-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-strong)] text-app shadow"
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div className="mt-2 flex items-center gap-1 border-t border-app pt-2">
        <button
          type="button"
          onClick={() => setIsSpoiler((v) => !v)}
          title={t("حرق", "Spoiler")}
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
            isSpoiler ? "bg-primary/15 text-primary" : "text-app-3 hover:text-app"
          }`}
        >
          {isSpoiler ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title={t("إرفاق صورة", "Attach image")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-app-3 transition-colors hover:text-app disabled:opacity-50"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void pickImage(e.target.files?.[0])}
        />
        <span className="ms-auto text-[11px] text-app-3">{draft.length}/2000</span>
        {onCancel && (
          <button onClick={onCancel} className="btn-glass !px-3 !py-1.5 text-xs">
            {t("إلغاء", "Cancel")}
          </button>
        )}
        <button
          onClick={submit}
          disabled={(!draft.trim() && !imageUrl) || add.isPending}
          className="btn-primary !px-4 !py-1.5 text-sm disabled:opacity-50"
        >
          {add.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {t("نشر", "Post")}
        </button>
      </div>
    </div>
  );
}

/* ============================ عقدة كومنت + ردوده ============================ */

function CommentNode({
  comment,
  replies,
  mangaId,
  chapterId,
  currentUserId,
  isAuthenticated,
  onChanged,
}: {
  comment: ApiComment;
  replies: ApiComment[];
  mangaId: number;
  chapterId?: number;
  currentUserId: number | null;
  isAuthenticated: boolean;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const [replying, setReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(true);

  return (
    <div>
      <CommentCard
        comment={comment}
        mangaId={mangaId}
        chapterId={chapterId}
        currentUserId={currentUserId}
        isAuthenticated={isAuthenticated}
        onReply={() => setReplying((v) => !v)}
        onChanged={onChanged}
      />

      {/* منطقة الردود: شرطة رأسية طويلة تربط الكومنت بكل ردوده */}
      {(replies.length > 0 || replying) && (
        <div className="relative mt-3 ps-5">
          <span className="absolute inset-y-0 start-[10px] w-px bg-app" aria-hidden />
          {replying && (
            <div className="mb-3">
              <Composer
                mangaId={mangaId}
                chapterId={chapterId}
                parentId={comment.id}
                autoFocus
                placeholder={t("اكتب رداً…", "Write a reply…")}
                onDone={onChanged}
                onCancel={() => setReplying(false)}
              />
            </div>
          )}

          {replies.length > 0 && (
            <>
              <button
                onClick={() => setShowReplies((v) => !v)}
                className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
              >
                <MessageSquare size={13} />
                {showReplies
                  ? t(`إخفاء ${replies.length} رد`, `Hide ${replies.length} replies`)
                  : t(`عرض ${replies.length} رد`, `Show ${replies.length} replies`)}
              </button>
              {showReplies && (
                <div className="flex flex-col gap-4">
                  {replies.map((r) => (
                    <CommentCard
                      key={r.id}
                      comment={r}
                      mangaId={mangaId}
                      chapterId={chapterId}
                      currentUserId={currentUserId}
                      isAuthenticated={isAuthenticated}
                      onChanged={onChanged}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================ بطاقة كومنت واحدة ============================ */

function CommentCard({
  comment,
  mangaId,
  chapterId,
  currentUserId,
  isAuthenticated,
  onReply,
  onChanged,
}: {
  comment: ApiComment;
  mangaId: number;
  chapterId?: number;
  currentUserId: number | null;
  isAuthenticated: boolean;
  onReply?: () => void;
  onChanged: () => void;
}) {
  const { t, lang } = useLanguage();
  const [revealed, setRevealed] = useState(!comment.isSpoiler);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [shared, setShared] = useState(false);
  // تفاؤليّة محليّة للتصويت
  const [vote, setVote] = useState(comment.myVote);
  const [likes, setLikes] = useState(comment.likes);
  const [dislikes, setDislikes] = useState(comment.dislikes);

  const voteMut = trpc.engagement.voteComment.useMutation();
  const del = trpc.engagement.deleteComment.useMutation({ onSuccess: onChanged });
  const block = trpc.engagement.blockUser.useMutation({ onSuccess: onChanged });

  const isMine = currentUserId != null && currentUserId === comment.user.id;

  const castVote = (v: 1 | -1) => {
    if (!isAuthenticated) return;
    const prev = vote;
    const next = prev === v ? 0 : v;
    // عدِّل العدادات محلياً
    setLikes((n) => n - (prev === 1 ? 1 : 0) + (next === 1 ? 1 : 0));
    setDislikes((n) => n - (prev === -1 ? 1 : 0) + (next === -1 ? 1 : 0));
    setVote(next);
    voteMut.mutate({ commentId: comment.id, value: v });
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#comment-${comment.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    } catch {
      /* المتصفح رفض النسخ */
    }
    setMenuOpen(false);
  };

  return (
    <article id={`comment-${comment.id}`} className="flex gap-3">
      <img
        src={proxyImg(comment.user.avatar) || "/placeholder-avatar.svg"}
        alt=""
        loading="lazy"
        className="h-9 w-9 shrink-0 rounded-full border border-app object-cover"
      />
      <div className="min-w-0 flex-1">
        {/* بطاقة مربعة بحدّ رفيع */}
        <div className="rounded-xl border border-app bg-[var(--surface)] px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-app">
              {comment.user.name ?? t("مستخدم", "User")}
            </span>
            <span className="shrink-0 text-[11px] text-app-3">
              {timeAgo(comment.createdAt, lang)}
            </span>
            {comment.isSpoiler && (
              <span className="shrink-0 rounded-full border border-app px-1.5 py-0.5 text-[10px] text-warning">
                {t("حرق", "Spoiler")}
              </span>
            )}
          </div>

          <div className="relative mt-1.5">
            {comment.content && (
              <p
                className={`whitespace-pre-wrap break-words text-sm leading-7 text-app-2 transition-[filter] ${
                  revealed ? "" : "select-none blur-md"
                }`}
              >
                {comment.content}
              </p>
            )}
            {comment.imageUrl && revealed && (
              <img
                src={comment.imageUrl}
                alt=""
                loading="lazy"
                className="mt-2 max-h-72 rounded-lg border border-app"
              />
            )}
            {!revealed && (
              <button
                onClick={() => setRevealed(true)}
                className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold text-primary"
              >
                <Eye size={14} />
                {t("إظهار الحرق", "Reveal spoiler")}
              </button>
            )}
          </div>
        </div>

        {/* شريط الإجراءات */}
        <div className="mt-1.5 flex items-center gap-1 px-1 text-app-3">
          <button
            onClick={() => castVote(1)}
            disabled={!isAuthenticated}
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold transition-colors ${
              vote === 1 ? "text-primary" : "hover:text-app"
            }`}
          >
            <ThumbsUp size={15} fill={vote === 1 ? "currentColor" : "none"} />
            {likes > 0 && likes}
          </button>
          <button
            onClick={() => castVote(-1)}
            disabled={!isAuthenticated}
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold transition-colors ${
              vote === -1 ? "text-danger" : "hover:text-app"
            }`}
          >
            <ThumbsDown size={15} fill={vote === -1 ? "currentColor" : "none"} />
            {dislikes > 0 && dislikes}
          </button>
          {onReply && (
            <button
              onClick={onReply}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold transition-colors hover:text-app"
            >
              <ReplyIcon size={15} />
              {t("رد", "Reply")}
            </button>
          )}

          {/* ثلاث نقاط */}
          <div className="relative ms-auto">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:text-app"
              aria-label={t("خيارات", "Options")}
            >
              <MoreHorizontal size={16} />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute end-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-app bg-[var(--surface-strong)] py-1 text-sm shadow-xl"
                  >
                    <button
                      onClick={share}
                      className="flex w-full items-center gap-2 px-3 py-2 text-app-2 transition-colors hover:bg-[var(--surface)]"
                    >
                      <Share2 size={14} />
                      {shared ? t("تم النسخ", "Copied") : t("مشاركة", "Share")}
                    </button>
                    {!isMine && (
                      <>
                        <button
                          onClick={() => {
                            setReportOpen(true);
                            setMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-app-2 transition-colors hover:bg-[var(--surface)]"
                        >
                          <Flag size={14} />
                          {t("إبلاغ", "Report")}
                        </button>
                        <button
                          onClick={() => {
                            if (isAuthenticated) block.mutate({ userId: comment.user.id });
                            setMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-danger transition-colors hover:bg-[var(--surface)]"
                        >
                          <Ban size={14} />
                          {t("حظر المستخدم", "Block user")}
                        </button>
                      </>
                    )}
                    {isMine && (
                      <button
                        onClick={() => {
                          del.mutate({ id: comment.id });
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-danger transition-colors hover:bg-[var(--surface)]"
                      >
                        <Trash2 size={14} />
                        {t("حذف", "Delete")}
                      </button>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {reportOpen && (
        <ReportModal
          commentId={comment.id}
          mangaId={mangaId}
          chapterId={chapterId}
          onClose={() => setReportOpen(false)}
        />
      )}
    </article>
  );
}

/* ============================ نافذة الإبلاغ ============================ */

function ReportModal({
  commentId,
  mangaId,
  chapterId,
  onClose,
}: {
  commentId: number;
  mangaId: number;
  chapterId?: number;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [reason, setReason] = useState<"porn" | "broken" | "wrong_translation" | "other">("other");
  const [details, setDetails] = useState("");
  const [done, setDone] = useState(false);
  const create = trpc.reports.create.useMutation({
    onSuccess: () => setDone(true),
  });

  const reasons: { key: typeof reason; ar: string; en: string }[] = [
    { key: "porn", ar: "محتوى إباحي/مسيء", en: "Explicit / abusive" },
    { key: "broken", ar: "سبام أو مزعج", en: "Spam" },
    { key: "wrong_translation", ar: "معلومة خاطئة", en: "Misinformation" },
    { key: "other", ar: "أخرى", en: "Other" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-app bg-[var(--surface-strong)] p-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-bold text-app">{t("إبلاغ عن تعليق", "Report comment")}</h4>
          <button onClick={onClose} className="text-app-3 hover:text-app">
            <X size={18} />
          </button>
        </div>
        {done ? (
          <p className="py-4 text-center text-sm text-success">
            {t("تم استلام بلاغك، شكراً لك", "Report received — thank you")}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {reasons.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setReason(r.key)}
                  className={`rounded-lg border px-3 py-2 text-start text-sm transition-colors ${
                    reason === r.key
                      ? "border-primary bg-primary/10 text-app"
                      : "border-app text-app-2 hover:text-app"
                  }`}
                >
                  {t(r.ar, r.en)}
                </button>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={t("تفاصيل إضافية (اختياري)", "More details (optional)")}
              className="mt-3 w-full resize-none rounded-lg border border-app bg-transparent p-2 text-sm text-app outline-none placeholder:text-app-3"
            />
            <button
              onClick={() =>
                create.mutate({
                  commentId,
                  mangaId,
                  chapterId,
                  reason,
                  details: details.trim() || undefined,
                })
              }
              disabled={create.isPending}
              className="btn-primary mt-3 w-full !py-2 text-sm disabled:opacity-50"
            >
              {create.isPending ? t("جارٍ الإرسال…", "Sending…") : t("إرسال البلاغ", "Submit report")}
            </button>
            {create.isError && (
              <p className="mt-2 text-center text-xs text-danger">
                {create.error.message}
              </p>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
