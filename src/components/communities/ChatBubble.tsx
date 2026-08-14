/**
 * سطر رسالة حرّ (بدون بالونة/فقاعة) لشات المجتمع:
 * أفاتار صغير + اسم المستخدم بخط صغير ملوّن مع الوقت بجانبه،
 * ثم نص الرسالة مباشرة تحته — بلا خلفية بطاقة أو حدود حول النص.
 * رسائلي تتميز بتلوين خفيف على الاسم فقط، وأزرار الإشراف تظهر عند التحويم.
 * الصور تبقى كروت rounded قابلة للتكبير.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, Pin, PinOff, Trash2, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { timeAgo } from "@/lib/manga";
import { avatarSrc, displayName } from "@/components/community/types";
import CommunityReportDialog from "./CommunityReportDialog";
import { communityColor, type CommunityChatMsg } from "./shared";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface ChatBubbleProps {
  message: CommunityChatMsg;
  mine: boolean;
  /** صاحب الرسالة هو مالك المجتمع */
  authorIsOwner: boolean;
  canModerate: boolean;
  /** هل يظهر زر التبليغ (مسجّل وليست رسالتي) */
  canReport: boolean;
  communitySlug: string;
  communityMangaId: number | null;
  accentColor: string | null;
  actionPending: boolean;
  onPin: (id: number) => void;
  onUnpin: (id: number) => void;
  onDelete: (id: number) => void;
}

export default function ChatBubble({
  message,
  mine,
  authorIsOwner,
  canModerate,
  canReport,
  communitySlug,
  communityMangaId,
  accentColor,
  actionPending,
  onPin,
  onUnpin,
  onDelete,
}: ChatBubbleProps) {
  const { t, lang } = useLanguage();
  const [zoomed, setZoomed] = useState(false);
  const when = timeAgo(message.createdAt, lang);
  const color = communityColor(accentColor);
  const pinned = !!message.pinnedAt;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.3, ease: EASE }}
      className="group flex items-start gap-2 px-1 py-0.5"
    >
      <img
        src={avatarSrc(message.user)}
        alt={displayName(message.user)}
        loading="lazy"
        className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover"
      />

      <div className="min-w-0 flex-1">
        {/* الاسم + شارة الدور + الوقت + الإجراءات — سطر واحد فوق النص */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-app-3">
          <span
            className="font-bold"
            dir="ltr"
            style={{ color: mine ? color : undefined }}
          >
            @{displayName(message.user)}
          </span>
          {authorIsOwner ? (
            <span className="flex items-center gap-0.5 text-[9.5px] font-bold text-warning">
              <Crown size={9} />
              {t("المالك", "Owner")}
            </span>
          ) : (
            message.roleName && (
              <span className="text-[9.5px] font-bold" style={{ color }}>
                {message.roleName}
              </span>
            )
          )}
          {pinned && <Pin size={10} className="text-primary" aria-label={t("مثبتة", "Pinned")} />}
          <span>{when}</span>
          <span className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
            {canModerate && (
              <>
                <button
                  onClick={() => (pinned ? onUnpin(message.id) : onPin(message.id))}
                  disabled={actionPending}
                  aria-label={pinned ? t("إلغاء التثبيت", "Unpin") : t("تثبيت", "Pin")}
                  title={pinned ? t("إلغاء التثبيت", "Unpin") : t("تثبيت", "Pin")}
                  className="btn-icon !h-7 !w-7"
                >
                  {pinned ? <PinOff size={12} /> : <Pin size={12} />}
                </button>
                <button
                  onClick={() => onDelete(message.id)}
                  disabled={actionPending}
                  aria-label={t("حذف الرسالة", "Delete message")}
                  title={t("حذف الرسالة", "Delete message")}
                  className="btn-icon !h-7 !w-7 !text-danger"
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
            {canReport && (
              <CommunityReportDialog
                messageId={message.id}
                communitySlug={communitySlug}
                excerpt={message.content}
                mangaId={communityMangaId}
              />
            )}
          </span>
        </div>

        <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-app">
          {message.content}
        </p>

        {message.imageUrl && (
          <button
            type="button"
            onClick={() => setZoomed(true)}
            className="mt-1.5 block overflow-hidden rounded-xl border border-app"
            aria-label={t("تكبير الصورة", "Zoom image")}
          >
            <img
              src={message.imageUrl}
              alt=""
              loading="lazy"
              className="max-h-60 max-w-full rounded-xl object-cover transition-transform hover:scale-[1.02]"
            />
          </button>
        )}
      </div>

      {/* تكبير الصورة */}
      <AnimatePresence>
        {zoomed && message.imageUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[88] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setZoomed(false)}
            role="dialog"
            aria-modal="true"
          >
            <button
              className="btn-icon absolute end-4 top-4 !text-white"
              onClick={() => setZoomed(false)}
              aria-label={t("إغلاق", "Close")}
            >
              <X size={18} />
            </button>
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              transition={{ duration: 0.25, ease: EASE }}
              src={message.imageUrl}
              alt=""
              className="max-h-[86vh] max-w-full rounded-2xl object-contain"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
