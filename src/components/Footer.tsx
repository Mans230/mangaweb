import { Link } from "react-router";
import { Send } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

export default function Footer() {
  const { t } = useLanguage();

  const linkCols = [
    {
      title: t("روابط", "Links"),
      items: [
        { to: "/browse", label: t("البحث المتقدم", "Advanced search") },
        { to: "/request", label: t("اطلب مانجا", "Request a manga") },
        { to: "/browse?sources=1", label: t("المصادر", "Sources") },
        { to: "/browse?adult=1", label: t("سياسة +18", "+18 policy") },
      ],
    },
    {
      title: t("تابعنا", "Follow us"),
      items: [],
    },
  ];

  return (
    <footer className="mt-20 border-t border-app pb-24 md:pb-0" style={{ background: "var(--surface)" }}>
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-3 md:px-6">
        {/* About */}
        <div>
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="zeko-manga" className="h-9 w-9 rounded-xl" />
            <span className="font-display gradient-text text-lg font-bold">
              {t("زيكو مانجا", "zeko-manga")}
            </span>
          </Link>
          <p className="mt-4 max-w-xs text-sm text-app-2">
            {t(
              "منصة عربية تجمع لك أحدث فصول المانهوا والمانجا من 8 مصادر — تحديث تلقائي كل 30 دقيقة، بتجربة قراءة زجاجية فريدة.",
              "An Arabic platform aggregating the latest manhwa & manga chapters from 8 sources — auto-refreshed every 30 minutes in a unique glassy reading experience."
            )}
          </p>
        </div>

        {/* Links */}
        <div>
          <h3 className="font-display text-base font-bold text-app">{linkCols[0].title}</h3>
          <ul className="mt-4 space-y-2.5">
            {linkCols[0].items.map((item) => (
              <li key={item.to + item.label}>
                <Link to={item.to} className="text-sm text-app-3 transition-colors hover:text-primary">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Telegram */}
        <div>
          <h3 className="font-display text-base font-bold text-app">{linkCols[1].title}</h3>
          <p className="mt-4 text-sm text-app-2">
            {t("اشترك بقناة الإشعارات ليصلك كل فصل جديد فور صدوره.", "Join the notification channel to get every new chapter the moment it drops.")}
          </p>
          <a
            href="https://t.me/dateranime"
            target="_blank"
            rel="noreferrer"
            className="btn-glass mt-4 !py-2.5 text-sm"
          >
            <Send size={16} />
            {t("اشترك بقناة الإشعارات", "Join the channel")}
          </a>
        </div>
      </div>

      <div className="border-t border-app">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-app-3 sm:flex-row md:px-6">
          <span>© 2026 zeko-manga</span>
          <span>{t("المحتوى مجمّع من مصادر خارجية", "Content aggregated from external sources")}</span>
        </div>
      </div>
    </footer>
  );
}
