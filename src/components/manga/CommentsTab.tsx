import { useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, Flag, Heart, LogIn, Send, ShieldCheck } from "lucide-react";
import { LOGIN_PATH } from "@/const";
import { useLanguage } from "@/components/LanguageProvider";
import type { CommentVM } from "./types";

interface CommentsTabProps {
  isAuthenticated: boolean;
  userAvatar?: string | null;
  comments: CommentVM[];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  submitPending: boolean;
  onLoadMore: () => void;
  onSubmit: (content: string, isSpoiler: boolean) => void;
}

function CommentItem({ comment }: { comment: CommentVM }) {
  const { t } = useLanguage();
  const [revealed, setRevealed] = useState(!comment.isSpoiler);
  const [liked, setLiked] = useState(false);
  const [reported, setReported] = useState(false);

  return (
    <motion.article
      initial={{ y: 20, scale: 0.98, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="glass !rounded-2xl p-4"
    >
      <div className="flex items-center gap-2.5">
        <img
          src={comment.avatar || "/placeholder-avatar.svg"}
          alt={comment.author}
          loading="lazy"
          className="h-9 w-9 shrink-0 rounded-full border border-app object-cover"
        />
        <span className="text-sm font-bold text-app">{comment.author}</span>
        {comment.badge && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${
              comment.badge === "مشرف" ? "gradient-primary" : "bg-app-3/60"
            }`}
          >
            {comment.badge === "مشرف" && <ShieldCheck size={10} />}
            {comment.badge}
          </span>
        )}
        <span className="ms-auto text-[11px] text-app-3">{comment.timeAgo}</span>
      </div>

      {/* المحتوى — تمويه الحرق حتى الإظهار */}
      <div className="relative mt-2.5">
        <p
          className={`text-sm leading-7 text-app-2 transition-[filter] duration-300 ${
            revealed ? "" : "select-none blur-md"
          }`}
        >
          {comment.content}
        </p>
        <AnimatePresence>
          {!revealed && (
            <motion.button
              type="button"
              exit={{ opacity: 0 }}
              onClick={() => setRevealed(true)}
              className="glass-strong absolute inset-0 flex items-center justify-center gap-2 rounded-xl text-xs font-bold text-primary"
            >
              <Eye size={14} />
              {t("تعليق يحتوي حرقاً — إظهار", "Spoiler — reveal")}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-3 flex items-center gap-4 border-t border-app pt-2.5 text-[11px] text-app-3">
        <button
          type="button"
          onClick={() => setLiked((v) => !v)}
          className={`inline-flex items-center gap-1.5 font-semibold transition-colors ${
            liked ? "text-danger" : "hover:text-danger"
          }`}
        >
          <motion.span
            key={String(liked)}
            initial={{ scale: liked ? 1.4 : 1 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.25 }}
            className="flex"
          >
            <Heart size={14} fill={liked ? "currentColor" : "none"} />
          </motion.span>
          {comment.likes + (liked ? 1 : 0)}
        </button>
        <button
          type="button"
          onClick={() => setReported(true)}
          disabled={reported}
          className="inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-warning disabled:text-success"
        >
          <Flag size={13} />
          {reported ? t("تم الإبلاغ", "Reported") : t("إبلاغ", "Report")}
        </button>
      </div>
    </motion.article>
  );
}

export default function CommentsTab({
  isAuthenticated,
  userAvatar,
  comments,
  total,
  hasMore,
  loadingMore,
  submitPending,
  onLoadMore,
  onSubmit,
}: CommentsTabProps) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState("");
  const [spoiler, setSpoiler] = useState(false);

  const submit = () => {
    const content = draft.trim();
    if (!content || submitPending) return;
    onSubmit(content, spoiler);
    setDraft("");
    setSpoiler(false);
  };

  return (
    <div>
      {/* ===== صندوق الكتابة ===== */}
      {isAuthenticated ? (
        <div className="glass mb-5 flex items-start gap-3 !rounded-2xl p-3.5">
          <img
            src={userAvatar || "/placeholder-avatar.svg"}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full border border-app object-cover"
          />
          <div className="min-w-0 flex-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder={t("شارك رأيك… (بدون حرق!)", "Share your thoughts… (no spoilers!)")}
              className="input-glass w-full resize-none text-sm"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSpoiler((v) => !v)}
                aria-pressed={spoiler}
                className={`glass-chip !px-3 !py-1.5 text-[11px] font-semibold ${
                  spoiler ? "!border-warning/60 text-warning" : ""
                }`}
              >
                {spoiler ? <EyeOff size={13} /> : <Eye size={13} />}
                {t("حرق", "Spoiler")}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim() || submitPending}
                className="btn-primary ms-auto !rounded-full !p-2.5 disabled:opacity-50"
                aria-label={t("إرسال", "Send")}
              >
                <Send size={15} className="rtl:-scale-x-100" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass mb-5 flex items-center gap-3 !rounded-2xl p-4">
          <LogIn size={18} className="shrink-0 text-primary" />
          <span className="text-sm text-app-2">{t("سجّل الدخول للتعليق", "Sign in to comment")}</span>
          <Link to={LOGIN_PATH} className="btn-glass ms-auto shrink-0 !px-4 !py-2 text-xs">
            {t("دخول", "Sign in")}
          </Link>
        </div>
      )}

      {/* ===== القائمة ===== */}
      <div className="space-y-3">
        {comments.map((c) => (
          <CommentItem key={c.id} comment={c} />
        ))}
        {comments.length === 0 && (
          <div className="glass rounded-2xl p-8 text-center text-sm text-app-3">
            {t("لا توجد تعليقات بعد — كن أول من يعلّق", "No comments yet — be the first")}
          </div>
        )}
      </div>

      {hasMore && (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="btn-glass !px-6 !py-2.5 text-xs disabled:opacity-60"
          >
            {loadingMore
              ? t("جارٍ التحميل…", "Loading…")
              : t(`عرض تعليقات أقدم (${total - comments.length})`, `Load older comments (${total - comments.length})`)}
          </button>
        </div>
      )}
    </div>
  );
}
