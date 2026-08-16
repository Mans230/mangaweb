/**
 * تبويب «المجتمعات» في لوحة الأدمن:
 * طلبات إنشاء المجتمعات (قبول/رفض بسبب إلزامي) + مفتاحا التفعيل +
 * إدارة المجتمعات (بحث → أرشفة/إلغاء أرشفة/حذف).
 * ملاحظة: البحث يعتمد communities.discovery لغياب إجراء بحث خاص بالأدمن،
 * لذا يقتصر على المجتمعات العامة غير المؤرشفة.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
  Search,
  Trash2,
  Users,
  UsersRound,
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
import { Switch } from "@/components/ui/switch";
import EmptyState from "@/components/EmptyState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { timeAgo } from "@/lib/manga";
import { EASE } from "./adminUtils";
import type { RouterOutputs } from "./adminUtils";
import { useAdminToast } from "./AdminToast";
import { CommunityAvatar } from "@/components/communities/shared";

type CreateRequestRow =
  RouterOutputs["admin"]["listCommunityCreateRequests"]["items"][number];
type SearchRow = RouterOutputs["communities"]["discovery"]["items"][number];

type StatusFilter = "pending" | "approved" | "rejected";

const statusChip: Record<StatusFilter, { ar: string; cls: string; icon: typeof Clock }> = {
  pending: { ar: "قيد المراجعة", cls: "!border-warning/40 text-warning", icon: Clock },
  approved: { ar: "مقبول", cls: "!border-success/40 text-success", icon: CheckCircle2 },
  rejected: { ar: "مرفوض", cls: "!border-danger/40 text-danger", icon: XCircle },
};

export default function CommunitiesManager() {
  const { t, lang } = useLanguage();
  const toast = useAdminToast();

  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(1);
  const [rejectTarget, setRejectTarget] = useState<CreateRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SearchRow | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => window.clearTimeout(id);
  }, [search]);

  const requestsQ = trpc.admin.listCommunityCreateRequests.useQuery(
    { status: filter, page, limit: 20 },
    { retry: false, placeholderData: (prev) => prev },
  );
  const togglesQ = trpc.admin.getCommunityToggles.useQuery(undefined, { retry: false });
  // بحث الأدمن عن مجتمع — discovery (عامة غير مؤرشفة؛ لا يوجد إجراء بحث أدمن)
  const searchQ = trpc.communities.discovery.useQuery(
    { search: debouncedSearch || undefined, limit: 10 },
    { enabled: debouncedSearch.length > 0, retry: false },
  );

  const fail = (e: { message: string }) => toast(e.message, "danger");

  const approveMut = trpc.admin.approveCreateRequest.useMutation({
    onSuccess: (d) => {
      toast(`${t("تم إنشاء المجتمع", "Community created")} — /c/${d.slug}`);
      void requestsQ.refetch();
    },
    onError: fail,
  });
  const rejectMut = trpc.admin.rejectCreateRequest.useMutation({
    onSuccess: () => {
      toast(t("تم رفض الطلب", "Request rejected"), "danger");
      setRejectTarget(null);
      setRejectReason("");
      void requestsQ.refetch();
    },
    onError: fail,
  });
  const togglesMut = trpc.admin.setCommunityToggles.useMutation({
    onSuccess: () => {
      toast(t("تم حفظ المفاتيح", "Toggles saved"));
      void togglesQ.refetch();
    },
    onError: fail,
  });
  const archiveMut = trpc.admin.setCommunityArchived.useMutation({
    onSuccess: (_d, vars) => {
      toast(vars.archived ? t("تمت الأرشفة — أصبح للقراءة فقط", "Archived — read only now") : t("تم إلغاء الأرشفة", "Unarchived"));
      void searchQ.refetch();
    },
    onError: fail,
  });
  const deleteMut = trpc.admin.deleteCommunity.useMutation({
    onSuccess: () => {
      toast(t("تم حذف المجتمع نهائياً", "Community permanently deleted"), "danger");
      setDeleteTarget(null);
      void searchQ.refetch();
    },
    onError: fail,
  });

  const toggles = togglesQ.data;
  const items = requestsQ.data?.items ?? [];
  const total = requestsQ.data?.total ?? 0;

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "pending", label: t("قيد المراجعة", "Pending") },
    { key: "approved", label: t("مقبول", "Approved") },
    { key: "rejected", label: t("مرفوض", "Rejected") },
  ];

  return (
    <div className="space-y-6">
      {/* مفاتيح التفعيل */}
      <div className="glass flex flex-col gap-3 !rounded-3xl p-4 sm:flex-row sm:items-center sm:gap-6">
        <span className="flex items-center gap-2 text-sm font-bold text-app">
          <UsersRound size={16} className="text-primary" />
          {t("مفاتيح المجتمعات", "Community toggles")}
        </span>
        <label className="flex items-center gap-2.5 text-xs font-semibold text-app-2">
          <Switch
            checked={toggles?.user ?? true}
            disabled={togglesQ.isLoading || togglesMut.isPending}
            onCheckedChange={(v) => togglesMut.mutate({ user: v })}
          />
          {t("مجتمعات المستخدمين", "User communities")}
          <span className={`text-[10px] font-bold ${toggles?.user ? "text-success" : "text-danger"}`}>
            {toggles?.user ? t("مفعّلة", "on") : t("معطّلة", "off")}
          </span>
        </label>
        <label className="flex items-center gap-2.5 text-xs font-semibold text-app-2">
          <Switch
            checked={toggles?.manga ?? true}
            disabled={togglesQ.isLoading || togglesMut.isPending}
            onCheckedChange={(v) => togglesMut.mutate({ manga: v })}
          />
          {t("مجتمعات المانهوا", "Manga communities")}
          <span className={`text-[10px] font-bold ${toggles?.manga ? "text-success" : "text-danger"}`}>
            {toggles?.manga ? t("مفعّلة", "on") : t("معطّلة", "off")}
          </span>
        </label>
      </div>

      {/* طلبات الإنشاء */}
      <section>
        <h2 className="font-display mb-3 text-base font-bold text-app">
          {t("طلبات إنشاء المجتمعات", "Community create requests")}
        </h2>
        <div className="mb-3 flex flex-wrap gap-2">
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
                <motion.span layoutId="admin-comm-pill" className="gradient-primary absolute inset-0 rounded-full" transition={{ duration: 0.3, ease: EASE }} />
              )}
              <span className="relative z-10">{f.label}</span>
            </button>
          ))}
        </div>

        {requestsQ.isLoading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-20" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="glass">
            <EmptyState title={t("لا طلبات", "No requests")} caption={t("لا طلبات إنشاء بهذه الحالة حالياً.", "No create requests with this status.")} />
          </div>
        ) : (
          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {items.map((r, i) => {
                const chip = statusChip[r.status as StatusFilter] ?? statusChip.pending;
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
                    <CommunityAvatar name={r.payload.name} imageUrl={r.payload.imageUrl} color={r.payload.color} size="sm" />
                    <div className="min-w-40 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="font-display text-sm font-bold text-app">{r.payload.name}</span>
                        <span className={`glass-chip shrink-0 !px-2.5 !py-1 !text-[11px] font-bold ${chip.cls}`}>
                          <chip.icon size={12} />
                          {t(chip.ar, r.status)}
                        </span>
                        {r.payload.isPrivate && (
                          <span className="glass-chip !px-2 !py-0.5 !text-[10px]">
                            <Lock size={10} />
                            {t("خاص", "Private")}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-app-3">
                        {r.user.name ?? r.user.username ?? `#${r.userId}`} · {timeAgo(r.createdAt, lang)}
                      </div>
                      {r.payload.description && (
                        <p className="mt-1 line-clamp-2 text-[11.5px] text-app-2">{r.payload.description}</p>
                      )}
                      {r.status === "rejected" && r.rejectReason && (
                        <p className="mt-1 text-[11.5px] font-semibold text-danger">
                          {t("سبب الرفض:", "Reason:")} {r.rejectReason}
                        </p>
                      )}
                    </div>
                    {r.status === "pending" && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => approveMut.mutate({ id: r.id })}
                          disabled={approveMut.isPending}
                          className="btn-glass !border-success/50 !px-4 !py-2 text-xs !text-success"
                        >
                          <CheckCircle2 size={14} /> {t("قبول", "Approve")}
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

        {total > 20 && (
          <div className="mt-3 flex justify-center gap-1.5">
            {Array.from({ length: Math.ceil(total / 20) }, (_, i) => i + 1).map((p) => (
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
      </section>

      {/* إدارة مجتمع محدد */}
      <section>
        <h2 className="font-display mb-3 text-base font-bold text-app">
          {t("إدارة مجتمع", "Manage a community")}
        </h2>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-app-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("ابحث عن مجتمع عام بالاسم…", "Search a public community by name…")}
            className="input-glass w-full !ps-11"
          />
        </div>
        {debouncedSearch && (
          <div className="mt-3 space-y-2.5">
            {searchQ.isLoading ? (
              [1, 2].map((i) => <div key={i} className="skeleton h-16" />)
            ) : (searchQ.data?.items ?? []).length === 0 ? (
              <p className="glass rounded-2xl px-4 py-5 text-center text-xs text-app-3">
                {t(
                  "لا نتائج — البحث يشمل المجتمعات العامة غير المؤرشفة فقط.",
                  "No results — search covers public non-archived communities only.",
                )}
              </p>
            ) : (
              (searchQ.data?.items ?? []).map((c) => (
                <div key={c.id} className="glass flex flex-wrap items-center gap-3 !rounded-2xl p-3.5">
                  <CommunityAvatar name={c.name} imageUrl={c.imageUrl} color={c.color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="line-clamp-1 text-sm font-bold text-app">{c.name}</span>
                      {c.isPrivate && <Lock size={11} className="text-app-3" />}
                    </div>
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-app-3">
                      <Users size={10} />
                      {c.memberCount} ·
                      <Link to={`/c/${c.slug}`} className="inline-flex items-center gap-0.5 text-primary hover:underline" dir="ltr">
                        /c/{c.slug}
                        <ExternalLink size={10} />
                      </Link>
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => archiveMut.mutate({ id: c.id, archived: !c.archivedAt })}
                      disabled={archiveMut.isPending}
                      className="btn-glass !border-warning/50 !px-3.5 !py-2 text-xs !text-warning"
                    >
                      {c.archivedAt ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                      {c.archivedAt ? t("إلغاء الأرشفة", "Unarchive") : t("أرشفة", "Archive")}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(c)}
                      className="btn-glass !border-danger/50 !px-3.5 !py-2 text-xs !text-danger"
                    >
                      <Trash2 size={13} /> {t("حذف", "Delete")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* مودال الرفض — السبب إلزامي */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="glass-strong border-app">
          <DialogHeader>
            <DialogTitle className="font-display text-app">
              {t("رفض طلب إنشاء", "Reject create request")} #{rejectTarget?.id}
            </DialogTitle>
            <DialogDescription className="text-app-2">
              «{rejectTarget?.payload.name}» — {t("سبب الرفض إلزامي وسيظهر للمستخدم.", "A reason is required and will be shown to the user.")}
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t("سبب الرفض…", "Rejection reason…")}
            className="input-glass w-full resize-none text-sm"
          />
          <DialogFooter className="gap-2">
            <button onClick={() => setRejectTarget(null)} className="btn-glass !px-5 !py-2.5 text-sm">
              {t("إلغاء", "Cancel")}
            </button>
            <button
              onClick={() =>
                rejectTarget &&
                rejectReason.trim() &&
                rejectMut.mutate({ id: rejectTarget.id, reason: rejectReason.trim() })
              }
              disabled={!rejectReason.trim() || rejectMut.isPending}
              className="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-50"
              style={{ background: "var(--danger)" }}
            >
              <XCircle size={15} /> {t("تأكيد الرفض", "Confirm reject")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* مودال تأكيد الحذف */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="glass-strong border-app">
          <DialogHeader>
            <DialogTitle className="font-display text-app">
              {t("حذف المجتمع نهائياً؟", "Permanently delete community?")}
            </DialogTitle>
            <DialogDescription className="text-app-2">
              «{deleteTarget?.name}» — {t(
                "سيُحذف المجتمع وكل رسائله وأعضائه نهائياً ولا يمكن التراجع.",
                "The community with all messages and members will be deleted permanently.",
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button onClick={() => setDeleteTarget(null)} className="btn-glass !px-5 !py-2.5 text-sm">
              {t("إلغاء", "Cancel")}
            </button>
            <button
              onClick={() => deleteTarget && deleteMut.mutate({ id: deleteTarget.id })}
              disabled={deleteMut.isPending}
              className="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-50"
              style={{ background: "var(--danger)" }}
            >
              <Trash2 size={15} /> {t("حذف نهائي", "Delete forever")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
