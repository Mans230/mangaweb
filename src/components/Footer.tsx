import { Link } from "react-router";
import { BookOpen, Send, ShieldAlert, Users } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { useUiToggles } from "@/lib/uiToggles";

const NOTIF_CHANNEL = "https://t.me/dateranime";

export default function Footer() {
  const { t } = useLanguage();
  const { communityGroupUrl } = useUiToggles();

  const links = [
    { to: "/request", label: t("اطلب مانجا", "Request") },
    { to: "/support", label: t("الدعم", "Support") },
    { to: "/announcements", label: t("الإعلانات", "News") },
    { to: "/browse?adult=1", label: t("سياسة +18", "+18") },
    { to: "/support?topic=dmca", label: t("DMCA", "DMCA") },
    { to: "/support?topic=abuse", label: t("إبلاغ إساءة", "Abuse report") },
  ];

  return (
    <footer
      className="mt-16 border-t border-app pb-24 md:pb-0"
      style={{ background: "var(--surface)" }}
    >
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[1.4fr_1fr_1fr] md:items-start md:gap-10 md:px-6">
        {/* العلامة + التعريف */}
        <div>
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-app bg-[var(--surface-strong)] text-primary">
              <BookOpen size={18} strokeWidth={2.4} />
            </span>
            <span className="font-display text-lg font-bold text-app">
              {t("زيكو مانجا", "zeko-manga")}
            </span>
          </Link>
          <p className="mt-3 max-w-xs text-[13px] leading-6 text-app-2">
            {t(
              "منصة عربية تجمع أحدث فصول المانهوا والمانجا من عدة مصادر — تحديث تلقائي وتجربة قراءة نظيفة.",
              "Arabic platform aggregating the latest manhwa & manga from multiple sources — auto-updated, clean reading.",
            )}
          </p>
        </div>

        {/* تابعنا — زرّان جنب بعض */}
        <div>
          <h3 className="font-display mb-3 text-sm font-bold text-app">{t("تابعنا", "Follow us")}</h3>
          <div className="flex flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
            <a
              href={NOTIF_CHANNEL}
              target="_blank"
              rel="noreferrer"
              className="btn-primary !px-3.5 !py-2 text-[13px]"
            >
              <Send size={15} />
              {t("قناة الإشعارات", "Notifications")}
            </a>
            <a
              href={communityGroupUrl || NOTIF_CHANNEL}
              target="_blank"
              rel="noreferrer"
              className="btn-glass !px-3.5 !py-2 text-[13px]"
            >
              <Users size={15} />
              {t("جروب التليجرام", "Telegram group")}
            </a>
          </div>
        </div>

        {/* روابط — شبكة مضغوطة 3×2 */}
        <div>
          <h3 className="font-display mb-3 text-sm font-bold text-app">{t("روابط", "Links")}</h3>
          <div className="grid grid-cols-3 gap-x-3 gap-y-2">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="inline-flex items-center gap-1 truncate text-[12.5px] text-app-3 transition-colors hover:text-primary"
              >
                {l.label === "DMCA" || l.label === "إبلاغ إساءة" ? (
                  <ShieldAlert size={12} className="shrink-0" />
                ) : null}
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
