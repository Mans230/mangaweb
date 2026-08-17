import { useState } from "react";
import { motion } from "framer-motion";
import { Download, Globe, Loader2, Trash2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { EASE } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

type SourceKey = "mangadex" | "asurascans" | "vortexscans";

const SOURCES: { key: SourceKey; name: string }[] = [
  { key: "mangadex", name: "MangaDex" },
  { key: "asurascans", name: "Asura Scans" },
  { key: "vortexscans", name: "Vortex Scans" },
];

interface ImportState {
  running: boolean;
  target: number;
  processed: number;
  created: number;
  duplicates: number;
  skippedAdult: number;
  failed: number;
  startedAt: string | Date | null;
  finishedAt: string | Date | null;
}

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <span className="glass-chip !px-2 !py-0.5 text-[10px] tabular-nums">
      {label} <b dir="ltr">{value}</b>
    </span>
  );
}

function SourceRow({
  sourceKey,
  name,
  state,
}: {
  sourceKey: SourceKey;
  name: string;
  state: ImportState | null | undefined;
}) {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const [target, setTarget] = useState("400");

  const start = trpc.import.startEnImport.useMutation({
    onSuccess: () => {
      toast(t("بدأ الاستيراد — يشتغل في الخلفية", "Import started — running in background"));
    },
    onError: (e) => {
      const code = (e as { data?: { code?: string } }).data?.code;
      if (code === "CONFLICT") {
        toast(t("الاستيراد يعمل بالفعل", "Import already running"), "info");
      } else {
        toast(e.message, "danger");
      }
    },
  });

  const parsed = parseInt(target, 10);
  const valid = Number.isFinite(parsed) && parsed >= 10 && parsed <= 1200;
  const running = state?.running ?? false;

  return (
    <div className="glass flex flex-wrap items-center gap-3 !rounded-2xl p-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-app" dir="ltr">
          {name}
        </div>
        <div className="mt-1">
          {state == null ? (
            <span className="text-xs text-app-3">{t("لم يبدأ", "Not started")}</span>
          ) : running ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Loader2 size={12} className="animate-spin" />
                <span className="tabular-nums" dir="ltr">
                  {state.processed}/{state.target}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                <Chip label={t("جديد", "new")} value={state.created} />
                <Chip label={t("مكرر", "dup")} value={state.duplicates} />
                <Chip label={t("+18 مستبعد", "adult skipped")} value={state.skippedAdult} />
                <Chip label={t("فشل", "failed")} value={state.failed} />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1">
                <Chip label={t("جديد", "new")} value={state.created} />
                <Chip label={t("مكرر", "dup")} value={state.duplicates} />
                <Chip label={t("+18 مستبعد", "adult skipped")} value={state.skippedAdult} />
                <Chip label={t("فشل", "failed")} value={state.failed} />
              </div>
              {state.finishedAt && (
                <div className="text-[10px] tabular-nums text-app-3" dir="ltr">
                  {new Date(state.finishedAt).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <input
        type="number"
        dir="ltr"
        min={10}
        max={1200}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="input-glass w-20 shrink-0 !py-1.5 text-center text-sm tabular-nums"
        aria-label={t("العدد المستهدف", "Target count")}
      />
      <button
        type="button"
        disabled={!valid || running || start.isPending}
        onClick={() => start.mutate({ sourceKey, target: parsed })}
        className="btn-primary shrink-0 !px-4 !py-2 text-xs disabled:opacity-50"
      >
        {start.isPending ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Download size={13} />
        )}
        {t("بدء الاستيراد", "Start import")}
      </button>
    </div>
  );
}

function EnImportCard() {
  const { t } = useLanguage();
  const statusQuery = trpc.import.enImportStatus.useQuery(undefined, {
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const anyRunning = SOURCES.some((s) => data[s.key]?.running);
      return anyRunning ? 5000 : false;
    },
  });

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <h3 className="font-display mb-1 flex items-center gap-2 text-sm font-bold text-app">
        <Globe size={16} className="text-primary" />
        {t("استيراد الكتالوج الإنجليزي", "EN catalog import")}
      </h3>
      <p className="mb-3 text-xs text-app-3">
        {t(
          "الاستيراد يتم في الخلفية بمعدل آمن (1-2 طلب/ثانية). 400 سلسلة ≈ 15-25 دقيقة. المحتوى +18 يُستبعد تلقائياً.",
          "Import runs in the background at a safe rate (1-2 req/s). 400 series ≈ 15-25 min. +18 content is auto-excluded.",
        )}
      </p>
      {statusQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {SOURCES.map((s) => (
            <SourceRow
              key={s.key}
              sourceKey={s.key}
              name={s.name}
              state={statusQuery.data?.[s.key] as ImportState | null | undefined}
            />
          ))}
        </div>
      )}
    </motion.section>
  );
}

function PurgeAdultCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();

  const purge = trpc.import.purgeAdult.useMutation({
    onSuccess: (res) => {
      toast(t(`تم حذف ${res.deleted} مانجا`, `Deleted ${res.deleted} manga`));
    },
    onError: (e) => toast(e.message, "danger"),
  });

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.05 }}
      className="glass !rounded-2xl border border-danger/30 p-4 md:p-5"
    >
      <h3 className="font-display mb-1 flex items-center gap-2 text-sm font-bold text-danger">
        <Trash2 size={16} />
        {t("حذف محتوى +18 نهائياً", "Purge adult content")}
      </h3>
      <p className="mb-3 text-xs text-app-3">
        {t(
          "يحذف كل المانجا المصنّفة +18 مع فصولها وتعليقاتها وتقييماتها نهائياً — لا رجوع.",
          "Permanently deletes all +18 manga with their chapters, comments and ratings — irreversible.",
        )}
      </p>
      <button
        type="button"
        disabled={purge.isPending}
        onClick={() => {
          if (window.confirm(t("متأكد؟ الحذف نهائي!", "Are you sure? This is permanent!"))) {
            purge.mutate();
          }
        }}
        className="rounded-full border border-danger/30 bg-danger/15 px-5 py-2 text-sm font-bold text-danger disabled:opacity-50"
      >
        {purge.isPending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Trash2 size={14} />
        )}
        {t("حذف نهائي", "Purge now")}
      </button>
    </motion.section>
  );
}

export default function AdminEnImport() {
  return (
    <div className="space-y-4">
      <EnImportCard />
      <PurgeAdultCard />
    </div>
  );
}
