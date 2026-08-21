import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { formatNum, timeAgo } from "@/lib/manga";
import { EASE, sourceStatusLabel } from "./adminUtils";
import type { RouterOutputs, SourceStatus } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

type ApiSource = RouterOutputs["admin"]["listSources"][number];

const statusStyles: Record<SourceStatus, string> = {
  active: "!border-success/40 text-success",
  paused: "!border-warning/40 text-warning",
  blocked: "!border-danger/40 text-danger",
};

/** يحسب نسبة الخطأ ولون شارة الصحّة من العدّادات التراكمية */
function health(s: ApiSource): {
  rate: number | null;
  tone: "ok" | "warn" | "bad" | "idle";
} {
  const total = (s.successCount ?? 0) + (s.errorCount ?? 0);
  if (total === 0) return { rate: null, tone: "idle" };
  const rate = (s.errorCount ?? 0) / total;
  const tone = rate === 0 ? "ok" : rate < 0.25 ? "warn" : "bad";
  return { rate, tone };
}

const toneStyles: Record<"ok" | "warn" | "bad" | "idle", string> = {
  ok: "!border-success/40 text-success",
  warn: "!border-warning/40 text-warning",
  bad: "!border-danger/40 text-danger",
  idle: "!border-app/20 text-app-3",
};

export default function AdminSources() {
  const { t } = useLanguage();
  const toast = useAdminToast();

  const query = trpc.admin.listSources.useQuery(undefined, { retry: false });
  const updateStatus = trpc.admin.updateSourceStatus.useMutation({
    onSuccess: () => query.refetch(),
  });
  const updateConfig = trpc.admin.updateSourceConfig.useMutation({
    onSuccess: () => query.refetch(),
    onError: (e) => toast(e.message, "danger"),
  });

  const [statusOverrides, setStatusOverrides] = useState<Record<number, SourceStatus>>({});
  const [priorityDraft, setPriorityDraft] = useState<Record<number, string>>({});

  const rows: ApiSource[] = useMemo(() => query.data ?? [], [query.data]);

  const toggleSource = (s: ApiSource, enabled: boolean) => {
    const id = Number(s.id);
    const status: SourceStatus = enabled ? "active" : "blocked";
    setStatusOverrides((prev) => ({ ...prev, [id]: status }));
    updateStatus.mutate(
      { id, status },
      {
        onError: () => {
          setStatusOverrides((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          toast(t("تعذّر تحديث حالة المصدر", "Couldn't update source status"), "danger");
        },
      },
    );
    toast(
      enabled ? `${s.name} — ${t("مفعّل", "enabled")}` : `${s.name} — ${t("معطّل", "disabled")}`,
      enabled ? "success" : "info",
    );
  };

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton h-52" />
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

  if (rows.length === 0) {
    return (
      <div className="glass p-10 text-center text-sm text-app-3">
        {t("لا توجد مصادر مضافة بعد", "No sources added yet")}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((s, i) => {
        const id = Number(s.id);
        const status = statusOverrides[id] ?? (s.status as SourceStatus);
        const enabled = status !== "blocked";
        const isCloudflare = s.name === "mangadar";
        const h = health(s);
        const priorityValue = priorityDraft[id] ?? String(s.priority ?? 0);
        return (
          <motion.div
            key={id}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: EASE, delay: i * 0.05 }}
            className="glass flex flex-col gap-3 !rounded-2xl p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-display truncate font-bold text-app" dir="ltr">
                {s.name}
              </span>
              <span className={`glass-chip shrink-0 !px-2.5 !py-0.5 !text-[11px] font-semibold ${statusStyles[status]}`}>
                {t(sourceStatusLabel(status), status)}
              </span>
            </div>

            {isCloudflare && (
              <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-2.5 text-[11px] leading-relaxed text-warning">
                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                {t("محمي بـ Cloudflare — يتطلب إعداداً على السيرفر", "Cloudflare-protected — requires server setup")}
              </div>
            )}

            {/* صحّة السكرابر */}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-app/10 p-2.5">
              <span className="flex items-center gap-1.5 text-[11px] text-app-3">
                <Activity size={13} /> {t("الصحّة", "Health")}
              </span>
              <span className={`glass-chip flex items-center gap-1 !px-2 !py-0.5 !text-[11px] font-semibold ${toneStyles[h.tone]}`}>
                {h.tone === "ok" ? (
                  <CheckCircle2 size={11} />
                ) : h.tone === "idle" ? null : (
                  <AlertTriangle size={11} />
                )}
                {h.rate === null
                  ? t("لم يُشغَّل", "not run")
                  : `${Math.round(h.rate * 100)}% ${t("خطأ", "err")}`}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="font-display text-sm font-bold tabular-nums text-app">{formatNum(s.mangaCount)}</div>
                <div className="text-[10px] text-app-3">{t("سلسلة", "series")}</div>
              </div>
              <div>
                <div className="font-display text-sm font-bold text-success tabular-nums">{formatNum(s.successCount ?? 0)}</div>
                <div className="text-[10px] text-app-3">{t("نجاح", "ok")}</div>
              </div>
              <div>
                <div className="font-display text-sm font-bold text-danger tabular-nums">{formatNum(s.errorCount ?? 0)}</div>
                <div className="text-[10px] text-app-3">{t("خطأ", "errors")}</div>
              </div>
            </div>

            <div className="text-[11px] text-app-3">
              {t("آخر نجاح", "Last success")}: <span className="text-app">{timeAgo(s.lastSuccessAt)}</span>
            </div>
            {s.lastError && (
              <div className="truncate rounded-lg border border-danger/30 bg-danger/5 px-2 py-1 text-[10px] text-danger" dir="ltr" title={s.lastError}>
                {s.lastError}
              </div>
            )}

            {/* أولوية + سكراب تلقائي */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-app-3">{t("الأولوية", "Priority")}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={priorityValue}
                onChange={(e) => setPriorityDraft((prev) => ({ ...prev, [id]: e.target.value }))}
                onBlur={() => {
                  const next = Number(priorityValue);
                  if (Number.isFinite(next) && next !== (s.priority ?? 0)) {
                    updateConfig.mutate({ id, priority: Math.max(0, Math.min(100, next)) });
                  }
                }}
                className="input-glass w-16 text-center text-sm"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-app-3">{t("سكراب تلقائي", "Auto scrape")}</span>
              <Switch
                checked={s.autoScrape ?? true}
                onCheckedChange={(v) => updateConfig.mutate({ id, autoScrape: v })}
                aria-label={t("سكراب تلقائي", "Auto scrape")}
              />
            </div>

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-app/60 pt-3">
              <span className="text-[11px] text-app-3">{t("تفعيل المصدر", "Source enabled")}</span>
              <Switch
                checked={enabled}
                onCheckedChange={(v) => toggleSource(s, v)}
                aria-label={t("تفعيل المصدر", "Toggle source")}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
