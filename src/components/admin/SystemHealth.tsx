import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertOctagon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Loader2,
  RefreshCw,
  Trash2,
  Undo2,
} from "lucide-react";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { timeAgo } from "@/lib/manga";
import { EASE } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

const PAGE_SIZE = 30;

/* ============ مسح الكاش ============ */
function CachePurgeCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const purge = trpc.admin.purgeCaches.useMutation({
    onSuccess: (r) =>
      toast(
        t(`تم مسح الكاش (${r.pagesCleared} فصل)`, `Caches purged (${r.pagesCleared} chapters)`),
        "success",
      ),
    onError: (e) => toast(e.message, "danger"),
  });

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <h3 className="font-display mb-1 flex items-center gap-2 text-sm font-bold text-app">
        <RefreshCw size={16} className="text-accent" />
        {t("مسح الكاش", "Purge caches")}
      </h3>
      <p className="mb-3 text-xs text-app-2">
        {t(
          "يفرّغ كاش صفحات الفصول وكاش الإعدادات في ذاكرة الخادم فوراً.",
          "Clears the in-memory chapter-pages and site-settings caches immediately.",
        )}
      </p>
      <button
        disabled={purge.isPending}
        onClick={() => purge.mutate()}
        className="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-50"
      >
        {purge.isPending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <RefreshCw size={14} />
        )}
        {t("مسح الآن", "Purge now")}
      </button>
    </motion.section>
  );
}

/* ============ سجل الأخطاء ============ */
type ErrStatus = "open" | "resolved" | "ignored" | "all";
const ERR_STATUSES: ErrStatus[] = ["open", "resolved", "ignored", "all"];

function ErrorLogsCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const [status, setStatus] = useState<ErrStatus>("open");
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const query = trpc.admin.errorLogs.useQuery(
    { page, limit: PAGE_SIZE, status },
    { retry: false },
  );
  const stats = trpc.admin.errorLogStats.useQuery(undefined, { retry: false });

  const refetchAll = () => {
    query.refetch();
    stats.refetch();
  };

  const clear = trpc.admin.clearErrorLogs.useMutation({
    onSuccess: () => {
      toast(t("تم مسح السجل", "Log cleared"));
      setConfirming(false);
      setPage(1);
      refetchAll();
    },
    onError: (e) => {
      toast(e.message, "danger");
      setConfirming(false);
    },
  });
  const updateStatus = trpc.admin.updateErrorStatus.useMutation({
    onSuccess: () => {
      toast(t("تم تحديث الحالة", "Status updated"), "success");
      setBusyId(null);
      refetchAll();
    },
    onError: (e) => {
      toast(e.message, "danger");
      setBusyId(null);
    },
  });

  const statusLabel: Record<ErrStatus, string> = {
    open: t("مفتوح", "Open"),
    resolved: t("محلول", "Resolved"),
    ignored: t("متجاهَل", "Ignored"),
    all: t("الكل", "All"),
  };
  const statusCount: Record<ErrStatus, number> = {
    open: stats.data?.open ?? 0,
    resolved: stats.data?.resolved ?? 0,
    ignored: stats.data?.ignored ?? 0,
    all: stats.data?.total ?? 0,
  };

  const setErrStatus = (id: number, s: "open" | "resolved" | "ignored") => {
    setBusyId(id);
    updateStatus.mutate({ id, status: s });
  };

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.06 }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display flex items-center gap-2 text-sm font-bold text-app">
          <AlertOctagon size={16} className="text-danger" />
          {t("سجل الأخطاء", "Error log")}
          {total > 0 && <span className="text-xs text-app-3">({total})</span>}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={refetchAll}
            className="btn-ghost !p-1.5"
            aria-label={t("تحديث", "Refresh")}
          >
            <RefreshCw size={13} className={query.isRefetching ? "animate-spin" : ""} />
          </button>
          {total > 0 &&
            (confirming ? (
              <div className="flex items-center gap-1">
                <button
                  disabled={clear.isPending}
                  onClick={() => clear.mutate()}
                  className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-50"
                >
                  {clear.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    t("تأكيد المسح", "Confirm")
                  )}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="btn-ghost !px-3 !py-1.5 text-xs"
                >
                  {t("إلغاء", "Cancel")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="btn-ghost !px-3 !py-1.5 text-xs text-danger"
              >
                <Trash2 size={13} />
                {t("مسح", "Clear")}
              </button>
            ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {ERR_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              status === s ? "bg-primary text-primary-ink" : "glass text-app-2 hover:text-app"
            }`}
          >
            {statusLabel[s]}
            <span className="ms-1 text-[10px] opacity-70">({statusCount[s]})</span>
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="skeleton h-40" />
      ) : query.isError ? (
        <ErrorState onRetry={refetchAll} retrying={query.isRefetching} />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-app-3">
          {t("لا توجد أخطاء في هذه الحالة", "No errors in this status")}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((log) => (
            <div key={log.id} className="rounded-xl border border-danger/20 bg-danger/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                      log.level === "client"
                        ? "bg-accent/15 text-accent"
                        : "bg-danger/15 text-danger"
                    }`}
                  >
                    {log.level === "client" ? t("عميل", "client") : t("خادم", "server")}
                  </span>
                  {log.count > 1 && (
                    <span className="rounded-full bg-app-2/10 px-1.5 py-0.5 text-[9px] font-bold text-app-2">
                      ×{log.count}
                    </span>
                  )}
                  {log.path && (
                    <span className="font-mono text-[11px] font-bold text-danger" dir="ltr">
                      {log.path}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-[10px] text-app-3">{timeAgo(log.lastSeenAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-xs text-app" dir="ltr">
                {log.message}
              </p>
              {log.stack && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[10px] text-app-3">
                    {t("الأثر (stack)", "Stack trace")}
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[10px] text-app-3" dir="ltr">
                    {log.stack}
                  </pre>
                </details>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {log.status !== "resolved" && (
                  <button
                    disabled={busyId === log.id}
                    onClick={() => setErrStatus(log.id, "resolved")}
                    className="btn-ghost !px-2.5 !py-1 text-[11px] text-green-500 disabled:opacity-50"
                  >
                    {busyId === log.id ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={12} />
                    )}
                    {t("حلّ", "Resolve")}
                  </button>
                )}
                {log.status !== "ignored" && (
                  <button
                    disabled={busyId === log.id}
                    onClick={() => setErrStatus(log.id, "ignored")}
                    className="btn-ghost !px-2.5 !py-1 text-[11px] text-app-2 disabled:opacity-50"
                  >
                    <EyeOff size={12} />
                    {t("تجاهل", "Ignore")}
                  </button>
                )}
                {log.status !== "open" && (
                  <button
                    disabled={busyId === log.id}
                    onClick={() => setErrStatus(log.id, "open")}
                    className="btn-ghost !px-2.5 !py-1 text-[11px] text-accent disabled:opacity-50"
                  >
                    <Undo2 size={12} />
                    {t("إعادة فتح", "Reopen")}
                  </button>
                )}
              </div>
            </div>
          ))}

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

export default function SystemHealth() {
  return (
    <div className="space-y-4">
      <CachePurgeCard />
      <ErrorLogsCard />
    </div>
  );
}
