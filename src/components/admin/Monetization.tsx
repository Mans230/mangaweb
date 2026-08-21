import { useState } from "react";
import { motion } from "framer-motion";
import { Coins, Crown, Loader2, Pencil, Plus, Save, Shuffle, Trash2, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { EASE } from "./adminUtils";
import type { RouterOutputs } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

type Code = RouterOutputs["promo"]["listCodes"][number];
type RewardType = "premium_days" | "coins";

type Draft = {
  id: number;
  code: string;
  rewardType: RewardType;
  amount: string;
  maxUses: string;
  expiresAt: string; // yyyy-mm-dd أو ""
  active: boolean;
};

function emptyDraft(): Draft {
  return {
    id: 0,
    code: "",
    rewardType: "premium_days",
    amount: "30",
    maxUses: "0",
    expiresAt: "",
    active: true,
  };
}

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function Monetization() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const query = trpc.promo.listCodes.useQuery(undefined, { retry: false });

  const [draft, setDraft] = useState<Draft | null>(null);

  const create = trpc.promo.createCode.useMutation({
    onSuccess: () => {
      toast(t("تم إنشاء الكود", "Code created"));
      setDraft(null);
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });
  const update = trpc.promo.updateCode.useMutation({
    onSuccess: () => {
      toast(t("تم تحديث الكود", "Code updated"));
      setDraft(null);
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });
  const remove = trpc.promo.deleteCode.useMutation({
    onSuccess: () => {
      toast(t("تم حذف الكود", "Code deleted"));
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });
  const toggle = trpc.promo.updateCode.useMutation({
    onSuccess: () => query.refetch(),
    onError: (e) => toast(e.message, "danger"),
  });

  const saving = create.isPending || update.isPending;

  const save = () => {
    if (!draft) return;
    const amount = Number(draft.amount);
    const maxUses = Number(draft.maxUses);
    if (!Number.isFinite(amount) || amount < 1) {
      toast(t("قيمة المكافأة غير صالحة", "Invalid reward amount"), "danger");
      return;
    }
    const expiresAt = draft.expiresAt ? new Date(draft.expiresAt) : undefined;
    if (draft.id === 0) {
      if (draft.code.trim().length < 3) {
        toast(t("الكود قصير جداً", "Code too short"), "danger");
        return;
      }
      create.mutate({
        code: draft.code.trim(),
        rewardType: draft.rewardType,
        amount,
        maxUses,
        expiresAt,
        active: draft.active,
      });
    } else {
      update.mutate({
        id: draft.id,
        amount,
        maxUses,
        expiresAt: draft.expiresAt ? new Date(draft.expiresAt) : null,
        active: draft.active,
      });
    }
  };

  const rewardText = (c: Code) =>
    c.rewardType === "premium_days"
      ? t(`${c.amount} يوم بريميوم`, `${c.amount} premium days`)
      : t(`${c.amount} كوين`, `${c.amount} coins`);

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display flex items-center gap-2 text-sm font-bold text-app">
          <Crown size={16} className="text-accent" />
          {t("الأكواد الترويجية", "Promo codes")}
        </h3>
        {!draft && (
          <button onClick={() => setDraft(emptyDraft())} className="btn-ghost !px-3 !py-1.5 text-xs">
            <Plus size={13} />
            {t("كود جديد", "New code")}
          </button>
        )}
      </div>

      {/* المحرّر */}
      {draft && (
        <div className="mb-4 space-y-3 rounded-2xl border border-app/10 p-3">
          {draft.id === 0 && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold text-app-2">
                  {t("الكود", "Code")}
                </label>
                <input
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                  placeholder="WELCOME2026"
                  dir="ltr"
                  className="input-glass w-full font-mono text-sm"
                />
              </div>
              <button
                onClick={() => setDraft({ ...draft, code: randomCode() })}
                className="btn-ghost !px-3 !py-2.5 text-xs"
                title={t("توليد", "Generate")}
              >
                <Shuffle size={14} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-2">
                {t("نوع المكافأة", "Reward type")}
              </label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setDraft({ ...draft, rewardType: "premium_days" })}
                  disabled={draft.id !== 0}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-bold transition disabled:opacity-50 ${
                    draft.rewardType === "premium_days"
                      ? "bg-primary text-primary-ink"
                      : "glass text-app-2"
                  }`}
                >
                  <Crown size={12} /> {t("بريميوم", "Premium")}
                </button>
                <button
                  onClick={() => setDraft({ ...draft, rewardType: "coins" })}
                  disabled={draft.id !== 0}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-bold transition disabled:opacity-50 ${
                    draft.rewardType === "coins" ? "bg-primary text-primary-ink" : "glass text-app-2"
                  }`}
                >
                  <Coins size={12} /> {t("كوينز", "Coins")}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-2">
                {draft.rewardType === "premium_days" ? t("عدد الأيام", "Days") : t("عدد الكوينز", "Coins")}
              </label>
              <input
                type="number"
                min={1}
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                className="input-glass w-full text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-2">
                {t("حد الاستخدام (0 = بلا حد)", "Max uses (0 = ∞)")}
              </label>
              <input
                type="number"
                min={0}
                value={draft.maxUses}
                onChange={(e) => setDraft({ ...draft, maxUses: e.target.value })}
                className="input-glass w-full text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-2">
                {t("تاريخ الانتهاء (اختياري)", "Expiry (optional)")}
              </label>
              <input
                type="date"
                value={draft.expiresAt}
                onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
                dir="ltr"
                className="input-glass w-full text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-app-2">{t("مفعّل", "Active")}</span>
            <Switch
              checked={draft.active}
              onCheckedChange={(v) => setDraft({ ...draft, active: v })}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setDraft(null)} className="btn-ghost !px-3 !py-1.5 text-xs">
              <X size={13} />
              {t("إلغاء", "Cancel")}
            </button>
            <button
              disabled={saving}
              onClick={save}
              className="btn-primary !px-4 !py-1.5 text-xs disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {t("حفظ", "Save")}
            </button>
          </div>
        </div>
      )}

      {query.isLoading ? (
        <div className="skeleton h-32" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      ) : (query.data?.length ?? 0) === 0 ? (
        <p className="py-6 text-center text-sm text-app-3">
          {t("لا توجد أكواد بعد", "No codes yet")}
        </p>
      ) : (
        <div className="space-y-2">
          {query.data?.map((c: Code) => {
            const exhausted = c.maxUses > 0 && c.usedCount >= c.maxUses;
            const expired = c.expiresAt ? new Date(c.expiresAt) < new Date() : false;
            return (
              <div key={c.id} className="glass flex items-center justify-between gap-2 !rounded-xl p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-app" dir="ltr">
                      {c.code}
                    </span>
                    {c.rewardType === "premium_days" ? (
                      <Crown size={13} className="text-warning" />
                    ) : (
                      <Coins size={13} className="text-warning" />
                    )}
                  </div>
                  <div className="text-xs text-app-2">
                    {rewardText(c)} · {c.usedCount}
                    {c.maxUses > 0 ? `/${c.maxUses}` : ""} {t("استخدام", "uses")}
                    {c.expiresAt && (
                      <span className={expired ? "text-danger" : ""}>
                        {" · "}
                        {new Date(c.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                    {(exhausted || expired) && (
                      <span className="text-danger"> · {t("منتهٍ", "spent")}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Switch
                    checked={c.active}
                    onCheckedChange={(v) => toggle.mutate({ id: c.id, active: v })}
                    aria-label={t("تفعيل", "Active")}
                  />
                  <button
                    onClick={() =>
                      setDraft({
                        id: c.id,
                        code: c.code,
                        rewardType: c.rewardType as RewardType,
                        amount: String(c.amount),
                        maxUses: String(c.maxUses),
                        expiresAt: c.expiresAt
                          ? new Date(c.expiresAt).toISOString().slice(0, 10)
                          : "",
                        active: c.active,
                      })
                    }
                    className="btn-ghost !p-1.5"
                    aria-label={t("تعديل", "Edit")}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ id: c.id })}
                    className="btn-ghost !p-1.5 text-danger disabled:opacity-50"
                    aria-label={t("حذف", "Delete")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.section>
  );
}
