/**
 * صندوق إرسال رسائل مجتمعات المستخدمين — مدمج: حقل نص (حد 500 حرف)،
 * زر إيموجي واحد، وزر 📷 واحد لرفع صورة من الجهاز مع معاينة قبل الإرسال.
 */
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Loader2, Send, Smile, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useDirectUpload, IMAGE_ACCEPT } from "@/lib/upload";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const MAX_LEN = 500;

const EMOJIS = [
  "😀", "😂", "🤣", "😊", "😍", "🥰", "😎", "🤔",
  "😅", "😭", "😢", "😡", "🥺", "😴", "🤯", "😱",
  "👍", "👎", "👏", "🙏", "💪", "🤝", "✌️", "👋",
  "❤️", "💜", "🔥", "✨", "⭐", "🎉", "💯", "⚡",
  "📚", "📖", "🎌", "☕", "🌙", "👀", "🫡", "💀",
];

interface ChatComposerProps {
  userAvatar?: string | null;
  pending: boolean;
  /** ثواني الوضع البطيء (0 = معطّل) — للعرض فقط */
  slowModeSeconds?: number;
  onSubmit: (content: string, imageUrl: string | null) => void;
}

export default function ChatComposer({
  userAvatar,
  pending,
  slowModeSeconds = 0,
  onSubmit,
}: ChatComposerProps) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // رفع مباشر multipart إلى /api/upload (بدون base64 عبر tRPC)
  const { upload, uploading, error: uploadError } = useDirectUpload("image");

  const clearPendingFile = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
  };

  const submit = async () => {
    const value = text.trim();
    if ((!value && !pendingFile) || pending || uploading) return;
    let finalImage: string | null = null;
    // رفع الصورة المختارة من الجهاز أولاً ثم إرسالها كرابط
    if (pendingFile) {
      finalImage = await upload(pendingFile);
      if (!finalImage) return; // الخطأ معروض تحت المعاينة
      clearPendingFile();
    }
    onSubmit(value || "📷", finalImage);
    setText("");
    setEmojiOpen(false);
  };

  /** إدراج الإيموجي عند موضع المؤشر داخل الـ textarea */
  const insertEmoji = (emoji: string) => {
    const el = areaRef.current;
    if (!el) {
      setText((prev) => (prev + emoji).slice(0, MAX_LEN));
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + emoji + text.slice(end)).slice(0, MAX_LEN);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = Math.min(start + emoji.length, next.length);
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="glass-strong relative !rounded-2xl p-3">
      {slowModeSeconds > 0 && (
        <p className="mb-2 text-center text-[10.5px] font-semibold text-app-3">
          {t(`الوضع البطيء: رسالة كل ${slowModeSeconds} ثانية`, `Slow mode: one message every ${slowModeSeconds}s`)}
        </p>
      )}

      {/* منتقي الإيموجي */}
      <AnimatePresence>
        {emojiOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="glass-strong absolute bottom-full z-20 mb-2 w-[min(92vw,320px)] rounded-2xl p-3 shadow-xl start-0"
          >
            <div className="grid grid-cols-8 gap-1">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => insertEmoji(e)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-colors hover:bg-primary/15"
                  aria-label={e}
                >
                  {e}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* معاينة صورة مرفوعة من الجهاز قبل الإرسال */}
      <AnimatePresence>
        {pendingPreview && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="relative mb-2 w-fit">
              <img
                src={pendingPreview}
                alt=""
                className="max-h-32 rounded-xl border border-app object-contain"
              />
              <button
                type="button"
                onClick={clearPendingFile}
                className="btn-icon absolute -end-2 -top-2 !h-6 !w-6 !bg-black/60 !text-white"
                aria-label={t("إلغاء الصورة", "Cancel image")}
              >
                <X size={12} />
              </button>
            </div>
            {uploadError && (
              <p className="mb-2 text-[11px] font-semibold text-danger">{uploadError}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-end gap-1.5">
        <img
          src={userAvatar ?? "/avatar-1.png"}
          alt=""
          aria-hidden
          className="mb-0.5 h-8 w-8 shrink-0 rounded-full border border-app object-cover"
        />
        <button
          type="button"
          onClick={() => setEmojiOpen((v) => !v)}
          aria-label={t("إيموجي", "Emoji")}
          className={`btn-icon mb-0.5 shrink-0 !h-8 !w-8 ${emojiOpen ? "!text-primary" : ""}`}
        >
          <Smile size={15} />
        </button>
        {/* رفع صورة من الجهاز (GIF مسموح) — زر الكاميرا الوحيد للمرفقات */}
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label={t("إرفاق صورة من جهازك", "Attach a photo from your device")}
          title={t("إرفاق صورة من جهازك", "Attach a photo from your device")}
          className={`btn-icon mb-0.5 shrink-0 !h-8 !w-8 ${pendingFile ? "!text-primary" : ""}`}
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
        </button>
        <div className="relative flex-1">
          <textarea
            ref={areaRef}
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
            placeholder={t("اكتب رسالتك…", "Write your message…")}
            className="input-glass max-h-32 min-h-[42px] w-full resize-none !rounded-2xl !py-2.5 text-sm"
          />
          {text.length > MAX_LEN - 60 && (
            <span className="pointer-events-none absolute bottom-1.5 end-3 text-[10px] tabular-nums text-app-3">
              {text.length}/{MAX_LEN}
            </span>
          )}
        </div>
        <button
          onClick={() => void submit()}
          disabled={pending || uploading || (!text.trim() && !pendingFile)}
          aria-label={t("إرسال", "Send")}
          className="btn-primary shrink-0 !rounded-xl !p-2.5 disabled:opacity-50"
        >
          <Send size={15} className="rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );
}
