import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { timeAgo } from "@/lib/manga";
import { EASE } from "./adminUtils";
import type { AdminUserRow, RouterOutputs } from "./adminUtils";

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
  };
}

type RoleFilter = "all" | "user" | "admin";

export default function UsersManager() {
  const { t } = useLanguage();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [page, setPage] = useState(1);

  const query = trpc.admin.listUsers.useQuery({ page, limit: 20 }, { retry: false });

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
                </div>
                <div className="mt-0.5 truncate text-xs text-app-3" dir="ltr">{u.email}</div>
              </div>
              <span className="text-[11px] text-app-3">{u.joinedAt}</span>
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
              className={`glass-chip !px-3.5 !py-1.5 tabular-nums ${page === p ? "!border-transparent !bg-gradient-to-l !from-[#7C3AED] !to-[#E879F9] !text-white" : ""}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
