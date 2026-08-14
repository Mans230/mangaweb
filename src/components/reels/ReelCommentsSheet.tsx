/**
 * شيت تعليقات الريل — ينزلق من الأسفل: قائمة بتمرير لا نهائي + حقل إدخال.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, LogIn, Send, X } from "lucide-react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/components/LanguageProvider";
import { useToast } from "@/components/library/toast";
import { LOGIN_PATH } from "@/const";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const MAX_LEN = 500;

interface ReelCommentsSheetProps {
  reelId: number | null;
  onClose: () => void;
}

export default function ReelCommentsSheet({ reelId, onClose }: ReelCommentsSheetProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const open = reelId !== null;

  const commentsQ = trpc.reels.listComments.useInfiniteQuery(
    { reelId: reelId ?? 0 },
    {
      enabled: open,
      retry: false,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    },
  );

  const addMut = trpc.reels.addComment.useMutation({
    onSuccess: () => {
      setText("");
      void utils.reels.listComments.invalidate({ reelId: reelId ?? 0 });
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  // أغلق بمفتاح Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const items = commentsQ.data?.pages.flatMap((p) => p.items) ?? [];

  const submit = () => {
    const value = text.trim();
    if (!value || reelId === null || addMut.isPending) return;
    addMut.mutate({ reelId, content: value });
  };

  const onScroll = () => {
    const el = listRef.current;
    if (!el || !commentsQ.hasNextPage || commentsQ.isFetchingNextPage) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      void commentsQ.fetchNextPage();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[86] bg-black/55 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.32, ease: EASE }}
            role="dialog"
            aria-modal="true"
            aria-label={t("تعليقات الريل", "Reel comments")}
            className="glass-strong fixed inset-x-0 bottom-0 z-[87] flex h-[70dvh] flex-col !rounded-t-3xl sm:inset-x-auto sm:start-1/2 sm:w-[min(94vw,440px)] sm:-translate-x-1/2 rtl:sm:translate-x-1/2"
          >
            <div className="flex items-center justify-between border-b border-app px-4 py-3">
              <h3 className="font-display text-sm font-bold text-app">
                {t("التعليقات", "Comments")}
              </h3>
              <button className="btn-icon !h-8 !w-8" onClick={onClose} aria-label={t("إغلاق", "Close")}>
                <X size={15} />
              </button>
            </div>

            <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4">
              {commentsQ.isLoading ? (
                <div className="flex flex-col gap-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton h-12 !rounded-2xl" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <p className="py-10 text-center text-sm text-app-3">
                  {t("لا تعليقات بعد — كن أول من يعلّق", "No comments yet — be the first")}
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {items.map((c) => (
                    <li key={c.id} className="flex items-start gap-2.5">
                      <img
                        src={c.user.avatarUrl ?? "/avatar-1.png"}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-full border border-app object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] font-bold text-app-3">
                          {c.user.name ?? c.user.username ?? t("مستخدم", "User")}
                        </span>
                        <p className="mt-0.5 break-words text-[13px] leading-5 text-app">
                          {c.content}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {commentsQ.isFetchingNextPage && (
                <p className="flex justify-center py-3">
                  <Loader2 size={16} className="animate-spin text-app-3" />
                </p>
              )}
            </div>

            <div className="border-t border-app p-3">
              {isAuthenticated ? (
                <div className="flex items-end gap-2">
                  <img
                    src={user?.avatarUrl ?? "/avatar-1.png"}
                    alt=""
                    className="mb-0.5 h-8 w-8 shrink-0 rounded-full border border-app object-cover"
                  />
                  <div className="relative flex-1">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          submit();
                        }
                      }}
                      rows={1}
                      maxLength={MAX_LEN}
                      placeholder={t("أضف تعليقاً…", "Add a comment…")}
                      className="input-glass max-h-28 min-h-[40px] w-full resize-none !rounded-2xl !py-2.5 text-sm"
                    />
                  </div>
                  <button
                    onClick={submit}
                    disabled={addMut.isPending || !text.trim()}
                    aria-label={t("إرسال", "Send")}
                    className="btn-primary shrink-0 !rounded-2xl !p-2.5 disabled:opacity-50"
                  >
                    {addMut.isPending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Send size={15} className="rtl:-scale-x-100" />
                    )}
                  </button>
                </div>
              ) : (
                <Link to={LOGIN_PATH} className="btn-glass w-full !py-2.5 text-sm">
                  <LogIn size={15} />
                  {t("سجّل الدخول للتعليق", "Sign in to comment")}
                </Link>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
