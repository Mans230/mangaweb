import { useMemo, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock, Flag, XCircle } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { timeAgo } from "@/lib/manga";
import { EASE } from "./adminUtils";
import type { RouterOutputs } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

type ApiReport = RouterOutputs["reports"]["listReports"]["items"][number];
type ReportStatus = "pending" | "resolved" | "dismissed";
type Filter = "all" | ReportStatus;

const PAGE_SIZE = 20;

const reasonLabels: Record<ApiReport["reason"], { ar: string; en: string }> = {
  porn: { ar: "محتوى إباحي", en: "Pornographic content" },
  broken: { ar: "صور مكسورة", en: "Broken images" },
  wrong_translation: { ar: "ترجمة خاطئة", en: "Wrong translation" },
  other: { ar: "أخرى", en: "Other" },
};

const pillStyles: Record<ReportStatus, string> = {
  pending: "!border-warning/40 text-warning",
  resolved: "!border-success/40 text-success",
  dismissed: "!border-danger/40 text-danger",
};

const statusIcons: Record<ReportStatus, typeof Clock> = {
  pending: Clock,
  resolved: CheckCircle2,
  dismissed: XCircle,
};

/** إدارة تبليغات المستخدمين — حلّ أو تجاهل عبر reports.resolveReport */
export default function ReportsManager() {
  const { t } = useLanguage();
  const toast = useAdminToast();

  const [filter, setFilter] = useState<Filter>("pending");
  const [page, setPage] = useState(1);
  const [overrides, setOverrides] = useState<Record<number, ReportStatus>>({});

  const query = trpc.reports.listReports.useQuery(
    { status: filter === "all" ? undefined : filter, offset: (page - 1) * PAGE_SIZE },
    { retry: false, placeholderData: (prev) => prev },
  );

  const resolveMut = trpc.reports.resolveReport.useMutation({
    onSuccess: () => query.refetch(),
  });

  const rows: ApiReport[] = useMemo(
    () =>
      (query.data?.items ?? []).map((r) =>
        overrides[r.id] ? { ...r, status: overrides[r.id] } : r,
      ),
    [query.data, overrides],
  );

  const setStatus = (id: number, status: ReportStatus) => {
    // تفاؤلي مع تراجع عند الفشل
    setOverrides((prev) => ({ ...prev, [id]: status }));
    resolveMut.mutate(
      { id, status: status as "resolved" | "dismissed" },
      {
        onSuccess: () =>
          toast(
            status === "resolved"
              ? t("تم حلّ البلاغ", "Report resolved")
              : t("تم تجاهل البلاغ", "Report dismissed"),
            status === "resolved" ? "success" : "danger",
          ),
        onError: () => {
          setOverrides((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          toast(t("تعذّر تحديث حالة البلاغ", "Couldn't update report status"), "danger");
        },
      },
    );
  };

  const filters: { key: Filter; label: string }[] = [
    { key: "pending", label: t("قيد المراجعة", "Pending") },
    { key: "resolved", label: t("تم الحل", "Resolved") },
    { key: "dismissed", label: t("متجاهَل", "Dismissed") },
    { key: "all", label: t("الكل", "All") },
  ];

  const total = query.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setFilter(f.key);
              setPage(1);
            }}
            className={`glass-chip relative !px-4 ${filter === f.key ? "!text-white" : ""}`}
          >
            {filter === f.key && (
              <motion.span
                layoutId="admin-reports-pill"
                className="gradient-primary absolute inset-0 rounded-full"
                transition={{ duration: 0.3, ease: EASE }}
              />
            )}
            <span className="relative z-10">{f.label}</span>
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="glass">
          <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
        </div>
      ) : rows.length === 0 ? (
        <div className="glass">
          <EmptyState
            title={t("لا تبليغات", "No reports")}
            caption={t("لا تبليغات بهذه الحالة حالياً.", "No reports with this status right now.")}
          />
        </div>
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence initial={false}>
            {rows.map((r, i) => {
              const Icon = statusIcons[r.status as ReportStatus] ?? Clock;
              const reason = reasonLabels[r.reason] ?? reasonLabels.other;
              return (
                <motion.li
                  key={r.id}
                  layout="position"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 15) * 0.03 }}
                  className="glass flex flex-wrap items-center gap-3 !rounded-2xl p-4"
                >
                  <span
                    className={`glass-chip shrink-0 !px-2.5 !py-1 !text-[11px] font-bold ${pillStyles[r.status as ReportStatus] ?? ""}`}
                  >
                    <Icon size={12} />
                    {r.status === "pending"
                      ? t("قيد المراجعة", "Pending")
                      : r.status === "resolved"
                        ? t("تم الحل", "Resolved")
                        : t("متجاهَل", "Dismissed")}
                  </span>

                  <div className="min-w-40 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="glass-chip !border-danger/40 !px-2.5 !py-0.5 !text-[10.5px] font-bold text-danger">
                        <Flag size={11} />
                        {t(reason.ar, reason.en)}
                      </span>
                      {r.manga ? (
                        <Link
                          to={`/manga/${r.manga.slug}`}
                          className="font-display text-sm font-bold text-app hover:text-primary"
                        >
                          {r.manga.title}
                        </Link>
                      ) : (
                        <span className="text-sm font-bold text-app-3">
                          {t("مانجا محذوفة", "Deleted manga")}
                        </span>
                      )}
                      {r.chapterId !== null && (
                        <span className="glass-chip !px-2 !py-0.5 !text-[10px]" dir="ltr">
                          {t("فصل", "chapter")} #{r.chapterId}
                        </span>
                      )}
                      <span className="text-[11px] text-app-3">#{r.id}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-app-3">
                      {r.user?.name ?? r.user?.username ?? t("مستخدم", "User")} · {timeAgo(r.createdAt)}
                    </div>
                    {r.details && (
                      <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-app-2">
                        {r.details}
                      </p>
                    )}
                  </div>

                  {r.status === "pending" && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => setStatus(r.id, "resolved")}
                        disabled={resolveMut.isPending}
                        className="btn-glass !border-success/50 !px-4 !py-2 text-xs !text-success disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} /> {t("تم الحل", "Resolve")}
                      </button>
                      <button
                        onClick={() => setStatus(r.id, "dismissed")}
                        disabled={resolveMut.isPending}
                        className="btn-glass !border-danger/50 !px-4 !py-2 text-xs !text-danger disabled:opacity-50"
                      >
                        <XCircle size={14} /> {t("تجاهل", "Dismiss")}
                      </button>
                    </div>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: Math.ceil(total / PAGE_SIZE) }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`glass-chip !px-3.5 !py-1.5 tabular-nums ${page === p ? "!border-transparent !bg-[#E0561F] !text-white" : ""}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
