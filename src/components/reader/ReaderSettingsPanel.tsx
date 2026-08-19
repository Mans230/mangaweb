import { AnimatePresence, motion } from "framer-motion";
import { Download, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import type {
  FitMode,
  FlipDirection,
  ImageQuality,
  ReaderBg,
  ReaderSettings,
  ReadingMode,
} from "./store";

interface ReaderSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onOpenDownload: () => void;
}

export default function ReaderSettingsPanel({
  open,
  onClose,
  settings,
  onChange,
  onOpenDownload,
}: ReaderSettingsPanelProps) {
  const { t } = useLanguage();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[70] bg-black/35 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong fixed end-3 top-16 z-[71] w-[min(92vw,340px)] rounded-3xl p-4 md:end-6"
            role="dialog"
            aria-modal="true"
            aria-label={t("إعدادات القارئ", "Reader settings")}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-app">
                {t("إعدادات القارئ", "Reader settings")}
              </h3>
              <button className="btn-icon !h-8 !w-8" onClick={onClose} aria-label={t("إغلاق", "Close")}>
                <X size={15} />
              </button>
            </div>

            <Segment
              label={t("وضع القراءة", "Reading mode")}
              value={settings.mode}
              options={[
                { value: "webtoon" as ReadingMode, label: t("ويب تون", "Webtoon") },
                { value: "paged" as ReadingMode, label: t("صفحة-صفحة", "Paged") },
              ]}
              onSelect={(v) => onChange({ mode: v })}
            />
            <Segment
              label={t("ملاءمة الصفحة", "Fit mode")}
              value={settings.fit}
              options={[
                { value: "width" as FitMode, label: t("عرض كامل", "Fit width") },
                { value: "screen" as FitMode, label: t("ملء الشاشة", "Fit screen") },
              ]}
              onSelect={(v) => onChange({ fit: v })}
            />
            <Segment
              label={t("الخلفية", "Background")}
              value={settings.bg}
              options={[
                { value: "auto" as ReaderBg, label: t("تلقائي", "Auto") },
                { value: "light" as ReaderBg, label: t("فاتح", "Light") },
                { value: "dark" as ReaderBg, label: t("داكن", "Dark") },
                { value: "oled" as ReaderBg, label: "OLED" },
              ]}
              onSelect={(v) => onChange({ bg: v })}
            />
            <Segment
              label={t("اتجاه التقليب", "Page direction")}
              value={settings.direction}
              options={[
                { value: "rtl" as FlipDirection, label: t("يمين ← يسار", "Right → Left") },
                { value: "ltr" as FlipDirection, label: t("يسار ← يمين", "Left → Right") },
              ]}
              onSelect={(v) => onChange({ direction: v })}
            />
            <Segment
              label={t("جودة الصور", "Image quality")}
              value={settings.quality}
              options={[
                { value: "auto" as ImageQuality, label: t("تلقائي", "Auto") },
                { value: "high" as ImageQuality, label: t("عالي", "High") },
                { value: "saver" as ImageQuality, label: t("موفّر", "Saver") },
              ]}
              onSelect={(v) => onChange({ quality: v })}
            />

            {/* عرض الحاوية / الصورة / السطوع / الفجوة — تُحفظ وتنطبق على كل الفصول */}
            <Slider
              label={t("عرض الحاوية", "Container width")}
              value={settings.containerWidth}
              min={400}
              max={1600}
              step={20}
              suffix="px"
              onChange={(v) => onChange({ containerWidth: v })}
            />
            <Slider
              label={t("عرض الصورة", "Image width")}
              value={settings.imageWidth}
              min={40}
              max={100}
              step={5}
              suffix="%"
              onChange={(v) => onChange({ imageWidth: v })}
            />
            <Slider
              label={t("السطوع", "Brightness")}
              value={settings.brightness}
              min={30}
              max={150}
              step={5}
              suffix="%"
              onChange={(v) => onChange({ brightness: v })}
            />
            {settings.mode === "webtoon" && (
              <Slider
                label={t("الفجوة بين الصفحات", "Page gap")}
                value={settings.gap}
                min={0}
                max={40}
                step={2}
                suffix="px"
                onChange={(v) => onChange({ gap: v })}
              />
            )}

            <button
              className="btn-primary mt-4 w-full !py-2.5 text-sm"
              onClick={() => {
                onClose();
                onOpenDownload();
              }}
            >
              <Download size={16} />
              {t("تحميل الفصل (PDF / CBZ)", "Download chapter (PDF / CBZ)")}
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Segment<T extends string>({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onSelect: (v: T) => void;
}) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-xs font-semibold text-app-3">{label}</p>
      <div className="flex flex-wrap gap-1 rounded-2xl border border-app bg-app/40 p-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className={`flex-1 whitespace-nowrap rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all ${
              value === opt.value
                ? "gradient-primary shadow"
                : "text-app-2 hover:text-app"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-semibold text-app-3">{label}</p>
        <span className="glass-chip !py-0.5 text-[11px] font-bold text-app-2 tabular-nums" dir="ltr">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--primary)]"
      />
    </div>
  );
}
