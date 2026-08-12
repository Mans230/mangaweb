import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock, ExternalLink, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import EmptyState from "@/components/EmptyState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { detectSourceFromUrl, timeAgo } from "@/lib/manga";
import { EASE, requestStatusLabel } from "./adminUtils";
import type { AdminRequestRow, RequestStatus, RouterOutputs } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

type ApiRequest = RouterOutputs["admin"]["listRequests"]["items"][number];

function mapApiRequest(r: ApiRequest): AdminRequestRow {
  const det = r.sourceUrl ? detectSourceFromUrl(r.sourceUrl) : null;
  return {
    id: r.id,
    title: r.title,
    requester: r.user?.name ?? "زائر",
    date: timeAgo(r.createdAt),
    sourceName: det?.source ?? null,
    sourceUrl: r.sourceUrl ?? undefined,
    note: r.note ?? undefined,
    status: r.status,
  };
}

type Filter = "all" | RequestStatus;

const pillStyles: Record<RequestStatus, string> = {
  pending: "!border-warning/40 text-warning",
  added: "!border-success/40 text-success",
  rejected: "!border-danger/40 text-danger",
};

const statusIcons: Record<RequestStatus, typeof Clock> = {
  pending: Clock,
  added: CheckCircle2,
  rejected: XCircle,
};

export default function RequestsManager() {
  const { t } = useLanguage();
  const toast = useAdminToast();

  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [overrides, setOverrides] = useState<Record<number, RequestStatus>>({});
  const [rejectTarget, setRejectTarget] = useState<AdminRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const query = trpc.admin.listRequests.useQuery(
    { status: filter === "all" ? undefined : filter, page, limit: 20 },
    { retry: false, placeholderData: (prev) => prev },
  );

  const updateMutation = trpc.admin.updateRequestStatus.useMutation({
    onSuccess: () => query.refetch(),
  });

  const rows: AdminRequestRow[] = useMemo(() => {
    const list = (query.data?.items ?? []).map(mapApiRequest);
    return list.map((r) => ({ ...r, status: overrides[r.id] ?? r.status }));
  }, [query.data, overrides]);

  const setStatus = (id: number, status: RequestStatus) => {
    setOverrides((prev) => ({ ...prev, [id]: status }));
    updateMutation.mutate(
      { id, status },
      {
        onError: () => {
          // تراجع عن التغيير المحلي عند فشل الـ API
          setOverrides((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          toast(t("تعذّر تحديث حالة الطلب", "Couldn't update request status"), "danger");
        },
      },
    );
  };

  const accept = (r: AdminRequestRow) => {
    setStatus(r.id, "added");
    toast(`#${r.id} — ${t("تمت الإضافة", "marked as added")}`);
  };

  const confirmReject = () => {
    if (!rejectTarget) return;
    setStatus(rejectTarget.id, "rejected");
    toast(`#${rejectTarget.id} — ${t("تم الرفض", "rejected")}`, "danger");
    setRejectTarget(null);
    setRejectReason("");
  };

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: t("الكل", "All") },
    { key: "pending", label: t("قيد المراجعة", "Pending") },
    { key: "added", label: t("تمت الإضافة", "Added") },
    { key: "rejected", label: t("مرفوض", "Rejected") },
  ];

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
              <motion.span layoutId="admin-req-pill" className="gradient-primary absolute inset-0 rounded-full" transition={{ duration: 0.3, ease: EASE }} />
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
      ) : rows.length === 0 ? (
        <div className="glass">
          <EmptyState title={t("لا طلبات", "No requests")} caption={t("لا طلبات بهذه الحالة حالياً.", "No requests with this status right now.")} />
        </div>
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence initial={false}>
            {rows.map((r, i) => {
              const Icon = statusIcons[r.status];
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
                  <span className={`glass-chip shrink-0 !px-2.5 !py-1 !text-[11px] font-bold ${pillStyles[r.status]}`}>
                    <Icon size={12} />
                    {t(requestStatusLabel(r.status), r.status)}
                  </span>
                  <div className="min-w-40 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="font-display text-sm font-bold text-app">{r.title}</span>
                      <span className="text-[11px] text-app-3">#{r.id}</span>
                      {r.sourceName && (
                        <span className="glass-chip !px-2 !py-0.5 !text-[10px]" dir="ltr">{r.sourceName}</span>
                      )}
                      {r.sourceUrl && (
                        <a
                          href={r.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                          aria-label={t("فتح الرابط", "Open link")}
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-app-3">
                      {r.requester} · {r.date}
                      {r.note ? ` — ${r.note}` : ""}
                    </div>
                  </div>
                  {r.status === "pending" && (
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => accept(r)} className="btn-glass !border-success/50 !px-4 !py-2 text-xs !text-success">
                        <CheckCircle2 size={14} /> {t("تمت الإضافة", "Added")}
                      </button>
                      <button
                        onClick={() => setRejectTarget(r)}
                        className="btn-glass !border-danger/50 !px-4 !py-2 text-xs !text-danger"
                      >
                        <XCircle size={14} /> {t("رفض", "Reject")}
                      </button>
                    </div>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {(query.data?.total ?? 0) > 20 && (
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: Math.ceil((query.data?.total ?? 0) / 20) }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`glass-chip !px-3.5 !py-1.5 tabular-nums ${page === p ? "!border-transparent !bg-gradient-to-l !from-[#7C3AED] !to-[#E879F9] !text-white" : ""}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* مودال الرفض */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="glass-strong border-app">
          <DialogHeader>
            <DialogTitle className="font-display text-app">
              {t("رفض الطلب", "Reject request")} #{rejectTarget?.id}
            </DialogTitle>
            <DialogDescription className="text-app-2">
              «{rejectTarget?.title}» — {t("اختر سبب الرفض أو اكتب سبباً مخصصاً.", "Pick a rejection reason or write a custom one.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {[
                t("موجودة بالفعل على المنصة", "Already on the platform"),
                t("المصدر متوقف عن النشر", "Source stopped publishing"),
                t("لا تتوفر ترجمة عربية", "No Arabic translation"),
                t("عنوان غير واضح", "Unclear title"),
              ].map((r) => (
                <button
                  key={r}
                  onClick={() => setRejectReason(r)}
                  className={`glass-chip !px-3 !py-1 !text-xs ${rejectReason === r ? "!border-danger/50 !text-danger" : ""}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
              placeholder={t("سبب الرفض…", "Rejection reason…")}
              className="input-glass w-full resize-none text-sm"
            />
          </div>
          <DialogFooter className="gap-2">
            <button onClick={() => setRejectTarget(null)} className="btn-glass !px-5 !py-2.5 text-sm">
              {t("إلغاء", "Cancel")}
            </button>
            <button
              onClick={confirmReject}
              className="btn-primary !px-5 !py-2.5 text-sm"
              style={{ background: "linear-gradient(135deg,#FB7185,#F43F5E)" }}
            >
              <XCircle size={15} /> {t("تأكيد الرفض", "Confirm reject")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
