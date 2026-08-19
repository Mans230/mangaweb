import { useState } from "react";
import { Link, useParams } from "react-router";
import { motion } from "framer-motion";
import {
  BookOpen,
  Crown,
  Flame,
  Heart,
  Link as LinkIcon,
  MessageSquare,
  Plus,
  Star,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { proxyImg, timeAgo } from "@/lib/manga";
import { trpc } from "@/providers/trpc";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

type TabKey = "comments" | "posts" | "followers" | "following" | "social";

export default function PublicProfile() {
  const { username = "" } = useParams();
  const { t, lang } = useLanguage();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<TabKey>("comments");
  const q = trpc.users.publicProfile.useQuery({ username }, { retry: false });

  const followMut = trpc.users.follow.useMutation({
    onSuccess: () => utils.users.publicProfile.invalidate({ username }),
  });
  const unfollowMut = trpc.users.unfollow.useMutation({
    onSuccess: () => utils.users.publicProfile.invalidate({ username }),
  });

  if (q.isLoading) {
    return <div className="mx-auto max-w-3xl px-4 py-8"><div className="skeleton h-64 !rounded-2xl" /></div>;
  }
  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-xl font-bold text-app">{t("المستخدم غير موجود", "User not found")}</h1>
      </div>
    );
  }

  const { user, wallet, stats, isFollowing, isSelf, isPremium } = q.data;
  const xpInLevel = wallet.xp % 100;
  const pct = Math.min(100, Math.round((xpInLevel / 100) * 100));
  const busy = followMut.isPending || unfollowMut.isPending;

  const tiles = [
    { icon: BookOpen, value: stats.chaptersRead, label: t("فصول مقروءة", "Chapters read") },
    { icon: MessageSquare, value: stats.comments, label: t("تعليقات", "Comments") },
    { icon: Users, value: stats.followers, label: t("متابِعون", "Followers") },
    { icon: UserPlus, value: stats.following, label: t("يتابع", "Following") },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="mx-auto max-w-3xl px-4 py-6 md:px-6"
    >
      {/* رأس البروفايل */}
      <div className="glass relative overflow-hidden !rounded-2xl">
        {user.bannerUrl && (
          <img src={proxyImg(user.bannerUrl)} alt="" className="absolute inset-x-0 top-0 h-28 w-full object-cover" />
        )}
        <div className={`relative flex flex-wrap items-center gap-4 p-5 ${user.bannerUrl ? "pt-20" : ""}`}>
          <img
            src={proxyImg(user.avatarUrl) || "/placeholder-avatar.svg"}
            alt=""
            onError={(e) => {
              if (!e.currentTarget.src.endsWith("/placeholder-avatar.svg"))
                e.currentTarget.src = "/placeholder-avatar.svg";
            }}
            className="h-20 w-20 shrink-0 rounded-full border-2 border-app object-cover"
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-display flex items-center gap-1.5 truncate text-xl font-bold text-app">
              {user.name ?? user.username}
              {isPremium && (
                <span className="glass-chip !py-0.5 text-[10px] font-bold text-warning" title="Premium">
                  <Crown size={11} /> {t("مميّز", "Premium")}
                </span>
              )}
            </h1>
            {user.username && <p className="text-xs text-app-3" dir="ltr">@{user.username}</p>}
            <p className="mt-1 text-[11px] text-app-3">
              {t("عضو منذ", "Member since")} {new Date(user.createdAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}
            </p>
          </div>
          {!isSelf && (
            <button
              onClick={() =>
                isFollowing ? unfollowMut.mutate({ userId: user.id }) : followMut.mutate({ userId: user.id })
              }
              disabled={busy || !isAuthenticated}
              className={`${isFollowing ? "btn-glass" : "btn-primary"} shrink-0 !px-5 !py-2.5 text-sm disabled:opacity-50`}
              title={!isAuthenticated ? t("سجّل الدخول للمتابعة", "Sign in to follow") : undefined}
            >
              {isFollowing ? <UserMinus size={15} /> : <UserPlus size={15} />}
              {isFollowing ? t("إلغاء المتابعة", "Unfollow") : t("متابعة", "Follow")}
            </button>
          )}
        </div>
      </div>

      {/* المستوى + XP + الستريك */}
      <div className="glass mt-4 flex flex-wrap items-center gap-4 !rounded-2xl p-4">
        <span className="flex items-center gap-1.5 text-sm font-bold text-primary">
          <Zap size={15} />
          {t("المستوى", "Level")} {wallet.level}
        </span>
        <div className="min-w-[140px] flex-1">
          <div className="mb-1 flex justify-between text-[11px] text-app-3">
            <span>XP {xpInLevel}/100</span>
            <span>{wallet.xp} {t("إجمالي", "total")}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-app-3/20">
            <div className="h-full gradient-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-sm font-bold text-warning">
          <Flame size={15} />
          {wallet.streakDays} {t("يوم", "days")}
        </span>
      </div>

      {/* الإحصائيات */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="glass !rounded-2xl p-3 text-center">
            <span className="gradient-primary mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-xl">
              <tile.icon size={16} />
            </span>
            <div className="font-display text-lg font-extrabold text-app">{tile.value}</div>
            <div className="text-[10.5px] text-app-3">{tile.label}</div>
          </div>
        ))}
      </div>

      {/* التبويبات */}
      <div className="mt-6 flex items-center gap-1 overflow-x-auto rounded-full border border-app bg-[var(--surface)] p-1 text-xs">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 font-semibold transition-colors ${
              tab === tb.key ? "bg-primary text-[var(--primary-ink)]" : "text-app-3 hover:text-app"
            }`}
          >
            <tb.icon size={14} />
            {t(tb.ar, tb.en)}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "comments" && <CommentsTab username={username} />}
        {tab === "posts" && <PostsTab username={username} />}
        {tab === "followers" && <FollowTab username={username} kind="followers" />}
        {tab === "following" && <FollowTab username={username} kind="following" />}
        {tab === "social" && (
          <SocialTab
            isSelf={isSelf}
            links={user.socialLinks ?? []}
            onSaved={() => utils.users.publicProfile.invalidate({ username })}
          />
        )}
      </div>
    </motion.div>
  );
}

const TABS: { key: TabKey; ar: string; en: string; icon: typeof MessageSquare }[] = [
  { key: "comments", ar: "التعليقات", en: "Comments", icon: MessageSquare },
  { key: "posts", ar: "المنشورات", en: "Posts", icon: BookOpen },
  { key: "followers", ar: "المتابِعون", en: "Followers", icon: Users },
  { key: "following", ar: "يتابع", en: "Following", icon: UserPlus },
  { key: "social", ar: "روابط", en: "Social", icon: LinkIcon },
];

/* ================= تبويب التعليقات ================= */
function CommentsTab({ username }: { username: string }) {
  const { t, lang } = useLanguage();
  const q = trpc.users.userComments.useQuery({ username, page: 1, limit: 30 }, { retry: false });
  if (q.isLoading) return <Skeleton />;
  const items = q.data?.items ?? [];
  if (items.length === 0) return <Empty text={t("لا تعليقات بعد", "No comments yet")} />;
  return (
    <div className="flex flex-col gap-3">
      {items.map((c) => (
        <Link
          key={c.id}
          to={`/manga/${c.mangaSlug}`}
          className="glass block !rounded-2xl p-3.5 transition-colors hover:border-[var(--border-glow)]"
        >
          <div className="mb-1 flex items-center gap-2">
            {c.stars != null && (
              <span className="flex items-center gap-0.5 text-warning" dir="ltr">
                <Star size={12} fill="currentColor" /> {c.stars}
              </span>
            )}
            <span className="truncate text-xs font-bold text-primary">{c.mangaTitle}</span>
            <span className="ms-auto shrink-0 text-[11px] text-app-3">{timeAgo(c.createdAt, lang)}</span>
          </div>
          {c.content && <p className="line-clamp-3 text-sm leading-6 text-app-2">{c.content}</p>}
        </Link>
      ))}
    </div>
  );
}

/* ================= تبويب المنشورات ================= */
function PostsTab({ username }: { username: string }) {
  const { t, lang } = useLanguage();
  const q = trpc.users.userPosts.useQuery({ username, page: 1, limit: 30 }, { retry: false });
  if (q.isLoading) return <Skeleton />;
  const items = q.data?.items ?? [];
  if (items.length === 0) return <Empty text={t("لا منشورات بعد", "No posts yet")} />;
  return (
    <div className="flex flex-col gap-3">
      {items.map((p) => (
        <div key={p.id} className="glass !rounded-2xl p-3.5">
          <p className="whitespace-pre-wrap text-sm leading-7 text-app-2">{p.body}</p>
          {p.imageUrl && (
            <img src={p.imageUrl} alt="" loading="lazy" className="mt-2 max-h-72 rounded-lg border border-app" />
          )}
          <div className="mt-2 flex items-center gap-3 text-[11px] text-app-3">
            <span className="inline-flex items-center gap-1">
              <Heart size={13} /> {p.likes}
            </span>
            <span className="ms-auto">{timeAgo(p.createdAt, lang)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================= تبويب المتابعين/يتابع ================= */
function FollowTab({ username, kind }: { username: string; kind: "followers" | "following" }) {
  const { t } = useLanguage();
  const q = trpc.users.followList.useQuery({ username, kind, limit: 100 }, { retry: false });
  if (q.isLoading) return <Skeleton />;
  const items = q.data?.items ?? [];
  if (items.length === 0)
    return <Empty text={kind === "followers" ? t("لا متابِعين بعد", "No followers yet") : t("لا يتابع أحداً بعد", "Not following anyone")} />;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((u) => (
        <Link
          key={u.id}
          to={u.username ? `/u/${u.username}` : "#"}
          className="glass flex items-center gap-3 !rounded-2xl p-2.5 transition-colors hover:border-[var(--border-glow)]"
        >
          <img
            src={proxyImg(u.avatarUrl) || "/placeholder-avatar.svg"}
            alt=""
            loading="lazy"
            className="h-9 w-9 shrink-0 rounded-full border border-app object-cover"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-app">{u.name ?? u.username}</div>
            {u.username && <div className="truncate text-[11px] text-app-3" dir="ltr">@{u.username}</div>}
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ================= تبويب روابط السوشيال ================= */
function SocialTab({
  isSelf,
  links,
  onSaved,
}: {
  isSelf: boolean;
  links: { label: string; url: string }[];
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ label: string; url: string }[]>(links);
  const save = trpc.users.updateSocialLinks.useMutation({
    onSuccess: () => {
      setEditing(false);
      onSaved();
    },
  });

  if (isSelf && editing) {
    return (
      <div className="glass !rounded-2xl p-4">
        <div className="flex flex-col gap-2">
          {draft.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={l.label}
                onChange={(e) =>
                  setDraft((d) => d.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
                placeholder={t("الاسم", "Label")}
                className="input-glass w-28 shrink-0 text-sm"
              />
              <input
                value={l.url}
                onChange={(e) =>
                  setDraft((d) => d.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                }
                placeholder="https://…"
                dir="ltr"
                className="input-glass min-w-0 flex-1 text-sm"
              />
              <button
                onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
                className="shrink-0 text-danger"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          {draft.length < 8 && (
            <button
              onClick={() => setDraft((d) => [...d, { label: "", url: "" }])}
              className="btn-glass !px-3 !py-1.5 text-xs"
            >
              <Plus size={14} /> {t("إضافة", "Add")}
            </button>
          )}
          <button
            onClick={() => save.mutate({ links: draft.filter((l) => l.label.trim() && l.url.trim()) })}
            disabled={save.isPending}
            className="btn-primary ms-auto !px-4 !py-1.5 text-xs disabled:opacity-50"
          >
            {t("حفظ", "Save")}
          </button>
          <button onClick={() => setEditing(false)} className="btn-glass !px-3 !py-1.5 text-xs">
            {t("إلغاء", "Cancel")}
          </button>
        </div>
        {save.isError && <p className="mt-2 text-xs text-danger">{save.error.message}</p>}
      </div>
    );
  }

  return (
    <div>
      {links.length === 0 ? (
        <Empty text={t("لا روابط اجتماعية بعد", "No social links yet")} />
      ) : (
        <div className="flex flex-col gap-2">
          {links.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="glass flex items-center gap-3 !rounded-2xl p-3 transition-colors hover:border-[var(--border-glow)]"
            >
              <LinkIcon size={15} className="shrink-0 text-primary" />
              <span className="text-sm font-semibold text-app">{l.label}</span>
              <span className="ms-auto truncate text-[11px] text-app-3" dir="ltr">{l.url}</span>
            </a>
          ))}
        </div>
      )}
      {isSelf && (
        <button
          onClick={() => {
            setDraft(links);
            setEditing(true);
          }}
          className="btn-glass mt-3 !px-4 !py-2 text-xs"
        >
          <LinkIcon size={14} /> {t("تعديل الروابط الاجتماعية", "Edit social links")}
        </button>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="skeleton h-20 !rounded-2xl" />
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="glass !rounded-2xl px-4 py-10 text-center text-sm text-app-3">{text}</p>;
}
