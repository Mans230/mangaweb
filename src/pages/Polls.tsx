import { motion } from "framer-motion";
import { BarChart3, Check, Loader2 } from "lucide-react";
import { Link } from "react-router";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { useToast, ToastViewport } from "@/components/library/toast";
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
      <ToastViewport />
    </motion.div>
  );
}
