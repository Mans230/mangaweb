/**
 * حقول مشتركة لنماذج المجتمعات: لوحة ألوان جاهزة + حقل صورة (رابط أو رفع من الجهاز عبر catbox).
 */
import { useRef } from "react";
import { Check, ImagePlus, Link2, Loader2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useImageUpload, IMAGE_ACCEPT } from "@/lib/upload";

/** لوحة ألوان جاهزة متناسقة مع الثيم البنفسجي الداكن */
export const COMMUNITY_COLOR_PALETTE = [
  "#7C3AED",
  "#8B5CF6",
  "#A855F7",
  "#C026D3",
  "#E879F9",
  "#6366F1",
  "#3B82F6",
  "#14B8A6",
  "#F59E0B",
  "#F43F5E",
] as const;

export function ColorPalettePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div>
      <span className="text-xs font-semibold text-app-3">
        {t("لون المجتمع", "Community color")}
      </span>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t("لون المجتمع", "Community color")}>
        {COMMUNITY_COLOR_PALETTE.map((c) => {
          const active = value.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={c}
              onClick={() => onChange(c)}
              className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform hover:scale-110 ${
                active ? "border-white shadow-lg" : "border-transparent"
              }`}
              style={{ background: c }}
            >
              {active && <Check size={15} className="text-white drop-shadow" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** حقل صورة: لصق رابط دائماً + زر رفع مباشر عند تفعيل Cloudinary */
export function CommunityImageField({
  value,
  onChange,
  onError,
}: {
  value: string;
  onChange: (url: string) => void;
  onError: (message: string) => void;
}) {
  const { t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useImageUpload();

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onError(t("اختر ملف صورة صالحاً", "Pick a valid image file"));
      return;
    }
    const url = await upload(file);
    if (url) {
      onChange(url);
    } else {
      onError(t("فشل رفع الصورة — جرّب لصق رابط بدلاً من ذلك", "Upload failed — try pasting a URL instead"));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div>
      <span className="text-xs font-semibold text-app-3">
        {t("صورة المجتمع (اختياري)", "Community image (optional)")}
      </span>
      <div className="mt-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Link2
            size={14}
            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-app-3"
          />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            dir="ltr"
            placeholder="https://…"
            className="input-glass w-full !ps-9 text-sm"
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(e) => void pickFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="btn-glass shrink-0 !px-4 !py-2.5 text-xs disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ImagePlus size={14} />
          )}
          {uploading ? t("جارٍ الرفع…", "Uploading…") : t("رفع صورة", "Upload")}
        </button>
      </div>
      {value.trim() && (
        <img
          src={value.trim()}
          alt=""
          className="mt-2 h-16 w-16 rounded-xl border border-app object-cover"
          onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
        />
      )}
    </div>
  );
}
