import { useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  Save,
  XCircle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { timeAgo } from "@/lib/manga";
import { EASE } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

type JobStatus = "pending" | "running" | "completed" | "failed";
type Filter = "all" | JobStatus;
const STATUSES: JobStatus[] = ["pending", "running", "completed", "failed"];
const PAGE_SIZE = 30;

const pillStyles: Record<JobStatus, string> = {
  pending: "!border-app/20 text-app-3",
  running: "!border-accent/40 text-accent",
  completed: "!border-success/40 text-success",
  failed: "!border-danger/40 text-danger",
};
const statusIcons: Record<JobStatus, typeof Clock> = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
};

/* ============ نافذة الحظر ============ */
function BlackoutCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const query = trpc.admin.getScrapeBlackout.useQuery(undefined, { retry: false });
  const [draft, setDraft] = useState<{
    enabled: boolean;
    startHour: number;
    endHour: number;
  } | null>(null);
  const cfg = draft ?? query.data ?? null;

  const save = trpc.admin.setScrapeBlackout.useMutation({
    onSuccess: () => {
      toast(t("تم حفظ نافذة الحظر", "Blackout saved"));
      setDraft(null);
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  if (!cfg) return null;

  return (
    <div className="glass !rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-app">
          {t("نافذة حظر السكراب التلقائي", "Auto-scrape blackout window")}
        </h3>
        <Switch
          checked={cfg.enabled}
          onCheckedChange={(v) => setDraft({ ...cfg, enabled: v })}
        />
      </div>
      <p className="mb-3 text-xs text-app-2">
        {t(
          "لا تعمل إعادات المحاولة والدورات التلقائية داخل هذه الساعات (0-23). التشغيل اليدوي يتجاوزها.",
          "Retries & automatic runs pause within these hours (0-23). Manual runs override it.",
        )}
      </p>
      {cfg.enabled && (
        <div className="mb-3 flex items-center gap-3">
          <label className="text-xs text-app-2">
            {t("من", "From")}
            <input
              type="number"
              min={0}
              max={23}
              value={cfg.startHour}
              onChange={(e) => setDraft({ ...cfg, startHour: Number(e.target.value) })}
              className="input-glass ms-1 w-16 text-sm"
            />
          </label>
          <label className="text-xs text-app-2">
            {t("إلى", "To")}
            <input
              type="number"
              min={0}
              max={23}
              value={cfg.endHour}
              onChange={(e) => setDraft({ ...cfg, endHour: Number(e.target.value) })}
              className="input-glass ms-1 w-16 text-sm"
            />
          </label>
        </div>
      )}
      <div className="flex justify-end">
        <button
          disabled={save.isPending || !draft}
          onClick={() => draft && save.mutate(draft)}
          className="btn-primary !px-4 !py-2 text-xs disabled:opacity-50"
        >
          {save.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {t("حفظ", "Save")}
        </button>
      </div>
    </div>
  );
}

export default function ScraperJobs() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const utils = trpc.useUtils();

  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);

  const statsQ = trpc.admin.scrapeJobStats.useQuery(undefined, {
    retry: false,
    refetchInterval: 15000,
  });
  const jobsQ = trpc.admin.listScrapeJobs.useQuery(
    { status: filter === "all" ? undefined : filter, page, limit: PAGE_SIZE },
    { retry: false, refetchInterval: 15000 },
  );

  const refresh = () => {
    jobsQ.refetch();
    utils.admin.scrapeJobStats.invalidate();
  };

  const trigger = trpc.admin.triggerScrape.useMutation({
    onSuccess: (r) => {
      toast(t(`بدأ سكراب: ${r.sources.join(", ")}`, `Scrape started: ${r.sources.join(", ")}`));
      setTimeout(refresh, 1200);
    },
    onError: (e) => toast(e.message, "danger"),
  });
  const retry = trpc.admin.retryScrapeJob.useMutation({
    onSuccess: (r) => {
      toast(t(`إعادة تشغيل: ${r.source}`, `Re-running: ${r.source}`));
      setTimeout(refresh, 1200);
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const items = jobsQ.data?.items ?? [];
  const total = jobsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const stats = statsQ.data;

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="space-y-4"
    >
      {/* شريط الإحصاءات */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass !rounded-2xl p-3 text-center">
          <div className="font-display text-xl font-bold text-app tabular-nums">
            {stats?.queueDepth ?? "—"}
          </div>
          <div className="text-[10px] text-app-3">{t("عمق الطابور", "Queue depth")}</div>
        </div>
        <div className="glass !rounded-2xl p-3 text-center">
          <div className="font-display text-xl font-bold text-accent tabular-nums">
            {stats?.running ?? "—"}
          </div>
          <div className="text-[10px] text-app-3">{t("قيد التشغيل", "Running")}</div>
        </div>
        <div className="glass !rounded-2xl p-3 text-center">
          <div className="font-display text-xl font-bold text-app-3 tabular-nums">
            {stats?.pending ?? "—"}
          </div>
          <div className="text-[10px] text-app-3">{t("معلّق", "Pending")}</div>
        </div>
      </div>

      {/* تشغيل يدوي لكل مصدر */}
      {stats && stats.sources.length > 0 && (
        <div className="glass !rounded-2xl p-4">
          <h3 className="font-display mb-2 text-sm font-bold text-app">
            {t("تشغيل يدوي", "Run now")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {stats.sources.map((s) => {
              const totalRuns = (s.successCount ?? 0) + (s.errorCount ?? 0);
              const rate = totalRuns > 0 ? Math.round(((s.successCount ?? 0) / totalRuns) * 100) : null;
              return (
                <button
                  key={s.name}
                  disabled={trigger.isPending}
                  onClick={() => trigger.mutate({ source: s.name })}
                  title={
                    rate === null
                      ? t("لم يُشغَّل بعد", "not run yet")
                      : t(`نجاح ${rate}% · آخر نجاح ${timeAgo(s.lastSuccessAt)}`, `${rate}% ok · last ${timeAgo(s.lastSuccessAt)}`)
                  }
                  className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-app-2 hover:text-app disabled:opacity-50"
                  dir="ltr"
                >
                  <Play size={11} />
                  {s.name}
                  {rate !== null && (
                    <span className={rate >= 90 ? "text-success" : rate >= 50 ? "text-warning" : "text-danger"}>
                      {rate}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <BlackoutCard />

      {/* فلاتر الحالة */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...STATUSES] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => {
              setFilter(f);
              setPage(1);
            }}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              filter === f ? "bg-primary text-primary-ink" : "glass text-app-2 hover:text-app"
            }`}
          >
            {f === "all" ? t("الكل", "All") : f}
          </button>
        ))}
        <button onClick={refresh} className="btn-ghost !p-1.5" aria-label={t("تحديث", "Refresh")}>
          <RefreshCw size={13} className={jobsQ.isRefetching ? "animate-spin" : ""} />
        </button>
      </div>

      {/* سجل الدورات */}
      {jobsQ.isLoading ? (
        <div className="skeleton h-64" />
      ) : jobsQ.isError ? (
        <ErrorState onRetry={() => jobsQ.refetch()} retrying={jobsQ.isRefetching} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t("لا توجد دورات", "No jobs")}
          caption={t("لم تُشغَّل أي دورة سكراب بعد.", "No scrape jobs have run yet.")}
        />
      ) : (
        <div className="space-y-2">
          {items.map((job) => {
            const status = job.status as JobStatus;
            const Icon = statusIcons[status] ?? Clock;
            return (
              <div key={job.id} className="glass flex items-center justify-between gap-2 !rounded-xl p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-app" dir="ltr">
                      {job.source}
                    </span>
                    <span className="text-[10px] text-app-3">
                      {job.trigger}
                      {job.attempt > 1 && ` #${job.attempt}`}
                    </span>
                  </div>
                  <div className="text-xs text-app-2">
                    {status === "completed" || status === "failed" ? (
                      <>
                        {t("استُوردت", "imported")} {job.imported} · {t("فشلت", "failed")} {job.failed}
                      </>
                    ) : (
                      t("قيد التنفيذ…", "in progress…")
                    )}
                    {" · "}
                    {timeAgo(job.createdAt)}
                  </div>
                  {job.error && (
                    <div className="mt-0.5 truncate text-[11px] text-danger" dir="ltr" title={job.error}>
                      {job.error}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`glass-chip flex items-center gap-1 !px-2 !py-0.5 !text-[11px] font-semibold ${pillStyles[status]}`}>
                    <Icon size={11} className={status === "running" ? "animate-spin" : ""} />
                    {status}
                  </span>
                  {status === "failed" && (
                    <button
                      disabled={retry.isPending}
                      onClick={() => retry.mutate({ id: job.id })}
                      className="btn-ghost !p-1.5 disabled:opacity-50"
                      aria-label={t("إعادة", "Retry")}
                      title={t("إعادة تشغيل", "Retry now")}
                    >
                      <RefreshCw size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40"
              >
                <ChevronRight size={14} className="rtl:hidden" />
                <ChevronLeft size={14} className="ltr:hidden" />
              </button>
              <span className="text-xs text-app-2">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40"
              >
                <ChevronLeft size={14} className="rtl:hidden" />
                <ChevronRight size={14} className="ltr:hidden" />
              </button>
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}
