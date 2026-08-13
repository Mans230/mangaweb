/**
 * درج إدارة المجتمع (للمالك/المشرفين) بثلاثة تبويبات:
 * الأعضاء (دور/كتم/طرد/حظر) — طلبات الانضمام — الأدوار المخصصة.
 * على الموبايل يظهر كبطاقة سفلية (bottom-sheet) وعلى الشاشات الكبيرة كدرج جانبي.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  Check,
  ChevronDown,
  Crown,
  MicOff,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserMinus,
  Users,
  UserPlus,
  Volume2,
  X,
} from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import EmptyState from "@/components/EmptyState";
import { trpc } from "@/providers/trpc";
import { useToast } from "@/components/library/toast";
import { avatarSrc, displayName } from "@/components/community/types";
import { timeAgo } from "@/lib/manga";
import type { CommunityDetails, CommunityMemberRow } from "./shared";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

type TabId = "members" | "requests" | "roles";

const MUTE_OPTIONS: { ar: string; en: string; minutes: number | null }[] = [
  { ar: "10 دقائق", en: "10 min", minutes: 10 },
  { ar: "ساعة", en: "1 hour", minutes: 60 },
  { ar: "يوم", en: "1 day", minutes: 60 * 24 },
  { ar: "دائم", en: "Permanent", minutes: null },
];

function isMuted(mutedUntil: Date | string | null): boolean {
  return !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();
}

export default function MembersDrawer({
  open,
  onClose,
  community,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  community: CommunityDetails;
  currentUserId: number | null;
}) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<TabId>("members");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleMod, setNewRoleMod] = useState(false);
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);

  const communityId = community.id;
  const invalidateAll = () => {
    void utils.communities.listMembers.invalidate({ communityId });
    void utils.communities.listJoinRequests.invalidate({ communityId });
    void utils.communities.getBySlug.invalidate({ slug: community.slug });
  };

  const membersQ = trpc.communities.listMembers.useQuery(
    { communityId, limit: 200 },
    { enabled: open, retry: false },
  );
  const requestsQ = trpc.communities.listJoinRequests.useQuery(
    { communityId },
    { enabled: open, retry: false },
  );

  const ok = (msg: string) => toast(msg);
  const fail = (e: { message: string }) => toast(e.message, { kind: "info" });

  const setRoleMut = trpc.communities.setMemberRole.useMutation({
    onSuccess: () => {
      ok(t("تم تحديث الدور", "Role updated"));
      invalidateAll();
    },
    onError: fail,
  });
  const muteMut = trpc.communities.mute.useMutation({
    onSuccess: () => {
      ok(t("تم كتم العضو", "Member muted"));
      invalidateAll();
    },
    onError: fail,
  });
  const unmuteMut = trpc.communities.unmute.useMutation({
    onSuccess: () => {
      ok(t("تم إلغاء الكتم", "Unmuted"));
      invalidateAll();
    },
    onError: fail,
  });
  const kickMut = trpc.communities.kick.useMutation({
    onSuccess: () => {
      ok(t("تم طرد العضو", "Member kicked"));
      invalidateAll();
    },
    onError: fail,
  });
  const banMut = trpc.communities.ban.useMutation({
    onSuccess: () => {
      ok(t("تم حظر العضو نهائياً", "Member banned"));
      invalidateAll();
    },
    onError: fail,
  });
  const approveMut = trpc.communities.approveJoin.useMutation({
    onSuccess: () => {
      ok(t("تم قبول الطلب", "Request approved"));
      invalidateAll();
    },
    onError: fail,
  });
  const rejectMut = trpc.communities.rejectJoin.useMutation({
    onSuccess: () => {
      ok(t("تم رفض الطلب", "Request rejected"));
      invalidateAll();
    },
    onError: fail,
  });
  const createRoleMut = trpc.communities.createRole.useMutation({
    onSuccess: () => {
      ok(t("تم إنشاء الدور", "Role created"));
      setNewRoleName("");
      setNewRoleMod(false);
      invalidateAll();
    },
    onError: fail,
  });
  const renameRoleMut = trpc.communities.renameRole.useMutation({
    onSuccess: () => {
      ok(t("تمت إعادة التسمية", "Role renamed"));
      setRenaming(null);
      invalidateAll();
    },
    onError: fail,
  });
  const deleteRoleMut = trpc.communities.deleteRole.useMutation({
    onSuccess: () => {
      ok(t("تم حذف الدور", "Role deleted"));
      invalidateAll();
    },
    onError: fail,
  });

  /** زر بتأكيد بخطوتين: أول نقرة تطلب التأكيد */
  const twoStep = (key: string, action: () => void) => {
    if (confirmKey === key) {
      setConfirmKey(null);
      action();
    } else {
      setConfirmKey(key);
      window.setTimeout(() => setConfirmKey((k) => (k === key ? null : k)), 3500);
    }
  };

  const roles = community.roles;
  const members = membersQ.data ?? [];
  const requests = requestsQ.data ?? [];

  const memberRow = (m: CommunityMemberRow) => {
    const actionable = !m.isOwner && m.user.id !== currentUserId;
    const isOpen = expanded === m.user.id;
    return (
      <li key={m.user.id} className="glass !rounded-2xl p-3">
        <button
          type="button"
          onClick={() => setExpanded(isOpen ? null : m.user.id)}
          className="flex w-full items-center gap-3 text-start"
        >
          <img
            src={avatarSrc(m.user)}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full border border-app object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[13px] font-bold text-app" dir="ltr">
                @{displayName(m.user)}
              </span>
              {m.isOwner && (
                <span className="glass-chip !border-warning/40 !px-1.5 !py-0 !text-[9.5px] font-bold text-warning">
                  <Crown size={9} />
                  {t("المالك", "Owner")}
                </span>
              )}
              {m.roleName && (
                <span className="glass-chip !px-1.5 !py-0 !text-[9.5px] font-bold text-primary">
                  {m.canModerate && <ShieldCheck size={9} />}
                  {m.roleName}
                </span>
              )}
              {isMuted(m.mutedUntil) && (
                <span className="glass-chip !border-danger/40 !px-1.5 !py-0 !text-[9.5px] font-bold text-danger">
                  <MicOff size={9} />
                  {t("مكتوم", "Muted")}
                </span>
              )}
            </div>
            <span className="text-[10.5px] text-app-3">
              {t("انضم", "Joined")} {timeAgo(m.createdAt, lang)}
            </span>
          </div>
          {actionable && (
            <ChevronDown
              size={15}
              className={`shrink-0 text-app-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          )}
        </button>

        <AnimatePresence initial={false}>
          {isOpen && actionable && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex flex-col gap-2.5 border-t border-app pt-3">
                {/* الدور */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-app-3">{t("الدور:", "Role:")}</span>
                  <select
                    value={m.roleId ?? ""}
                    onChange={(e) =>
                      setRoleMut.mutate({
                        communityId,
                        userId: m.user.id,
                        roleId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="input-glass flex-1 !rounded-xl !py-1.5 text-xs"
                  >
                    <option value="">{t("بدون دور", "No role")}</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.canModerate ? ` (${t("إشراف", "mod")})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* الكتم */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-app-3">
                    <MicOff size={11} />
                    {t("كتم:", "Mute:")}
                  </span>
                  {MUTE_OPTIONS.map((o) => (
                    <button
                      key={o.ar}
                      onClick={() => muteMut.mutate({ communityId, userId: m.user.id, minutes: o.minutes })}
                      className="glass-chip !px-2.5 !py-1 !text-[10.5px]"
                    >
                      {t(o.ar, o.en)}
                    </button>
                  ))}
                  {isMuted(m.mutedUntil) && (
                    <button
                      onClick={() => unmuteMut.mutate({ communityId, userId: m.user.id })}
                      className="glass-chip !border-success/40 !px-2.5 !py-1 !text-[10.5px] !text-success"
                    >
                      <Volume2 size={11} />
                      {t("إلغاء الكتم", "Unmute")}
                    </button>
                  )}
                </div>

                {/* طرد / حظر */}
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      twoStep(`kick:${m.user.id}`, () => kickMut.mutate({ communityId, userId: m.user.id }))
                    }
                    className="btn-glass flex-1 !px-3 !py-2 text-[11px] !text-warning"
                  >
                    <UserMinus size={13} />
                    {confirmKey === `kick:${m.user.id}` ? t("تأكيد الطرد؟", "Confirm kick?") : t("طرد", "Kick")}
                  </button>
                  <button
                    onClick={() =>
                      twoStep(`ban:${m.user.id}`, () => banMut.mutate({ communityId, userId: m.user.id }))
                    }
                    className="btn-glass flex-1 !px-3 !py-2 text-[11px] !text-danger"
                  >
                    <Ban size={13} />
                    {confirmKey === `ban:${m.user.id}` ? t("تأكيد الحظر؟", "Confirm ban?") : t("حظر", "Ban")}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </li>
    );
  };

  const tabs: { id: TabId; label: string; icon: typeof Users; badge?: number }[] = [
    { id: "members", label: t("الأعضاء", "Members"), icon: Users, badge: community.memberCount },
    { id: "requests", label: t("طلبات الانضمام", "Join requests"), icon: UserPlus, badge: requests.length || undefined },
    { id: "roles", label: t("الأدوار", "Roles"), icon: ShieldCheck },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[84] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.32, ease: EASE }}
            className="glass-strong fixed inset-x-0 bottom-0 z-[85] flex max-h-[85vh] flex-col rounded-t-3xl p-4 md:inset-x-auto md:inset-y-0 md:end-0 md:max-h-none md:w-[420px] md:rounded-none md:rounded-s-3xl md:p-5"
            role="dialog"
            aria-modal="true"
            aria-label={t("إدارة الأعضاء", "Members management")}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-app">{t("إدارة المجتمع", "Manage community")}</h3>
              <button className="btn-icon !h-8 !w-8" onClick={onClose} aria-label={t("إغلاق", "Close")}>
                <X size={15} />
              </button>
            </div>

            {/* التبويبات */}
            <div className="glass mb-3 flex !rounded-full p-1" role="tablist">
              {tabs.map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(item.id)}
                    className={`relative flex flex-1 items-center justify-center gap-1 rounded-full py-2 text-[11px] font-bold transition-colors ${
                      active ? "text-white" : "text-app-3 hover:text-app-2"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="members-drawer-pill"
                        className="gradient-primary absolute inset-0 rounded-full"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}
                    <item.icon size={12} className="relative z-10" />
                    <span className="relative z-10">{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className={`relative z-10 rounded-full px-1.5 text-[9.5px] tabular-nums ${active ? "bg-white/25" : "bg-primary/20 text-primary"}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pe-1">
              {tab === "members" &&
                (membersQ.isLoading ? (
                  <div className="flex flex-col gap-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="skeleton h-14 !rounded-2xl" />
                    ))}
                  </div>
                ) : members.length === 0 ? (
                  <EmptyState title={t("لا أعضاء", "No members")} caption="" />
                ) : (
                  <ul className="flex flex-col gap-2">{members.map(memberRow)}</ul>
                ))}

              {tab === "requests" &&
                (requestsQ.isLoading ? (
                  <div className="flex flex-col gap-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="skeleton h-14 !rounded-2xl" />
                    ))}
                  </div>
                ) : requests.length === 0 ? (
                  <EmptyState
                    title={t("لا طلبات معلقة", "No pending requests")}
                    caption={t("طلبات الانضمام الجديدة تظهر هنا.", "New join requests appear here.")}
                  />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {requests.map((r) => (
                      <li key={r.id} className="glass flex items-center gap-3 !rounded-2xl p-3">
                        <img
                          src={avatarSrc(r.user)}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-full border border-app object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold text-app" dir="ltr">
                            @{displayName(r.user)}
                          </span>
                          <span className="text-[10.5px] text-app-3">{timeAgo(r.createdAt, lang)}</span>
                        </div>
                        <button
                          onClick={() => approveMut.mutate({ requestId: r.id })}
                          disabled={approveMut.isPending}
                          className="btn-glass !border-success/50 !px-3 !py-1.5 text-[11px] !text-success"
                        >
                          <Check size={12} />
                          {t("قبول", "Approve")}
                        </button>
                        <button
                          onClick={() => rejectMut.mutate({ requestId: r.id })}
                          disabled={rejectMut.isPending}
                          className="btn-glass !border-danger/50 !px-3 !py-1.5 text-[11px] !text-danger"
                        >
                          <X size={12} />
                          {t("رفض", "Reject")}
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}

              {tab === "roles" && (
                <div className="flex flex-col gap-2">
                  {roles.length === 0 && (
                    <EmptyState
                      title={t("لا أدوار مخصصة", "No custom roles")}
                      caption={t("أنشئ أدواراً بأسماء حرة وصلاحية إشراف اختيارية.", "Create named roles with optional mod rights.")}
                    />
                  )}
                  {roles.map((r) => (
                    <div key={r.id} className="glass flex items-center gap-2 !rounded-2xl p-3">
                      {renaming?.id === r.id ? (
                        <>
                          <input
                            value={renaming.name}
                            onChange={(e) => setRenaming({ id: r.id, name: e.target.value })}
                            maxLength={60}
                            className="input-glass flex-1 !rounded-xl !py-1.5 text-xs"
                          />
                          <button
                            onClick={() => renameRoleMut.mutate({ roleId: r.id, name: renaming.name.trim() })}
                            disabled={!renaming.name.trim() || renameRoleMut.isPending}
                            className="btn-icon !h-8 !w-8 !text-success"
                            aria-label={t("حفظ", "Save")}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setRenaming(null)}
                            className="btn-icon !h-8 !w-8"
                            aria-label={t("إلغاء", "Cancel")}
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 truncate text-sm font-bold text-app">{r.name}</span>
                          {r.canModerate && (
                            <span className="glass-chip !border-primary/40 !px-2 !py-0.5 !text-[10px] font-bold text-primary">
                              <ShieldCheck size={10} />
                              {t("إشراف", "Mod")}
                            </span>
                          )}
                          <button
                            onClick={() => setRenaming({ id: r.id, name: r.name })}
                            className="btn-icon !h-8 !w-8"
                            aria-label={t("إعادة تسمية", "Rename")}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() =>
                              twoStep(`role:${r.id}`, () => deleteRoleMut.mutate({ roleId: r.id }))
                            }
                            className={`btn-icon !h-8 !w-8 !text-danger ${confirmKey === `role:${r.id}` ? "!border-danger/60" : ""}`}
                            aria-label={t("حذف الدور", "Delete role")}
                            title={confirmKey === `role:${r.id}` ? t("تأكيد الحذف؟", "Confirm delete?") : t("حذف الدور", "Delete role")}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}

                  {/* إنشاء دور */}
                  <div className="glass mt-1 flex flex-col gap-2 !rounded-2xl p-3">
                    <span className="text-[11px] font-bold text-app-2">{t("دور جديد", "New role")}</span>
                    <input
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      maxLength={60}
                      placeholder={t("اسم الدور…", "Role name…")}
                      className="input-glass !rounded-xl !py-2 text-xs"
                    />
                    <label className="flex items-center gap-2 text-[11px] font-semibold text-app-2">
                      <input
                        type="checkbox"
                        checked={newRoleMod}
                        onChange={(e) => setNewRoleMod(e.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                      {t("صلاحية الإشراف (إدارة الأعضاء والرسائل)", "Moderation rights (manage members & messages)")}
                    </label>
                    <button
                      onClick={() =>
                        newRoleName.trim() &&
                        createRoleMut.mutate({ communityId, name: newRoleName.trim(), canModerate: newRoleMod })
                      }
                      disabled={!newRoleName.trim() || createRoleMut.isPending}
                      className="btn-primary !py-2 text-xs disabled:opacity-50"
                    >
                      <Plus size={13} />
                      {t("إنشاء الدور", "Create role")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
