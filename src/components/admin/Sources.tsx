import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, RefreshCw, ShieldAlert, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import {
  EASE,
  formatNum,
  mockAdminSources,
  sourceStatusLabel,
  timeAgo,
} from "./adminMock";
import type { AdminSourceCard, RouterOutputs, SourceStatus } from "./adminMock";
import { useAdminToast } from "./AdminToast";

type ApiSource = RouterOutputs["admin"]["listSources"][number];

let mockIdx = 0;
function mapApiSource(s: ApiSource): AdminSourceCard {
  const mock = mockAdminSources[mockIdx++ % mockAdminSources.length];
  return {
    id: Number(s.id),
    name: s.name as AdminSourceCard["name"],
    baseUrl: s.baseUrl,
    status: s.status,
    lastScan: timeAgo(s.lastScanAt),
    mangaCount: s.mangaCount,
    // TODO: زمن الاستجابة وفصول اليوم غير متاحين من الـ API بعد
    chaptersToday: mock.chaptersToday,
    latencyMs: mock.latencyMs,
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

  const [scanning, setScanning] = useState<Set<number>>(new Set());
  const [scanResults, setScanResults] = useState<Record<number, number>>({});
  const [overrides, setOverrides] = useState<Record<number, SourceStatus>>({});
  const [scanInterval, setScanInterval] = useState("30");
  const [rateLimit, setRateLimit] = useState(3);

  // TODO: fallback للـ mock عند تعذّر الـ API
  const cards: AdminSourceCard[] = useMemo(() => {
    mockIdx = 0;
    const base = query.data ? query.data.map(mapApiSource) : mockAdminSources;
    return base.map((c) => {
      const status = overrides[c.id] ?? c.status;
      return { ...c, status, enabled: status !== "blocked" };
    });
  }, [query.data, overrides]);

  const scanOne = (card: AdminSourceCard) => {
    if (card.name === "mangadar") {
      toast(t("mangadar محمي بـ Cloudflare — الفحص اليدوي غير متاح", "Cloudflare-protected source"), "danger");
      return;
    }
    setScanning((prev) => new Set([...prev, card.id]));
    window.setTimeout(() => {
      const found = Math.floor(Math.random() * 18) + 2;
      setScanning((prev) => {
        const next = new Set(prev);
        next.delete(card.id);
        return next;
      });
      setScanResults((prev) => ({ ...prev, [card.id]: found }));
      toast(`+${found} ${t("فصول جديدة من", "new chapters from")} ${card.name}`);
    }, 1800);
  };

  const scanAll = () => {
    cards.filter((c) => c.enabled && c.name !== "mangadar").forEach((c, i) => {
      window.setTimeout(() => scanOne(c), i * 250);
    });
  };

  const toggleSource = (card: AdminSourceCard, enabled: boolean) => {
    const status: SourceStatus = enabled ? "active" : "blocked";
    setOverrides((prev) => ({ ...prev, [card.id]: status }));
    updateMutation.mutate(
      { id: card.id, status },
      {
        onError: () => {
          // TODO: fallback محلي حتى يستقر الـ API
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

  const maxLatency = 1500;

  return (
    <div className="space-y-5">
      {/* إعدادات عامة */}
      <div className="glass flex flex-wrap items-center gap-4 !rounded-2xl p-4">
        <div className="flex items-center gap-2 text-sm">
          <Activity size={16} className="text-primary" />
          <span className="font-semibold text-app">{t("دورية الفحص", "Scan interval")}</span>
          <select value={scanInterval} onChange={(e) => setScanInterval(e.target.value)} className="input-glass !px-3 !py-1.5 text-sm">
            <option value="15">15 {t("د", "min")}</option>
            <option value="30">30 {t("د", "min")}</option>
            <option value="60">60 {t("د", "min")}</option>
          </select>
        </div>
        <div className="flex min-w-52 flex-1 items-center gap-3 text-sm">
          <Zap size={16} className="shrink-0 text-primary" />
          <span className="shrink-0 font-semibold text-app">{t("معدل الطلبات", "Rate limit")}</span>
          <input
            type="range"
            min={1}
            max={5}
            value={rateLimit}
            onChange={(e) => setRateLimit(Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
          />
          <span className="glass-chip shrink-0 !px-2.5 !py-0.5 !text-[11px] tabular-nums" dir="ltr">
            {rateLimit} req/s
          </span>
        </div>
        <button onClick={scanAll} className="btn-primary ms-auto !px-5 !py-2.5 text-sm">
          <RefreshCw size={15} />
          {t("فحص الكل", "Scan all")}
        </button>
      </div>

      {/* بطاقات المصادر */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c, i) => {
          const isScanning = scanning.has(c.id);
          const result = scanResults[c.id];
          const isCloudflare = c.name === "mangadar";
          return (
            <motion.div
              key={c.id}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: EASE, delay: i * 0.06 }}
              className={`glass flex flex-col gap-3 !rounded-2xl p-4 transition-shadow ${
                isScanning ? "ring-2 ring-accent-2/50" : ""
              }`}
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

              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="font-display text-sm font-bold tabular-nums text-app">{formatNum(c.mangaCount)}</div>
                  <div className="text-[10px] text-app-3">{t("سلسلة", "series")}</div>
                </div>
                <div>
                  <div className="font-display text-sm font-bold tabular-nums text-app">{formatNum(c.chaptersToday)}</div>
                  <div className="text-[10px] text-app-3">{t("فصول اليوم", "today")}</div>
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-app">{c.lastScan}</div>
                  <div className="text-[10px] text-app-3">{t("آخر فحص", "last scan")}</div>
                </div>
              </div>

              {/* زمن الاستجابة */}
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-app-3">
                  <span>{t("زمن الاستجابة", "Latency")}</span>
                  <span className="tabular-nums" dir="ltr">{c.latencyMs ? `${c.latencyMs}ms` : "—"}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((c.latencyMs / maxLatency) * 100, 100)}%` }}
                    transition={{ duration: 0.8, ease: EASE, delay: 0.2 + i * 0.06 }}
                    className="h-full rounded-full"
                    style={{
                      background:
                        c.latencyMs > 900
                          ? "linear-gradient(90deg,#FBBF24,#FB7185)"
                          : "linear-gradient(90deg,#7C3AED,#38BDF8)",
                    }}
                  />
                </div>
              </div>

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-app/60 pt-3">
                <Switch
                  checked={c.enabled}
                  onCheckedChange={(v) => toggleSource(c, v)}
                  aria-label={t("تفعيل المصدر", "Toggle source")}
                />
                <div className="flex items-center gap-2">
                  {result !== undefined && !isScanning && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15 }}
                      className="glass-chip !border-success/40 !px-2 !py-0.5 !text-[11px] font-bold text-success"
                    >
                      +{result}
                    </motion.span>
                  )}
                  <button
                    onClick={() => scanOne(c)}
                    disabled={isScanning || !c.enabled}
                    className="btn-glass !px-3.5 !py-1.5 text-xs disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={isScanning ? "animate-spin" : ""} />
                    {t("فحص الآن", "Scan now")}
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
