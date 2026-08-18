import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Construction,
  Crown,
  EyeOff,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Save,
  ScrollText,
  ShieldBan,
  Trash2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { timeAgo } from "@/lib/manga";
import { EASE } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

const LOGS_PAGE_SIZE = 20;

/* ================= فلتر الكلمات ================= */
function BannedWordsCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const query = trpc.admin.getBannedWords.useQuery(undefined, { retry: false });
  // null = لم يعدّل المستخدم بعد → نعرض قيمة السيرفر
  const [edited, setEdited] = useState<string | null>(null);
  const text = edited ?? (query.data?.words.join("\n") ?? "");
  const setText = (v: string) => setEdited(v);

  const save = trpc.admin.setBannedWords.useMutation({
    onSuccess: (res) => {
      toast(t(`تم حفظ ${res.count} كلمة`, `Saved ${res.count} words`));
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const wordsCount = text.split("\n").map((w) => w.trim()).filter(Boolean).length;

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <h3 className="font-display mb-1 flex items-center gap-2 text-sm font-bold text-app">
        <ShieldBan size={16} className="text-danger" />
        {t("فلتر الكلمات المحظورة", "Banned words filter")}
      </h3>
      <p className="mb-3 text-xs text-app-3">
        {t("كلمة واحدة في كل سطر. تُطبَّق على التعليقات والمحتوى المُنشأ من المستخدمين.", "One word per line. Applied to comments and user-generated content.")}
      </p>
      {query.isLoading ? (
        <div className="skeleton h-44" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      ) : (
        <>
          <textarea
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("اكتب كل كلمة في سطر…", "One word per line…")}
            className="input-glass w-full resize-y text-sm leading-7"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs tabular-nums text-app-3">
              {wordsCount} {t("كلمة", "words")}
            </span>
            <button
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  words: [...new Set(text.split("\n").map((w) => w.trim()).filter(Boolean))],
                })
              }
              className="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-50"
            >
              {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {t("حفظ", "Save")}
            </button>
          </div>
        </>
      )}
    </motion.section>
  );
}

/* ================= تشغيل السكرابر يدويًا ================= */
function ScrapeTriggerCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const [src, setSrc] = useState("");
  const sourcesQ = trpc.admin.listSources.useQuery(undefined, { retry: false });
  const srcArg = src ? { source: src } : undefined;
  const trigger = trpc.admin.triggerScrape.useMutation({
    onSuccess: (d) =>
      toast(
        t(
          `بدأ فحص ${d.sources.length} مصدر — الفصول الجديدة ستظهر تباعًا`,
          `Scrape started for ${d.sources.length} sources`,
        ),
      ),
    onError: (e) =>
      toast(
        e.data?.code === "CONFLICT"
          ? t("فحص يعمل بالفعل — انتظر حتى ينتهي", "A scrape is already running")
          : e.message,
        "danger",
      ),
  });
  const full = trpc.admin.importFullCatalog.useMutation({
    onSuccess: (d) =>
      toast(
        t(
          `بدأ استيراد الكتالوج الكامل من ${d.sources.length} مصدر — كل الأعمال (القديمة والجديدة) ستُضاف تباعًا`,
          `Full catalog import started for ${d.sources.length} sources`,
        ),
      ),
    onError: (e) =>
      toast(
        e.data?.code === "CONFLICT"
          ? t("فحص يعمل بالفعل — انتظر حتى ينتهي", "A scrape is already running")
          : e.message,
        "danger",
      ),
  });

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.04 }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
        <RefreshCw size={16} className="text-primary" />
        {t("فحص المصادر (سكرابر)", "Sources scraper")}
      </h3>
      <div className="flex flex-col gap-2.5">
        {/* اختيار المصدر — فارغ = كل المصادر */}
        <select
          value={src}
          onChange={(e) => setSrc(e.target.value)}
          className="input-glass !py-2 text-xs"
        >
          <option value="">{t("كل المصادر", "All sources")}</option>
          {(sourcesQ.data ?? []).map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="glass flex items-center justify-between gap-3 !rounded-2xl p-3.5">
          <p className="text-xs leading-relaxed text-app-3">
            {t(
              "أحدث الفصول فقط — الفحص التلقائي يعمل دوريًا، اضغط لتشغيله فورًا",
              "Latest chapters only — press to run the periodic scan now",
            )}
          </p>
          <button
            type="button"
            onClick={() => trigger.mutate(srcArg)}
            disabled={trigger.isPending || full.isPending}
            className="btn-primary flex shrink-0 items-center gap-2 !rounded-xl px-4 py-2.5 text-xs font-bold disabled:opacity-50"
          >
            {trigger.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {trigger.isPending ? t("جارٍ التشغيل…", "Starting…") : t("افحص الآن", "Scan now")}
          </button>
        </div>
        <div className="glass flex items-center justify-between gap-3 !rounded-2xl p-3.5">
          <p className="text-xs leading-relaxed text-app-3">
            {t(
              "الكتالوج الكامل — يمرّ على كل صفحات كل المصادر ويضيف كل الأعمال القديمة والجديدة الناقصة (يأخذ وقتًا في الخلفية)",
              "Full catalog — walks every page of every source and adds all missing old + new titles (runs in background, takes a while)",
            )}
          </p>
          <button
            type="button"
            onClick={() => full.mutate(srcArg)}
            disabled={trigger.isPending || full.isPending}
            className="btn-glass flex shrink-0 items-center gap-2 !rounded-xl px-4 py-2.5 text-xs font-bold disabled:opacity-50"
          >
            {full.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {full.isPending ? t("جارٍ البدء…", "Starting…") : t("استيراد الكتالوج الكامل", "Import full catalog")}
          </button>
        </div>
      </div>
    </motion.section>
  );
}

/* ================= أقسام الواجهة (إخفاء المجتمعات/الريلز) ================= */
function UiSectionsCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const query = trpc.admin.getUiToggles.useQuery(undefined, { retry: false });

  const save = trpc.admin.setUiToggles.useMutation({
    onSuccess: () => {
      toast(t("تم حفظ إعدادات الأقسام", "Section settings saved"));
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const toggle = (key: "hideCommunities" | "hideReels", value: boolean) =>
    save.mutate({ [key]: value });

  const [groupUrl, setGroupUrl] = useState<string | null>(null);
  const groupUrlValue = groupUrl ?? query.data?.communityGroupUrl ?? "";

  const rows: {
    key: "hideCommunities" | "hideReels";
    title: string;
    desc: string;
  }[] = [
    {
      key: "hideCommunities",
      title: t("إخفاء المجتمعات", "Hide communities"),
      desc: t(
        "يُخفي صفحات المجتمعات والشات وروابطها من كل الموقع فوراً.",
        "Hides community pages, chats and all their links site-wide.",
      ),
    },
    {
      key: "hideReels",
      title: t("إخفاء الريلز", "Hide reels"),
      desc: t(
        "يُخفي ريلز Fun (الفيديوهات القصيرة) وروابطها من الموقع.",
        "Hides Fun reels (short videos) and their links.",
      ),
    },
  ];

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.06 }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <h3 className="font-display mb-1 flex items-center gap-2 text-sm font-bold text-app">
        <EyeOff size={16} className="text-primary" />
        {t("أقسام الواجهة", "Site sections")}
      </h3>
      <p className="mb-3 text-xs text-app-3">
        {t(
          "تحكّم في ظهور الأقسام الكبيرة. الإخفاء يطبَّق فوراً على كل الزوار.",
          "Control visibility of major sections. Hiding applies instantly to all visitors.",
        )}
      </p>
      {query.isLoading ? (
        <div className="skeleton h-28" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => {
            const hidden = query.data?.[row.key] ?? false;
            return (
              <div
                key={row.key}
                className="glass flex items-center justify-between gap-3 !rounded-2xl p-3.5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-app">
                    {row.title}
                    {hidden && (
                      <span className="ms-2 rounded-md bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold text-danger">
                        {t("مخفي", "Hidden")}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-app-3">{row.desc}</div>
                </div>
                <Switch
                  checked={hidden}
                  disabled={save.isPending}
                  onCheckedChange={(v) => toggle(row.key, v)}
                />
              </div>
            );
          })}

          {/* رابط جروب المناقشة — زر "انضم للمناقشة" في صفحات المانجا */}
          <div className="glass !rounded-2xl p-3.5">
            <div className="text-sm font-semibold text-app">
              {t("جروب المناقشة", "Discussion group")}
            </div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-app-3">
              {t(
                "رابط جروب تليجرام/ديسكورد — يظهر زر «انضم لجروب المناقشة» في صفحة كل مانجا. اتركه فارغاً لإخفاء الزر.",
                "Telegram/Discord group link — shows a join button on every manga page. Leave empty to hide it.",
              )}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <input
                dir="ltr"
                value={groupUrlValue}
                onChange={(e) => setGroupUrl(e.target.value)}
                placeholder="https://t.me/your_group"
                className="input-glass flex-1 !py-2 text-xs"
              />
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => save.mutate({ communityGroupUrl: groupUrlValue.trim() })}
                className="btn-primary shrink-0 !px-4 !py-2 text-xs"
              >
                {t("حفظ", "Save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.section>
  );
}

/* ================= وضع الصيانة ================= */
function MaintenanceCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const query = trpc.admin.getMaintenance.useQuery(undefined, { retry: false });
  // null = لم يعدّل المستخدم بعد → نعرض قيمة السيرفر
  const [editedEnabled, setEditedEnabled] = useState<boolean | null>(null);
  const [editedMessage, setEditedMessage] = useState<string | null>(null);
  const enabled = editedEnabled ?? query.data?.enabled ?? false;
  const message = editedMessage ?? query.data?.message ?? "";
  const setEnabled = (v: boolean) => setEditedEnabled(v);
  const setMessage = (v: string) => setEditedMessage(v);

  const save = trpc.admin.setMaintenance.useMutation({
    onSuccess: () => {
      toast(t("تم حفظ إعدادات الصيانة", "Maintenance settings saved"));
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.08 }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
        <Construction size={16} className="text-warning" />
        {t("وضع الصيانة", "Maintenance mode")}
      </h3>
      {query.isLoading ? (
        <div className="skeleton h-32" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      ) : (
        <div className="space-y-3">
          <div className="glass flex items-center justify-between !rounded-2xl p-3.5">
            <span className="text-sm font-semibold text-app">
              {enabled ? t("الصيانة مفعّلة — الموقع مغلق للزوار", "Maintenance ON — site closed") : t("الصيانة متوقفة — الموقع يعمل", "Maintenance OFF — site live")}
            </span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-app-2">
              {t("رسالة الصيانة", "Maintenance message")}
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("نعود إليكم قريباً…", "We'll be back soon…")}
              className="input-glass w-full resize-none text-sm"
            />
          </div>

          {/* معاينة */}
          {enabled && (
            <div className="rounded-2xl border border-dashed border-warning/50 bg-warning/5 p-4 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wide text-warning">
                {t("معاينة", "Preview")}
              </span>
              <div className="mt-2 flex flex-col items-center gap-2">
                <Construction size={26} className="text-warning" />
                <p className="font-display text-base font-bold text-app">
                  {t("المنصة تحت الصيانة", "Under maintenance")}
                </p>
                <p className="text-sm text-app-2">
                  {message.trim() || t("نعود إليكم قريباً…", "We'll be back soon…")}
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              disabled={save.isPending}
              onClick={() => save.mutate({ enabled, message: message.trim() || undefined })}
              className="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-50"
            >
              {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {t("حفظ", "Save")}
            </button>
          </div>
        </div>
      )}
    </motion.section>
  );
}

/* ================= سجل الأدمن ================= */
function AdminLogsCard() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const query = trpc.admin.adminLogs.useQuery(
    { page, limit: LOGS_PAGE_SIZE },
    { retry: false, placeholderData: (prev) => prev },
  );
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / LOGS_PAGE_SIZE));

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.16 }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
        <ScrollText size={16} className="text-accent-2" />
        {t("سجل عمليات الأدمن", "Admin activity log")}
      </h3>
      {query.isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-11" />)}</div>
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      ) : (query.data?.items ?? []).length === 0 ? (
        <p className="py-8 text-center text-sm text-app-3">
          {t("لا عمليات مسجّلة بعد", "No logged actions yet")}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-app text-xs text-app-3">
                  <th className="p-2.5 text-start font-semibold">{t("العملية", "Action")}</th>
                  <th className="p-2.5 text-start font-semibold">{t("الهدف", "Target")}</th>
                  <th className="p-2.5 text-start font-semibold">{t("الأدمن", "Admin")}</th>
                  <th className="p-2.5 text-start font-semibold">{t("الوقت", "Time")}</th>
                </tr>
              </thead>
              <tbody>
                {query.data!.items.map((log) => (
                  <tr key={log.id} className="border-b border-app/50 last:border-0">
                    <td className="p-2.5">
                      <span className="glass-chip !px-2.5 !py-1 !text-[11px] font-semibold" dir="ltr">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-2.5 text-xs text-app-2">
                      {log.targetType ? (
                        <span dir="ltr">
                          {log.targetType}
                          {log.targetId ? ` #${log.targetId}` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2.5 text-xs text-app-2">
                      {log.admin.name}
                      <span className="text-app-3" dir="ltr"> @{log.admin.username}</span>
                    </td>
                    <td className="whitespace-nowrap p-2.5 text-xs text-app-3">
                      {timeAgo(log.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-3">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-icon !h-8 !w-8 disabled:opacity-40" aria-label={t("السابق", "Prev")}>
                <ChevronRight size={15} />
              </button>
              <span className="text-xs tabular-nums text-app-2">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-icon !h-8 !w-8 disabled:opacity-40" aria-label={t("التالي", "Next")}>
                <ChevronLeft size={15} />
              </button>
            </div>
          )}
        </>
      )}
    </motion.section>
  );
}

/* ================= الإعلانات ================= */
const ANN_TYPES: { key: string; ar: string; en: string }[] = [
  { key: "info", ar: "معلومة", en: "Info" },
  { key: "warning", ar: "تحذير", en: "Warning" },
  { key: "maintenance", ar: "صيانة", en: "Maintenance" },
  { key: "new", ar: "جديد", en: "New" },
];

function AnnouncementsCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const listQ = trpc.announcements.list.useQuery(undefined, { retry: false });

  const [type, setType] = useState("info");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [audience, setAudience] = useState<"all" | "users">("all");

  const create = trpc.announcements.create.useMutation({
    onSuccess: () => {
      toast(t("تم نشر الإعلان", "Announcement published"));
      setTitle("");
      setBody("");
      setLinkUrl("");
      listQ.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });
  const setActive = trpc.announcements.setActive.useMutation({
    onSuccess: () => listQ.refetch(),
    onError: (e) => toast(e.message, "danger"),
  });
  const remove = trpc.announcements.remove.useMutation({
    onSuccess: () => {
      toast(t("تم الحذف", "Deleted"));
      listQ.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const submit = () => {
    if (title.trim().length < 2 || body.trim().length < 2) {
      toast(t("العنوان والنص مطلوبان", "Title and body required"), "danger");
      return;
    }
    create.mutate({
      type: type as "info" | "warning" | "maintenance" | "new",
      title: title.trim(),
      body: body.trim(),
      linkUrl: linkUrl.trim() || undefined,
      audience,
      active: true,
    });
  };

  const items = listQ.data?.items ?? [];

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.05 }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
        <Megaphone size={16} className="text-primary" />
        {t("الإعلانات", "Announcements")}
      </h3>

      {/* نموذج إنشاء */}
      <div className="mb-4 flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="input-glass !py-2 text-xs"
          >
            {ANN_TYPES.map((a) => (
              <option key={a.key} value={a.key}>
                {t(a.ar, a.en)}
              </option>
            ))}
          </select>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as "all" | "users")}
            className="input-glass !py-2 text-xs"
          >
            <option value="all">{t("الكل", "Everyone")}</option>
            <option value="users">{t("المسجّلين فقط", "Registered only")}</option>
          </select>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("العنوان", "Title")}
          className="input-glass !py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("نص الإعلان", "Announcement body")}
          rows={2}
          className="input-glass !py-2 text-sm"
        />
        <input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          dir="ltr"
          placeholder="https://… (اختياري)"
          className="input-glass !py-2 text-xs"
        />
        <button
          type="button"
          onClick={submit}
          disabled={create.isPending}
          className="btn-primary self-start !px-4 !py-2 text-xs"
        >
          {create.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          {t("نشر", "Publish")}
        </button>
      </div>

      {/* القائمة */}
      {listQ.isLoading ? (
        <div className="skeleton h-16" />
      ) : items.length === 0 ? (
        <p className="text-xs text-app-3">{t("لا إعلانات بعد.", "No announcements yet.")}</p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div
              key={a.id}
              className="glass flex items-center justify-between gap-3 !rounded-xl p-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-app">{a.title}</div>
                <div className="text-[11px] text-app-3">{a.type}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  checked={a.active}
                  disabled={setActive.isPending}
                  onCheckedChange={(v) => setActive.mutate({ id: a.id, active: v })}
                />
                <button
                  onClick={() => remove.mutate({ id: a.id })}
                  disabled={remove.isPending}
                  className="btn-icon !h-8 !w-8 !text-danger"
                  aria-label={t("حذف", "Delete")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.section>
  );
}

/* ================= منح اشتراك مميّز ================= */
function PremiumGrantCard() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const [username, setUsername] = useState("");
  const [days, setDays] = useState("30");
  const grant = trpc.premium.grant.useMutation({
    onSuccess: (d) => {
      toast(t("تم منح الاشتراك حتى " + new Date(d.until).toLocaleDateString(), "Premium granted"));
      setUsername("");
    },
    onError: (e) => toast(e.message, "danger"),
  });
  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.05 }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
        <Crown size={16} className="text-primary" />
        {t("منح اشتراك مميّز", "Grant premium")}
      </h3>
      <div className="flex flex-wrap items-end gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t("اسم المستخدم", "Username")}
          className="input-glass min-w-0 flex-1 !py-2 text-sm"
          dir="ltr"
        />
        <input
          value={days}
          onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))}
          placeholder={t("أيام", "Days")}
          className="input-glass w-24 !py-2 text-sm"
          dir="ltr"
        />
        <button
          type="button"
          disabled={grant.isPending || !username.trim() || !Number(days)}
          onClick={() => grant.mutate({ username: username.trim(), days: Number(days) })}
          className="btn-primary !px-4 !py-2 text-xs disabled:opacity-50"
        >
          {grant.isPending ? <Loader2 size={13} className="animate-spin" /> : <Crown size={13} />}
          {t("منح", "Grant")}
        </button>
      </div>
    </motion.section>
  );
}

export default function AdminSettings() {
  return (
    <div className="space-y-4">
      <BannedWordsCard />
      <ScrapeTriggerCard />
      <PremiumGrantCard />
      <UiSectionsCard />
      <AnnouncementsCard />
      <MaintenanceCard />
      <AdminLogsCard />
    </div>
  );
}
