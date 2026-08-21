import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Pencil, Plus, Save, Send, Trash2, X } from "lucide-react";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { EASE } from "./adminUtils";
import type { RouterOutputs } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

type Template = RouterOutputs["notifications"]["adminListTemplates"][number];
type Target = "all" | "premium" | "manga_followers";

/* ============ نموذج البثّ ============ */
function BroadcastCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<Target>("all");
  const [mangaId, setMangaId] = useState("");
  const [confirming, setConfirming] = useState(false);

  const templatesQ = trpc.notifications.adminListTemplates.useQuery(undefined, {
    retry: false,
  });

  const broadcast = trpc.notifications.adminBroadcast.useMutation({
    onSuccess: (res) => {
      toast(
        t(`تم الإرسال إلى ${res.count} مستخدم`, `Sent to ${res.count} users`),
        "success",
      );
      setTitle("");
      setBody("");
      setConfirming(false);
    },
    onError: (e) => {
      toast(e.message, "danger");
      setConfirming(false);
    },
  });

  const targetLabel: Record<Target, string> = {
    all: t("كل المستخدمين", "All users"),
    premium: t("مشتركو البريميوم", "Premium users"),
    manga_followers: t("متابعو مانجا", "Manga followers"),
  };

  const canSend =
    title.trim() !== "" &&
    body.trim() !== "" &&
    (target !== "manga_followers" || Number(mangaId) > 0);

  const send = () => {
    broadcast.mutate({
      title: title.trim(),
      body: body.trim(),
      target,
      mangaId: target === "manga_followers" ? Number(mangaId) : undefined,
    });
  };

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
        <Send size={16} className="text-accent" />
        {t("بثّ إشعار", "Broadcast notification")}
      </h3>

      <div className="space-y-3">
        {/* تحميل قالب */}
        {(templatesQ.data?.length ?? 0) > 0 && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-app-2">
              {t("تحميل من قالب", "Load from template")}
            </label>
            <select
              className="input-glass w-full text-sm"
              value=""
              onChange={(e) => {
                const tpl = templatesQ.data?.find((x) => String(x.id) === e.target.value);
                if (tpl) {
                  setTitle(tpl.title);
                  setBody(tpl.body);
                }
              }}
            >
              <option value="">{t("— اختر قالباً —", "— pick a template —")}</option>
              {templatesQ.data?.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-app-2">
            {t("العنوان", "Title")}
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="input-glass w-full text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-app-2">
            {t("النص", "Body")}
          </label>
          <textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            className="input-glass w-full resize-none text-sm"
          />
        </div>

        {/* الجمهور */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-app-2">
            {t("الجمهور المستهدف", "Target audience")}
          </label>
          <div className="flex flex-wrap gap-2">
            {(["all", "premium", "manga_followers"] as Target[]).map((tg) => (
              <button
                key={tg}
                onClick={() => setTarget(tg)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  target === tg
                    ? "bg-primary text-primary-ink"
                    : "glass text-app-2 hover:text-app"
                }`}
              >
                {targetLabel[tg]}
              </button>
            ))}
          </div>
        </div>

        {target === "manga_followers" && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-app-2">
              {t("معرّف المانجا (ID)", "Manga ID")}
            </label>
            <input
              type="number"
              min={1}
              value={mangaId}
              onChange={(e) => setMangaId(e.target.value)}
              placeholder="123"
              dir="ltr"
              className="input-glass w-32 text-sm"
            />
          </div>
        )}

        {/* إرسال بتأكيد */}
        {!confirming ? (
          <div className="flex justify-end">
            <button
              disabled={!canSend}
              onClick={() => setConfirming(true)}
              className="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-50"
            >
              <Send size={14} />
              {t("إرسال", "Send")}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-dashed border-warning/50 bg-warning/5 p-3">
            <span className="text-xs font-semibold text-warning">
              {t(
                `تأكيد الإرسال إلى «${targetLabel[target]}»؟`,
                `Confirm sending to "${targetLabel[target]}"?`,
              )}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="btn-ghost !px-3 !py-1.5 text-xs"
              >
                {t("إلغاء", "Cancel")}
              </button>
              <button
                disabled={broadcast.isPending}
                onClick={send}
                className="btn-primary !px-4 !py-1.5 text-xs disabled:opacity-50"
              >
                {broadcast.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Send size={13} />
                )}
                {t("تأكيد", "Confirm")}
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}

/* ============ إدارة القوالب ============ */
function emptyDraft() {
  return { id: 0, name: "", title: "", body: "" };
}

function TemplatesCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const query = trpc.notifications.adminListTemplates.useQuery(undefined, {
    retry: false,
  });

  const [draft, setDraft] = useState<{
    id: number;
    name: string;
    title: string;
    body: string;
  } | null>(null);

  const create = trpc.notifications.adminCreateTemplate.useMutation({
    onSuccess: () => {
      toast(t("تم إنشاء القالب", "Template created"));
      setDraft(null);
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });
  const update = trpc.notifications.adminUpdateTemplate.useMutation({
    onSuccess: () => {
      toast(t("تم تحديث القالب", "Template updated"));
      setDraft(null);
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });
  const remove = trpc.notifications.adminDeleteTemplate.useMutation({
    onSuccess: () => {
      toast(t("تم حذف القالب", "Template deleted"));
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const saving = create.isPending || update.isPending;
  const save = () => {
    if (!draft) return;
    const payload = {
      name: draft.name.trim(),
      title: draft.title.trim(),
      body: draft.body.trim(),
    };
    if (!payload.name || !payload.title || !payload.body) return;
    if (draft.id === 0) create.mutate(payload);
    else update.mutate({ id: draft.id, ...payload });
  };

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.06 }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display flex items-center gap-2 text-sm font-bold text-app">
          {t("القوالب", "Templates")}
        </h3>
        {!draft && (
          <button
            onClick={() => setDraft(emptyDraft())}
            className="btn-ghost !px-3 !py-1.5 text-xs"
          >
            <Plus size={13} />
            {t("قالب جديد", "New")}
          </button>
        )}
      </div>

      {/* محرّر القالب */}
      {draft && (
        <div className="mb-4 space-y-2 rounded-2xl border border-app/10 p-3">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={t("اسم القالب (داخلي)", "Template name (internal)")}
            className="input-glass w-full text-sm"
          />
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder={t("العنوان", "Title")}
            className="input-glass w-full text-sm"
          />
          <textarea
            rows={2}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            placeholder={t("النص", "Body")}
            className="input-glass w-full resize-none text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDraft(null)}
              className="btn-ghost !px-3 !py-1.5 text-xs"
            >
              <X size={13} />
              {t("إلغاء", "Cancel")}
            </button>
            <button
              disabled={saving}
              onClick={save}
              className="btn-primary !px-4 !py-1.5 text-xs disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              {t("حفظ", "Save")}
            </button>
          </div>
        </div>
      )}

      {query.isLoading ? (
        <div className="skeleton h-24" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      ) : (query.data?.length ?? 0) === 0 ? (
        <p className="py-6 text-center text-sm text-app-3">
          {t("لا توجد قوالب بعد", "No templates yet")}
        </p>
      ) : (
        <div className="space-y-2">
          {query.data?.map((tpl: Template) => (
            <div
              key={tpl.id}
              className="glass flex items-start justify-between gap-2 !rounded-xl p-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-bold text-app">{tpl.name}</div>
                <div className="truncate text-xs text-app-2">{tpl.title}</div>
                <div className="line-clamp-2 text-[11px] text-app-3">{tpl.body}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() =>
                    setDraft({ id: tpl.id, name: tpl.name, title: tpl.title, body: tpl.body })
                  }
                  className="btn-ghost !p-1.5"
                  aria-label={t("تعديل", "Edit")}
                >
                  <Pencil size={13} />
                </button>
                <button
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ id: tpl.id })}
                  className="btn-ghost !p-1.5 text-danger disabled:opacity-50"
                  aria-label={t("حذف", "Delete")}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.section>
  );
}

export default function NotificationsManager() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BroadcastCard />
      <TemplatesCard />
    </div>
  );
}
