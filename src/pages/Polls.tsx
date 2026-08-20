import { useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, Check, Loader2, Plus, Search, Send, Swords, X } from "lucide-react";
import { Link } from "react-router";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { useToast, ToastViewport } from "@/components/library/toast";
import { proxyImg } from "@/lib/manga";
import { LOGIN_PATH } from "@/const";
import { trpc } from "@/providers/trpc";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function Polls() {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const pollQ = trpc.polls.current.useQuery(undefined, { retry: false });

  const voteMut = trpc.polls.vote.useMutation({
    onSuccess: () => {
      toast(t("تم التصويت!", "Vote recorded!"));
      void utils.polls.current.invalidate();
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const poll = pollQ.data?.poll ?? null;
  const myVote = pollQ.data?.myVoteOptionId ?? null;
  const showResults = !!poll && (myVote != null || !isAuthenticated);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8"
    >
      <h1 className="font-display flex items-center gap-2 text-2xl font-bold text-app">
        <BarChart3 size={24} className="text-primary" />
        {t("تصويت الأسبوع", "Weekly poll")}
      </h1>

      {pollQ.isLoading ? (
        <div className="flex flex-col gap-3">
          <div className="skeleton h-8 w-1/2" />
          <div className="skeleton h-40 w-full !rounded-3xl" />
        </div>
      ) : !poll ? (
        <div className="glass !rounded-3xl p-10 text-center">
          <p className="text-sm text-app-3">
            {t(
              "لا يوجد تصويت حالياً — ترقّب تصويت الأسبوع الجاي!",
              "No active poll — stay tuned for next week's!",
            )}
          </p>
        </div>
      ) : (
        <div className="glass flex flex-col gap-4 !rounded-3xl p-6">
          <span className="glass-chip self-start text-[11px] font-bold" dir="ltr">
            {poll.weekKey}
          </span>
          <h2 className="font-display text-xl font-bold text-app">
            {t(poll.questionAr, poll.questionEn)}
          </h2>

          {!showResults ? (
            <div className="flex flex-col gap-2.5">
              {poll.options.map((o) => (
                <button
                  key={o.id}
                  onClick={() => voteMut.mutate({ pollId: poll.id, optionId: o.id })}
                  disabled={voteMut.isPending}
                  className="btn-glass w-full justify-between !py-3 text-sm disabled:opacity-50"
                >
                  <span>{t(o.textAr, o.textEn)}</span>
                  {voteMut.isPending && voteMut.variables?.optionId === o.id ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {poll.options.map((o) => {
                const pct =
                  poll.totalVotes > 0 ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
                const mine = myVote === o.id;
                return (
                  <div
                    key={o.id}
                    className={`flex flex-col gap-1.5 rounded-2xl border p-3 ${
                      mine ? "border-primary" : "border-app"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                      <span className="flex items-center gap-1.5 text-app">
                        {t(o.textAr, o.textEn)}
                        {mine && <Check size={13} className="text-success" />}
                      </span>
                      <span dir="ltr" className="shrink-0 text-app-3 tabular-nums">
                        {pct}% · {o.votes}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-app-3/15">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, ease: EASE }}
                        className="gradient-primary h-full rounded-full"
                      />
                    </div>
                  </div>
                );
              })}
              {!isAuthenticated && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <p className="text-xs text-app-3">
                    {t("سجّل الدخول للتصويت", "Sign in to vote")}
                  </p>
                  <Link to={LOGIN_PATH} className="btn-primary !px-5 !py-1.5 text-xs">
                    {t("دخول", "Sign in")}
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ChallengeSubmit />
      <ToastViewport />
    </motion.div>
  );
}

/* ============ ترشيح تحدي الأسبوع من المستخدم (2–3 مانهوا) ============ */
type PickedManga = { id: number; title: string; coverUrl?: string | null };

function ChallengeSubmit() {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [q, setQ] = useState("");
  const [picks, setPicks] = useState<PickedManga[]>([]);
  const [note, setNote] = useState("");

  const searchQ = trpc.manga.list.useQuery(
    { search: q, limit: 6, sort: "popular" },
    { enabled: q.trim().length >= 2, retry: false },
  );
  const mineQ = trpc.challenges.mine.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });
  const submit = trpc.challenges.submit.useMutation({
    onSuccess: () => {
      toast(t("تم إرسال ترشيحك للأدمن ✅", "Submitted for admin review ✅"));
      setPicks([]);
      setNote("");
      setQ("");
      utils.challenges.mine.invalidate();
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  if (!isAuthenticated) return null;

  const add = (m: PickedManga) => {
    if (picks.length >= 3 || picks.some((p) => p.id === m.id)) return;
    setPicks((p) => [...p, m]);
    setQ("");
  };

  const pending = mineQ.data?.find((s) => s.status === "pending");

  return (
    <div className="glass flex flex-col gap-3 !rounded-3xl p-5">
      <h2 className="font-display flex items-center gap-2 text-base font-bold text-app">
        <Swords size={18} className="text-primary" />
        {t("رشّح تحدي الأسبوع", "Nominate a weekly challenge")}
      </h2>
      <p className="text-xs text-app-3">
        {t(
          "اختر مانهوتين أو ثلاثة للمقارنة — يراجعها الأدمن وتنزل كتصويت الأسبوع.",
          "Pick 2–3 titles to compare — an admin reviews it and it becomes the weekly poll.",
        )}
      </p>

      {pending ? (
        <div className="glass !rounded-2xl p-3 text-center text-xs text-warning">
          {t("عندك ترشيح قيد المراجعة", "You have a submission under review")}
        </div>
      ) : (
        <>
          {/* المختارة */}
          {picks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {picks.map((m) => (
                <span key={m.id} className="glass-chip !py-1 text-xs">
                  {m.title}
                  <button onClick={() => setPicks((p) => p.filter((x) => x.id !== m.id))}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* بحث */}
          {picks.length < 3 && (
            <div className="relative">
              <div className="input-glass flex items-center gap-2 !py-2">
                <Search size={15} className="text-app-3" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("ابحث عن مانهوا…", "Search a title…")}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
              {q.trim().length >= 2 && (searchQ.data?.items?.length ?? 0) > 0 && (
                <div className="glass-strong absolute z-20 mt-1 max-h-64 w-full overflow-y-auto !rounded-2xl p-1">
                  {searchQ.data!.items
                    .filter((m) => !picks.some((p) => p.id === m.id))
                    .map((m) => (
                      <button
                        key={m.id}
                        onClick={() => add({ id: m.id, title: m.title, coverUrl: m.coverUrl })}
                        className="flex w-full items-center gap-2 rounded-lg p-1.5 text-start hover:bg-[var(--surface)]"
                      >
                        <img
                          src={proxyImg(m.coverUrl) || "/placeholder-cover.svg"}
                          alt=""
                          className="h-10 w-8 shrink-0 rounded object-cover"
                        />
                        <span className="truncate text-sm text-app">{m.title}</span>
                        <Plus size={14} className="ms-auto shrink-0 text-primary" />
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder={t("سبب المقارنة (اختياري)", "Why compare? (optional)")}
            className="input-glass !py-2 text-sm"
          />
          <button
            onClick={() => submit.mutate({ mangaIds: picks.map((p) => p.id), note: note.trim() || undefined })}
            disabled={picks.length < 2 || submit.isPending}
            className="btn-primary !py-2.5 text-sm disabled:opacity-50"
          >
            {submit.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {t("أرسل الترشيح", "Submit")}
          </button>
        </>
      )}
    </div>
  );
}
