import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Ban,
  BookOpen,
  MessageSquare,
  Search,
  Undo2,
  User,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { EASE, formatNum, mockAdminUsers, timeAgo } from "./adminMock";
import type { AdminUserRow, RouterOutputs } from "./adminMock";
import { useAdminToast } from "./AdminToast";

type ApiUser = RouterOutputs["admin"]["listUsers"]["items"][number];

function mapApiUser(u: ApiUser): AdminUserRow {
  return {
    id: Number(u.id),
    name: u.name ?? "مستخدم",
    username: u.email?.split("@")[0] ?? `user${u.id}`,
    email: u.email ?? "—",
    avatar: u.avatarUrl || `/avatar-${(Number(u.id) % 4) + 1}.png`,
    role: u.role,
    // TODO: حالة الحظر وإحصاءات القراءة غير متاحة من الـ API بعد
    banned: false,
    chaptersRead: 0,
    comments: 0,
    joinedAt: timeAgo(u.createdAt),
  };
}

type RoleFilter = "all" | "user" | "admin" | "banned";

export default function UsersManager() {
  const { t } = useLanguage();
  const toast = useAdminToast();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sort, setSort] = useState<"newest" | "active">("newest");
  const [page, setPage] = useState(1);

  const [roleOverrides, setRoleOverrides] = useState<Record<number, "admin" | "user">>({});
  const [bannedIds, setBannedIds] = useState<Set<number>>(new Set());
  const [banTarget, setBanTarget] = useState<AdminUserRow | null>(null);
  const [banReason, setBanReason] = useState("");

  const query = trpc.admin.listUsers.useQuery({ page, limit: 20 }, { retry: false });

  // TODO: fallback للـ mock عند تعذّر الـ API
  const users: AdminUserRow[] = useMemo(() => {
    let list = query.data ? query.data.items.map(mapApiUser) : mockAdminUsers;
    list = list.map((u) => ({
      ...u,
      role: roleOverrides[u.id] ?? u.role,
      banned: bannedIds.has(u.id) || u.banned,
    }));
    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (u) => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    }
    if (roleFilter === "banned") list = list.filter((u) => u.banned);
    else if (roleFilter !== "all") list = list.filter((u) => u.role === roleFilter && !u.banned);
    if (sort === "active") list = [...list].sort((a, b) => b.chaptersRead - a.chaptersRead);
    return list;
  }, [query.data, search, roleFilter, sort, roleOverrides, bannedIds]);

  const toggleRole = (u: AdminUserRow) => {
    // TODO: ربط بـ API تغيير الدور عند توفره
    const next = u.role === "admin" ? "user" : "admin";
    setRoleOverrides((prev) => ({ ...prev, [u.id]: next }));
    toast(
      next === "admin"
        ? `${u.name} — ${t("تمت الترقية لمشرف", "promoted to admin")}`
        : `${u.name} — ${t("تم التخفيض لعضو", "demoted to member")}`,
    );
  };

  const confirmBan = () => {
    if (!banTarget) return;
    // TODO: ربط بـ API الحظر (مع سبب الحظر) عند توفره
    setBannedIds((prev) => new Set([...prev, banTarget.id]));
    toast(`${banTarget.name} — ${t("تم الحظر", "banned")}`, "danger");
    setBanTarget(null);
    setBanReason("");
  };

  const unban = (u: AdminUserRow) => {
    // TODO: ربط بـ API فك الحظر عند توفره
    setBannedIds((prev) => {
      const next = new Set(prev);
      next.delete(u.id);
      return next;
    });
    toast(`${u.name} — ${t("تم فك الحظر", "unbanned")}`, "info");
  };

  const filters: { key: RoleFilter; label: string }[] = [
    { key: "all", label: t("الكل", "All") },
    { key: "user", label: t("عضو", "Member") },
    { key: "admin", label: t("مشرف", "Admin") },
    { key: "banned", label: t("محظور", "Banned") },
  ];

  return (
    <div className="space-y-4">
      {/* شريط الأدوات */}
      <div className="glass flex flex-wrap items-center gap-2.5 !rounded-2xl p-3">
        <div className="relative min-w-48 flex-1">
          <Search size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-app-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("ابحث بالاسم أو البريد…", "Search name or email…")}
            className="input-glass w-full !py-2.5 !ps-10 text-sm"
          />
        </div>
        <div className="flex gap-1.5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setRoleFilter(f.key)}
              className={`glass-chip relative !px-3.5 !py-1.5 text-xs ${roleFilter === f.key ? "!text-white" : ""}`}
            >
              {roleFilter === f.key && (
                <motion.span layoutId="user-filter-pill" className="gradient-primary absolute inset-0 rounded-full" transition={{ duration: 0.3, ease: EASE }} />
              )}
              <span className="relative z-10">{f.label}</span>
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as "newest" | "active")} className="input-glass !py-2 text-sm">
          <option value="newest">{t("الأحدث انضماماً", "Newest")}</option>
          <option value="active">{t("الأنشط", "Most active")}</option>
        </select>
      </div>

      {/* القائمة */}
      {query.isLoading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="glass">
          <EmptyState title={t("لا مستخدمون", "No users")} caption={t("لا نتائج مطابقة للبحث أو الفلتر.", "No matches for your search or filter.")} />
        </div>
      ) : (
        <div className="space-y-2.5">
          {users.map((u, i) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 15) * 0.03 }}
              className="glass flex flex-wrap items-center gap-3 !rounded-2xl p-3.5 transition-all"
              style={u.banned ? { filter: "saturate(0.3)" } : {}}
            >
              <Avatar className="h-11 w-11 border border-app">
                <AvatarImage src={u.avatar} alt={u.name} />
                <AvatarFallback>
                  <User size={18} />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-36 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-app">{u.name}</span>
                  <span className="text-xs text-app-3" dir="ltr">@{u.username}</span>
                  <span
                    className={`glass-chip !px-2 !py-0.5 !text-[10px] font-bold ${
                      u.role === "admin" ? "!border-accent/50 text-accent" : "!border-accent-2/40 text-accent-2"
                    }`}
                  >
                    {u.role === "admin" ? t("مشرف", "Admin") : t("عضو", "Member")}
                  </span>
                  {u.banned && (
                    <span className="glass-chip !border-danger/50 !px-2 !py-0.5 !text-[10px] font-bold text-danger">
                      {t("محظور", "Banned")}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-app-3" dir="ltr">{u.email}</div>
              </div>
              <div className="hidden items-center gap-4 text-[11px] text-app-3 sm:flex">
                <span className="flex items-center gap-1">
                  <BookOpen size={12} className="text-primary" />
                  <span className="tabular-nums">{formatNum(u.chaptersRead)}</span> {t("فصل", "ch")}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare size={12} className="text-primary" />
                  <span className="tabular-nums">{formatNum(u.comments)}</span>
                </span>
                <span>{u.joinedAt}</span>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => toggleRole(u)}
                  className="btn-icon !h-9 !w-9"
                  title={u.role === "admin" ? t("تخفيض لعضو", "Demote") : t("ترقية لمشرف", "Promote")}
                  aria-label={u.role === "admin" ? t("تخفيض", "Demote") : t("ترقية", "Promote")}
                >
                  {u.role === "admin" ? <ArrowDownCircle size={16} /> : <ArrowUpCircle size={16} />}
                </button>
                {u.banned ? (
                  <button onClick={() => unban(u)} className="btn-icon !h-9 !w-9 hover:!border-success/50 hover:!text-success" title={t("فك الحظر", "Unban")} aria-label={t("فك الحظر", "Unban")}>
                    <Undo2 size={16} />
                  </button>
                ) : (
                  <button onClick={() => setBanTarget(u)} className="btn-icon !h-9 !w-9 hover:!border-danger/50 hover:!text-danger" title={t("حظر", "Ban")} aria-label={t("حظر", "Ban")}>
                    <Ban size={16} />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ترقيم بسيط */}
      {(query.data?.total ?? users.length) > 20 && (
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: Math.ceil((query.data?.total ?? users.length) / 20) }, (_, i) => i + 1).map((p) => (
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

      {/* تأكيد الحظر */}
      <Dialog open={!!banTarget} onOpenChange={(open) => !open && setBanTarget(null)}>
        <DialogContent className="glass-strong border-app">
          <DialogHeader>
            <DialogTitle className="font-display text-app">
              {t("حظر", "Ban")} {banTarget?.name}
            </DialogTitle>
            <DialogDescription className="text-app-2">
              {t("لن يتمكن المستخدم من التعليق أو التفاعل حتى فك الحظر.", "The user won't be able to comment or interact until unbanned.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-app-2">{t("سبب الحظر", "Ban reason")}</label>
            <div className="flex flex-wrap gap-1.5">
              {[t("سبام", "Spam"), t("إساءة", "Abuse"), t("محتوى مخالف", "Violation")].map((r) => (
                <button
                  key={r}
                  onClick={() => setBanReason(r)}
                  className={`glass-chip !px-3 !py-1 !text-xs ${banReason === r ? "!border-danger/50 !text-danger" : ""}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              rows={2}
              placeholder={t("اكتب السبب…", "Write the reason…")}
              className="input-glass w-full resize-none text-sm"
            />
          </div>
          <DialogFooter className="gap-2">
            <button onClick={() => setBanTarget(null)} className="btn-glass !px-5 !py-2.5 text-sm">
              {t("إلغاء", "Cancel")}
            </button>
            <button
              onClick={confirmBan}
              className="btn-primary !px-5 !py-2.5 text-sm"
              style={{ background: "linear-gradient(135deg,#FB7185,#F43F5E)" }}
            >
              <Ban size={15} /> {t("تأكيد الحظر", "Confirm ban")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
