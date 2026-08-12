import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Home,
  LayoutDashboard,
  Library,
  LogOut,
  Moon,
  Search,
  Send,
  Sun,
  User,
  X,
} from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useLanguage } from "./LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { LOGIN_PATH } from "@/const";
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

const navLinks = [
  { to: "/", ar: "الرئيسية", en: "Home" },
  { to: "/browse", ar: "تصفّح", en: "Browse" },
  { to: "/library", ar: "مكتبتي", en: "Library" },
  { to: "/request", ar: "اطلب مانجا", en: "Request" },
];

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { t, toggleLanguage } = useLanguage();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setSearchOpen(false), [location.pathname]);

  const accountPath = isAuthenticated ? "/profile" : LOGIN_PATH;
  const bottomNav = [
    { to: "/", ar: "الرئيسية", en: "Home", icon: Home },
    { to: "/browse", ar: "بحث", en: "Search", icon: Search },
    { to: "/library", ar: "مكتبتي", en: "Library", icon: Library },
    { to: "/request", ar: "الطلبات", en: "Requests", icon: Send },
    { to: accountPath, ar: "حسابي", en: "Account", icon: User },
  ];

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
            <span className="font-display gradient-text text-lg font-bold md:text-xl">
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
          <div className="ms-auto flex items-center gap-2 lg:ms-0">
            <button
              className="btn-icon"
              aria-label={t("بحث", "Search")}
              onClick={() => setSearchOpen((v) => !v)}
            >
              {searchOpen ? <X size={18} /> : <Search size={18} />}
            </button>

            <button
              className="btn-icon overflow-hidden"
              aria-label={t("تبديل المظهر", "Toggle theme")}
              onClick={toggleTheme}
            >
              <motion.span
                key={theme}
                initial={{ rotate: -180, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="flex"
              >
                {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
              </motion.span>
            </button>

            <button
              onClick={toggleLanguage}
              className="glass-chip h-10 items-center !px-3.5 font-semibold"
              aria-label={t("تغيير اللغة", "Switch language")}
            >
              {t("EN", "ع")}
            </button>

            <button className="btn-icon relative hidden sm:inline-flex" aria-label={t("الإشعارات", "Notifications")}>
              <Bell size={18} />
              <span className="absolute end-2 top-2 h-2 w-2 rounded-full bg-danger" />
            </button>

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
                    <AvatarImage src={user?.avatarUrl ?? undefined} alt={user?.name ?? ""} />
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
      </motion.header>

      {/* ===== Mobile bottom nav ===== */}
      <nav className="glass-strong fixed inset-x-3 bottom-3 z-50 flex items-center justify-between rounded-2xl px-2 py-1.5 lg:hidden">
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
                  style={{ background: "rgba(167,139,250,0.18)", border: "1px solid var(--border-glow)" }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <Icon size={20} className={`relative z-10 ${active ? "text-primary" : "text-app-3"}`} />
              <span
                className={`relative z-10 text-[10.5px] font-medium ${
                  active ? "text-app" : "text-app-3"
                }`}
              >
                {t(item.ar, item.en)}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
