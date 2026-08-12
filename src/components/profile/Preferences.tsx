import { useState } from "react";
import { motion } from "framer-motion";
import { Bell, Globe, Image, Lock, Moon, Monitor, ScrollText, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useLanguage } from "@/components/LanguageProvider";
import AgeGateModal, { isAgeConfirmed } from "@/components/AgeGateModal";
import { useToast } from "@/components/library/toast";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const AGE_KEY = "zeko-age-confirmed";
const UNBLUR_KEY = "zeko-adult-unblur";
const QUALITY_KEY = "zeko-image-quality";
const READMODE_KEY = "zeko-reading-mode";

interface PreferencesProps {
  telegramLinked: boolean;
}

export default function Preferences({ telegramLinked }: PreferencesProps) {
  const { t, lang, toggleLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [adult, setAdult] = useState(isAgeConfirmed);
  const [gateOpen, setGateOpen] = useState(false);
  const [unblur, setUnblur] = useState(() => window.localStorage.getItem(UNBLUR_KEY) === "1");
  const [notif, setNotif] = useState(false);
  const [quality, setQuality] = useState(() => window.localStorage.getItem(QUALITY_KEY) ?? "auto");
  const [readMode, setReadMode] = useState(() => window.localStorage.getItem(READMODE_KEY) ?? "webtoon");

  const themes = [
    { key: "light" as const, label: t("فاتح", "Light"), icon: Sun },
    { key: "dark" as const, label: t("داكن", "Dark"), icon: Moon },
    { key: "auto" as const, label: t("تلقائي", "Auto"), icon: Monitor },
  ];

  const toggleAdult = (next: boolean) => {
    if (next && !isAgeConfirmed()) {
      // تأكيد العمر قبل التفعيل
      setGateOpen(true);
      return;
    }
    setAdult(next);
    if (next) window.localStorage.setItem(AGE_KEY, "1");
    else {
      window.localStorage.removeItem(AGE_KEY);
      setUnblur(false);
      window.localStorage.removeItem(UNBLUR_KEY);
    }
    toast(next ? t("فُعّل محتوى +18", "+18 content enabled") : t("عُطّل محتوى +18", "+18 content disabled"));
  };

  const selectStyle = "input-glass w-full !py-2.5 text-sm sm:w-56";

  return (
    <motion.section
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="glass p-6 md:p-8"
    >
      <h3 className="font-display mb-5 text-base font-bold text-app">{t("الإعدادات", "Preferences")}</h3>

      <div className="flex flex-col divide-y divide-[var(--border)]">
        {/* theme */}
        <PrefRow icon={Sun} title={t("المظهر", "Appearance")} desc={t("يتبدل فوراً ويُحفظ على جهازك.", "Applies instantly and persists on your device.")}>
          <div className="glass flex !rounded-full p-1">
            {themes.map((th) => (
              <button
                key={th.key}
                onClick={() => {
                  // "تلقائي" يتبع تفضيل النظام عبر نفس مزود الثيم
                  const resolved =
                    th.key === "auto"
                      ? window.matchMedia("(prefers-color-scheme: dark)").matches
                        ? "dark"
                        : "light"
                      : th.key;
                  setTheme(resolved);
                  toast(t("تم تغيير المظهر", "Theme changed"));
                }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  theme === (th.key === "auto" ? theme : th.key) && th.key !== "auto"
                    ? "gradient-primary text-white shadow-sm"
                    : "text-app-3 hover:text-app-2"
                }`}
              >
                <th.icon size={13} />
                {th.label}
              </button>
            ))}
          </div>
        </PrefRow>

        {/* language */}
        <PrefRow icon={Globe} title={t("اللغة", "Language")} desc={t("تقلب اتجاه الواجهة بالكامل.", "Flips the whole UI direction.")}>
          <div className="glass flex !rounded-full p-1">
            {(["ar", "en"] as const).map((l) => (
              <button
                key={l}
                onClick={() => {
                  if (lang !== l) {
                    toggleLanguage();
                    toast(t("تم تغيير اللغة", "Language changed"));
                  }
                }}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                  lang === l ? "gradient-primary text-white shadow-sm" : "text-app-3 hover:text-app-2"
                }`}
              >
                {l === "ar" ? "عربي" : "English"}
              </button>
            ))}
          </div>
        </PrefRow>

        {/* +18 */}
        <PrefRow icon={Lock} title={t("محتوى +18", "+18 content")} desc={t("يتطلب تأكيد العمر عند التفعيل.", "Requires age confirmation to enable.")}>
          <Toggle checked={adult} onChange={toggleAdult} />
        </PrefRow>
        {adult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <PrefRow icon={Image} title={t("إظهار الأغلفة بدون تمويه", "Show covers unblurred")} desc={t("لأعمال +18 فقط.", "For +18 titles only.")} compact>
              <Toggle
                checked={unblur}
                onChange={(v) => {
                  setUnblur(v);
                  // TODO(api): اجعل MangaCard يقرأ هذا التفضيل عند الدمج النهائي
                  window.localStorage.setItem(UNBLUR_KEY, v ? "1" : "0");
                  toast(t("حُفظ التفضيل", "Preference saved"));
                }}
              />
            </PrefRow>
          </motion.div>
        )}

        {/* notifications */}
        <PrefRow
          icon={Bell}
          title={t("إشعارات الفصول الجديدة", "New-chapter notifications")}
          desc={telegramLinked ? t("تصلك عبر تليجرام.", "Delivered via Telegram.") : t("تتطلب ربط تليجرام أولاً.", "Requires linking Telegram first.")}
        >
          <Toggle
            checked={notif && telegramLinked}
            disabled={!telegramLinked}
            onChange={(v) => {
              setNotif(v);
              // TODO(api): حفظ تفضيل الإشعارات على الخادم
              toast(v ? t("فُعّلت الإشعارات", "Notifications enabled") : t("عُطّلت الإشعارات", "Notifications disabled"));
            }}
          />
        </PrefRow>

        {/* image quality */}
        <PrefRow icon={Image} title={t("جودة الصور الافتراضية", "Default image quality")} desc={t("في صفحة القراءة.", "In the reader.")}>
          <select
            value={quality}
            onChange={(e) => {
              setQuality(e.target.value);
              window.localStorage.setItem(QUALITY_KEY, e.target.value);
              toast(t("حُفظ التفضيل", "Preference saved"));
            }}
            className={selectStyle}
          >
            <option value="auto">{t("تلقائي", "Auto")}</option>
            <option value="high">{t("عالي", "High")}</option>
            <option value="saver">{t("موفّر", "Data saver")}</option>
          </select>
        </PrefRow>

        {/* reading mode */}
        <PrefRow icon={ScrollText} title={t("وضع القراءة الافتراضي", "Default reading mode")} desc={t("ويبتون متصل أو صفحة-صفحة.", "Continuous webtoon or page-by-page.")}>
          <select
            value={readMode}
            onChange={(e) => {
              setReadMode(e.target.value);
              window.localStorage.setItem(READMODE_KEY, e.target.value);
              toast(t("حُفظ التفضيل", "Preference saved"));
            }}
            className={selectStyle}
          >
            <option value="webtoon">{t("ويبتون", "Webtoon")}</option>
            <option value="paged">{t("صفحة-صفحة", "Page-by-page")}</option>
          </select>
        </PrefRow>
      </div>

      <AgeGateModal
        open={gateOpen}
        onConfirm={() => {
          setGateOpen(false);
          setAdult(true);
          toast(t("فُعّل محتوى +18", "+18 content enabled"));
        }}
        onClose={() => setGateOpen(false)}
      />
    </motion.section>
  );
}

function PrefRow({
  icon: Icon,
  title,
  desc,
  compact,
  children,
}: {
  icon: typeof Sun;
  title: string;
  desc: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-4 ${compact ? "py-3 ps-10" : "py-4"}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft/15 text-primary">
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-app">{title}</div>
        <p className="text-[11.5px] text-app-3">{desc}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** مفتاح تبديل زجاجي متحرك (knob ينزلق بنابض ويملأ المسار بتدرج). */
function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full border border-app transition-colors ${
        checked ? "gradient-primary border-transparent" : "bg-black/10 dark:bg-white/10"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      <motion.span
        animate={{ x: checked ? (document.dir === "rtl" ? -20 : 20) : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className="absolute start-1 top-1 h-5 w-5 rounded-full bg-white shadow-md"
      />
    </button>
  );
}
