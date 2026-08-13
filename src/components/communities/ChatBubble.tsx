/**
 * فقاعة رسالة بأسلوب تيليجرام لشات المجتمع:
 * رسائلي جهة اليسار (بتلوين خفيف)، والآخرون جهة اليمين،
 * مع شارة الدور الملونة بجانب الاسم، صورة قابلة للتكبير،
 * وأزرار إشراف (تثبيت/حذف) عند التحويم + زر تبليغ.
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
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ duration: 0.3, ease: EASE }}
      className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}
    >
      <img
        src={avatarSrc(message.user)}
        alt={displayName(message.user)}
        loading="lazy"
        className="h-8 w-8 shrink-0 rounded-full border border-app object-cover"
      />

      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 sm:max-w-[65%] ${
          mine ? "rounded-es-sm border" : "glass rounded-ee-sm"
        }`}
        style={
          mine
            ? {
                background: `linear-gradient(135deg, ${color}2E, ${color}14)`,
                borderColor: `${color}55`,
              }
            : undefined
        }
      >
        {/* الاسم + شارة الدور + الوقت + الإجراءات */}
        <div className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-app-3">
          <span className="font-bold text-app-2" dir="ltr">
            @{displayName(message.user)}
          </span>
          {authorIsOwner ? (
            <span className="glass-chip !border-warning/40 !px-1.5 !py-0 !text-[9.5px] font-bold text-warning">
              <Crown size={9} />
              {t("المالك", "Owner")}
            </span>
          ) : (
            message.roleName && (
              <span
                className="rounded-full px-1.5 py-px text-[9.5px] font-bold"
                style={{ background: `${color}26`, color }}
              >
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

        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-app">
          {message.content}
        </p>

        {message.imageUrl && (
          <button
            type="button"
            onClick={() => setZoomed(true)}
            className="mt-2 block overflow-hidden rounded-xl border border-app"
            aria-label={t("تكبير الصورة", "Zoom image")}
          >
            <img
              src={message.imageUrl}
              alt=""
              loading="lazy"
              className="max-h-52 max-w-full rounded-xl object-cover transition-transform hover:scale-[1.02]"
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
