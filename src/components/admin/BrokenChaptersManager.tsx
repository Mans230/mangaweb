import { useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Loader2,
  RefreshCw,
  Undo2,
  Wrench,
  XCircle,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { timeAgo } from "@/lib/manga";
import { EASE } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

type Status = "pending" | "resolved" | "dismissed";
const STATUSES: Status[] = ["pending", "resolved", "dismissed"];
const PAGE_SIZE = 20;

export default function BrokenChaptersManager() {
  const { t } = useLanguage();
  const toast = useAdminToast();

  const [status, setStatus] = useState<Status>("pending");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<number | null>(null);

  const query = trpc.admin.listBrokenChapters.useQuery(
    { status, page, limit: PAGE_SIZE },
    { retry: false },
  );

  const statusLabel: Record<Status, string> = {
    pending: t("معلّق", "Pending"),
    resolved: t("محلول", "Resolved"),
    dismissed: t("مرفوض", "Dismissed"),
  };

  const onError = (e: { message: string }) => {
    toast(e.message, "danger");
    setBusyId(null);
  };
  const done = (msg: string) => {
    toast(msg, "success");
    setBusyId(null);
    query.refetch();
  };

  const rescrape = trpc.admin.rescrapeChapter.useMutation({
    onSuccess: (r) => done(t(`أُعيد سحب ${r.pageCount} صفحة`, `Re-fetched ${r.pageCount} pages`)),
    onError,
  });
  const hide = trpc.admin.hideChapter.useMutation({
    onSuccess: () => done(t("تم إخفاء الفصل", "Chapter hidden")),
    onError,
  });
  const unhide = trpc.admin.unhideChapter.useMutation({
    onSuccess: () => done(t("تم إظهار الفصل", "Chapter shown")),
    onError,
  });
  const resolve = trpc.reports.resolveReport.useMutation({
    onSuccess: () => done(t("تم تحديث التقرير", "Report updated")),
    onError,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const anyBusy = rescrape.isPending || hide.isPending || unhide.isPending || resolve.isPending;

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="space-y-4"
    >
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
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
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="skeleton h-64" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t("لا توجد فصول معطوبة", "No broken chapters")}
          caption={t("طابور البلاغات فارغ.", "The report queue is empty.")}
        />
      ) : (
        <div className="space-y-3">
          {items.map((row) => {
            const rep = row.report;
            const ch = row.chapter;
            const busy = busyId === rep.id && anyBusy;
            return (
              <div key={rep.id} className="glass !rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display text-sm font-bold text-app">
                      {row.manga?.title ?? t("مانجا محذوفة", "deleted manga")}
                      {ch && (
                        <span className="text-app-2">
                          {" "}
                          · {t("الفصل", "Ch.")} {ch.number}
                        </span>
                      )}
                    </div>
                    {ch?.hiddenAt && (
                      <span className="text-[11px] font-bold text-warning">
                        {t("مخفي حالياً", "currently hidden")}
                      </span>
                    )}
                    {rep.details && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-app-2">{rep.details}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-app-3">
                      {timeAgo(rep.createdAt)}
                      {ch && ` · ${ch.pageCount} ${t("صفحة", "pages")}`}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {ch && (
                    <>
                      <button
                        disabled={anyBusy}
                        onClick={() => {
                          setBusyId(rep.id);
                          rescrape.mutate({ id: ch.id });
                        }}
                        className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-50"
                      >
                        {busy && rescrape.isPending ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <RefreshCw size={13} />
                        )}
                        {t("إعادة سحب", "Re-fetch")}
                      </button>
                      {ch.hiddenAt ? (
                        <button
                          disabled={anyBusy}
                          onClick={() => {
                            setBusyId(rep.id);
                            unhide.mutate({ id: ch.id });
                          }}
                          className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-50"
                        >
                          <Undo2 size={13} />
                          {t("إظهار", "Unhide")}
                        </button>
                      ) : (
                        <button
                          disabled={anyBusy}
                          onClick={() => {
                            setBusyId(rep.id);
                            hide.mutate({ id: ch.id });
                          }}
                          className="btn-ghost !px-3 !py-1.5 text-xs text-warning disabled:opacity-50"
                        >
                          <EyeOff size={13} />
                          {t("إخفاء", "Hide")}
                        </button>
                      )}
                    </>
                  )}
                  {rep.status === "pending" && (
                    <>
                      <button
                        disabled={anyBusy}
                        onClick={() => {
                          setBusyId(rep.id);
                          resolve.mutate({ id: rep.id, status: "resolved" });
                        }}
                        className="btn-ghost !px-3 !py-1.5 text-xs text-success disabled:opacity-50"
                      >
                        <CheckCircle2 size={13} />
                        {t("حل", "Resolve")}
                      </button>
                      <button
                        disabled={anyBusy}
                        onClick={() => {
                          setBusyId(rep.id);
                          resolve.mutate({ id: rep.id, status: "dismissed" });
                        }}
                        className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-50"
                      >
                        <XCircle size={13} />
                        {t("رفض", "Dismiss")}
                      </button>
                    </>
                  )}
                  {ch && row.manga && (
                    <a
                      href={`/manga/${row.manga.slug}`}
                      className="btn-ghost !px-3 !py-1.5 text-xs"
                    >
                      <Wrench size={13} />
                      {t("فتح المانجا", "Open manga")}
                    </a>
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
