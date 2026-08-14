import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router";
import Layout from "@/components/Layout";
import Onboarding from "@/components/Onboarding";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import { trpc } from "@/providers/trpc";
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
import Fun from "@/pages/Fun";
import Reels from "@/pages/Reels";
import Today from "@/pages/Today";
import Login from "@/pages/Login";
import Admin from "@/pages/Admin";

export default function App() {
  const { pathname } = useLocation();
  const utils = trpc.useUtils();

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
          <Route path="manga/:slug/community" element={<Community />} />
          <Route path="communities" element={<Communities />} />
          <Route path="c/:slug" element={<CommunityChat />} />
          <Route path="manga/:slug/chapter/:n" element={<Reader />} />
          <Route path="library" element={<Library />} />
          <Route path="profile" element={<Profile />} />
          <Route path="request" element={<Request />} />
          <Route path="fun" element={<Fun />} />
          <Route path="fun/reels" element={<Reels />} />
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
