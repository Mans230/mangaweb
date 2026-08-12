import { CloudOff, RotateCcw } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

interface ErrorStateProps {
  title?: string;
  caption?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

/** حالة خطأ حقيقية عند تعذّر تحميل البيانات من الـ API مع زر إعادة المحاولة */
export default function ErrorState({ title, caption, onRetry, retrying }: ErrorStateProps) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-danger/15 text-danger">
        <CloudOff size={28} />
      </span>
      <h3 className="font-display mt-5 text-lg font-bold text-app">
        {title ?? t("تعذّر تحميل البيانات", "Couldn't load data")}
      </h3>
      <p className="mt-2 max-w-sm text-sm text-app-3">
        {caption ?? t("حدث خطأ أثناء الاتصال بالخادم. تحقق من اتصالك ثم حاول مجدداً.", "Something went wrong while reaching the server. Check your connection and try again.")}
      </p>
      {onRetry && (
        <button onClick={onRetry} disabled={retrying} className="btn-primary mt-6 !px-6 !py-2.5 text-sm disabled:opacity-60">
          <RotateCcw size={15} className={retrying ? "animate-spin" : ""} />
          {t("إعادة المحاولة", "Retry")}
        </button>
      )}
    </div>
  );
}
