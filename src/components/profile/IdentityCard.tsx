import { useState } from "react";
import { motion } from "framer-motion";
import { AtSign, BadgeCheck, CalendarDays, Check, Mail, Pencil, Upload } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useToast } from "@/components/library/toast";
import GlassModal from "@/components/library/GlassModal";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const AVATARS = ["/avatar-1.png", "/avatar-2.png", "/avatar-3.png", "/avatar-4.png"];
const AVATAR_KEY = "zeko-avatar";
const NAME_KEY = "zeko-display-name";

interface IdentityCardProps {
  name: string;
  email: string | null;
  avatar: string | null;
  role: string;
  createdAt?: string | Date | null;
}

export default function IdentityCard({ name, email, avatar, role, createdAt }: IdentityCardProps) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();

  const [currentAvatar, setCurrentAvatar] = useState(
    () => window.localStorage.getItem(AVATAR_KEY) ?? avatar ?? "/avatar-1.png",
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(
    () => window.localStorage.getItem(NAME_KEY) ?? name,
  );

  const joinDate = createdAt
    ? new Date(createdAt).toLocaleDateString(lang === "ar" ? "ar" : "en", {
        month: "long",
        year: "numeric",
      })
    : null;

  const saveName = () => {
    setEditingName(false);
    // TODO(api): ربط تحديث الاسم بـ mutation عند توفر endpoint لتحديث الملف
    window.localStorage.setItem(NAME_KEY, displayName);
    toast(t("تم تحديث الاسم", "Name updated"));
  };

  const pickAvatar = (src: string) => {
    setCurrentAvatar(src);
    // TODO(api): ربط تحديث الصورة بـ mutation عند توفر endpoint
    window.localStorage.setItem(AVATAR_KEY, src);
    setPickerOpen(false);
    toast(t("تم تحديث الصورة", "Avatar updated"));
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="glass gradient-hero-bg relative overflow-hidden p-6 md:p-8"
    >
      <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-start">
        {/* avatar + rotating double ring */}
        <div className="relative h-28 w-28 shrink-0">
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="gradient-primary absolute inset-0 rounded-full opacity-80"
            style={{ padding: 3, WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude" }}
            aria-hidden
          />
          <span className="absolute inset-1.5 rounded-full border border-app" aria-hidden />
          <img
            src={currentAvatar}
            alt={displayName}
            className="absolute inset-2.5 h-[92px] w-[92px] rounded-full border-2 border-app object-cover"
          />
          <button
            onClick={() => setPickerOpen(true)}
            aria-label={t("تغيير الصورة", "Change avatar")}
            className="glass-strong absolute -bottom-1 -end-1 flex h-9 w-9 items-center justify-center rounded-full text-primary shadow-md transition-transform hover:scale-110"
          >
            <Pencil size={14} />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {editingName ? (
              <input
                autoFocus
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                className="input-glass !py-1.5 text-lg font-bold"
                maxLength={40}
              />
            ) : (
              <h1 className="font-display text-2xl font-bold text-app md:text-3xl">{displayName}</h1>
            )}
            {!editingName && (
              <button
                onClick={() => setEditingName(true)}
                aria-label={t("تعديل الاسم", "Edit name")}
                className="btn-icon !h-8 !w-8"
              >
                <Pencil size={13} />
              </button>
            )}
            {/* role badge */}
            <span className="gradient-primary flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold text-white shadow-sm">
              <BadgeCheck size={12} />
              {role === "admin" ? t("مشرف", "Admin") : t("عضو", "Member")}
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-1.5 text-sm text-app-3">
            <span className="flex items-center justify-center gap-1.5 sm:justify-start">
              <AtSign size={14} />
              <span dir="ltr">@{(displayName || "zeko").replace(/\s+/g, "_").toLowerCase()}</span>
            </span>
            {email && (
              <span className="flex items-center justify-center gap-1.5 sm:justify-start">
                <Mail size={14} />
                <span dir="ltr">{email}</span>
              </span>
            )}
            {joinDate && (
              <span className="flex items-center justify-center gap-1.5 sm:justify-start">
                <CalendarDays size={14} />
                {t("عضو منذ", "Member since")} {joinDate}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* avatar picker modal */}
      <GlassModal open={pickerOpen} onClose={() => setPickerOpen(false)} title={t("اختر صورتك", "Pick your avatar")}>
        <div className="grid grid-cols-4 gap-3">
          {AVATARS.map((src, i) => (
            <motion.button
              key={src}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: EASE, delay: i * 0.06 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => pickAvatar(src)}
              className={`relative overflow-hidden rounded-2xl border-2 transition-colors ${
                currentAvatar === src ? "border-primary" : "border-app hover:border-[var(--border-glow)]"
              }`}
            >
              <img src={src} alt={`${t("صورة", "Avatar")} ${i + 1}`} className="aspect-square w-full object-cover" />
              {currentAvatar === src && (
                <span className="gradient-primary absolute end-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-white">
                  <Check size={12} />
                </span>
              )}
            </motion.button>
          ))}
        </div>
        <button
          onClick={() => toast(t("رفع الصور قادم قريباً", "Uploads coming soon"), { kind: "info" })}
          className="btn-glass mt-4 w-full !py-2.5 text-sm"
        >
          <Upload size={15} />
          {t("رفع صورة من جهازك", "Upload from device")}
        </button>
      </GlassModal>
    </motion.section>
  );
}
