import { motion } from "framer-motion";
import { BadgeCheck, Check, Crown, Sparkles } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import PromoRedeem from "@/components/PromoRedeem";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

const FEATURES: [string, string][] = [
  ["إزالة الإعلانات نهائياً", "No ads at all"],
  ["كل الثيمات مفتوحة", "All themes unlocked"],
  ["شارة مميّزة بجانب اسمك", "Premium badge next to your name"],
  ["أولوية في طلبات المانجا", "Priority manga requests"],
  ["دعم أسرع", "Faster support"],
];

const PLANS: { key: string; ar: string; en: string; priceAr: string; priceEn: string; highlight?: boolean }[] = [
  { key: "monthly", ar: "شهري", en: "Monthly", priceAr: "قريباً", priceEn: "Soon" },
  { key: "yearly", ar: "سنوي", en: "Yearly", priceAr: "قريباً", priceEn: "Soon", highlight: true },
];

export default function Premium() {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const statusQ = trpc.premium.status.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const active = statusQ.data?.active;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="mx-auto max-w-3xl px-4 py-8 md:px-6"
    >
      <div className="mb-6 text-center">
        <span className="gradient-primary mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl">
          <Crown size={26} />
        </span>
        <h1 className="font-display text-2xl font-bold text-app">{t("زيكو مميّز", "Zeko Premium")}</h1>
        <p className="mt-1 text-sm text-app-3">
          {t("ادعم الموقع واحصل على تجربة أنظف وأسرع.", "Support the site and get a cleaner, faster experience.")}
        </p>
      </div>

      {active && (
        <div className="glass mb-6 flex items-center gap-2 !rounded-2xl p-4 text-sm font-bold text-success">
          <BadgeCheck size={18} />
          {t("اشتراكك المميّز فعّال", "Your premium is active")}
          {statusQ.data?.until && (
            <span className="ms-auto text-xs font-normal text-app-3">
              {t("حتى", "until")} {new Date(statusQ.data.until).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* استبدال كود ترويجي */}
      <div className="mb-6">
        <PromoRedeem onRedeemed={() => statusQ.refetch()} />
      </div>

      {/* المزايا */}
      <div className="glass mb-6 !rounded-2xl p-5">
        <h2 className="font-display mb-3 flex items-center gap-2 text-base font-bold text-app">
          <Sparkles size={16} className="text-accent-2" />
          {t("المزايا", "Features")}
        </h2>
        <ul className="flex flex-col gap-2.5">
          {FEATURES.map(([ar, en]) => (
            <li key={ar} className="flex items-center gap-2.5 text-sm text-app-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success/15 text-success">
                <Check size={12} />
              </span>
              {t(ar, en)}
            </li>
          ))}
        </ul>
      </div>

      {/* الخطط */}
      <div className="grid gap-4 sm:grid-cols-2">
        {PLANS.map((p) => (
          <div
            key={p.key}
            className={`glass flex flex-col items-center gap-3 !rounded-2xl p-6 text-center ${
              p.highlight ? "!border-primary" : ""
            }`}
          >
            {p.highlight && <span className="ed-tag">{t("الأفضل", "Best value")}</span>}
            <h3 className="font-display text-lg font-bold text-app">{t(p.ar, p.en)}</h3>
            <div className="font-display text-2xl font-extrabold text-primary">{t(p.priceAr, p.priceEn)}</div>
            <button
              disabled
              className="btn-primary w-full !py-2.5 text-sm opacity-60"
              title={t("بوابات الدفع قيد الإعداد", "Payment gateways coming soon")}
            >
              {t("الدفع قريباً", "Payment coming soon")}
            </button>
          </div>
        ))}
      </div>

      <p className="mt-4 text-center text-[11px] text-app-3">
        {t(
          "بوابات الدفع قيد الإعداد — سيتم تفعيل الاشتراك قريباً.",
          "Payment gateways are being set up — subscriptions go live soon.",
        )}
      </p>
    </motion.div>
  );
}
