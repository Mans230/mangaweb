/**
 * صندوق إرسال رسائل مجتمعات المستخدمين — حد 500 حرف، رابط صورة اختياري،
 * ومنتقي إيموجي مدمج يُدرج عند موضع المؤشر.
 */
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ImagePlus, Send, Smile, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

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
  const [imageUrl, setImageUrl] = useState("");
  const [imageOpen, setImageOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const value = text.trim();
    if (!value || pending) return;
    onSubmit(value, imageUrl.trim() || null);
    setText("");
    setImageUrl("");
    setImageOpen(false);
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

      {/* حقل رابط الصورة */}
      <AnimatePresence>
        {imageOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mb-2 flex items-center gap-2">
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                dir="ltr"
                placeholder={t("رابط صورة (اختياري) https://…", "Image URL (optional) https://…")}
                className="input-glass flex-1 !rounded-xl !py-2 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  setImageOpen(false);
                  setImageUrl("");
                }}
                className="btn-icon !h-7 !w-7"
                aria-label={t("إزالة الصورة", "Remove image")}
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
        <button
          type="button"
          onClick={() => setEmojiOpen((v) => !v)}
          aria-label={t("إيموجي", "Emoji")}
          className={`btn-icon mb-0.5 shrink-0 !h-9 !w-9 ${emojiOpen ? "!text-primary" : ""}`}
        >
          <Smile size={16} />
        </button>
        <button
          type="button"
          onClick={() => setImageOpen((v) => !v)}
          aria-label={t("إرفاق صورة", "Attach image")}
          className={`btn-icon mb-0.5 shrink-0 !h-9 !w-9 ${imageOpen ? "!text-primary" : ""}`}
        >
          <ImagePlus size={16} />
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
