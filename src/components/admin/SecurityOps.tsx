import { useState } from "react";
import { motion } from "framer-motion";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Loader2,
  ScrollText,
  ShieldAlert,
  ShieldBan,
  Trash2,
} from "lucide-react";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { timeAgo } from "@/lib/manga";
import { EASE } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

const PAGE = 20;

/* ============ سجل الأدمن ============ */
function AuditLogCard() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const query = trpc.admin.adminLogs.useQuery({ page, limit: PAGE }, { retry: false });
  const items = query.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE));

  return (
    <section className="glass !rounded-2xl p-4">
      <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
        <ScrollText size={16} className="text-accent" />
        {t("سجل تدقيق الأدمن", "Admin audit log")}
      </h3>
      {query.isLoading ? (
        <div className="skeleton h-40" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-app-3">{t("لا سجلات", "No entries")}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((log) => (
            <div key={log.id} className="flex items-center justify-between gap-2 rounded-lg border border-app/10 px-3 py-2">
              <div className="min-w-0">
                <span className="font-mono text-xs font-bold text-app" dir="ltr">
                  {log.action}
                </span>
                {log.targetType && (
                  <span className="text-[11px] text-app-3" dir="ltr">
                    {" "}
                    · {log.targetType}
                    {log.targetId ? `#${log.targetId}` : ""}
                  </span>
                )}
                <div className="text-[11px] text-app-2">
                  {log.admin?.name ?? log.admin?.username ?? `#${log.adminId}`}
                </div>
              </div>
              <span className="shrink-0 text-[10px] text-app-3">{timeAgo(log.createdAt)}</span>
            </div>
          ))}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40">
                <ChevronRight size={14} className="rtl:hidden" />
                <ChevronLeft size={14} className="ltr:hidden" />
              </button>
              <span className="text-xs text-app-2">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40">
                <ChevronLeft size={14} className="rtl:hidden" />
                <ChevronRight size={14} className="ltr:hidden" />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ============ حظر IP ============ */
function IpBansCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const utils = trpc.useUtils();
  const query = trpc.admin.listBans.useQuery(undefined, { retry: false });
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");

  const ban = trpc.admin.banIp.useMutation({
    onSuccess: () => {
      toast(t("تم حظر الـ IP", "IP banned"));
      setIp("");
      setReason("");
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });
  const unban = trpc.admin.unbanIp.useMutation({
    onSuccess: () => {
      toast(t("تم رفع الحظر", "IP unbanned"));
      query.refetch();
      utils.admin.failedLoginStats.invalidate();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  return (
    <section className="glass !rounded-2xl p-4">
      <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
        <ShieldBan size={16} className="text-danger" />
        {t("عناوين IP المحظورة", "Banned IPs")}
      </h3>
      <div className="mb-3 flex flex-wrap gap-2">
        <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="1.2.3.4" dir="ltr" className="input-glass min-w-0 flex-1 font-mono text-sm" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("السبب (اختياري)", "reason (optional)")} className="input-glass min-w-0 flex-1 text-sm" />
        <button
          disabled={ban.isPending || ip.trim().length < 3}
          onClick={() => ban.mutate({ ip: ip.trim(), reason: reason.trim() || undefined })}
          className="btn-primary shrink-0 !px-4 !py-2.5 text-sm disabled:opacity-50"
        >
          {ban.isPending ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
          {t("حظر", "Ban")}
        </button>
      </div>
      {query.isLoading ? (
        <div className="skeleton h-24" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      ) : (query.data?.length ?? 0) === 0 ? (
        <p className="py-4 text-center text-sm text-app-3">{t("لا عناوين محظورة", "No banned IPs")}</p>
      ) : (
        <div className="space-y-1.5">
          {query.data?.map((b) => (
            <div key={b.ip} className="flex items-center justify-between gap-2 rounded-lg border border-app/10 px-3 py-2">
              <div className="min-w-0">
                <span className="font-mono text-sm font-bold text-app" dir="ltr">{b.ip}</span>
                {b.reason && <span className="ms-2 text-[11px] text-app-3">{b.reason}</span>}
                <div className="text-[10px] text-app-3">{timeAgo(b.createdAt)}</div>
              </div>
              <button disabled={unban.isPending} onClick={() => unban.mutate({ ip: b.ip })} className="btn-ghost !p-1.5 text-danger disabled:opacity-50" aria-label={t("رفع الحظر", "Unban")}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============ محاولات دخول فاشلة ============ */
function FailedLoginsCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const utils = trpc.useUtils();
  const statsQ = trpc.admin.failedLoginStats.useQuery(undefined, { retry: false });
  const listQ = trpc.admin.listFailedLogins.useQuery({ page: 1, limit: PAGE }, { retry: false });

  const ban = trpc.admin.banIp.useMutation({
    onSuccess: () => {
      toast(t("تم حظر الـ IP", "IP banned"));
      utils.admin.listBans.invalidate();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const items = listQ.data?.items ?? [];

  return (
    <section className="glass !rounded-2xl p-4">
      <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
        <ShieldAlert size={16} className="text-warning" />
        {t("محاولات دخول فاشلة", "Failed logins")}
      </h3>

      {/* أكثر IP فشلاً */}
      {(statsQ.data?.top.length ?? 0) > 0 && (
        <div className="mb-3">
          <span className="text-[10px] font-bold uppercase tracking-wide text-app-3">
            {t("الأكثر فشلاً (24 ساعة)", "Top offenders (24h)")}
          </span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {statsQ.data?.top.map((row) => (
              <button
                key={row.ip}
                disabled={ban.isPending}
                onClick={() => ban.mutate({ ip: row.ip, reason: `${row.attempts} failed logins` })}
                title={t("حظر هذا الـ IP", "Ban this IP")}
                className="glass flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-app-2 hover:text-danger disabled:opacity-50"
                dir="ltr"
              >
                <Ban size={11} /> {row.ip}
                <span className="font-bold text-danger">{row.attempts}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {listQ.isLoading ? (
        <div className="skeleton h-24" />
      ) : listQ.isError ? (
        <ErrorState onRetry={() => listQ.refetch()} retrying={listQ.isRefetching} />
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-app-3">{t("لا محاولات فاشلة", "No failed attempts")}</p>
      ) : (
        <div className="space-y-1">
          {items.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-app/10 px-3 py-1.5 text-xs">
              <span className="font-mono font-bold text-app" dir="ltr">{f.ip}</span>
              {f.email && <span className="truncate text-app-3" dir="ltr">{f.email}</span>}
              <span className="shrink-0 text-[10px] text-app-3">{timeAgo(f.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============ حالة تحديد المعدل ============ */
function RateLimitCard() {
  const { t } = useLanguage();
  const query = trpc.admin.rateLimitStatus.useQuery(undefined, { retry: false, refetchInterval: 15000 });

  return (
    <section className="glass !rounded-2xl p-4">
      <h3 className="font-display mb-1 flex items-center gap-2 text-sm font-bold text-app">
        <Gauge size={16} className="text-accent" />
        {t("تحديد المعدل (هذه العملية)", "Rate limiting (this instance)")}
      </h3>
      <p className="mb-3 text-[11px] text-app-2">
        {t(
          "الحدود مبرمجة في الكود: الدخول/الأمان، DMCA (3/ساعة)، الأكواد (10/ساعة). القيم أدناه دلاء نشطة في الذاكرة الآن.",
          "Limits are hardcoded: auth/security, DMCA (3/hr), promo (10/hr). Below are the buckets currently active in memory.",
        )}
      </p>
      {query.isLoading ? (
        <div className="skeleton h-16" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      ) : (
        <>
          <div className="mb-2 text-sm">
            <span className="font-display text-xl font-bold text-app tabular-nums">
              {query.data?.activeBuckets ?? 0}
            </span>{" "}
            <span className="text-xs text-app-3">{t("دلو نشط", "active buckets")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {query.data?.top.map((row) => (
              <span key={row.keyPrefix} className="glass-chip !px-2.5 !py-0.5 !text-[11px]" dir="ltr">
                {row.keyPrefix}: <span className="font-bold">{row.count}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default function SecurityOps() {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="grid gap-4 lg:grid-cols-2"
    >
      <AuditLogCard />
      <IpBansCard />
      <FailedLoginsCard />
      <RateLimitCard />
    </motion.div>
  );
}
