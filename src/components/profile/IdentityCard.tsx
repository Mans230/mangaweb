import { motion } from "framer-motion";
import { proxyImg } from "@/lib/manga";
import { AtSign, BadgeCheck, CalendarDays, Mail, Pencil } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface IdentityCardProps {
  name: string;
  username: string | null;
  email: string | null;
  avatar: string | null;
  banner: string | null;
  role: string;
  createdAt?: string | Date | null;
}

/**
 * بطاقة الهوية — بيانات حقيقية من auth.me (username/avatarUrl/bannerUrl).
 * التعديل يتم من بطاقة «تخصيص الملف» أسفل الصفحة؛ زر القلم ينزل إليها.
 */
export default function IdentityCard({
  name,
  username,
  email,
  avatar,
  banner,
  role,
  createdAt,
}: IdentityCardProps) {
  const { t, lang } = useLanguage();

  const joinDate = createdAt
    ? new Date(createdAt).toLocaleDateString(lang === "ar" ? "ar" : "en", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="glass gradient-hero-bg relative overflow-hidden p-4 md:p-6"
    >
      {/* صورة الغلاف كخلفية لرأس البطاقة */}
      {banner && (
        <>
          <img
            src={proxyImg(banner)}
            alt=""
            aria-hidden
            className="absolute inset-x-0 top-0 h-40 w-full object-cover"
          />
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/35 via-black/25 to-transparent" />
        </>
      )}

      <div className={`relative flex items-center gap-4 text-start ${banner ? "pt-20" : ""}`}>
        {/* avatar + rotating double ring — مضغوط */}
        <div className="relative h-20 w-20 shrink-0">
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="gradient-primary absolute inset-0 rounded-full opacity-80"
            style={{ padding: 3, WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude" }}
            aria-hidden
          />
          <span className="absolute inset-1 rounded-full border border-app" aria-hidden />
          <img
            src={proxyImg(avatar) || "/placeholder-avatar.svg"}
            alt={name}
            onError={(e) => {
              // لو فشل البروكسي لأي سبب اعرض الصورة المحلية بدل الأيقونة المكسورة
              if (!e.currentTarget.src.endsWith("/placeholder-avatar.svg")) {
                e.currentTarget.src = "/placeholder-avatar.svg";
              }
            }}
            className="absolute inset-1.5 h-[68px] w-[68px] rounded-full border-2 border-app object-cover"
          />
          <a
            href="#profile-customize"
            aria-label={t("تغيير الصورة", "Change avatar")}
            className="glass-strong absolute -bottom-1 -end-1 flex h-7 w-7 items-center justify-center rounded-full text-primary shadow-md transition-transform hover:scale-110"
          >
            <Pencil size={12} />
          </a>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-start gap-2">
            <h1 className="font-display text-xl font-bold text-app md:text-2xl">{name}</h1>
            {/* role badge */}
            <span className="gradient-primary flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold text-white shadow-sm">
              <BadgeCheck size={12} />
              {role === "admin" ? t("مشرف", "Admin") : t("عضو", "Member")}
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-1.5 text-sm text-app-3">
            {username ? (
              <span className="flex items-center justify-start gap-1.5 font-semibold text-primary sm:justify-start">
                <AtSign size={14} />
                <span dir="ltr">@{username}</span>
              </span>
            ) : (
              <a
                href="#profile-customize"
                className="flex items-center justify-start gap-1.5 text-primary transition-colors hover:text-primary-soft sm:justify-start"
              >
                <AtSign size={14} />
                {t("عيّن اسم المستخدم الخاص بك", "Set your username")}
              </a>
            )}
            {email && (
              <span className="flex items-center justify-start gap-1.5 sm:justify-start">
                <Mail size={14} />
                <span dir="ltr">{email}</span>
              </span>
            )}
            {joinDate && (
              <span className="flex items-center justify-start gap-1.5 sm:justify-start">
                <CalendarDays size={14} />
                {t("عضو منذ", "Member since")} {joinDate}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
