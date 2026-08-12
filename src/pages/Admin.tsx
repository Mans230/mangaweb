import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  FlaskConical,
  GitMerge,
  Inbox,
  LayoutDashboard,
  Link2,
  ListMusic,
  ShieldX,
  Users,
  BookOpen,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { LOGIN_PATH } from "@/const";
import { trpc } from "@/providers/trpc";
import { AdminToastProvider } from "@/components/admin/AdminToast";
import AdminDashboard from "@/components/admin/Dashboard";
import MangaManager from "@/components/admin/MangaManager";
import AddByLink from "@/components/admin/AddByLink";
import AdminSources from "@/components/admin/Sources";
import MergeDuplicates from "@/components/admin/MergeDuplicates";
import UsersManager from "@/components/admin/UsersManager";
import RequestsManager from "@/components/admin/RequestsManager";
import { EASE, mockStats } from "@/components/admin/adminMock";

type AdminView = "dashboard" | "manga" | "add" | "sources" | "merge" | "users" | "requests";

const shortcutKeys: Record<string, AdminView> = {
  d: "dashboard",
  m: "manga",
  a: "add",
  s: "sources",
  g: "merge",
  u: "users",
  r: "requests",
};

function AdminShell({ demoMode }: { demoMode: boolean }) {
  const { t } = useLanguage();
  const [view, setView] = useState<AdminView>("dashboard");

  const statsQuery = trpc.admin.stats.useQuery(undefined, {
    retry: false,
    enabled: !demoMode,
  });
  // TODO: fallback للـ mock عند تعذّر الـ API
  const pendingCount = statsQuery.data?.pendingRequests ?? mockStats.pendingRequests;

  const tabs = useMemo(
    () =>
      [
        { id: "dashboard", label: t("لوحة المعلومات", "Dashboard"), icon: LayoutDashboard },
        { id: "manga", label: t("إدارة المانجا", "Manga"), icon: BookOpen },
        { id: "add", label: t("إضافة بلينك", "Add by link"), icon: Link2 },
        { id: "sources", label: t("المصادر", "Sources"), icon: ListMusic },
        { id: "merge", label: t("دمج المكرر", "Merge duplicates"), icon: GitMerge },
        { id: "users", label: t("المستخدمون", "Users"), icon: Users },
        { id: "requests", label: t("الطلبات", "Requests"), icon: Inbox, badge: pendingCount },
      ] as { id: AdminView; label: string; icon: typeof LayoutDashboard; badge?: number }[],
    [t, pendingCount],
  );

  // اختصارات لوحة المفاتيح: g ثم حرف
  useEffect(() => {
    let armed = false;
    let timer = 0;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      if (e.key === "g" && !armed) {
        armed = true;
        timer = window.setTimeout(() => (armed = false), 900);
        return;
      }
      if (armed && shortcutKeys[e.key]) {
        setView(shortcutKeys[e.key]);
        armed = false;
        window.clearTimeout(timer);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, []);

  const activeTab = tabs.find((tab) => tab.id === view)!;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] gap-5 px-4 py-6 md:px-6">
      {/* الشريط الجانبي — سطح المكتب */}
      <motion.aside
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="glass-strong sticky top-24 hidden h-fit w-60 shrink-0 flex-col gap-1 rounded-3xl p-3 lg:flex"
      >
        <div className="mb-2 flex items-center gap-2 px-2 pt-1">
          <img src="/logo.svg" alt="" className="h-7 w-7 rounded-lg" />
          <span className="font-display text-sm font-bold text-app">
            {t("لوحة الأدمن", "Admin panel")}
          </span>
        </div>
        {tabs.map((tab) => {
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`relative flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                active ? "text-white" : "text-app-2 hover:text-app"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="admin-nav-pill"
                  className="gradient-primary absolute inset-0 rounded-2xl shadow-md"
                  transition={{ duration: 0.35, ease: EASE }}
                />
              )}
              <tab.icon size={17} className="relative z-10 shrink-0" />
              <span className="relative z-10 flex-1 text-start">{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={`relative z-10 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                    active ? "bg-white/25 text-white" : "bg-warning/20 text-warning"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
        <div className="mt-3 border-t border-app px-2 pt-3 text-[10px] leading-relaxed text-app-3">
          {t("اختصارات: g ثم d/m/a/s/g/u/r للتنقل", "Shortcuts: g then d/m/a/s/g/u/r")}
        </div>
      </motion.aside>

      {/* المحتوى */}
      <div className="min-w-0 flex-1">
        {/* تبويبات الموبايل */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {tabs.map((tab) => {
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={`glass-chip relative shrink-0 !px-4 !py-2 text-xs font-semibold ${active ? "!text-white" : ""}`}
              >
                {active && (
                  <motion.span
                    layoutId="admin-nav-pill-mobile"
                    className="gradient-primary absolute inset-0 rounded-full"
                    transition={{ duration: 0.3, ease: EASE }}
                  />
                )}
                <tab.icon size={14} className="relative z-10" />
                <span className="relative z-10">{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`relative z-10 rounded-full px-1.5 text-[10px] font-bold tabular-nums ${active ? "bg-white/25" : "bg-warning/20 text-warning"}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {demoMode && (
          <div className="glass mb-4 flex items-center gap-2.5 !rounded-2xl border !border-accent-2/40 p-3 text-xs text-accent-2">
            <FlaskConical size={15} className="shrink-0" />
            {t(
              "وضع المعاينة — تعذّر الاتصال بالخادم، تُعرض بيانات تجريبية.",
              "Preview mode — server unreachable, showing mock data.",
            )}
          </div>
        )}

        <div className="mb-4 flex items-center gap-3">
          <h1 className="font-display text-xl font-bold text-app md:text-2xl">{activeTab.label}</h1>
          <motion.span
            key={view}
            initial={{ width: 0 }}
            animate={{ width: 48 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="gradient-primary mt-1 h-1 rounded-full"
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            {view === "dashboard" && <AdminDashboard />}
            {view === "manga" && <MangaManager />}
            {view === "add" && <AddByLink />}
            {view === "sources" && <AdminSources />}
            {view === "merge" && <MergeDuplicates />}
            {view === "users" && <UsersManager />}
            {view === "requests" && <RequestsManager />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function Admin() {
  const { t } = useLanguage();
  const { user, isAuthenticated, isLoading, error } = useAuth();

  // تعذّر الاتصال بالخادم → وضع معاينة ببيانات تجريبية (TODO: إزالة عند استقرار الـ API)
  const serverDown = !!error && !isAuthenticated;

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="mx-auto w-full max-w-[1400px] space-y-4 px-4 py-8 md:px-6">
        <div className="skeleton h-10 w-56" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
        <div className="skeleton h-72" />
      </div>
    );
  } else if (serverDown) {
    body = <AdminShell demoMode />;
  } else if (!isAuthenticated) {
    body = (
      <div className="mx-auto max-w-lg px-4 py-20">
        <div className="glass">
          <EmptyState
            title={t("سجّل الدخول أولاً", "Sign in first")}
            caption={t("لوحة التحكم متاحة للمشرفين فقط بعد تسجيل الدخول.", "The dashboard is available to admins after signing in.")}
            ctaLabel={t("تسجيل الدخول", "Sign in")}
            ctaTo={LOGIN_PATH}
          />
        </div>
      </div>
    );
  } else if (user?.role !== "admin") {
    body = (
      <div className="mx-auto max-w-lg px-4 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="glass flex flex-col items-center p-10 text-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-danger/15 text-danger">
            <ShieldX size={30} />
          </span>
          <h1 className="font-display mt-5 text-2xl font-bold text-app">
            {t("غير مصرّح", "Access denied")}
          </h1>
          <p className="mt-2 text-sm text-app-2">
            {t(
              "هذه الصفحة مخصصة للمشرفين فقط. إن كنت تعتقد أن هذا خطأ، تواصل مع إدارة المنصة.",
              "This page is for admins only. Contact the platform team if you think this is a mistake.",
            )}
          </p>
          <Link to="/" className="btn-primary mt-6 !px-6 !py-2.5 text-sm">
            {t("العودة للرئيسية", "Back to home")}
          </Link>
        </motion.div>
      </div>
    );
  } else {
    body = <AdminShell demoMode={false} />;
  }

  return <AdminToastProvider>{body}</AdminToastProvider>;
}
