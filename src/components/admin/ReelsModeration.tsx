import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Film,
  Loader2,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { formatNum, timeAgo } from "@/lib/manga";
import { EASE } from "./adminUtils";
import type { RouterOutputs } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

type ReelItem = RouterOutputs["reels"]["pendingList"]["items"][number];
const PAGE_SIZE = 10;

export default function ReelsModeration() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const [page, setPage] = useState(1);
  const [rejectTarget, setRejectTarget] = useState<ReelItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [removeTarget, setRemoveTarget] = useState<ReelItem | null>(null);
  // عناصر عولجت — تختفي فوراً حتى قبل انتهاء الـ refetch
  const [handledIds, setHandledIds] = useState<Set<number>>(new Set());

  const query = trpc.reels.pendingList.useQuery(
    { page, limit: PAGE_SIZE },
    { retry: false, placeholderData: (prev) => prev },
  );

  const markHandled = (id: number) =>
    setHandledIds((prev) => new Set(prev).add(id));

  const approve = trpc.reels.approve.useMutation({
    onSuccess: (_r, v) => {
      toast(t("تمت الموافقة على الريل", "Reel approved"));
      markHandled(v.id);
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const reject = trpc.reels.reject.useMutation({
    onSuccess: (_r, v) => {
      toast(t("تم رفض الريل", "Reel rejected"), "info");
      markHandled(v.id);
      setRejectTarget(null);
      setRejectReason("");
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const remove = trpc.reels.remove.useMutation({
    onSuccess: (_r, v) => {
      toast(t("حُذف الريل نهائياً", "Reel permanently deleted"), "danger");
      markHandled(v.id);
      setRemoveTarget(null);
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const items = (query.data?.items ?? []).filter((r) => !handledIds.has(r.id));
  const total = Math.max(0, (query.data?.total ?? 0) - handledIds.size);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const busyId =
    (approve.isPending && approve.variables?.id) ||
    (reject.isPending && reject.variables?.id) ||
    (remove.isPending && remove.variables?.id) ||
    null;

  return (
    <div className="space-y-4">
      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-72" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="glass">
          <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
        </div>
      ) : items.length === 0 ? (
        <div className="glass">
          <EmptyState
            title={t("لا ريلز بانتظار المراجعة", "No pending reels")}
            caption={t("كل الريلز المرسلة تمت معالجتها.", "All submitted reels have been handled.")}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {items.map((reel) => (
              <motion.article
                key={reel.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="glass overflow-hidden !rounded-2xl"
              >
                {/* الفيديو */}
                <div className="relative aspect-video w-full bg-black/60">
                  <video
                    src={reel.videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-contain"
                  />
                </div>

                <div className="space-y-2.5 p-3.5">
                  {/* المستخدم + الوقت */}
                  <div className="flex items-center gap-2.5">
                    {reel.user.avatarUrl ? (
                      <img src={reel.user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft/15 text-primary">
                        <User size={15} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-app">{reel.user.name}</div>
                      <div className="text-[11px] text-app-3" dir="ltr">
                        @{reel.user.username} · {timeAgo(reel.createdAt)}
                      </div>
                    </div>
                    <span className="glass-chip shrink-0 !px-2 !py-0.5 !text-[10px] tabular-nums">
                      {formatNum(reel.viewsCount)} {t("مشاهدة", "views")}
                    </span>
                  </div>

                  {/* الكابشن */}
                  {reel.caption && (
                    <p className="line-clamp-3 text-sm leading-relaxed text-app-2">{reel.caption}</p>
                  )}

                  {/* المانهوا المرتبطة */}
                  {reel.mangaId && (
                    <div className="flex items-center gap-1.5 text-[11px] text-app-3">
                      <Film size={12} className="text-primary" />
                      {t("مرتبط بسلسلة رقم", "Linked to series #")}
                      <span className="font-bold tabular-nums text-app-2">{reel.mangaId}</span>
                    </div>
                  )}

                  {/* الأزرار */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {busyId === reel.id ? (
                      <span className="btn-glass flex-1 !py-2.5 text-xs">
                        <Loader2 size={14} className="animate-spin" />
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => approve.mutate({ id: reel.id })}
                          className="btn-primary flex-1 !border-none !bg-none !py-2.5 text-xs"
                          style={{ background: "var(--success)" }}
                        >
                          <CheckCircle2 size={14} /> {t("موافقة", "Approve")}
                        </button>
                        <button
                          onClick={() => {
                            setRejectTarget(reel);
                            setRejectReason("");
                          }}
                          className="btn-glass flex-1 !border-warning/50 !py-2.5 text-xs !text-warning"
                        >
                          <XCircle size={14} /> {t("رفض", "Reject")}
                        </button>
                        <button
                          onClick={() => setRemoveTarget(reel)}
                          className="btn-glass !border-danger/50 !px-3 !py-2.5 text-xs !text-danger"
                          aria-label={t("حذف نهائي", "Delete permanently")}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ترقيم */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-icon !h-9 !w-9 disabled:opacity-40" aria-label={t("السابق", "Prev")}>
            <ChevronRight size={16} />
          </button>
          <span className="text-sm tabular-nums text-app-2">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-icon !h-9 !w-9 disabled:opacity-40" aria-label={t("التالي", "Next")}>
            <ChevronLeft size={16} />
          </button>
        </div>
      )}

      {/* مودال الرفض — السبب إلزامي */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="glass-strong border-app">
          <DialogHeader>
            <DialogTitle className="font-display text-app">{t("رفض الريل", "Reject reel")}</DialogTitle>
            <DialogDescription className="text-app-2">
              {t("سيصل السبب إشعاراً للمستخدم. السبب إلزامي.", "The reason is sent to the user as a notification. It's required.")}
            </DialogDescription>
          </DialogHeader>
          <textarea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t("سبب الرفض…", "Rejection reason…")}
            className="input-glass w-full resize-none text-sm"
          />
          <DialogFooter className="gap-2">
            <button onClick={() => setRejectTarget(null)} className="btn-glass flex-1 !py-2.5 text-sm">
              {t("إلغاء", "Cancel")}
            </button>
            <button
              disabled={reject.isPending || !rejectReason.trim()}
              onClick={() =>
                rejectTarget && reject.mutate({ id: rejectTarget.id, reason: rejectReason.trim() })
              }
              className="btn-primary flex-1 !border-none !bg-none !py-2.5 text-sm disabled:opacity-50"
              style={{ background: "var(--warning)" }}
            >
              {reject.isPending ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              {t("تأكيد الرفض", "Confirm reject")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأكيد الحذف النهائي */}
      <Dialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent className="glass-strong border-app">
          <DialogHeader>
            <DialogTitle className="font-display text-app">{t("حذف نهائي", "Permanent deletion")}</DialogTitle>
            <DialogDescription className="text-app-2">
              {t("سيُحذف الريل نهائياً من المنصة ولا يمكن التراجع.", "The reel will be permanently deleted. This cannot be undone.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button onClick={() => setRemoveTarget(null)} className="btn-glass flex-1 !py-2.5 text-sm">
              {t("إلغاء", "Cancel")}
            </button>
            <button
              disabled={remove.isPending}
              onClick={() => removeTarget && remove.mutate({ id: removeTarget.id })}
              className="btn-primary flex-1 !border-none !bg-none !py-2.5 text-sm disabled:opacity-50"
              style={{ background: "var(--danger)" }}
            >
              {remove.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {t("حذف نهائي", "Delete")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
