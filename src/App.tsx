import { useEffect } from "react";
import { Routes, Route, useLocation, Navigate } from "react-router";
import Layout from "@/components/Layout";
import Onboarding from "@/components/Onboarding";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import { trpc } from "@/providers/trpc";
import { useUiToggles } from "@/lib/uiToggles";
import Home from "@/pages/Home";
import Browse from "@/pages/Browse";
import MangaDetail from "@/pages/MangaDetail";
import Community from "@/pages/Community";
import Communities from "@/pages/Communities";
import CommunityChat from "@/pages/CommunityChat";
import Reader from "@/pages/Reader";
import Library from "@/pages/Library";
import Profile from "@/pages/Profile";
import Request from "@/pages/Request";
import Support from "@/pages/Support";
import Fun from "@/pages/Fun";
import Reels from "@/pages/Reels";
import Today from "@/pages/Today";
import Login from "@/pages/Login";
import Admin from "@/pages/Admin";

export default function App() {
  const { pathname } = useLocation();
  const utils = trpc.useUtils();
  // أقسام يخفيها الأدمن من الإعدادات — الروابط المباشرة تُحوَّل للرئيسية
  const { hideCommunities, hideReels } = useUiToggles();

  // تتبّع مشاهدات الصفحات بصمت (fail-safe — لا يؤثر أي خطأ على التنقل)
  useEffect(() => {
    utils.client.analytics.track.mutate({ path: pathname }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      <Onboarding />
      <PwaInstallBanner />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="browse" element={<Browse />} />
          <Route path="search" element={<Browse />} />
          <Route path="manga/:slug" element={<MangaDetail />} />
          <Route
            path="manga/:slug/community"
            element={hideCommunities ? <Navigate to="/" replace /> : <Community />}
          />
          <Route
            path="communities"
            element={hideCommunities ? <Navigate to="/" replace /> : <Communities />}
          />
          <Route
            path="c/:slug"
            element={hideCommunities ? <Navigate to="/" replace /> : <CommunityChat />}
          />
          <Route path="manga/:slug/chapter/:n" element={<Reader />} />
          <Route path="library" element={<Library />} />
          <Route path="profile" element={<Profile />} />
          <Route path="request" element={<Request />} />
          <Route path="support" element={<Support />} />
          <Route
            path="fun"
            element={hideCommunities && hideReels ? <Navigate to="/" replace /> : <Fun />}
          />
          <Route
            path="fun/reels"
            element={hideReels ? <Navigate to="/" replace /> : <Reels />}
          />
          <Route path="today" element={<Today />} />
          <Route path="auth" element={<Login />} />
          <Route path="login" element={<Login />} />
          <Route path="admin" element={<Admin />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </>
  );
}
