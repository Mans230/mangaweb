import { useState } from "react";
import { AlertTriangle, Info, Sparkles, Wrench, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useLanguage } from "@/components/LanguageProvider";

const DISMISS_KEY = "zeko_dismissed_ann";

function loadDismissed(): number[] {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

const TYPE_STYLE: Record<
  string,
  { icon: typeof Info; wrap: string; accent: string }
> = {
  info: { icon: Info, wrap: "border-accent/40 bg-accent/10", accent: "text-accent" },
  warning: { icon: AlertTriangle, wrap: "border-warning/40 bg-warning/10", accent: "text-warning" },
  maintenance: { icon: Wrench, wrap: "border-danger/40 bg-danger/10", accent: "text-danger" },
  new: { icon: Sparkles, wrap: "border-accent-2/40 bg-accent-2/10", accent: "text-accent-2" },
};

/** بانر الإعلانات النشطة — قابل للإغلاق لكل إعلان على حدة (يُحفظ محلياً). */
export default function AnnouncementBanner() {
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState<number[]>(loadDismissed);
  const q = trpc.announcements.active.useQuery(undefined, {
    retry: false,
    staleTime: 60 * 1000,
  });

  const items = (q.data?.items ?? []).filter((a) => !dismissed.includes(a.id));
  if (!items.length) return null;

  const dismiss = (id: number) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-100)));
    } catch {
      /* ignore quota */
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 pt-3 md:px-6">
      {items.map((a) => {
        const style = TYPE_STYLE[a.type] ?? TYPE_STYLE.info;
        const Icon = style.icon;
        return (
          <div
            key={a.id}
            className={`flex items-start gap-3 rounded-2xl border px-4 py-2.5 ${style.wrap}`}
          >
            <Icon size={16} className={`mt-0.5 shrink-0 ${style.accent}`} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-app">{a.title}</div>
              <div className="text-[12.5px] leading-relaxed text-app-2">{a.body}</div>
              {a.linkUrl && (
                <a
                  href={a.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-1 inline-block text-xs font-bold ${style.accent}`}
                >
                  {a.linkLabel || t("اقرأ المزيد", "Read more")}
                </a>
              )}
            </div>
            <button
              onClick={() => dismiss(a.id)}
              className="btn-icon !h-7 !w-7 shrink-0"
              aria-label={t("إغلاق", "Dismiss")}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
