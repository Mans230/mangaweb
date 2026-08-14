/**
 * صندوق إرسال رسائل مجتمعات المستخدمين — حد 500 حرف، رابط صورة اختياري،
 * ومنتقي إيموجي مدمج يُدرج عند موضع المؤشر.
 */
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, ImagePlus, Loader2, Send, Smile, Upload, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useImageUpload, IMAGE_ACCEPT } from "@/lib/upload";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const MAX_LEN = 500;

const EMOJIS = [
  "😀", "😂", "🤣", "😊", "😍", "🥰", "😎", "🤔",
  "😅", "😭", "😢", "😡", "🥺", "😴", "🤯", "😱",
  "👍", "👎", "👏", "🙏", "💪", "🤝", "✌️", "👋",
  "❤️", "💜", "🔥", "✨", "⭐", "🎉", "💯", "⚡",
  "📚", "📖", "🎌", "☕", "🌙", "👀", "🫡", "💀",
];

/** ستيكرز جاهزة (روابط ثابتة) — تُرسل كصورة */
const STICKERS = [
  "https://files.catbox.moe/2h7l0k.png",
  "https://files.catbox.moe/8zq1x9.png",
  "https://files.catbox.moe/4m3p2s.png",
  "https://files.catbox.moe/9w8e7r.png",
  "https://files.catbox.moe/6t5y4u.png",
  "https://files.catbox.moe/1a2b3c.png",
  "https://files.catbox.moe/7d8e9f.png",
  "https://files.catbox.moe/3g4h5i.png",
] as const;

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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [stickerTab, setStickerTab] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, uploading, error: uploadError } = useImageUpload();

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
    let finalImage = imageUrl.trim() || null;
    // رفع الصورة المختارة من الجهاز أولاً ثم إرسالها كرابط
    if (pendingFile) {
      finalImage = await upload(pendingFile);
      if (!finalImage) return; // الخطأ معروض تحت المعاينة
      clearPendingFile();
    }
    onSubmit(value || "📷", finalImage);
    setText("");
    setImageUrl("");
    setImageOpen(false);
    setEmojiOpen(false);
  };

  /** ستيكر = رسالة بصورة جاهزة بلا نص */
  const sendSticker = (url: string) => {
    if (pending || uploading) return;
    onSubmit("✨", url);
    setEmojiOpen(false);
    setStickerTab(false);
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
            {/* تبويبا إيموجي/ستيكرز */}
            <div className="mb-2 flex gap-1 rounded-full bg-black/10 p-1 dark:bg-white/10">
              {([false, true] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setStickerTab(v)}
                  className={`flex-1 rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                    stickerTab === v ? "gradient-primary text-white" : "text-app-3 hover:text-app-2"
                  }`}
                >
                  {v ? t("ستيكرز", "Stickers") : t("إيموجي", "Emoji")}
                </button>
              ))}
            </div>
            {stickerTab ? (
              <div className="grid grid-cols-4 gap-2">
                {STICKERS.map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => sendSticker(url)}
                    className="flex items-center justify-center rounded-xl p-1 transition-colors hover:bg-primary/15"
                    aria-label={t("إرسال ستيكر", "Send sticker")}
                  >
                    <img src={url} alt="" loading="lazy" className="h-14 w-14 rounded-lg object-contain" />
                  </button>
                ))}
              </div>
            ) : (
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
            )}
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
          aria-label={t("إرفاق صورة برابط", "Attach image by URL")}
          title={t("إرفاق صورة برابط", "Attach image by URL")}
          className={`btn-icon mb-0.5 shrink-0 !h-9 !w-9 ${imageOpen ? "!text-primary" : ""}`}
        >
          <ImagePlus size={16} />
        </button>
        {/* رفع صورة من الجهاز (GIF مسموح) */}
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
          aria-label={t("رفع صورة من جهازك", "Upload image from device")}
          title={t("رفع صورة من جهازك", "Upload image from device")}
          className={`btn-icon mb-0.5 shrink-0 !h-9 !w-9 ${pendingFile ? "!text-primary" : ""}`}
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        </button>
        <a
          href="https://catbox.moe"
          target="_blank"
          rel="noreferrer"
          aria-label="catbox.moe"
          title="catbox.moe"
          className="btn-icon mb-0.5 shrink-0 !h-9 !w-9 !text-[10px] font-bold"
        >
          <ExternalLink size={13} />
        </a>
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
          className="btn-primary shrink-0 !rounded-2xl !p-3 disabled:opacity-50"
        >
          <Send size={16} className="rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );
}
