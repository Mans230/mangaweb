import { motion } from "framer-motion";
import { CornerUpLeft, Trash2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { timeAgo } from "@/lib/manga";
import { avatarSrc, displayName, parseBody } from "./types";
import type { CommunityMessage } from "./types";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface MessageItemProps {
  message: CommunityMessage;
  /** أسلوب فقاعة الشات بدل بطاقة النقاش */
  bubble?: boolean;
  mine: boolean;
  canDelete: boolean;
  deletePending?: boolean;
  onDelete: (id: number) => void;
  /** زر الرد (اقتباس) — يُعرض في تبويب النقاش فقط */
  onReply?: (message: CommunityMessage) => void;
}

export default function MessageItem({
  message,
  bubble,
  mine,
  canDelete,
  deletePending,
  onDelete,
  onReply,
}: MessageItemProps) {
  const { t, lang } = useLanguage();
  const { quote, text } = parseBody(message.body);
  const when = timeAgo(message.createdAt, lang);

  const avatar = (
    <img
      src={avatarSrc(message.user)}
      alt={displayName(message.user)}
      loading="lazy"
      className="h-9 w-9 shrink-0 rounded-full border border-app object-cover"
    />
  );

  const quoteBlock = quote && (
    <div className="mb-1.5 border-s-2 border-primary/60 ps-2 text-[11.5px] leading-5 text-app-3">
      <span className="line-clamp-2">{quote}</span>
    </div>
  );

  const actions = (
    <span className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
      {onReply && (
        <button
          onClick={() => onReply(message)}
          aria-label={t("ردّ باقتباس", "Reply with quote")}
          title={t("ردّ باقتباس", "Reply with quote")}
          className="btn-icon !h-7 !w-7"
        >
          <CornerUpLeft size={13} className="rtl:-scale-x-100" />
        </button>
      )}
      {canDelete && (
        <button
          onClick={() => onDelete(message.id)}
          disabled={deletePending}
          aria-label={t("حذف الرسالة", "Delete message")}
          title={t("حذف الرسالة", "Delete message")}
          className="btn-icon !h-7 !w-7 !text-danger"
        >
          <Trash2 size={13} />
        </button>
      )}
    </span>
  );

  if (bubble) {
    // أسلوب الشات: فقاعات — رسائلي بخلفية متدرجة، وغيرها زجاجية
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
        transition={{ duration: 0.3, ease: EASE }}
        className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}
      >
        {avatar}
        <div
          className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 sm:max-w-[65%] ${
            mine
              ? "gradient-primary rounded-es-sm text-white shadow-md"
              : "glass rounded-ee-sm"
          }`}
        >
          <div className={`mb-0.5 flex items-center gap-2 text-[10.5px] ${mine ? "text-white/75" : "text-app-3"}`}>
            <span className="font-bold" dir="ltr">@{displayName(message.user)}</span>
            <span>{when}</span>
            {actions}
          </div>
          {quoteBlock}
          <p className={`whitespace-pre-wrap break-words text-sm leading-6 ${mine ? "text-white" : "text-app"}`}>
            {text}
          </p>
        </div>
      </motion.div>
    );
  }

  // أسلوب النقاش: بطاقة زجاجية
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -50, transition: { duration: 0.25 } }}
      transition={{ duration: 0.3, ease: EASE }}
      className="glass group flex items-start gap-3 !rounded-2xl p-3.5"
    >
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-bold text-app" dir="ltr">
            @{displayName(message.user)}
          </span>
          <span className="shrink-0 text-[10.5px] text-app-3">{when}</span>
          <span className="ms-auto">{actions}</span>
        </div>
        {quote && <div className="mt-1.5">{quoteBlock}</div>}
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-7 text-app-2">{text}</p>
      </div>
    </motion.div>
  );
}
