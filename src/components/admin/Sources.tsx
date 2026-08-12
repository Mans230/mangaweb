import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { formatNum, timeAgo } from "@/lib/manga";
import { EASE, sourceStatusLabel } from "./adminUtils";
import type { AdminSourceCard, RouterOutputs, SourceStatus } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

type ApiSource = RouterOutputs["admin"]["listSources"][number];

function mapApiSource(s: ApiSource): AdminSourceCard {
  return {
    id: Number(s.id),
    name: s.name,
    baseUrl: s.baseUrl,
    status: s.status,
    lastScan: timeAgo(s.lastScanAt),
    mangaCount: s.mangaCount,
    enabled: s.status !== "blocked",
  };
}

const statusStyles: Record<SourceStatus, string> = {
  active: "!border-success/40 text-success",
  paused: "!border-warning/40 text-warning",
  blocked: "!border-danger/40 text-danger",
};

export default function AdminSources() {
  const { t } = useLanguage();
  const toast = useAdminToast();

  const query = trpc.admin.listSources.useQuery(undefined, { retry: false });
  const updateMutation = trpc.admin.updateSourceStatus.useMutation({
    onSuccess: () => query.refetch(),
  });

  const [overrides, setOverrides] = useState<Record<number, SourceStatus>>({});

  const cards: AdminSourceCard[] = useMemo(() => {
    const base = (query.data ?? []).map(mapApiSource);
    return base.map((c) => {
      const status = overrides[c.id] ?? c.status;
      return { ...c, status, enabled: status !== "blocked" };
    });
  }, [query.data, overrides]);

  const toggleSource = (card: AdminSourceCard, enabled: boolean) => {
    const status: SourceStatus = enabled ? "active" : "blocked";
    setOverrides((prev) => ({ ...prev, [card.id]: status }));
    updateMutation.mutate(
      { id: card.id, status },
      {
        onError: () => {
          // تراجع عن التغيير المحلي عند فشل الـ API
          setOverrides((prev) => {
            const next = { ...prev };
            delete next[card.id];
            return next;
          });
          toast(t("تعذّر تحديث حالة المصدر", "Couldn't update source status"), "danger");
        },
      },
    );
    toast(
      enabled
        ? `${card.name} — ${t("مفعّل", "enabled")}`
        : `${card.name} — ${t("معطّل", "disabled")}`,
      enabled ? "success" : "info",
    );
  };

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-40" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="glass">
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="glass p-10 text-center text-sm text-app-3">
        {t("لا توجد مصادر مضافة بعد", "No sources added yet")}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c, i) => {
        const isCloudflare = c.name === "mangadar";
        return (
          <motion.div
            key={c.id}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: EASE, delay: i * 0.06 }}
            className="glass flex flex-col gap-3 !rounded-2xl p-4 transition-shadow"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-display truncate font-bold text-app" dir="ltr">
                {c.name}
              </span>
              <span className={`glass-chip shrink-0 !px-2.5 !py-0.5 !text-[11px] font-semibold ${statusStyles[c.status]}`}>
                {t(sourceStatusLabel(c.status), c.status)}
              </span>
            </div>

            {isCloudflare && (
              <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-2.5 text-[11px] leading-relaxed text-warning">
                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                {t("محمي بـ Cloudflare — يتطلب إعداداً على السيرفر", "Cloudflare-protected — requires server setup")}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="font-display text-sm font-bold tabular-nums text-app">{formatNum(c.mangaCount)}</div>
                <div className="text-[10px] text-app-3">{t("سلسلة", "series")}</div>
              </div>
              <div>
                <div className="font-display text-sm font-bold text-app">{c.lastScan}</div>
                <div className="text-[10px] text-app-3">{t("آخر فحص", "last scan")}</div>
              </div>
            </div>

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-app/60 pt-3">
              <span className="text-[11px] text-app-3">{t("تفعيل المصدر", "Source enabled")}</span>
              <Switch
                checked={c.enabled}
                onCheckedChange={(v) => toggleSource(c, v)}
                aria-label={t("تفعيل المصدر", "Toggle source")}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
