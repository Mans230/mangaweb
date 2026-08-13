import { useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { LogIn, Send, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { LOGIN_PATH } from "@/const";
import { avatarSrc, displayName } from "./types";
import type { CommunityMessage } from "./types";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface ComposerProps {
  isAuthenticated: boolean;
  userAvatar?: string | null;
  /** رسالة قيد الاقتباس (reply-lite) — تُعرض كشريحة فوق الصندوق */
  replyTo: CommunityMessage | null;
  onCancelReply: () => void;
  pending: boolean;
  onSubmit: (text: string) => void;
}

/** صندوق إرسال موحّد لتبويبَي النقاش والشات — غير المسجل يقرأ فقط مع دعوة دخول. */
export default function Composer({
  isAuthenticated,
  userAvatar,
  replyTo,
  onCancelReply,
  pending,
  onSubmit,
}: ComposerProps) {
  const { t } = useLanguage();
  const [text, setText] = useState("");

  if (!isAuthenticated) {
    return (
      <div className="glass flex flex-wrap items-center justify-center gap-3 !rounded-2xl px-5 py-4 text-center">
        <p className="w-full text-sm text-app-2">
          {t("سجّل الدخول للمشاركة في النقاش — يمكنك القراءة بحرية.", "Sign in to join the discussion — reading is open to everyone.")}
        </p>
        <Link to={LOGIN_PATH} className="btn-primary !px-5 !py-2.5 text-sm">
          <LogIn size={15} />
          {t("تسجيل الدخول", "Sign in")}
        </Link>
      </div>
    );
  }

  const submit = () => {
    const value = text.trim();
    if (!value || pending) return;
    onSubmit(value);
    setText("");
  };

  return (
    <div className="glass-strong !rounded-2xl p-3">
      {/* شريحة الاقتباس */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mb-2 flex items-center gap-2 rounded-xl border-s-2 border-primary bg-primary/10 px-3 py-2">
              <img
                src={avatarSrc(replyTo.user)}
                alt=""
                aria-hidden
                className="h-6 w-6 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <span className="block text-[10.5px] font-bold text-primary" dir="ltr">
                  @{displayName(replyTo.user)}
                </span>
                <span className="block truncate text-[11.5px] text-app-3">
                  {replyTo.body.split("\n").pop()}
                </span>
              </div>
              <button
                onClick={onCancelReply}
                aria-label={t("إلغاء الرد", "Cancel reply")}
                className="btn-icon !h-7 !w-7"
              >
                <X size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-end gap-2">
        <img
          src={userAvatar ?? "/avatar-1.png"}
          alt=""
          aria-hidden
          className="mb-0.5 h-9 w-9 shrink-0 rounded-full border border-app object-cover"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter يرسل، Shift+Enter سطر جديد
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder={replyTo ? t("اكتب ردّك…", "Write your reply…") : t("شارك رأيك…", "Share your thoughts…")}
          className="input-glass max-h-32 min-h-[42px] flex-1 resize-none !rounded-2xl !py-2.5 text-sm"
        />
        <button
          onClick={submit}
          disabled={pending || !text.trim()}
          aria-label={t("إرسال", "Send")}
          className="btn-primary shrink-0 !rounded-2xl !p-3 disabled:opacity-50"
        >
          <Send size={16} className="rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );
}
