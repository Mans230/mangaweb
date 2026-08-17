
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CheckCheck,
  Coins,
  Home,
  LayoutDashboard,
  Library,
  LifeBuoy,
  LogOut,
  Menu,
  Search,
  Shuffle,
  Sparkles,
  User,
  UsersRound,
  X,
} from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { LOGIN_PATH } from "@/const";
import { proxyImg, timeAgo } from "@/lib/manga";
import { useUiToggles } from "@/lib/uiToggles";
import { trpc } from "@/providers/trpc";
import {
  useMarkNotificationRead,
  useNotificationsList,
  type NotificationItem,
} from "@/lib/notifications";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/* ===== جرس الإشعارات — مركز الإشعارات (trpc.notifications) ===== */
function NotificationsBell() {
  const { t, lang } = useLanguage();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  // فشل الاستعلام (الباكند لم يسلّم الراوتر بعد) → جرس بدون badge ولا كسر
  const query = useNotificationsList(isAuthenticated);
  const markReadMut = useMarkNotificationRead(() => void query.refetch());

  const items = query.data?.items ?? [];
  const unread = query.data?.unreadCount ?? 0;

  /** ضغطة إشعار: تعليمه مقروءاً ثم فتح صفحة المانجا (slug لو توفر وإلا id) */
  const openItem = (n: NotificationItem) => {
    if (!n.readAt) markReadMut.mutate({ id: n.id });
    if (n.type === "ticket_reply") navigate("/support");
    else if (n.mangaSlug) navigate(`/manga/${n.mangaSlug}`);
    else if (n.mangaId != null) navigate(`/manga/${n.mangaId}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="btn-icon relative"
        aria-label={t("الإشعارات", "Notifications")}
      >
        <Bell size={18} />
        {isAuthenticated && unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[70vh] w-[21rem] max-w-[calc(100vw-2rem)] overflow-y-auto backdrop-blur-xl saturate-150"
      >
        {!isAuthenticated ? (
          <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
            <Bell size={22} className="text-app-3" />
            <p className="text-sm text-app-3">
              {t("سجّل الدخول لترى إشعاراتك", "Sign in to see your notifications")}
            </p>
            <Link to={LOGIN_PATH} className="btn-primary !px-5 !py-2 text-xs">
              {t("دخول", "Sign in")}
            </Link>
          </div>
        ) : (
          <>
            <DropdownMenuLabel className="flex items-center gap-1.5">
              <Bell size={13} className="text-primary" />
              {t("الإشعارات", "Notifications")}
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => markReadMut.mutate({})}
                  disabled={markReadMut.isPending}
                  className="ms-auto flex items-center gap-1 text-[10.5px] font-bold text-primary disabled:opacity-50"
                >
                  <CheckCheck size={12} />
                  {t("تعليم الكل كمقروء", "Mark all as read")}
                </button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {query.isLoading ? (
              <div className="flex flex-col gap-2 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-14 !rounded-xl" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-app-3">
                {t("لا إشعارات حالياً", "No notifications yet")}
              </p>
            ) : (
              items.map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  onClick={() => openItem(n)}
                  className="cursor-pointer gap-3 !rounded-xl px-2 py-2 focus:bg-[rgba(224,86,31,0.16)]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Bell size={15} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-1 text-xs font-semibold">{n.title}</span>
                    {n.body && (
                      <span className="line-clamp-2 text-[11px] text-app-3">{n.body}</span>
                    )}
                    <span className="text-[10px] text-app-3">{timeAgo(n.createdAt, lang)}</span>
                  </span>
                  {!n.readAt && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-hidden />
                  )}
                </DropdownMenuItem>
              ))
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const navLinks = [
  { to: "/browse", ar: "تصفّح", en: "Browse" },
  { to: "/en", ar: "EN Manga", en: "EN Manga" },
  { to: "/calendar", ar: "التقويم", en: "Calendar" },
  { to: "/leaderboard", ar: "المتصدّرون", en: "Leaderboard" },
  { to: "/request", ar: "اطلب مانجا", en: "Request" },
];

export default function Navbar() {
  const { t } = useLanguage();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  /** «عشوائي»: يجلب slug عشوائي من السيرفر ويفتح صفحته */
  const goRandom = async () => {
    setMenuOpen(false);
    try {
      const slug = await utils.rec.randomPick.fetch();
      if (slug) navigate(`/manga/${slug}`);
    } catch {
      /* تجاهل */
    }
  };

  useEffect(() => {
    setSearchOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  const accountPath = isAuthenticated ? "/profile" : LOGIN_PATH;
  const { hideCommunities, hideReels } = useUiToggles();
  const walletQ = trpc.coins.wallet.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    staleTime: 60_000,
  });
  const showFun = !(hideCommunities && hideReels);
  const bottomNav = [
    { to: "/", ar: "الرئيسية", en: "Home", icon: Home },
    ...(showFun ? [{ to: "/fun", ar: "Fun", en: "Fun", icon: Sparkles }] : []),
    { to: "/library", ar: "مكتبتي", en: "Library", icon: Library },
    { to: accountPath, ar: "حسابي", en: "Account", icon: User },
    ...(user?.role === "admin"
      ? [{ to: "/admin", ar: "الإدارة", en: "Admin", icon: LayoutDashboard }]
      : []),
  ];

  // البار السفلي يختفي في: القارئ، شات المجتمع، وريلز Fun
  const hideBottomNav =
    /\/manga\/[^/]+\/chapter\//.test(location.pathname) ||
    location.pathname.startsWith("/c/") ||
    location.pathname.startsWith("/fun/reels");

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    navigate(`/browse?q=${encodeURIComponent(query.trim())}`);
    setSearchOpen(false);
    setQuery("");
  };

  return (
    <>
      {/* ===== Top navbar ===== */}
      <motion.header
        initial={{ y: "-100%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="glass-strong sticky top-0 z-50 border-x-0 border-t-0"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:px-6">
          {/* Logo */}
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <img src="/logo.svg" alt="zeko-manga" className="h-9 w-9 rounded-xl" />
            {/* الاسم يظهر على الشاشات الكبيرة فقط لتوفير المساحة على الهاتف */}
            <span className="font-display hidden text-lg font-bold text-primary sm:inline md:text-xl">
              {t("زيكو مانجا", "zeko-manga")}
            </span>
          </Link>

          {/* Desktop links */}
          <nav className="mx-auto hidden items-center gap-1 lg:flex">
            {navLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) =>
                  `relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    isActive ? "text-app" : "text-app-3 hover:text-app-2"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {t(l.ar, l.en)}
                    {isActive && (
                      <motion.span
                        layoutId="nav-underline"
                        className="gradient-primary absolute inset-x-4 -bottom-0.5 h-0.5 rounded-full"
                        transition={{ duration: 0.3, ease: EASE }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Actions */}
          <div className="ms-auto flex items-center gap-2 md:ms-0">
            {/* قائمة الموبايل (الشريط السفلي يبقى كما هو) */}
            <button
              className="btn-icon lg:hidden"
              aria-label={t("القائمة", "Menu")}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            <button
              className="btn-icon"
              aria-label={t("بحث", "Search")}
              onClick={() => setSearchOpen((v) => !v)}
            >
              {searchOpen ? <X size={18} /> : <Search size={18} />}
            </button>

            {isAuthenticated && (
              <Link
                to="/coins"
                className="glass-chip !py-1.5 text-xs font-bold text-primary tabular-nums"
                aria-label={t("كوينز", "Coins")}
              >
                <Coins size={13} />
                {(walletQ.data?.coins ?? 0).toLocaleString("en-US")}
              </Link>
            )}
            <NotificationsBell />

            {/* AUTH-SLOT: wired to useAuth() */}
            {isLoading ? (
              <span
                className="glass-chip hidden h-10 w-20 animate-pulse sm:inline-flex"
                aria-hidden
              />
            ) : !isAuthenticated ? (
              <Link
                to={LOGIN_PATH}
                className="btn-glass hidden !px-5 !py-2.5 text-sm sm:inline-flex"
              >
                {t("دخول", "Sign in")}
              </Link>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger className="hidden items-center gap-2 sm:inline-flex">
                  <Avatar className="h-9 w-9 border border-app">
                    <AvatarImage src={proxyImg(user?.avatarUrl) || undefined} alt={user?.name ?? ""} />
                    <AvatarFallback>
                      <User size={16} />
                    </AvatarFallback>
                  </Avatar>
                  <span className="max-w-28 truncate text-sm font-medium text-app">
                    {user?.name ?? t("حسابي", "Account")}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="truncate">
                    {user?.name ?? t("حسابي", "Account")}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/profile")}>
                    <User size={16} />
                    {t("الملف الشخصي", "Profile")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/library")}>
                    <Library size={16} />
                    {t("مكتبتي", "My Library")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/coins")}>
                    <Coins size={16} />
                    {t("كوينز", "Coins")}
                  </DropdownMenuItem>
                  {user?.role === "admin" && (
                    <DropdownMenuItem onClick={() => navigate("/admin")}>
                      <LayoutDashboard size={16} />
                      {t("لوحة الأدمن", "Admin Panel")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => logout()}>
                    <LogOut size={16} />
                    {t("تسجيل الخروج", "Sign out")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Search overlay */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="overflow-hidden border-t border-app"
            >
              <form onSubmit={submitSearch} className="mx-auto flex max-w-7xl gap-2 px-4 py-3 md:px-6">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("ابحث عن مانجا، مانهوا، تصنيف…", "Search manga, manhwa, genres…")}
                  className="input-glass w-full"
                />
                <button type="submit" className="btn-primary shrink-0 !px-5 !py-3">
                  <Search size={18} />
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile menu sheet — روابط التنقل كاملة بما فيها المجتمعات */}
        <AnimatePresence>
          {menuOpen && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="overflow-hidden border-t border-app lg:hidden"
              aria-label={t("قائمة التنقل", "Navigation menu")}
            >
              <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
                {navLinks.map((l) => {
                  const active =
                    l.to === "/" ? location.pathname === "/" : location.pathname.startsWith(l.to);
                  return (
                    <Link
                      key={l.to}
                      to={l.to}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                        active
                          ? "bg-primary/15 text-primary"
                          : "text-app-2 hover:bg-primary/10 hover:text-app"
                      }`}
                    >
                      {l.to === "/communities" && <UsersRound size={16} />}
                      {t(l.ar, l.en)}
                    </Link>
                  );
                })}
                <Link
                  to="/support"
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                    location.pathname.startsWith("/support")
                      ? "bg-primary/15 text-primary"
                      : "text-app-2 hover:bg-primary/10 hover:text-app"
                  }`}
                >
                  <LifeBuoy size={16} />
                  {t("الدعم", "Support")}
                </Link>
                <button
                  onClick={goRandom}
                  className="flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-start text-sm font-semibold text-app-2 transition-colors hover:bg-primary/10 hover:text-app"
                >
                  <Shuffle size={16} />
                  {t("مانجا عشوائية", "Random manga")}
                </button>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </motion.header>

      {/* ===== Mobile bottom nav — رفيع (~56px)، يختفي في القارئ وشات المجتمع وريلز Fun ===== */}
      {!hideBottomNav && (
      <nav className="glass-strong fixed inset-x-0 bottom-0 z-50 flex h-14 items-center justify-between border-x-0 border-b-0 px-2 lg:hidden">
        {bottomNav.map((item) => {
          const active =
            item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="relative flex flex-1 flex-col items-center gap-0.5 py-1.5"
            >
              {active && (
                <motion.span
                  layoutId="bottom-nav-pill"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: "rgba(224,86,31,0.18)", border: "1px solid var(--border-glow)" }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <Icon size={19} className={`relative z-10 ${active ? "text-primary" : "text-app-3"}`} />
              <span
                className={`relative z-10 text-[10px] font-medium ${
                  active ? "text-app" : "text-app-3"
                }`}
              >
                {t(item.ar, item.en)}
              </span>
            </Link>
          );
        })}
      </nav>
      )}
    </>
  );
}
