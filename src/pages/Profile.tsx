import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import IdentityCard from "@/components/profile/IdentityCard";
import Achievements from "@/components/profile/Achievements";
import LinkedAccounts from "@/components/profile/LinkedAccounts";
import Preferences from "@/components/profile/Preferences";
import DangerZone from "@/components/profile/DangerZone";
import GuestGate from "@/components/library/GuestGate";
import { ToastViewport } from "@/components/library/toast";
import { normalizeApiManga, timeAgoAr } from "@/components/library/data";
import type { LibraryData } from "@/components/library/data";

const TG_KEY = "zeko-telegram-linked";

export default function Profile() {
  const { t } = useLanguage();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [telegramLinked, setTelegramLinked] = useState(
    () => window.localStorage.getItem(TG_KEY) === "1",
  );

  useEffect(() => {
    if (user?.telegramId) setTelegramLinked(true);
  }, [user?.telegramId]);

  // بيانات المكتبة لتغذية الإنجازات — API فقط، بلا بدائل وهمية
  const libraryQ = trpc.library.getLibrary.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    staleTime: 60_000,
  });

  const libData: LibraryData = useMemo(() => {
    if (!libraryQ.data) return { favorites: [], following: [], history: [] };
    return {
      favorites: libraryQ.data.favorites.map((r) => normalizeApiManga(r.manga)),
      following: libraryQ.data.following.map((r) => ({
        manga: normalizeApiManga(r.manga),
        updatedAt: timeAgoAr(new Date(r.manga.updatedAt ?? r.createdAt)),
      })),
      history: libraryQ.data.history.map((r) => {
        const date = new Date(r.updatedAt);
        return {
          id: r.id,
          manga: normalizeApiManga(r.manga),
          chapter: Math.floor(r.chapter.number),
          lastPage: r.lastPage,
          date,
          timeLabel: date.toLocaleTimeString("ar", { hour: "numeric", minute: "2-digit" }),
        };
      }),
    };
  }, [libraryQ.data]);

  return (
    <div className="relative mx-auto max-w-4xl px-4 py-10 md:px-6 md:py-14">
      {/* ambient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="animate-blob-a absolute -top-20 start-10 h-64 w-64 rounded-full bg-primary-soft/25 blur-3xl" />
        <div className="animate-blob-b absolute top-2/3 end-0 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
      </div>

      {isLoading ? (
        <div className="relative flex flex-col gap-6">
          <div className="skeleton h-44 w-full !rounded-3xl" />
          <div className="skeleton h-56 w-full !rounded-3xl" />
          <div className="skeleton h-48 w-full !rounded-3xl" />
        </div>
      ) : !isAuthenticated ? (
        <div className="relative py-8">
          <GuestGate
            heading={t("ملفك الشخصي بانتظارك", "Your profile awaits")}
            copy={t(
              "سجّل الدخول لإدارة حسابك وتتبّع إنجازاتك القرائية وربط تليجرام.",
              "Sign in to manage your account, track reading achievements, and link Telegram.",
            )}
          />
        </div>
      ) : (
        <div className="relative flex flex-col gap-6 md:gap-8">
          <IdentityCard
            name={user?.name ?? t("قارئ", "Reader")}
            email={user?.email ?? null}
            avatar={user?.avatarUrl ?? null}
            role={user?.role ?? "user"}
            createdAt={user?.createdAt ?? null}
          />
          <Achievements data={libData} />
          <LinkedAccounts
            email={user?.email ?? null}
            telegramLinked={telegramLinked}
            onTelegramChange={setTelegramLinked}
          />
          <Preferences telegramLinked={telegramLinked} />
          <DangerZone />
        </div>
      )}

      <ToastViewport />
    </div>
  );
}
