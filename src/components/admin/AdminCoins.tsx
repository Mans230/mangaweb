import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Coins,
  Gift,
  Loader2,
  Plus,
  Save,
  Settings2,
  Store,
  Trash2,
  X,
} from "lucide-react";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { EASE } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

/* ================= إعدادات الاقتصاد ================= */

const SETTING_ROWS: { key: string; label: string }[] = [
  { key: "coins.per_chapter", label: "كوين لكل فصل" },
  { key: "coins.daily_cap", label: "الحد اليومي" },
  { key: "coins.xp_per_chapter", label: "XP لكل فصل" },
  { key: "coins.xp_per_level", label: "XP لكل مستوى" },
  { key: "coins.checkin_base", label: "أساس الحضور" },
  { key: "coins.checkin_max_day", label: "أقصى يوم حضور مضاعف" },
  { key: "coins.mission_read3_reward", label: "مكافأة مهمة القراءة" },
  { key: "coins.mission_read3_count", label: "عدد فصول مهمة القراءة" },
  { key: "coins.mission_comment_reward", label: "مكافأة مهمة التعليق" },
  { key: "coins.mission_rate_reward", label: "مكافأة مهمة التقييم" },
  { key: "coins.mission_library_reward", label: "مكافأة مهمة المكتبة" },
  { key: "coins.spin_min", label: "أقل عجلة" },
  { key: "coins.spin_max", label: "أكثر عجلة" },
  { key: "coins.referral_inviter", label: "مكافأة الداعي" },
  { key: "coins.referral_invitee", label: "مكافأة المدعو" },
  { key: "coins.referral_threshold", label: "فصول تحقيق الدعوة" },
];

function SettingRow({
  settingKey,
  label,
  value,
  defaultValue,
  onSaved,
}: {
  settingKey: string;
  label: string;
  value: number;
  defaultValue: number;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const [edited, setEdited] = useState<string | null>(null);
  const text = edited ?? String(value);

  const save = trpc.adminCoins.setSetting.useMutation({
    onSuccess: () => {
      toast(t("تم الحفظ", "Saved"));
      setEdited(null);
      onSaved();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const parsed = parseInt(text, 10);
  const valid = Number.isFinite(parsed) && parsed >= 0 && parsed <= 100000;

  return (
    <div className="glass flex items-center gap-2.5 !rounded-2xl p-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold text-app">{label}</div>
        <div className="mt-0.5 text-[10px] tabular-nums text-app-3" dir="ltr">
          {t("الافتراضي", "Default")}: {defaultValue}
        </div>
      </div>
      <input
        type="number"
        dir="ltr"
        min={0}
        max={100000}
        value={text}
        onChange={(e) => setEdited(e.target.value)}
        className="input-glass w-24 shrink-0 !py-1.5 text-center text-sm tabular-nums"
      />
      <button
        type="button"
        disabled={!valid || save.isPending || edited === null}
        onClick={() => save.mutate({ key: settingKey, value: parsed })}
        className="btn-icon !h-8 !w-8 shrink-0 disabled:opacity-40"
        aria-label={t("حفظ", "Save")}
      >
        {save.isPending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Save size={14} />
        )}
      </button>
    </div>
  );
}

function EconomySettingsCard() {
  const { t } = useLanguage();
  const query = trpc.adminCoins.getSettings.useQuery(undefined, { retry: false });

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <h3 className="font-display mb-1 flex items-center gap-2 text-sm font-bold text-app">
        <Settings2 size={16} className="text-primary" />
        {t("إعدادات الاقتصاد", "Economy settings")}
      </h3>
      <p className="mb-3 text-xs text-app-3">
        {t(
          "كل قيم نظام الكوينز قابلة للتعديل وتُطبَّق خلال ثوانٍ بدون إعادة نشر.",
          "All coin economy values are editable and apply within seconds without redeploying.",
        )}
      </p>
      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-14" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SETTING_ROWS.map((row) => (
            <SettingRow
              key={row.key}
              settingKey={row.key}
              label={row.label}
              value={query.data?.values[row.key] ?? 0}
              defaultValue={query.data?.defaults[row.key] ?? 0}
              onSaved={() => query.refetch()}
            />
          ))}
        </div>
      )}
    </motion.section>
  );
}

/* ================= منح كوينز ================= */

function GrantCoinsCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const grant = trpc.adminCoins.grantCoins.useMutation({
    onSuccess: (res) => {
      toast(t(`الرصيد الجديد: ${res.balance}`, `New balance: ${res.balance}`));
      setAmount("");
      setNote("");
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const parsed = parseInt(amount, 10);
  const valid =
    email.trim().length > 3 &&
    Number.isFinite(parsed) &&
    parsed !== 0 &&
    Math.abs(parsed) <= 10000;

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.04 }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <h3 className="font-display mb-1 flex items-center gap-2 text-sm font-bold text-app">
        <Gift size={16} className="text-warning" />
        {t("منح كوينز", "Grant coins")}
      </h3>
      <p className="mb-3 text-xs text-app-3">
        {t(
          "قيمة موجبة تمنح كوينز، وقيمة سالبة تخصم من الرصيد (لا ينزل الرصيد تحت الصفر).",
          "A positive amount grants coins, a negative one deducts (balance never goes below zero).",
        )}
      </p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <input
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("بريد المستخدم", "User email")}
          className="input-glass !py-2 text-sm"
        />
        <input
          type="number"
          dir="ltr"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t("المبلغ (+/-)", "Amount (+/-)")}
          className="input-glass !py-2 text-sm tabular-nums"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder={t("ملاحظة (اختياري)", "Note (optional)")}
          className="input-glass !py-2 text-sm sm:col-span-2"
        />
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={!valid || grant.isPending}
          onClick={() =>
            grant.mutate({
              email: email.trim(),
              amount: parsed,
              note: note.trim() || undefined,
            })
          }
          className="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-50"
        >
          {grant.isPending ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
          {t("منح", "Grant")}
        </button>
      </div>
    </motion.section>
  );
}

/* ================= إدارة المتجر ================= */

const TYPE_LABELS: Record<string, string> = {
  theme: "ثيم",
  badge: "شارة",
  adfree: "إزالة إعلانات",
};

function ShopManagerCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const query = trpc.shop.list.useQuery(undefined, { retry: false });

  const [itemKey, setItemKey] = useState("");
  const [type, setType] = useState<"theme" | "badge" | "adfree">("theme");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [price, setPrice] = useState("");
  const [sort, setSort] = useState("0");
  const [active, setActive] = useState(true);

  const upsert = trpc.adminCoins.shopUpsertItem.useMutation({
    onSuccess: () => {
      toast(t("تم الحفظ", "Saved"));
      setItemKey("");
      setNameAr("");
      setNameEn("");
      setPrice("");
      setSort("0");
      setActive(true);
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const del = trpc.adminCoins.shopDeleteItem.useMutation({
    onSuccess: () => {
      toast(t("تم حذف العنصر", "Item deleted"));
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const parsedPrice = parseInt(price, 10);
  const parsedSort = parseInt(sort, 10);
  const formValid =
    itemKey.trim().length > 0 &&
    nameAr.trim().length > 0 &&
    nameEn.trim().length > 0 &&
    Number.isFinite(parsedPrice) &&
    parsedPrice >= 0 &&
    Number.isFinite(parsedSort);

  const items = query.data?.items ?? [];

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.08 }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
        <Store size={16} className="text-accent-2" />
        {t("إدارة المتجر", "Shop management")}
      </h3>

      {query.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-12" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="glass flex items-center gap-3 !rounded-2xl p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-app">
                  {item.nameAr}
                  <span className="ms-2 text-[10px] font-normal text-app-3" dir="ltr">
                    {item.itemKey}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-app-3">
                  <span>{TYPE_LABELS[item.type] ?? item.type}</span>
                  <span className="tabular-nums" dir="ltr">
                    {item.price} 🪙
                  </span>
                  {!item.active && (
                    <span className="rounded-md bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold text-danger">
                      {t("معطّل", "Disabled")}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={del.isPending}
                onClick={() => {
                  if (window.confirm(t(`حذف «${item.nameAr}» نهائياً؟`, `Delete "${item.nameEn}" permanently?`))) {
                    del.mutate({ id: item.id });
                  }
                }}
                className="btn-icon !h-8 !w-8 shrink-0 !text-danger disabled:opacity-40"
                aria-label={t("حذف", "Delete")}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {/* نموذج إضافة عنصر */}
          <div className="glass !rounded-2xl p-3.5">
            <div className="mb-2.5 text-xs font-bold text-app-2">
              {t("إضافة عنصر جديد", "Add new item")}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                dir="ltr"
                value={itemKey}
                onChange={(e) => setItemKey(e.target.value)}
                placeholder="itemKey (e.g. theme_neon)"
                maxLength={64}
                className="input-glass !py-2 text-xs"
              />
              <select
                value={type}
                onChange={(e) => setType(e.target.value as "theme" | "badge" | "adfree")}
                className="input-glass !py-2 text-xs"
              >
                <option value="theme">{t("ثيم", "Theme")}</option>
                <option value="badge">{t("شارة", "Badge")}</option>
                <option value="adfree">{t("إزالة إعلانات", "Ad-free")}</option>
              </select>
              <input
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder={t("الاسم بالعربية", "Arabic name")}
                maxLength={128}
                className="input-glass !py-2 text-xs"
              />
              <input
                dir="ltr"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder={t("الاسم بالإنجليزية", "English name")}
                maxLength={128}
                className="input-glass !py-2 text-xs"
              />
              <input
                type="number"
                dir="ltr"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={t("السعر", "Price")}
                className="input-glass !py-2 text-xs tabular-nums"
              />
              <input
                type="number"
                dir="ltr"
                min={0}
                max={999}
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                placeholder={t("الترتيب", "Sort")}
                className="input-glass !py-2 text-xs tabular-nums"
              />
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-app-2">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="accent-primary"
                />
                {t("مفعّل", "Active")}
              </label>
              <button
                type="button"
                disabled={!formValid || upsert.isPending}
                onClick={() =>
                  upsert.mutate({
                    itemKey: itemKey.trim(),
                    type,
                    nameAr: nameAr.trim(),
                    nameEn: nameEn.trim(),
                    price: parsedPrice,
                    sort: parsedSort,
                    active,
                  })
                }
                className="btn-primary !px-4 !py-2 text-xs disabled:opacity-50"
              >
                {upsert.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                {t("إضافة", "Add")}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.section>
  );
}

/* ================= التصويت الأسبوعي ================= */

type OptionDraft = { textAr: string; textEn: string };

function PollsManagerCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const currentQuery = trpc.polls.current.useQuery(undefined, { retry: false });

  const [questionAr, setQuestionAr] = useState("");
  const [questionEn, setQuestionEn] = useState("");
  const [options, setOptions] = useState<OptionDraft[]>([
    { textAr: "", textEn: "" },
    { textAr: "", textEn: "" },
  ]);

  const create = trpc.adminCoins.createPoll.useMutation({
    onSuccess: () => {
      toast(t("تم نشر التصويت", "Poll published"));
      setQuestionAr("");
      setQuestionEn("");
      setOptions([
        { textAr: "", textEn: "" },
        { textAr: "", textEn: "" },
      ]);
      currentQuery.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const close = trpc.adminCoins.closePoll.useMutation({
    onSuccess: () => {
      toast(t("تم إغلاق التصويت", "Poll closed"));
      currentQuery.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const setOption = (i: number, patch: Partial<OptionDraft>) =>
    setOptions((prev) => prev.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  const formValid =
    questionAr.trim().length > 0 &&
    questionEn.trim().length > 0 &&
    options.every((o) => o.textAr.trim().length > 0 && o.textEn.trim().length > 0);

  const poll = currentQuery.data?.poll ?? null;

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.12 }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <h3 className="font-display mb-1 flex items-center gap-2 text-sm font-bold text-app">
        <BarChart3 size={16} className="text-success" />
        {t("التصويت الأسبوعي", "Weekly poll")}
      </h3>
      <p className="mb-3 text-xs text-app-3">
        {t(
          "نشر تصويت جديد يغلق التصويت الحالي تلقائياً.",
          "Publishing a new poll automatically closes the current one.",
        )}
      </p>

      {/* نموذج إنشاء تصويت */}
      <div className="glass mb-3 !rounded-2xl p-3.5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            value={questionAr}
            onChange={(e) => setQuestionAr(e.target.value)}
            placeholder={t("السؤال بالعربية", "Question (Arabic)")}
            maxLength={255}
            className="input-glass !py-2 text-xs"
          />
          <input
            dir="ltr"
            value={questionEn}
            onChange={(e) => setQuestionEn(e.target.value)}
            placeholder={t("السؤال بالإنجليزية", "Question (English)")}
            maxLength={255}
            className="input-glass !py-2 text-xs"
          />
        </div>
        <div className="mt-2 space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-[10px] tabular-nums text-app-3">
                {i + 1}
              </span>
              <input
                value={opt.textAr}
                onChange={(e) => setOption(i, { textAr: e.target.value })}
                placeholder={t("الخيار بالعربية", "Option (Arabic)")}
                maxLength={255}
                className="input-glass flex-1 !py-1.5 text-xs"
              />
              <input
                dir="ltr"
                value={opt.textEn}
                onChange={(e) => setOption(i, { textEn: e.target.value })}
                placeholder={t("الخيار بالإنجليزية", "Option (English)")}
                maxLength={255}
                className="input-glass flex-1 !py-1.5 text-xs"
              />
              <button
                type="button"
                disabled={options.length <= 2}
                onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                className="btn-icon !h-7 !w-7 shrink-0 disabled:opacity-30"
                aria-label={t("إزالة خيار", "Remove option")}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={options.length >= 6}
            onClick={() => setOptions((prev) => [...prev, { textAr: "", textEn: "" }])}
            className="btn-glass !px-3 !py-1.5 text-xs disabled:opacity-40"
          >
            <Plus size={13} />
            {t("إضافة خيار", "Add option")}
          </button>
          <button
            type="button"
            disabled={!formValid || create.isPending}
            onClick={() =>
              create.mutate({
                questionAr: questionAr.trim(),
                questionEn: questionEn.trim(),
                options: options.map((o) => ({
                  textAr: o.textAr.trim(),
                  textEn: o.textEn.trim(),
                })),
              })
            }
            className="btn-primary !px-4 !py-2 text-xs disabled:opacity-50"
          >
            {create.isPending ? <Loader2 size={13} className="animate-spin" /> : <BarChart3 size={13} />}
            {t("نشر التصويت", "Publish poll")}
          </button>
        </div>
      </div>

      {/* التصويت الحالي */}
      {currentQuery.isLoading ? (
        <div className="skeleton h-16" />
      ) : !poll ? (
        <p className="py-4 text-center text-xs text-app-3">
          {t("لا يوجد تصويت نشط حالياً", "No active poll right now")}
        </p>
      ) : (
        <div className="glass !rounded-2xl p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-app">{poll.questionAr}</div>
              <div className="mt-0.5 text-[10px] text-app-3" dir="ltr">
                {poll.weekKey} · {poll.totalVotes} {t("صوت", "votes")}
              </div>
            </div>
            <button
              type="button"
              disabled={close.isPending}
              onClick={() => close.mutate({ id: poll.id })}
              className="btn-glass shrink-0 !px-3 !py-1.5 text-xs !text-danger disabled:opacity-50"
            >
              {close.isPending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
              {t("إغلاق التصويت", "Close poll")}
            </button>
          </div>
          <div className="mt-2.5 space-y-1.5">
            {poll.options.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-app-2">{o.textAr}</span>
                <span className="shrink-0 tabular-nums text-app-3" dir="ltr">
                  {o.votes}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.section>
  );
}

export default function AdminCoins() {
  return (
    <div className="space-y-4">
      <EconomySettingsCard />
      <GrantCoinsCard />
      <ShopManagerCard />
      <PollsManagerCard />
    </div>
  );
}
