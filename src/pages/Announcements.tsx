import { motion } from "framer-motion";
import { AlertTriangle, Info, Megaphone, Sparkles, Wrench } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const TYPE_META: Record<string, { icon: typeof Info; accent: string; ar: string; en: string }> = {
  info: { icon: Info, accent: "text-accent", ar: "معلومة", en: "Info" },
  warning: { icon: AlertTriangle, accent: "text-warning", ar: "تحذير", en: "Warning" },
  maintenance: { icon: Wrench, accent: "text-danger", ar: "صيانة", en: "Maintenance" },
  new: { icon: Sparkles, accent: "text-accent-2", ar: "جديد", en: "New" },
};

export default function Announcements() {
  const { t, lang } = useLanguage();
  const q = trpc.announcements.active.useQuery(undefined, { retry: false });
  const items = q.data?.items ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="mx-auto max-w-3xl px-4 py-8 md:px-6"
    >
      <h1 className="font-display mb-6 flex items-center gap-2 text-2xl font-bold text-app">
        <Megaphone size={22} className="text-primary" />
        {t("إعلانات الموقع", "Announcements")}
      </h1>

      {q.isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24 w-full !rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="glass !rounded-2xl px-4 py-10 text-center text-sm text-app-3">
          {t("لا توجد إعلانات حالياً.", "No announcements right now.")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((a) => {
            const meta = TYPE_META[a.type] ?? TYPE_META.info;
            const Icon = meta.icon;
            return (
              <div key={a.id} className="glass !rounded-2xl p-4 md:p-5">
                <div className="mb-1.5 flex items-center gap-2">
                  <Icon size={16} className={meta.accent} />
                  <span className={`text-[11px] font-bold ${meta.accent}`}>
                    {t(meta.ar, meta.en)}
                  </span>
                  <span className="ms-auto text-[11px] text-app-3">
                    {new Date(a.createdAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}
                  </span>
                </div>
                <div className="text-base font-bold text-app">{a.title}</div>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-app-2">
                  {a.body}
                </p>
                {a.linkUrl && (
                  <a
                    href={a.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-2 inline-block text-sm font-bold ${meta.accent}`}
                  >
                    {a.linkLabel || t("اقرأ المزيد", "Read more")}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
