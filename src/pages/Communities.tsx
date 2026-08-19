import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  CheckCircle2,
  Clock,
  Crown,
  Lock,
  MessageSquare,
  Plus,
  Search,
  Users,
  UsersRound,
  XCircle,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/components/LanguageProvider";
import EmptyState from "@/components/EmptyState";
import { ToastViewport } from "@/components/library/toast";
import { LOGIN_PATH } from "@/const";
import { timeAgo } from "@/lib/manga";
import CreateCommunityModal from "@/components/communities/CreateCommunityModal";
import {
  CommunityAvatar,
  type CommunityCard,
  type MyCreateRequestRow,
} from "@/components/communities/shared";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

function CommunityGridCard({ c, index }: { c: CommunityCard; index: number }) {
  const { t } = useLanguage();
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE, delay: Math.min(index, 12) * 0.04 }}
    >
      <Link
        to={`/c/${c.slug}`}
        className="glass group flex items-center gap-3 !rounded-3xl p-4 transition-transform hover:-translate-y-0.5"
      >
        <CommunityAvatar name={c.name} imageUrl={c.imageUrl} color={c.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="line-clamp-1 text-sm font-bold text-app">{c.name}</h3>
            {c.isPrivate && <Lock size={12} className="shrink-0 text-app-3" />}
          </div>
          {c.description && (
            <p className="mt-0.5 line-clamp-1 text-[11.5px] text-app-3">{c.description}</p>
          )}
          <div className="mt-1.5 flex items-center gap-3 text-[11px] font-semibold text-app-3">
            <span className="flex items-center gap-1">
              <Users size={11} />
              {c.memberCount} {t("عضو", "members")}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare size={11} />
              {c.messageCount} {t("رسالة", "messages")}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

const requestStatusChip = (status: MyCreateRequestRow["status"]) =>
  status === "approved"
    ? { label: "مقبول", icon: CheckCircle2, cls: "!border-success/40 text-success" }
    : status === "rejected"
      ? { label: "مرفوض", icon: XCircle, cls: "!border-danger/40 text-danger" }
      : { label: "قيد المراجعة", icon: Clock, cls: "!border-warning/40 text-warning" };

export default function Communities() {
  const { t, lang } = useLanguage();
  const { isAuthenticated } = useAuth();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(id);
  }, [search]);

  const discoveryQ = trpc.communities.discovery.useQuery(
    { search: debounced || undefined, limit: 24 },
    { retry: false, placeholderData: (prev) => prev },
  );
  const myCommunitiesQ = trpc.communities.myCommunities.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const myRequestsQ = trpc.communities.myCreateRequests.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });

  const items = discoveryQ.data?.items ?? [];
  // عند تعطيل مجتمعات المستخدمين يعيد الاكتشاف قائمة فارغة دائماً
  const maybeDisabled = !debounced && discoveryQ.isSuccess && items.length === 0;

  return (
    <div className="relative mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
      {/* ambient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="animate-blob-a absolute -top-20 end-10 h-72 w-72 rounded-full bg-primary-soft/25 blur-3xl" />
        <div className="animate-blob-b absolute top-1/3 start-0 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
      </div>

      <div className="relative flex flex-col gap-8">
        {/* الرأس */}
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="gradient-primary flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg">
              <UsersRound size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-extrabold text-app md:text-3xl">
                {t("المجتمعات", "Communities")}
              </h1>
              <p className="text-xs text-app-3 md:text-sm">
                {t("انضم لمجتمعات القرّاء أو أنشئ مجتمعك الخاص.", "Join reader communities or create your own.")}
              </p>
            </div>
            {isAuthenticated ? (
              <button onClick={() => setCreateOpen(true)} className="btn-primary !px-5 !py-2.5 text-sm">
                <Plus size={16} />
                {t("أنشئ مجتمعك", "Create yours")}
              </button>
            ) : (
              <Link to={LOGIN_PATH} className="btn-glass !px-5 !py-2.5 text-sm">
                {t("سجّل الدخول لإنشاء مجتمع", "Sign in to create")}
              </Link>
            )}
          </div>

          {/* بحث */}
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-app-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("ابحث عن مجتمع بالاسم…", "Search communities by name…")}
              className="input-glass w-full !ps-11"
            />
          </div>
        </motion.header>

        {/* الاكتشاف */}
        <section>
          <h2 className="font-display mb-3 text-base font-bold text-app md:text-lg">
            {debounced ? t("نتائج البحث", "Search results") : t("الأنشط حالياً", "Most active")}
          </h2>
          {discoveryQ.isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="skeleton h-24 !rounded-3xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="glass !rounded-3xl">
              {maybeDisabled ? (
                <EmptyState
                  title={t("المجتمعات غير متاحة حالياً", "Communities unavailable right now")}
                  caption={t(
                    "مجتمعات المستخدمين معطّلة أو مؤرشفة مؤقتاً من الإدارة — القراءة تبقى متاحة عبر الروابط المباشرة.",
                    "User communities are temporarily disabled — reading still works via direct links.",
                  )}
                />
              ) : (
                <EmptyState
                  title={t("لا نتائج", "No results")}
                  caption={t("جرّب اسماً مختلفاً أو أنشئ مجتمعك الخاص.", "Try a different name or create your own.")}
                />
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((c, i) => (
                <CommunityGridCard key={c.id} c={c} index={i} />
              ))}
            </div>
          )}
          {maybeDisabled && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-app-3">
              <Archive size={12} />
              {t("الروابط المباشرة للمجتمعات تبقى قابلة للقراءة.", "Direct community links remain readable.")}
            </p>
          )}
        </section>

        {/* مجتمعاتي */}
        {isAuthenticated && (
          <section>
            <h2 className="font-display mb-3 text-base font-bold text-app md:text-lg">
              {t("مجتمعاتي", "My communities")}
            </h2>
            {myCommunitiesQ.isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-24 !rounded-3xl" />
                ))}
              </div>
            ) : (myCommunitiesQ.data ?? []).length === 0 ? (
              <div className="glass !rounded-3xl">
                <EmptyState
                  title={t("لم تنضم لأي مجتمع بعد", "No communities yet")}
                  caption={t("اكتشف المجتمعات بالأعلى أو أنشئ مجتمعك.", "Discover communities above or create yours.")}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(myCommunitiesQ.data ?? []).map((c) => (
                  <Link
                    key={c.id}
                    to={`/c/${c.slug}`}
                    className="glass flex items-center gap-3 !rounded-3xl p-4 transition-transform hover:-translate-y-0.5"
                  >
                    <CommunityAvatar name={c.name} imageUrl={c.imageUrl} color={c.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="line-clamp-1 text-sm font-bold text-app">{c.name}</h3>
                        {c.isPrivate && <Lock size={11} className="shrink-0 text-app-3" />}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        {c.isOwner && (
                          <span className="glass-chip !border-warning/40 !px-2 !py-0.5 !text-[10px] font-bold text-warning">
                            <Crown size={10} />
                            {t("المالك", "Owner")}
                          </span>
                        )}
                        {c.roleName && (
                          <span className="glass-chip !px-2 !py-0.5 !text-[10px] font-bold text-primary">
                            {c.roleName}
                          </span>
                        )}
                        {c.archivedAt && (
                          <span className="glass-chip !px-2 !py-0.5 !text-[10px] font-bold text-app-3">
                            <Archive size={10} />
                            {t("مؤرشف", "Archived")}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {/* طلباتي */}
        {isAuthenticated && (myRequestsQ.data ?? []).length > 0 && (
          <section>
            <h2 className="font-display mb-3 text-base font-bold text-app md:text-lg">
              {t("طلباتي", "My requests")}
            </h2>
            <ul className="flex flex-col gap-2.5">
              <AnimatePresence initial={false}>
                {(myRequestsQ.data ?? []).map((r) => {
                  const chip = requestStatusChip(r.status);
                  return (
                    <motion.li
                      key={r.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="glass flex flex-wrap items-center gap-3 !rounded-2xl p-4"
                    >
                      <span className={`glass-chip shrink-0 !px-2.5 !py-1 !text-[11px] font-bold ${chip.cls}`}>
                        <chip.icon size={12} />
                        {t(chip.label, r.status)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-bold text-app">{r.payload.name}</p>
                        <p className="mt-0.5 text-[11px] text-app-3">
                          {timeAgo(r.createdAt, lang)}
                          {r.payload.isPrivate ? ` · ${t("خاص", "Private")}` : ` · ${t("عام", "Public")}`}
                        </p>
                        {r.status === "rejected" && r.rejectReason && (
                          <p className="mt-1 text-[11.5px] font-semibold text-danger">
                            {t("سبب الرفض:", "Reject reason:")} {r.rejectReason}
                          </p>
                        )}
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </section>
        )}
      </div>

      <CreateCommunityModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ToastViewport />
    </div>
  );
}
