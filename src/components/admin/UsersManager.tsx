import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Ban, Search, ShieldBan, ShieldCheck, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { timeAgo } from "@/lib/manga";
import { EASE } from "./adminUtils";
import type { AdminUserRow, RouterOutputs } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

type ApiUser = RouterOutputs["admin"]["listUsers"]["items"][number];

function mapApiUser(u: ApiUser): AdminUserRow {
  return {
    id: Number(u.id),
    name: u.name ?? "مستخدم",
    username: u.email?.split("@")[0] ?? `user${u.id}`,
    email: u.email ?? "—",
    avatar: u.avatarUrl,
    role: u.role,
    joinedAt: timeAgo(u.createdAt),
    bannedAt: u.bannedAt ?? null,
  };
}

type RoleFilter = "all" | "user" | "admin";

interface BanEntry {
  ip: string;
  reason?: string | null;
  createdAt?: string | Date | null;
}

/** قسم حظر عناوين IP — banIp / unbanIp / listBans */
function IpBanSection() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");

  const bansQuery = trpc.admin.listBans.useQuery(undefined, { retry: false });

  // شكل الاستجابة قد يكون مصفوفة مباشرة أو { items }
  const bans: BanEntry[] = useMemo(() => {
    const d: unknown = bansQuery.data;
    if (Array.isArray(d)) return d as BanEntry[];
    const items = (d as { items?: unknown } | undefined)?.items;
    return Array.isArray(items) ? (items as BanEntry[]) : [];
  }, [bansQuery.data]);

  const banMutation = trpc.admin.banIp.useMutation({
    onSuccess: () => {
      setIp("");
      setReason("");
      bansQuery.refetch();
      toast(t("تم حظر العنوان", "IP banned"));
    },
    onError: () => toast(t("تعذّر حظر العنوان", "Couldn't ban IP"), "danger"),
  });
  const unbanMutation = trpc.admin.unbanIp.useMutation({
    onSuccess: () => {
      bansQuery.refetch();
      toast(t("تم فك حظر العنوان", "IP unbanned"));
    },
    onError: () => toast(t("تعذّر فك الحظر", "Couldn't unban IP"), "danger"),
  });

  const validIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip.trim());

  return (
    <div className="glass !rounded-3xl p-5">
      <h2 className="font-display flex items-center gap-2 text-base font-bold text-app">
        <ShieldBan size={17} className="text-danger" />
        {t("حظر عناوين IP", "IP bans")}
      </h2>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          dir="ltr"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="1.2.3.4"
          className="input-glass w-40 !py-2.5 text-left text-sm"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("السبب (اختياري)…", "Reason (optional)…")}
          className="input-glass min-w-40 flex-1 !py-2.5 text-sm"
        />
        <button
          onClick={() => banMutation.mutate({ ip: ip.trim(), reason: reason.trim() || undefined })}
          disabled={!validIp || banMutation.isPending}
          className="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-50"
        >
          <Ban size={14} /> {t("حظر", "Ban")}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {bansQuery.isLoading ? (
          [1, 2].map((i) => <div key={i} className="skeleton h-11" />)
        ) : bans.length === 0 ? (
          <p className="py-2 text-center text-xs text-app-3">{t("لا عناوين محظورة حالياً", "No banned IPs")}</p>
        ) : (
          bans.map((b) => (
            <div key={b.ip} className="glass flex flex-wrap items-center gap-3 !rounded-2xl px-3.5 py-2.5">
              <span className="font-mono text-sm font-bold text-app" dir="ltr">{b.ip}</span>
              {b.reason && <span className="flex-1 text-xs text-app-3">{b.reason}</span>}
              {b.createdAt && <span className="text-[11px] text-app-3">{timeAgo(b.createdAt)}</span>}
              <button
                onClick={() => unbanMutation.mutate({ ip: b.ip })}
                disabled={unbanMutation.isPending}
                className="btn-glass !border-success/50 !px-3 !py-1.5 text-[11px] !text-success disabled:opacity-50"
              >
                <ShieldCheck size={12} /> {t("فك الحظر", "Unban")}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function UsersManager() {
  const { t } = useLanguage();
  const toast = useAdminToast();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [page, setPage] = useState(1);

  const query = trpc.admin.listUsers.useQuery({ page, limit: 20 }, { retry: false });

  const banMutation = trpc.admin.banUser.useMutation({
    onSuccess: (_r, vars) => {
      query.refetch();
      toast(vars.banned ? t("تم حظر المستخدم", "User banned") : t("تم فك حظر المستخدم", "User unbanned"));
    },
    onError: () => toast(t("تعذّر تحديث حالة الحظر", "Couldn't update ban state"), "danger"),
  });

  // البحث وفلتر الدور يُطبّقان محلياً على نتائج الصفحة الحالية
  const users: AdminUserRow[] = useMemo(() => {
    let list = (query.data?.items ?? []).map(mapApiUser);
    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (u) => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    }
    if (roleFilter !== "all") list = list.filter((u) => u.role === roleFilter);
    return list;
  }, [query.data, search, roleFilter]);

  const filters: { key: RoleFilter; label: string }[] = [
    { key: "all", label: t("الكل", "All") },
    { key: "user", label: t("عضو", "Member") },
    { key: "admin", label: t("مشرف", "Admin") },
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
              {f.key === roleFilter && (
                <motion.span layoutId="user-filter-pill" className="gradient-primary absolute inset-0 rounded-full" transition={{ duration: 0.3, ease: EASE }} />
              )}
              <span className="relative z-10">{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* القائمة */}
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
            >
              <Avatar className="h-11 w-11 border border-app">
                {u.avatar && <AvatarImage src={u.avatar} alt={u.name} />}
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
                  {u.bannedAt && (
                    <span className="glass-chip !border-danger/50 !px-2 !py-0.5 !text-[10px] font-bold text-danger">
                      <Ban size={10} /> {t("محظور", "Banned")}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-app-3" dir="ltr">{u.email}</div>
              </div>
              <span className="text-[11px] text-app-3">{u.joinedAt}</span>
              {u.role !== "admin" && (
                <button
                  onClick={() => banMutation.mutate({ userId: u.id, banned: !u.bannedAt })}
                  disabled={banMutation.isPending}
                  className={`btn-glass !px-3.5 !py-2 text-xs disabled:opacity-50 ${
                    u.bannedAt ? "!border-success/50 !text-success" : "!border-danger/50 !text-danger"
                  }`}
                >
                  {u.bannedAt ? (
                    <>
                      <ShieldCheck size={13} /> {t("فك الحظر", "Unban")}
                    </>
                  ) : (
                    <>
                      <Ban size={13} /> {t("حظر", "Ban")}
                    </>
                  )}
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* ترقيم بسيط */}
      {(query.data?.total ?? 0) > 20 && (
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: Math.ceil((query.data?.total ?? 0) / 20) }, (_, i) => i + 1).map((p) => (
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

      {/* حظر IP */}
      <IpBanSection />
    </div>
  );
}
