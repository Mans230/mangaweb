import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ArrowDown, MessagesSquare } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { useToast } from "@/components/library/toast";
import Composer from "./Composer";
import MessageItem from "./MessageItem";
import { buildQuotedBody } from "./types";
import type { CommunityMessage } from "./types";

const PAGE = 50;

interface DiscussionTabProps {
  mangaId: number;
  isAuthenticated: boolean;
  isAdmin: boolean;
  currentUserId: number | null;
  userAvatar?: string | null;
}

/**
 * تبويب «النقاش» — أحدث الرسائل بترتيب زمني تصاعدي،
 * مع «تحميل رسائل أقدم» (beforeId) وردّ-خفيف بالاقتباس.
 */
export default function DiscussionTab({
  mangaId,
  isAuthenticated,
  isAdmin,
  currentUserId,
  userAvatar,
}: DiscussionTabProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<CommunityMessage | null>(null);

  // إعادة ضبط عند الانتقال لمجتمع مانجا أخرى ضمن نفس المسار (render-adjust)
  const [prevMangaId, setPrevMangaId] = useState(mangaId);
  if (mangaId !== prevMangaId) {
    setPrevMangaId(mangaId);
    setMessages([]);
    setHasMore(false);
    setLoadedFor(null);
    setReplyTo(null);
  }

  const initialQ = trpc.community.listMessages.useQuery(
    { mangaId, limit: PAGE },
    { retry: false },
  );

  // تهيئة أولية: الخادم يعيد الأحدث تنازلياً → نعكس للعرض الزمني
  useEffect(() => {
    if (!initialQ.data || loadedFor === mangaId) return;
    setMessages([...(initialQ.data as CommunityMessage[])].reverse());
    setHasMore(initialQ.data.length >= PAGE);
    setLoadedFor(mangaId);
  }, [initialQ.data, loadedFor, mangaId]);

  const loadOlder = async () => {
    const oldest = messages[0]?.id;
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const older = (await utils.community.listMessages.fetch({
        mangaId,
        beforeId: oldest,
        limit: PAGE,
      })) as CommunityMessage[];
      setMessages((prev) => [...[...older].reverse(), ...prev]);
      setHasMore(older.length >= PAGE);
    } catch {
      toast(t("تعذّر تحميل الرسائل الأقدم", "Could not load older messages"), { kind: "info" });
    } finally {
      setLoadingOlder(false);
    }
  };

  const postMut = trpc.community.postMessage.useMutation({
    onSuccess: (row) => {
      if (row) setMessages((prev) => [...prev, row as CommunityMessage]);
      setReplyTo(null);
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });
  const deleteMut = trpc.community.deleteMessage.useMutation({
    onSuccess: (_d, vars) =>
      setMessages((prev) => prev.filter((m) => m.id !== vars.id)),
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const submit = (text: string) => {
    const body = replyTo ? buildQuotedBody(replyTo, text) : text;
    postMut.mutate({ mangaId, body });
  };

  if (initialQ.isLoading && loadedFor !== mangaId) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-16 !rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {hasMore && (
        <button
          onClick={() => void loadOlder()}
          disabled={loadingOlder}
          className="btn-glass mx-auto !px-5 !py-2 text-xs font-semibold disabled:opacity-50"
        >
          <ArrowDown size={13} className="rotate-180" />
          {loadingOlder ? t("جارٍ التحميل…", "Loading…") : t("تحميل رسائل أقدم", "Load older messages")}
        </button>
      )}

      {loadedFor === mangaId && messages.length === 0 ? (
        <div className="glass">
          <EmptyState
            title={t("لا نقاش بعد", "No discussion yet")}
            caption={t("كن أول من يشارك رأيه حول هذا العمل.", "Be the first to share your thoughts on this title.")}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout">
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                mine={currentUserId === m.userId}
                canDelete={currentUserId === m.userId || isAdmin}
                deletePending={deleteMut.isPending}
                onDelete={(id) => deleteMut.mutate({ id })}
                onReply={isAuthenticated ? setReplyTo : undefined}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <div className="sticky bottom-20 md:bottom-6">
        <div className="pointer-events-none absolute -top-8 inset-x-0 h-8 bg-gradient-to-t from-[var(--bg)] to-transparent" aria-hidden />
        <Composer
          isAuthenticated={isAuthenticated}
          userAvatar={userAvatar}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          pending={postMut.isPending}
          onSubmit={submit}
        />
      </div>

      {messages.length > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-app-3">
          <MessagesSquare size={12} />
          {t(`${messages.length} رسالة في هذا النقاش`, `${messages.length} messages in this discussion`)}
        </p>
      )}
    </div>
  );
}
