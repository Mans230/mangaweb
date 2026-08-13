import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Radio } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { useToast } from "@/components/library/toast";
import Composer from "./Composer";
import MessageItem from "./MessageItem";
import type { CommunityMessage } from "./types";

const POLL_MS = 4000;
const PAGE = 50;

interface LiveChatTabProps {
  mangaId: number;
  isAuthenticated: boolean;
  isAdmin: boolean;
  currentUserId: number | null;
  userAvatar?: string | null;
}

/**
 * تبويب «الشات المباشر» — فقاعات + تمرير تلقائي لأسفل
 * + polling كل ٤ ثوانٍ بـ afterId=آخر id لجلب الجديد فقط.
 */
export default function LiveChatTab({
  mangaId,
  isAuthenticated,
  isAdmin,
  currentUserId,
  userAvatar,
}: LiveChatTabProps) {
  const { t } = useLanguage();
  const { toast } = useToast();

  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [afterId, setAfterId] = useState(0);
  const [primedFor, setPrimedFor] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // لا نمرّر تلقائياً إن كان المستخدم صاعداً لقراءة رسائل أقدم
  const stickToBottom = useRef(true);

  // إعادة ضبط كاملة عند الانتقال لمجتمع مانجا أخرى ضمن نفس المسار (render-adjust)
  const [prevMangaId, setPrevMangaId] = useState(mangaId);
  if (mangaId !== prevMangaId) {
    setPrevMangaId(mangaId);
    setMessages([]);
    setAfterId(0);
    setPrimedFor(null);
  }

  const chatQ = trpc.community.listMessages.useQuery(
    { mangaId, afterId: afterId || undefined, limit: PAGE },
    {
      retry: false,
      refetchInterval: POLL_MS,
      refetchIntervalInBackground: false,
    },
  );

  // دمج القادم الجديد بنمط render-adjust (react-query يعيد مرجعاً جديداً لكل جلب):
  // أول جلب (بلا afterId) يرجع الأحدث تنازلياً → نعكسه، ولاحقاً نلحق الجديد فقط
  const fetched = chatQ.data as CommunityMessage[] | undefined;
  const [prevFetched, setPrevFetched] = useState<typeof fetched>(undefined);
  if (fetched && fetched !== prevFetched) {
    setPrevFetched(fetched);
    if (fetched.length > 0) {
      if (primedFor !== mangaId) {
        setMessages([...fetched].reverse());
        setAfterId(fetched[0].id); // تنازلي: الأكبر أولاً
        setPrimedFor(mangaId);
      } else {
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          const fresh = fetched.filter((m) => !known.has(m.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
        setAfterId(fetched[fetched.length - 1].id); // تصاعدي مع afterId: الأكبر أخيراً
      }
    }
  }

  // تمرير لأسفل عند وصول رسائل جديدة إن كان المستخدم ملتصقاً بالأسفل
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const postMut = trpc.community.postMessage.useMutation({
    onSuccess: (row) => {
      if (row) {
        setMessages((prev) =>
          prev.some((m) => m.id === row.id) ? prev : [...prev, row as CommunityMessage],
        );
        if (row.id > afterId) setAfterId(row.id);
        stickToBottom.current = true;
      }
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });
  const deleteMut = trpc.community.deleteMessage.useMutation({
    onSuccess: (_d, vars) =>
      setMessages((prev) => prev.filter((m) => m.id !== vars.id)),
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const loading = chatQ.isLoading && primedFor !== mangaId;

  return (
    <div className="flex flex-col gap-3">
      {/* شريط الحالة */}
      <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-success">
        <Radio size={12} className="animate-pulse-soft" />
        {t("شات مباشر — يتحدّث تلقائياً كل ٤ ثوانٍ", "Live chat — auto-refreshes every 4s")}
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="glass flex max-h-[60vh] min-h-[320px] flex-col gap-3 overflow-y-auto !rounded-3xl p-4"
      >
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`skeleton h-12 !rounded-2xl ${i % 2 ? "me-auto w-2/3" : "ms-auto w-1/2"}`} />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            title={t("الشات هادئ", "Chat is quiet")}
            caption={t("ابدأ الحديث — رسالتك تظهر فوراً للجميع.", "Start the conversation — your message appears instantly for everyone.")}
          />
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                bubble
                mine={currentUserId === m.userId}
                canDelete={currentUserId === m.userId || isAdmin}
                deletePending={deleteMut.isPending}
                onDelete={(id) => deleteMut.mutate({ id })}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      <Composer
        isAuthenticated={isAuthenticated}
        userAvatar={userAvatar}
        replyTo={null}
        onCancelReply={() => {}}
        pending={postMut.isPending}
        onSubmit={(text) => postMut.mutate({ mangaId, body: text })}
      />
    </div>
  );
}
