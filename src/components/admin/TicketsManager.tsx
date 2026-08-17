import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock, LifeBuoy, Lock, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import EmptyState from "@/components/EmptyState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { proxyImg, timeAgo } from "@/lib/manga";
import { EASE } from "./adminUtils";
import type { RouterOutputs } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

type TicketStatus = "open" | "answered" | "closed";
type Filter = "all" | TicketStatus;

type ApiTicket = RouterOutputs["support"]["listTickets"]["items"][number];

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

export default function TicketsManager() {
  const { t, lang } = useLanguage();
  const toast = useAdminToast();

  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [overrides, setOverrides] = useState<Record<number, TicketStatus>>({});
  const [openId, setOpenId] = useState<number | null>(null);
  const [reply, setReply] = useState("");

  const query = trpc.support.listTickets.useQuery(
    { status: filter === "all" ? undefined : filter, page, limit: 20 },
    { retry: false, placeholderData: (prev) => prev },
  );

  const detail = trpc.support.getTicket.useQuery(
    { id: openId ?? 0 },
    { retry: false, enabled: openId !== null },
  );

  const statusMut = trpc.support.setTicketStatus.useMutation({
    onSuccess: () => {
      void query.refetch();
      void detail.refetch();
    },
  });

  const replyMut = trpc.support.replyTicket.useMutation({
    onSuccess: () => {
      setReply("");
      void query.refetch();
      void detail.refetch();
      toast(t("أُرسل الرد وأُشعر المستخدم", "Reply sent and user notified"));
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    let list = (query.data?.items ?? []).map((r) => ({
      ...r,
      status: overrides[r.id] ?? (r.status as TicketStatus),
    }));
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (r) =>
          r.subject.toLowerCase().includes(term) ||
          (r.userName ?? "").toLowerCase().includes(term) ||
          String(r.id) === term,
      );
    }
    return list;
  }, [query.data, overrides, search]);

  const setStatus = (id: number, status: TicketStatus) => {
    setOverrides((prev) => ({ ...prev, [id]: status }));
    statusMut.mutate(
      { id, status },
      {
        onError: () => {
          setOverrides((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          toast(t("تعذّر تحديث حالة التذكرة", "Couldn't update ticket status"), "danger");
        },
      },
    );
  };

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: t("الكل", "All") },
    { key: "open", label: t("مفتوحة", "Open") },
    { key: "answered", label: t("تم الرد", "Answered") },
    { key: "closed", label: t("مغلقة", "Closed") },
  ];

  const openTicket = detail.data;
  const openStatus = openTicket ? (overrides[openTicket.ticket.id] ?? openTicket.ticket.status) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setFilter(f.key);
              setPage(1);
            }}
            className={`glass-chip relative !px-4 ${filter === f.key ? "!text-white" : ""}`}
          >
            {filter === f.key && (
              <motion.span layoutId="admin-ticket-pill" className="gradient-primary absolute inset-0 rounded-full" transition={{ duration: 0.3, ease: EASE }} />
            )}
            <span className="relative z-10">{f.label}</span>
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("ابحث بالعنوان أو اسم المستخدم أو رقم التذكرة…", "Search by subject, user, or ticket #…")}
        className="input-glass w-full !py-2 text-sm"
      />

      {query.isLoading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="glass">
          <EmptyState title={t("لا تذاكر", "No tickets")} caption={t("لا تذاكر بهذه الحالة حالياً.", "No tickets with this status right now.")} />
        </div>
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence initial={false}>
            {rows.map((r: ApiTicket & { status: TicketStatus }, i: number) => {
              const s = (STATUS_LABEL[r.status] ? r.status : "open") as TicketStatus;
              const Icon = s === "open" ? Clock : s === "answered" ? CheckCircle2 : Lock;
              return (
                <motion.li
                  key={r.id}
                  layout="position"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 15) * 0.03 }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(r.id)}
                    className="glass flex w-full flex-wrap items-center gap-3 !rounded-2xl p-4 text-start transition-colors hover:border-[var(--border-glow)]"
                  >
                    <span className={`glass-chip shrink-0 !px-2.5 !py-1 !text-[11px] font-bold ${STATUS_STYLE[s]}`}>
                      <Icon size={12} />
                      {t(...STATUS_LABEL[s])}
                    </span>
                    <span className="min-w-40 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="font-display text-sm font-bold text-app">{r.subject}</span>
                        <span className="text-[11px] text-app-3">#{r.id}</span>
                        {s === "open" && (
                          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">!</span>
                        )}
                      </span>
                      <span className="mt-0.5 line-clamp-1 block text-xs text-app-3">
                        {r.userName} · {timeAgo(r.updatedAt, lang)} — {r.excerpt}
                      </span>
                    </span>
                    <span className="glass-chip shrink-0 !px-2 !py-0.5 !text-[10px]">
                      {r.messagesCount} {t("رسالة", "msgs")}
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {(query.data?.total ?? 0) > 20 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-glass !px-4 !py-2 text-xs disabled:opacity-50"
          >
            {t("السابق", "Prev")}
          </button>
          <span className="text-xs text-app-3 tabular-nums">{page}</span>
          <button
            disabled={page * 20 >= (query.data?.total ?? 0)}
            onClick={() => setPage((p) => p + 1)}
            className="btn-glass !px-4 !py-2 text-xs disabled:opacity-50"
          >
            {t("التالي", "Next")}
          </button>
        </div>
      )}

      {/* مودال خيط التذكرة */}
      <Dialog open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent className="glass-strong max-h-[85vh] overflow-y-auto border-app sm:max-w-2xl">
          {detail.isLoading || !openTicket ? (
            <div className="space-y-2.5 py-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-16" />
              ))}
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-display flex items-center gap-2 text-app">
                  <LifeBuoy size={17} className="text-primary" />
                  {openTicket.ticket.subject}
                  <span className="text-xs font-normal text-app-3">#{openTicket.ticket.id}</span>
                </DialogTitle>
                <DialogDescription className="text-app-2">
                  {openTicket.ownerName} · {timeAgo(openTicket.ticket.createdAt, lang)} ·{" "}
                  {t(...STATUS_LABEL[(openStatus as TicketStatus) ?? "open"])}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-2.5 py-2">
                {openTicket.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`glass !rounded-2xl p-3.5 ${m.isAdmin ? "border-s-2 !border-s-primary" : ""}`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-[11px]">
                      {m.isAdmin ? (
                        <span className="glass-chip !border-primary/40 !px-2 !py-0.5 !text-[10px] font-bold text-primary">
                          {t("الإدارة", "Staff")}
                        </span>
                      ) : (
                        <span className="font-semibold text-app-2">{m.authorName ?? openTicket.ownerName}</span>
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

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reply.trim() || openId === null) return;
                  replyMut.mutate({ id: openId, body: reply.trim() });
                }}
                className="flex flex-col gap-2.5"
              >
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  maxLength={5000}
                  placeholder={t("اكتب رد الإدارة…", "Write the staff reply…")}
                  className="input-glass w-full resize-y text-sm"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    {openStatus !== "closed" ? (
                      <button
                        type="button"
                        onClick={() => openId !== null && setStatus(openId, "closed")}
                        className="btn-glass !px-4 !py-2 text-xs !text-danger"
                      >
                        <Lock size={13} /> {t("إغلاق", "Close")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openId !== null && setStatus(openId, "open")}
                        className="btn-glass !px-4 !py-2 text-xs !text-success"
                      >
                        <CheckCircle2 size={13} /> {t("إعادة فتح", "Reopen")}
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={replyMut.isPending || !reply.trim()}
                    className="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-60"
                  >
                    <Send size={14} />
                    {replyMut.isPending ? t("جارٍ الإرسال…", "Sending…") : t("رد وإشعار المستخدم", "Reply & notify")}
                  </button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
