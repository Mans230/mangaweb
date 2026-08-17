import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  Image as ImageIcon,
  LifeBuoy,
  Loader2,
  Lock,
  LogIn,
  MessageSquare,
  Plus,
  Send,
  X,
} from "lucide-react";
import { useImageUpload, IMAGE_ACCEPT } from "@/lib/upload";
import { proxyImg } from "@/lib/manga";
import EmptyState from "@/components/EmptyState";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { LOGIN_PATH } from "@/const";
import { timeAgo } from "@/lib/manga";
import { trpc } from "@/providers/trpc";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

type TicketStatus = "open" | "answered" | "closed";
type Category = "general" | "technical" | "source" | "other";

const STATUS_LABEL: Record<TicketStatus, [string, string]> = {
  open: ["مفتوحة", "Open"],
  answered: ["تم الرد", "Answered"],
  closed: ["مغلقة", "Closed"],
};

const STATUS_STYLE: Record<TicketStatus, string> = {
  open: "!border-warning/40 text-warning",
  answered: "!border-success/40 text-success",
  closed: "!border-app text-app-3",
};

const CATEGORY_LABEL: Record<Category, [string, string]> = {
  general: ["عام", "General"],
  technical: ["مشكلة تقنية", "Technical issue"],
  source: ["طلب مصدر", "Source request"],
  other: ["أخرى", "Other"],
};

function statusChip(status: string, t: (ar: string, en: string) => string) {
  const s = (STATUS_LABEL[status as TicketStatus] ? status : "open") as TicketStatus;
  return (
    <span className={`glass-chip shrink-0 !px-2.5 !py-0.5 !text-[10px] font-bold ${STATUS_STYLE[s]}`}>
      {t(...STATUS_LABEL[s])}
    </span>
  );
}

/* ================= قائمة التذاكر ================= */
function TicketList({ onOpen, onNew }: { onOpen: (id: number) => void; onNew: () => void }) {
  const { t, lang } = useLanguage();
  const query = trpc.support.list.useQuery(undefined, { retry: false });
  const items = query.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-app">{t("تذاكري", "My tickets")}</h2>
        <button type="button" onClick={onNew} className="btn-primary !px-4 !py-2 text-xs">
          <Plus size={14} />
          {t("تذكرة جديدة", "New ticket")}
        </button>
      </div>

      {query.isLoading ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-20 !rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="glass">
          <EmptyState
            title={t("لا تذاكر بعد", "No tickets yet")}
            caption={t("تحتاج مساعدة؟ افتح تذكرة وسيرد عليك فريق الدعم.", "Need help? Open a ticket and the support team will reply.")}
          />
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((ticket, i) => (
            <motion.li
              key={ticket.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 12) * 0.03 }}
            >
              <button
                type="button"
                onClick={() => onOpen(ticket.id)}
                className="glass flex w-full items-center gap-3 !rounded-2xl p-4 text-start transition-colors hover:border-[var(--border-glow)]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <LifeBuoy size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-app">{ticket.subject}</span>
                    {ticket.unreadAdmin > 0 && (
                      <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white tabular-nums">
                        {ticket.unreadAdmin}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-[11px] text-app-3">
                    {ticket.excerpt || t("بلا رسائل", "No messages")} · {timeAgo(ticket.updatedAt, lang)}
                  </span>
                </span>
                {statusChip(ticket.status, t)}
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* زر إرفاق صورة مشترك للنماذج */
function AttachImage({
  url,
  setUrl,
}: {
  url: string | null;
  setUrl: (u: string | null) => void;
}) {
  const { t } = useLanguage();
  const { upload, uploading } = useImageUpload();
  const ref = useRef<HTMLInputElement>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    const u = await upload(f);
    if (u) setUrl(u);
    if (ref.current) ref.current.value = "";
  };
  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {url ? (
        <span className="flex items-center gap-1.5 text-[11px] text-app-2">
          <img src={proxyImg(url)} alt="" className="h-9 w-9 rounded object-cover" />
          <button type="button" onClick={() => setUrl(null)} className="font-semibold text-danger">
            {t("إزالة", "Remove")}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="btn-glass !px-3 !py-1.5 text-xs disabled:opacity-50"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
          {t("إرفاق صورة", "Attach image")}
        </button>
      )}
    </div>
  );
}

/* ================= نموذج تذكرة جديدة ================= */
function NewTicketForm({ onDone, onCancel }: { onDone: (id: number) => void; onCancel: () => void }) {
  const { t } = useLanguage();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<Category>("general");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  const mutation = trpc.support.create.useMutation({
    onSuccess: (r) => onDone(r.id),
    onError: (e) => setError(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    mutation.mutate({ subject: subject.trim(), category, body: body.trim(), imageUrl });
  };

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="glass flex flex-col gap-4 !rounded-2xl p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-app">{t("تذكرة جديدة", "New ticket")}</h2>
        <button type="button" onClick={onCancel} className="btn-icon !h-8 !w-8" aria-label={t("إلغاء", "Cancel")}>
          <X size={15} />
        </button>
      </div>

      <label className="flex flex-col gap-1.5 text-xs font-semibold text-app-2">
        {t("العنوان", "Subject")}
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          required
          className="input-glass"
          placeholder={t("مثال: الفصول لا تُحمَّل في عمل معيّن", "e.g. chapters won't load for a certain title")}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-xs font-semibold text-app-2">
        {t("التصنيف", "Category")}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          className="input-glass"
        >
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
            <option key={c} value={c}>
              {t(...CATEGORY_LABEL[c])}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-xs font-semibold text-app-2">
        {t("تفاصيل المشكلة", "Details")}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={5}
          maxLength={5000}
          className="input-glass resize-y"
          placeholder={t("اشرح المشكلة بالتفصيل — متى بدأت؟ على أي صفحة؟", "Describe the issue in detail — when did it start? on which page?")}
        />
      </label>

      <AttachImage url={imageUrl} setUrl={setImageUrl} />

      {error && <p className="text-xs font-semibold text-danger">{error}</p>}

      <button type="submit" disabled={mutation.isPending} className="btn-primary !py-3 text-sm disabled:opacity-60">
        <Send size={15} />
        {mutation.isPending ? t("جارٍ الإرسال…", "Sending…") : t("إرسال التذكرة", "Send ticket")}
      </button>
    </motion.form>
  );
}

/* ================= عرض التذكرة (خيط الرسائل) ================= */
function TicketThread({ id, onBack }: { id: number; onBack: () => void }) {
  const { t, lang } = useLanguage();
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const query = trpc.support.get.useQuery({ id }, { retry: false });
  const utils = trpc.useUtils();

  const replyMut = trpc.support.reply.useMutation({
    onSuccess: () => {
      setBody("");
      setImageUrl(null);
      void query.refetch();
      void utils.support.list.invalidate();
    },
  });
  const closeMut = trpc.support.close.useMutation({
    onSuccess: () => {
      void query.refetch();
      void utils.support.list.invalidate();
    },
  });

  if (query.isLoading) {
    return <div className="skeleton h-72 !rounded-2xl" />;
  }
  if (!query.data) {
    return (
      <div className="glass">
        <EmptyState title={t("التذكرة غير موجودة", "Ticket not found")} />
      </div>
    );
  }

  const { ticket, messages } = query.data;
  const closed = ticket.status === "closed";
  const catKey = (ticket.category in CATEGORY_LABEL ? ticket.category : "general") as Category;

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    replyMut.mutate({ id, body: body.trim(), imageUrl });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="btn-icon !h-9 !w-9" aria-label={t("رجوع", "Back")}>
          <ArrowRight size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-base font-bold text-app">{ticket.subject}</h2>
          <p className="text-[11px] text-app-3">
            #{ticket.id} · {t(...CATEGORY_LABEL[catKey])} · {timeAgo(ticket.createdAt, lang)}
          </p>
        </div>
        {statusChip(ticket.status, t)}
        {!closed && (
          <button
            type="button"
            onClick={() => closeMut.mutate({ id })}
            disabled={closeMut.isPending}
            className="btn-glass !px-3.5 !py-2 text-xs !text-danger"
          >
            <Lock size={13} />
            {t("إغلاق التذكرة", "Close ticket")}
          </button>
        )}
      </div>

      {/* الرسائل */}
      <div className="flex flex-col gap-2.5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`glass !rounded-2xl p-4 ${
              m.isAdmin ? "border-s-2 !border-s-primary" : ""
            }`}
          >
            <div className="mb-1.5 flex items-center gap-2 text-[11px]">
              {m.isAdmin ? (
                <span className="glass-chip !border-primary/40 !px-2 !py-0.5 !text-[10px] font-bold text-primary">
                  {t("الإدارة", "Staff")}
                </span>
              ) : (
                <span className="font-semibold text-app-2">{m.authorName ?? t("أنت", "You")}</span>
              )}
              <span className="text-app-3">{timeAgo(m.createdAt, lang)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-7 text-app">{m.body}</p>
            {m.imageUrl && (
              <a href={proxyImg(m.imageUrl)} target="_blank" rel="noopener noreferrer">
                <img
                  src={proxyImg(m.imageUrl)}
                  alt=""
                  className="mt-2 max-h-60 rounded-xl border border-app object-contain"
                />
              </a>
            )}
          </div>
        ))}
      </div>

      {/* صندوق الرد */}
      {closed ? (
        <div className="glass flex items-center gap-2.5 !rounded-2xl p-4 text-xs text-app-3">
          <CheckCircle2 size={15} className="text-success" />
          {t("هذه التذكرة مغلقة. تحتاج شيئاً آخر؟ افتح تذكرة جديدة.", "This ticket is closed. Need something else? Open a new ticket.")}
        </div>
      ) : (
        <form onSubmit={send} className="glass flex flex-col gap-3 !rounded-2xl p-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={5000}
            className="input-glass resize-y"
            placeholder={t("اكتب ردّك…", "Write your reply…")}
          />
          <div className="flex items-center justify-between gap-2">
            <AttachImage url={imageUrl} setUrl={setImageUrl} />
          </div>
          <button type="submit" disabled={replyMut.isPending || !body.trim()} className="btn-primary self-end !px-5 !py-2.5 text-xs disabled:opacity-60">
            <Send size={14} />
            {replyMut.isPending ? t("جارٍ الإرسال…", "Sending…") : t("رد", "Reply")}
          </button>
        </form>
      )}
    </motion.div>
  );
}

/* ================= الصفحة ================= */
/* ================= الأسئلة الشائعة ================= */
const FAQ: { q: [string, string]; a: [string, string] }[] = [
  {
    q: ["الصور مكسورة أو لا تظهر", "Images are broken or missing"],
    a: [
      "اعمل تحديث قوي (Ctrl+Shift+R). لو استمر، الصورة القديمة مخزّنة — امسح كاش الموقع من إعدادات المتصفح.",
      "Hard refresh (Ctrl+Shift+R). If it persists, clear the site cache from your browser settings.",
    ],
  },
  {
    q: ["تسجيل الدخول بتليجرام لا يعمل", "Telegram login not working"],
    a: [
      "عطّل مانع الإعلانات لهذا الموقع وجرّب متصفحاً آخر — ودجت تليجرام يحتاج كوكيز الطرف الثالث.",
      "Disable your ad blocker for this site and try another browser — the Telegram widget needs third-party cookies.",
    ],
  },
  {
    q: ["لا أستطيع رفع صورة الملف الشخصي", "Can't upload a profile picture"],
    a: [
      "استخدم زر الرفع من جهازك في «تخصيص الملف». الحد 5MB وصيغ jpg/png/webp/gif.",
      "Use the upload-from-device button in Customize profile. Max 5MB, formats jpg/png/webp/gif.",
    ],
  },
  {
    q: ["كيف أكسب الكوينز؟", "How do I earn coins?"],
    a: [
      "اقرأ الفصول، سجّل حضورك يومياً، أكمل المهام، ولفّ عجلة الحظ من صفحة الكوينز.",
      "Read chapters, check in daily, finish missions, and spin the lucky wheel on the Coins page.",
    ],
  },
  {
    q: ["فصل لا يفتح", "A chapter won't open"],
    a: [
      "غالباً المصدر ضغط مؤقتاً — جرّب بعد دقائق. لو استمر لعمل واحد، افتح تذكرة بالرابط.",
      "Usually the source is temporarily rate-limited — try again in a few minutes. If it persists for one title, open a ticket with the link.",
    ],
  },
];

function FaqSection() {
  const { t } = useLanguage();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="glass mb-6 !rounded-2xl p-4 md:p-5">
      <h2 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
        <HelpCircle size={16} className="text-primary" />
        {t("أسئلة شائعة", "Frequently asked")}
      </h2>
      <div className="flex flex-col divide-y divide-[var(--border)]">
        {FAQ.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="py-1">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-3 py-2.5 text-start text-sm font-semibold text-app-2 hover:text-app"
              >
                {t(item.q[0], item.q[1])}
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-app-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <p className="pb-3 text-[13px] leading-relaxed text-app-3">
                  {t(item.a[0], item.a[1])}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Support() {
  const { t } = useLanguage();
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<{ kind: "list" } | { kind: "new" } | { kind: "thread"; id: number }>({ kind: "list" });

  if (!isLoading && !isAuthenticated) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <span className="glass flex h-16 w-16 items-center justify-center rounded-3xl text-primary">
          <LifeBuoy size={26} />
        </span>
        <h1 className="font-display text-xl font-bold text-app">{t("الدعم", "Support")}</h1>
        <p className="text-sm text-app-3">{t("سجّل الدخول لفتح تذكرة دعم أو متابعة تذاكرك.", "Sign in to open a support ticket or follow yours.")}</p>
        <Link to={LOGIN_PATH} className="btn-primary !px-6 !py-2.5 text-sm">
          <LogIn size={15} />
          {t("دخول", "Sign in")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
      <div className="mb-6 flex items-center gap-3">
        <span className="gradient-primary flex h-12 w-12 items-center justify-center rounded-2xl text-white">
          <MessageSquare size={20} />
        </span>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-app">{t("الدعم", "Support")}</h1>
          <p className="text-xs text-app-3">{t("فريقنا يرد عادة خلال 24 ساعة.", "Our team usually replies within 24 hours.")}</p>
        </div>
      </div>

      {view.kind === "list" && <FaqSection />}

      <AnimatePresence mode="wait">
        <motion.div key={view.kind + (view.kind === "thread" ? view.id : "")} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {view.kind === "list" && (
            <TicketList
              onOpen={(id) => setView({ kind: "thread", id })}
              onNew={() => setView({ kind: "new" })}
            />
          )}
          {view.kind === "new" && (
            <NewTicketForm
              onDone={(id) => {
                setView({ kind: "thread", id });
                navigate("/support", { replace: true });
              }}
              onCancel={() => setView({ kind: "list" })}
            />
          )}
          {view.kind === "thread" && (
            <TicketThread id={view.id} onBack={() => setView({ kind: "list" })} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
