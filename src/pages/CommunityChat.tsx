import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  BookOpen,
  Clock,
  Crown,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  MicOff,
  Pin,
  Radio,
  Settings,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/components/LanguageProvider";
import EmptyState from "@/components/EmptyState";
import { ToastViewport, useToast } from "@/components/library/toast";
import { LOGIN_PATH } from "@/const";
import { avatarSrc, displayName } from "@/components/community/types";
import ChatBubble from "@/components/communities/ChatBubble";
import ChatComposer from "@/components/communities/ChatComposer";
import MembersDrawer from "@/components/communities/MembersDrawer";
import SettingsDrawer from "@/components/communities/SettingsDrawer";
import { playSoftBeep } from "@/components/communities/sound";
import {
  CommunityAvatar,
  communityColor,
  type CommunityChatMsg,
} from "@/components/communities/shared";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const POLL_MS = 10_000;
const PAGE = 30;
const SOUND_KEY = "zeko:comm:sound";
const joinReqKey = (communityId: number) => `zeko:joinreq:${communityId}`;

export default function CommunityChat() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const inviteCode = params.get("invite") ?? undefined;
  const { t } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [membersOpen, setMembersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [joinPending, setJoinPending] = useState(false);
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== "0";
    } catch {
      return true;
    }
  });

  const detailsQ = trpc.communities.getBySlug.useQuery(
    { slug, inviteCode },
    {
      retry: false,
      // أثناء انتظار قبول طلب الانضمام نحدّث العضوية دورياً
      refetchInterval: joinPending ? 8000 : false,
    },
  );
  const community = detailsQ.data;
  const membership = community?.myMembership ?? null;
  const isMember = !!membership;
  const canMod = membership?.canModerate === true;
  const archived = !!community?.archivedAt;

  // مزامنة حالة «طلب معلّق» المخزنة محلياً مع العضوية الفعلية
  useEffect(() => {
    if (!community) return;
    let stored = false;
    try {
      stored = localStorage.getItem(joinReqKey(community.id)) === "1";
    } catch {
      /* ignore */
    }
    if (isMember) {
      setJoinPending(false);
      try {
        localStorage.removeItem(joinReqKey(community.id));
      } catch {
        /* ignore */
      }
    } else if (stored) {
      setJoinPending(true);
    }
  }, [community, isMember]);

  /* ===== الشات: جلب أولي بآخر 30 رسالة ثم polling بـ afterId ===== */
  const [messages, setMessages] = useState<CommunityChatMsg[]>([]);
  const [afterId, setAfterId] = useState(0);
  const [primedFor, setPrimedFor] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const communityId = community?.id ?? 0;
  const [prevCommunityId, setPrevCommunityId] = useState(communityId);
  if (communityId !== prevCommunityId) {
    setPrevCommunityId(communityId);
    setMessages([]);
    setAfterId(0);
    setPrimedFor(null);
  }

  const chatQ = trpc.communities.messages.useQuery(
    { communityId, afterId: afterId || undefined, inviteCode, limit: PAGE },
    {
      enabled: !!community,
      retry: false,
      refetchInterval: POLL_MS,
      refetchIntervalInBackground: false,
    },
  );

  const fetched = chatQ.data as CommunityChatMsg[] | undefined;
  const [prevFetched, setPrevFetched] = useState<typeof fetched>(undefined);
  if (fetched && fetched !== prevFetched) {
    setPrevFetched(fetched);
    if (fetched.length > 0) {
      if (primedFor !== communityId) {
        // أول جلب: الأحدث تنازلياً → نعكس للعرض
        setMessages([...fetched].reverse());
        setAfterId(fetched[0].id);
        setPrimedFor(communityId);
      } else {
        const myId = user ? Number(user.id) : null;
        const known = new Set(messages.map((m) => m.id));
        const fresh = fetched.filter((m) => !known.has(m.id));
        if (fresh.length) {
          setMessages((prev) => {
            const prevKnown = new Set(prev.map((m) => m.id));
            const add = fetched.filter((m) => !prevKnown.has(m.id));
            return add.length ? [...prev, ...add] : prev;
          });
          // صوت خفيف عند وصول رسائل من الآخرين
          if (soundRef.current && fresh.some((m) => m.userId !== myId)) {
            playSoftBeep();
          }
        }
        setAfterId(fetched[fetched.length - 1].id);
      }
    }
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const pinnedQ = trpc.communities.pinnedMessages.useQuery(
    { communityId, inviteCode },
    { enabled: !!community, retry: false },
  );

  /* ===== الطفرات ===== */
  const sendMut = trpc.communities.sendMessage.useMutation({
    onSuccess: (row) => {
      if (row) {
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row as CommunityChatMsg]));
        if (row.id > afterId) setAfterId(row.id);
        stickToBottom.current = true;
      }
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });
  const joinMut = trpc.communities.requestJoin.useMutation({
    onSuccess: () => {
      setJoinPending(true);
      try {
        if (community) localStorage.setItem(joinReqKey(community.id), "1");
      } catch {
        /* ignore */
      }
      toast(t("أُرسل طلب انضمامك — بانتظار موافقة الإشراف", "Join request sent — awaiting moderator approval"));
    },
    onError: (e) => {
      if (e.data?.code === "CONFLICT") {
        setJoinPending(true);
      }
      toast(e.message, { kind: "info" });
    },
  });
  const leaveMut = trpc.communities.leave.useMutation({
    onSuccess: () => {
      toast(t("غادرت المجتمع", "You left the community"));
      void utils.communities.getBySlug.invalidate({ slug });
      void utils.communities.myCommunities.invalidate();
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });
  const pinMut = trpc.communities.pinMessage.useMutation({
    onSuccess: (_d, vars) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === vars.messageId ? { ...m, pinnedAt: new Date() } : m)),
      );
      void utils.communities.pinnedMessages.invalidate({ communityId });
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });
  const unpinMut = trpc.communities.unpinMessage.useMutation({
    onSuccess: (_d, vars) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === vars.messageId ? { ...m, pinnedAt: null } : m)),
      );
      void utils.communities.pinnedMessages.invalidate({ communityId });
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });
  const deleteMut = trpc.communities.deleteMessage.useMutation({
    onSuccess: (_d, vars) => {
      setMessages((prev) => prev.filter((m) => m.id !== vars.messageId));
      void utils.communities.pinnedMessages.invalidate({ communityId });
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const toggleSound = () => {
    setSoundOn((v) => {
      const next = !v;
      try {
        localStorage.setItem(SOUND_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  /* ===== حالات التحميل/الخطأ ===== */
  if (detailsQ.isLoading) {
    return (
      <div className="relative mx-auto max-w-3xl px-4 py-10 md:py-14">
        <div className="skeleton h-28 w-full !rounded-3xl" />
        <div className="skeleton mt-4 h-10 w-full !rounded-2xl" />
        <div className="mt-4 flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-14 !rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (detailsQ.isError || !community) {
    const code = detailsQ.error?.data?.code;
    if (code === "FORBIDDEN") {
      // مجتمع خاص — شاشة القفل
      return (
        <div className="mx-auto max-w-md px-4 pt-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="glass flex flex-col items-center p-10 text-center !rounded-3xl"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Lock size={28} />
            </span>
            <h1 className="font-display mt-5 text-2xl font-bold text-app">
              {t("مجتمع خاص", "Private community")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-app-2">
              {t(
                "هذا المجتمع خاص — تحتاج عضوية أو رابط دعوة صالحاً لعرضه.",
                "This community is private — you need membership or a valid invite link.",
              )}
            </p>
            {!isAuthenticated && (
              <Link to={LOGIN_PATH} className="btn-primary mt-6 !px-6 !py-2.5 text-sm">
                <LogIn size={15} />
                {t("تسجيل الدخول", "Sign in")}
              </Link>
            )}
            <Link to="/communities" className="btn-glass mt-3 !px-6 !py-2.5 text-sm">
              {t("استكشف المجتمعات", "Explore communities")}
            </Link>
          </motion.div>
          <ToastViewport />
        </div>
      );
    }
    return (
      <EmptyState
        title={t("المجتمع غير موجود", "Community not found")}
        caption={t("ربما حُذف أو أن الرابط غير صحيح.", "It may have been removed or the link is wrong.")}
        ctaLabel={t("استكشف المجتمعات", "Explore communities")}
        ctaTo="/communities"
      />
    );
  }

  const pinned = pinnedQ.data ?? [];
  const color = community.color;
  const muted = membership?.mutedUntil && new Date(membership.mutedUntil).getTime() > Date.now();
  const myId = user ? Number(user.id) : null;
  const chatLoading = chatQ.isLoading && primedFor !== communityId;

  const joinCta = joinPending ? (
    <div className="glass flex items-center justify-center gap-2 !rounded-2xl px-5 py-4 text-sm font-semibold text-warning">
      <Clock size={16} />
      {t("طلب انضمامك قيد المراجعة — ستتمكن من الكتابة فور القبول.", "Your join request is pending — you can write once approved.")}
    </div>
  ) : (
    <div className="glass flex flex-wrap items-center justify-center gap-3 !rounded-2xl px-5 py-4 text-center">
      <p className="w-full text-sm text-app-2">
        {inviteCode
          ? t("وصلت عبر دعوة — انضم للمشاركة في الحديث.", "You arrived via invite — join to join the conversation.")
          : t("يمكنك القراءة بحرية — اطلب الانضمام للمشاركة.", "Reading is open — request to join to participate.")}
      </p>
      {isAuthenticated ? (
        <button
          onClick={() =>
            joinMut.mutate(inviteCode ? { inviteCode } : { slug: community.slug })
          }
          disabled={joinMut.isPending}
          className="btn-primary !px-6 !py-2.5 text-sm disabled:opacity-50"
        >
          {joinMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
          {inviteCode ? t("انضم بالدعوة", "Join with invite") : t("اطلب الانضمام", "Request to join")}
        </button>
      ) : (
        <Link to={LOGIN_PATH} className="btn-primary !px-6 !py-2.5 text-sm">
          <LogIn size={15} />
          {t("سجّل الدخول للانضمام", "Sign in to join")}
        </Link>
      )}
    </div>
  );

  return (
    <div className="relative mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
      {/* ambient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="animate-blob-a absolute -top-24 end-8 h-72 w-72 rounded-full blur-3xl"
          style={{ background: `${communityColor(color)}26` }}
        />
        <div className="animate-blob-b absolute top-1/2 start-0 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
      </div>

      <div className="relative flex flex-col gap-4">
        {/* الرأس */}
        <motion.header
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="glass relative flex items-center gap-4 overflow-hidden !rounded-3xl p-4 md:p-5"
        >
          {community.imageUrl && (
            <>
              <img
                src={community.imageUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl"
              />
              <div className="absolute inset-0 bg-gradient-to-l from-transparent via-[var(--bg)]/60 to-[var(--bg)]/85" />
            </>
          )}
          <div className="relative shrink-0">
            <CommunityAvatar name={community.name} imageUrl={community.imageUrl} color={color} size="lg" />
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display line-clamp-1 text-lg font-extrabold text-app md:text-2xl">
                {community.name}
              </h1>
              {community.isPrivate && <Lock size={14} className="shrink-0 text-app-3" />}
            </div>
            {community.description && (
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-app-2 md:text-sm">
                {community.description}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="glass-chip !px-2.5 !py-1 !text-[10.5px] font-bold">
                <Users size={11} />
                {community.memberCount} {t("عضو", "members")}
              </span>
              {community.mangaId && (
                <span className="glass-chip !px-2.5 !py-1 !text-[10.5px] font-bold text-primary">
                  <BookOpen size={11} />
                  {t("مرتبط بعمل", "Linked to a title")}
                </span>
              )}
              {membership?.isOwner && (
                <span className="glass-chip !border-warning/40 !px-2.5 !py-1 !text-[10.5px] font-bold text-warning">
                  <Crown size={11} />
                  {t("أنت المالك", "You own it")}
                </span>
              )}
              {membership?.roleName && (
                <span
                  className="rounded-full px-2.5 py-1 text-[10.5px] font-bold"
                  style={{ background: `${communityColor(color)}26`, color: communityColor(color) }}
                >
                  {membership.roleName}
                </span>
              )}
            </div>
          </div>
          {/* أزرار الرأس */}
          <div className="relative flex shrink-0 flex-col gap-1.5">
            <button
              onClick={toggleSound}
              className="btn-icon !h-9 !w-9"
              aria-label={soundOn ? t("كتم صوت التنبيه", "Mute notification sound") : t("تفعيل صوت التنبيه", "Enable notification sound")}
              title={soundOn ? t("كتم صوت التنبيه", "Mute notification sound") : t("تفعيل صوت التنبيه", "Enable notification sound")}
            >
              {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            {canMod && (
              <>
                <button
                  onClick={() => setMembersOpen(true)}
                  className="btn-icon !h-9 !w-9"
                  aria-label={t("إدارة الأعضاء", "Manage members")}
                  title={t("إدارة الأعضاء", "Manage members")}
                >
                  <Users size={16} />
                </button>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="btn-icon !h-9 !w-9"
                  aria-label={t("إعدادات المجتمع", "Community settings")}
                  title={t("إعدادات المجتمع", "Community settings")}
                >
                  <Settings size={16} />
                </button>
              </>
            )}
            {isMember && !membership?.isOwner && (
              <button
                onClick={() => leaveMut.mutate({ communityId })}
                disabled={leaveMut.isPending}
                className="btn-icon !h-9 !w-9 !text-danger"
                aria-label={t("مغادرة المجتمع", "Leave community")}
                title={t("مغادرة المجتمع", "Leave community")}
              >
                <LogOut size={16} className="rtl:-scale-x-100" />
              </button>
            )}
          </div>
        </motion.header>

        {/* شريط الأرشفة */}
        {archived && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="glass flex items-center justify-center gap-2 !rounded-2xl border !border-warning/40 px-4 py-3 text-center text-xs font-bold text-warning md:text-sm"
            role="status"
          >
            <Archive size={16} className="shrink-0" />
            {t("هذا المجتمع مؤرشف من الإدارة — قراءة فقط", "This community is archived by admins — read only")}
          </motion.div>
        )}

        {/* الرسائل المثبتة */}
        {pinned.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="glass !rounded-2xl p-2.5"
          >
            <button
              onClick={() => setPinnedOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-1.5 text-[11.5px] font-bold text-primary"
            >
              <Pin size={12} />
              {t("رسائل مثبتة", "Pinned messages")} ({pinned.length})
              <span className="ms-auto text-app-3">{pinnedOpen ? "−" : "+"}</span>
            </button>
            <AnimatePresence initial={false}>
              {pinnedOpen && (
                <motion.ul
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="mt-2 flex max-h-40 flex-col gap-1.5 overflow-y-auto"
                >
                  {pinned.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-xl border border-app bg-black/10 px-2.5 py-1.5">
                      <img src={avatarSrc(p.user)} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                      <span className="shrink-0 text-[10px] font-bold text-app-3" dir="ltr">
                        @{displayName(p.user)}
                      </span>
                      <span className="line-clamp-1 flex-1 text-[11.5px] text-app-2">{p.content}</span>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* حالة البث */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-success">
          <Radio size={12} className="animate-pulse-soft" />
          {t("شات مباشر — يتحدّث تلقائياً كل ١٠ ثوانٍ", "Live chat — auto-refreshes every 10s")}
        </div>

        {/* الرسائل */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="glass flex max-h-[58vh] min-h-[300px] flex-col gap-3 overflow-y-auto !rounded-3xl p-4"
        >
          {chatLoading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`skeleton h-12 !rounded-2xl ${i % 2 ? "me-auto w-2/3" : "ms-auto w-1/2"}`} />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              title={t("الشات هادئ", "Chat is quiet")}
              caption={t("ابدأ الحديث — رسالتك تظهر فوراً للأعضاء.", "Start the conversation — your message appears instantly.")}
            />
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              {messages.map((m) => (
                <ChatBubble
                  key={m.id}
                  message={m}
                  mine={myId === m.userId}
                  authorIsOwner={m.userId === community.ownerId}
                  canModerate={canMod}
                  canReport={isAuthenticated && myId !== m.userId}
                  communitySlug={community.slug}
                  communityMangaId={community.mangaId ?? null}
                  accentColor={color}
                  actionPending={pinMut.isPending || unpinMut.isPending || deleteMut.isPending}
                  onPin={(id) => pinMut.mutate({ messageId: id })}
                  onUnpin={(id) => unpinMut.mutate({ messageId: id })}
                  onDelete={(id) => deleteMut.mutate({ messageId: id })}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* صندوق الكتابة / الانضمام */}
        {archived ? (
          <div className="glass flex items-center justify-center gap-2 !rounded-2xl px-5 py-4 text-sm font-semibold text-app-3">
            <Archive size={15} />
            {t("المجتمع مؤرشف — الكتابة معطّلة", "Archived — writing is disabled")}
          </div>
        ) : !isAuthenticated ? (
          <div className="glass flex flex-wrap items-center justify-center gap-3 !rounded-2xl px-5 py-4 text-center">
            <p className="w-full text-sm text-app-2">
              {t("سجّل الدخول للمشاركة في الشات — يمكنك القراءة بحرية.", "Sign in to chat — reading is open.")}
            </p>
            <Link to={LOGIN_PATH} className="btn-primary !px-5 !py-2.5 text-sm">
              <LogIn size={15} />
              {t("تسجيل الدخول", "Sign in")}
            </Link>
          </div>
        ) : !isMember ? (
          joinCta
        ) : muted ? (
          <div className="glass flex items-center justify-center gap-2 !rounded-2xl px-5 py-4 text-sm font-semibold text-danger">
            <MicOff size={15} />
            {t("أنت مكتوم في هذا المجتمع حالياً", "You are muted in this community")}
          </div>
        ) : (
          <ChatComposer
            userAvatar={user?.avatarUrl}
            pending={sendMut.isPending}
            slowModeSeconds={canMod ? 0 : community.slowModeSeconds}
            onSubmit={(content, imageUrl) =>
              sendMut.mutate({ communityId, content, imageUrl: imageUrl ?? undefined })
            }
          />
        )}
      </div>

      {canMod && (
        <>
          <MembersDrawer
            open={membersOpen}
            onClose={() => setMembersOpen(false)}
            community={community}
            currentUserId={myId}
          />
          <SettingsDrawer
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            community={community}
          />
        </>
      )}
      <ToastViewport />
    </div>
  );
}
