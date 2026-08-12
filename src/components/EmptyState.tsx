import { Link } from "react-router";
import { useLanguage } from "./LanguageProvider";

interface EmptyStateProps {
  title?: string;
  caption?: string;
  ctaLabel?: string;
  ctaTo?: string;
}

export default function EmptyState({ title, caption, ctaLabel, ctaTo }: EmptyStateProps) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <img src="/empty-state.svg" alt="" className="w-56 max-w-full opacity-90" />
      <h3 className="font-display mt-6 text-lg font-bold text-app">
        {title ?? t("لا يوجد شيء هنا بعد", "Nothing here yet")}
      </h3>
      <p className="mt-2 max-w-sm text-sm text-app-3">
        {caption ?? t("جرّب البحث أو تصفّح الأقسام الأخرى.", "Try searching or browsing other sections.")}
      </p>
      {ctaLabel && ctaTo && (
        <Link to={ctaTo} className="btn-primary mt-6 !py-2.5 text-sm">
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
