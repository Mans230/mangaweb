import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChartNoAxesCombined,
  Clapperboard,
  Coins,
  Flag,
  FolderCog,
  GitMerge,
  Globe,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  ListMusic,
  MessageSquare,
  Settings,
  ShieldX,
  Users,
  UsersRound,
  BookOpen,
} from "lucide-react";
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
import TicketsManager from "@/components/admin/TicketsManager";
import ReportsManager from "@/components/admin/ReportsManager";
import CommentsManager from "@/components/admin/CommentsManager";
import CommunitiesManager from "@/components/admin/CommunitiesManager";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
import ContentManager from "@/components/admin/ContentManager";
import ReelsModeration from "@/components/admin/ReelsModeration";
import AdminSettings from "@/components/admin/AdminSettings";
import AdminCoins from "@/components/admin/AdminCoins";
import AdminEnImport from "@/components/admin/AdminEnImport";
import { EASE } from "@/components/admin/adminUtils";

type AdminView = "analytics" | "content" | "reels" | "settings" | "coins" | "en" | "dashboard" | "manga" | "add" | "sources" | "merge" | "users" | "requests" | "tickets" | "reports" | "comments" | "communities";

const shortcutKeys: Record<string, AdminView> = {
  n: "analytics",
  k: "content",
  l: "reels",
  o: "settings",
  d: "dashboard",
  b: "manga",
  a: "add",
  s: "sources",
  g: "merge",
  u: "users",
  r: "requests",
  t: "tickets",
  p: "reports",
  c: "comments",
  m: "communities",
};

function AdminShell() {
  const { t } = useLanguage();
  const [view, setView] = useState<AdminView>("analytics");

  const statsQuery = trpc.admin.stats.useQuery(undefined, { retry: false });
  const pendingCount = statsQuery.data?.pendingRequests ?? 0;
  const openTickets = statsQuery.data?.openTickets ?? 0;
  const pendingReelsQuery = trpc.analytics.overview.useQuery(undefined, { retry: false });
  const pendingReels = pendingReelsQuery.data?.pendingReels ?? 0;

  const tabs = useMemo(
    () =>
      [
        { id: "analytics", label: t("التحليلات", "Analytics"), icon: ChartNoAxesCombined },
        { id: "content", label: t("إدارة المحتوى", "Content"), icon: FolderCog },
        { id: "reels", label: t("مراجعة الريلز", "Reels review"), icon: Clapperboard, badge: pendingReels },
        { id: "settings", label: t("الإعدادات", "Settings"), icon: Settings },
        { id: "coins", label: t("كوينز", "Coins"), icon: Coins },
        { id: "en", label: t("مانجا EN", "EN Manga"), icon: Globe },
        { id: "dashboard", label: t("لوحة المعلومات", "Dashboard"), icon: LayoutDashboard },
        { id: "manga", label: t("إدارة المانجا", "Manga"), icon: BookOpen },
        { id: "add", label: t("إضافة بلينك", "Add by link"), icon: Link2 },
        { id: "sources", label: t("المصادر", "Sources"), icon: ListMusic },
        { id: "merge", label: t("دمج المكرر", "Merge duplicates"), icon: GitMerge },
        { id: "users", label: t("المستخدمون", "Users"), icon: Users },
        { id: "requests", label: t("الطلبات", "Requests"), icon: Inbox, badge: pendingCount },
        { id: "tickets", label: t("تذاكر الدعم", "Support tickets"), icon: LifeBuoy, badge: openTickets },
        { id: "reports", label: t("التبليغات", "Reports"), icon: Flag },
        { id: "comments", label: t("التعليقات", "Comments"), icon: MessageSquare },
        { id: "communities", label: t("المجتمعات", "Communities"), icon: UsersRound },
      ] as { id: AdminView; label: string; icon: typeof LayoutDashboard; badge?: number }[],
    [t, pendingCount, pendingReels, openTickets],
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
          {t("اختصارات: g ثم d/m/a/s/g/u/r/c للتنقل", "Shortcuts: g then d/m/a/s/g/u/r/c")}
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
            {view === "analytics" && <AnalyticsDashboard />}
            {view === "content" && <ContentManager />}
            {view === "reels" && <ReelsModeration />}
            {view === "settings" && <AdminSettings />}
            {view === "coins" && <AdminCoins />}
            {view === "en" && <AdminEnImport />}
            {view === "dashboard" && <AdminDashboard />}
            {view === "manga" && <MangaManager />}
            {view === "add" && <AddByLink />}
            {view === "sources" && <AdminSources />}
            {view === "merge" && <MergeDuplicates />}
            {view === "users" && <UsersManager />}
            {view === "requests" && <RequestsManager />}
            {view === "tickets" && <TicketsManager />}
            {view === "reports" && <ReportsManager />}
            {view === "comments" && <CommentsManager />}
            {view === "communities" && <CommunitiesManager />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function AdminSkeleton() {
  return (
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
}

function Forbidden() {
  const { t } = useLanguage();
  return (
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
          {t("غير مصرّح لك بالوصول", "Access denied")}
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
}

export default function Admin() {
  const { user, isLoading } = useAuth();

  let body: React.ReactNode;
  if (isLoading) {
    body = <AdminSkeleton />;
  } else if (!user) {
    // غير مسجّل → تحويل لصفحة الدخول
    body = <Navigate to={LOGIN_PATH} replace />;
  } else if (user.role !== "admin") {
    body = <Forbidden />;
  } else {
    body = <AdminShell />;
  }

  return <AdminToastProvider>{body}</AdminToastProvider>;
}
