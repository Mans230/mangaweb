import { useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  Loader2,
  Mail,
  Trash2,
  XCircle,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { timeAgo } from "@/lib/manga";
import { EASE } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

type DmcaStatus = "pending" | "reviewing" | "actioned" | "rejected";
type Filter = "all" | DmcaStatus;

const STATUSES: DmcaStatus[] = ["pending", "reviewing", "actioned", "rejected"];

const statusLabel = (s: DmcaStatus, t: (a: string, e: string) => string) =>
  ({
    pending: t("معلّق", "Pending"),
    reviewing: t("قيد المراجعة", "Reviewing"),
    actioned: t("تمت الإزالة", "Actioned"),
    rejected: t("مرفوض", "Rejected"),
  })[s];

const pillStyles: Record<DmcaStatus, string> = {
  pending: "!border-warning/40 text-warning",
  reviewing: "!border-accent/40 text-accent",
  actioned: "!border-success/40 text-success",
  rejected: "!border-danger/40 text-danger",
};

const statusIcons: Record<DmcaStatus, typeof Clock> = {
  pending: Clock,
  reviewing: Eye,
  actioned: CheckCircle2,
  rejected: XCircle,
};

const PAGE_SIZE = 20;

/** قوالب ردود جاهزة تملأ حقل الملاحظات */
function templates(t: (a: string, e: string) => string) {
  return [
    {
      label: t("قبول وإزالة", "Accept & remove"),
      text: t(
        "تم التحقق من البلاغ وإزالة المحتوى المخالف. شكراً لتواصلك.",
        "Claim verified and the infringing content has been removed. Thank you.",
      ),
    },
    {
      label: t("طلب توضيح", "Request more info"),
      text: t(
        "نحتاج إثبات ملكية الحقوق والروابط الدقيقة للمحتوى قبل المتابعة.",
        "We need proof of rights ownership and exact content URLs before proceeding.",
      ),
    },
    {
      label: t("رفض — غير كافٍ", "Reject — insufficient"),
      text: t(
        "لا يستوفي البلاغ متطلبات DMCA (بيانات ناقصة/رابط غير صالح).",
        "This claim does not meet DMCA requirements (missing data / invalid URL).",
      ),
    },
  ];
}

export default function DmcaManager() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const utils = trpc.useUtils();

  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const query = trpc.dmca.list.useQuery(
    {
      status: filter === "all" ? undefined : filter,
      page,
      limit: PAGE_SIZE,
    },
    { retry: false },
  );

  const refresh = () => {
    query.refetch();
    utils.dmca.pendingCount.invalidate();
  };

  const update = trpc.dmca.updateStatus.useMutation({
    onSuccess: () => {
      toast(t("تم تحديث الطلب", "Request updated"));
      setOpenId(null);
      refresh();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const remove = trpc.dmca.remove.useMutation({
    onSuccess: () => {
      toast(t("تم حذف الطلب", "Request deleted"));
      setOpenId(null);
      refresh();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const setFilterReset = (f: Filter) => {
    setFilter(f);
    setPage(1);
    setOpenId(null);
  };

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="space-y-4"
    >
      {/* فلاتر الحالة */}
      <div className="flex flex-wrap gap-2">
        {(["all", ...STATUSES] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilterReset(f)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              filter === f
                ? "bg-primary text-primary-ink"
                : "glass text-app-2 hover:text-app"
            }`}
          >
            {f === "all" ? t("الكل", "All") : statusLabel(f, t)}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="skeleton h-64" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t("لا توجد بلاغات", "No DMCA requests")}
          caption={t("طابور DMCA فارغ حالياً.", "The DMCA queue is empty.")}
        />
      ) : (
        <div className="space-y-3">
          {items.map((row) => {
            const r = row.request;
            const status = r.status as DmcaStatus;
            const Icon = statusIcons[status] ?? Clock;
            const open = openId === r.id;
            return (
              <div key={r.id} className="glass !rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold text-app">
                        {r.claimantName}
                      </span>
                      {r.company && (
                        <span className="text-xs text-app-2">· {r.company}</span>
                      )}
                    </div>
                    <a
                      href={`mailto:${r.claimantEmail}`}
                      className="mt-0.5 flex items-center gap-1 text-xs text-app-2 hover:text-app"
                      dir="ltr"
                    >
                      <Mail size={12} /> {r.claimantEmail}
                    </a>
                  </div>
                  <span
                    className={`glass flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${pillStyles[status]}`}
                  >
                    <Icon size={12} />
                    {statusLabel(status, t)}
                  </span>
                </div>

                <div className="mt-2 space-y-1 text-xs text-app-2">
                  <a
                    href={r.targetUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1 text-accent hover:underline"
                    dir="ltr"
                  >
                    <ExternalLink size={12} /> {r.targetUrl}
                  </a>
                  {row.manga && (
                    <p>
                      {t("المانجا", "Manga")}:{" "}
                      <span className="text-app">{row.manga.title}</span>
                    </p>
                  )}
                  <p className="line-clamp-2 whitespace-pre-wrap text-app-2">
                    {r.workDescription}
                  </p>
                  <p className="text-app-2/70">
                    {timeAgo(r.createdAt)}
                    {row.handler && ` · ${t("عالجه", "by")} ${row.handler.name}`}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setOpenId(open ? null : r.id);
                      setNotes(r.notes ?? "");
                    }}
                    className="btn-ghost !px-3 !py-1.5 text-xs"
                  >
                    {open ? t("إغلاق", "Close") : t("معالجة", "Handle")}
                  </button>
                </div>

                {open && (
                  <div className="mt-3 space-y-3 border-t border-app/10 pt-3">
                    {/* قوالب */}
                    <div className="flex flex-wrap gap-1.5">
                      {templates(t).map((tpl) => (
                        <button
                          key={tpl.label}
                          onClick={() => setNotes(tpl.text)}
                          className="glass rounded-full px-2.5 py-1 text-[11px] text-app-2 hover:text-app"
                        >
                          {tpl.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={t("ملاحظات / قرار داخلي…", "Internal notes / decision…")}
                      className="input-glass w-full resize-none text-sm"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {STATUSES.map((s) => (
                          <button
                            key={s}
                            disabled={update.isPending}
                            onClick={() =>
                              update.mutate({ id: r.id, status: s, notes: notes.trim() || undefined })
                            }
                            className={`rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                              status === s
                                ? "bg-primary text-primary-ink"
                                : "glass text-app-2 hover:text-app"
                            }`}
                          >
                            {statusLabel(s, t)}
                          </button>
                        ))}
                      </div>
                      <button
                        disabled={remove.isPending}
                        onClick={() => remove.mutate({ id: r.id })}
                        className="btn-ghost !px-3 !py-1.5 text-xs text-danger disabled:opacity-50"
                      >
                        {remove.isPending ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                        {t("حذف", "Delete")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* ترقيم الصفحات */}
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
