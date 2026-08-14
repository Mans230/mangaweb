import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import Lenis from "lenis";
import Navbar from "./Navbar";
import Footer from "./Footer";

/**
 * Shared layout — nested-route pattern (<Outlet/>).
 * App.tsx MUST nest all routes inside this layout route.
 */
export default function Layout() {
  const { pathname } = useLocation();
  const isReader = /\/manga\/[^/]+\/chapter\//.test(pathname);
  // مسارات بلا بار سفلي: القارئ، شات المجتمع، ريلز Fun
  const hideBottomNav =
    isReader || pathname.startsWith("/c/") || pathname.startsWith("/fun/reels");

  // Lenis smooth scroll site-wide (disabled on the reader page per design)
  useEffect(() => {
    if (isReader) return;
    const lenis = new Lenis({ lerp: 0.12, smoothWheel: true });
    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [isReader]);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="noise-overlay" aria-hidden />
      <Navbar />
      <main className={`flex-1 ${hideBottomNav ? "" : "pb-20"} md:pb-0`}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
