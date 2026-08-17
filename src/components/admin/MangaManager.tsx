import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  EyeOff,
  Flame,
  ImageOff,
  Pencil,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { GENRES, mangaStatusLabel, proxyImg, timeAgo, typeLabel } from "@/lib/manga";
import { EASE } from "./adminUtils";
import type { AdminMangaRow, RouterOutputs } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

const TYPE_FILTERS = ["الكل", "مانهوا", "مانجا", "مانها"];
const STATUS_FILTERS = ["الكل", "مستمر", "مكتمل"];

type ApiMangaItem = RouterOutputs["admin"]["listManga"]["items"][number];

function mapApiManga(m: ApiMangaItem): AdminMangaRow {
  return {
    id: Number(m.id),
    slug: m.slug,
    title: m.title,
    altTitle: m.altTitles?.[0],
    cover: proxyImg(m.coverUrl) || "/placeholder-cover.svg",
    type: typeLabel(m.type),
    status: mangaStatusLabel(m.status),
    chapters: m.chapterCount,
    rating: m.rating,
    source: m.source.name,
    isAdult: m.isAdult,
    isTrending: m.isTrending ?? false,
    statusRaw: m.status,
    lastScan: timeAgo(m.updatedAt),
    genres: m.genres ?? [],
    description: m.description ?? "",
  };
}

export default function MangaManager() {
  const { t } = useLanguage();
  const toast = useAdminToast();

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("الكل");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [typeFilter, setTypeFilter] = useState("الكل");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const [adultOverrides, setAdultOverrides] = useState<Record<number, boolean>>({});
  const [editing, setEditing] = useState<AdminMangaRow | null>(null);
  const [draft, setDraft] = useState<AdminMangaRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number[] | null>(null);

  const query = trpc.admin.listManga.useQuery(
    { page, limit: perPage, search: search || undefined },
    { retry: false, placeholderData: (prev) => prev },
  );

  const sourcesQuery = trpc.manga.sources.useQuery(undefined, { retry: false });
  const sourceOptions = useMemo(
    () => (sourcesQuery.data ?? []).map((s) => s.name),
    [sourcesQuery.data],
  );

  const { rows, total } = useMemo(() => {
    if (!query.data) return { rows: [] as AdminMangaRow[], total: 0 };
    let list = query.data.items.map(mapApiManga);
    // فلاتر المصدر/الحالة/النوع تُطبّق محلياً على نتائج الصفحة
    if (sourceFilter !== "الكل") list = list.filter((m) => m.source === sourceFilter);
    if (statusFilter !== "الكل") list = list.filter((m) => m.status === statusFilter);
    if (typeFilter !== "الكل") list = list.filter((m) => m.type === typeFilter);
    return { rows: list, total: query.data.total };
  }, [query.data, sourceFilter, statusFilter, typeFilter]);

  const visible = useMemo(
    () =>
      rows.map((m) => ({
        ...m,
        isAdult: adultOverrides[m.id] ?? m.isAdult,
      })),
    [rows, adultOverrides],
  );

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const applyHide = (ids: number[]) => {
    // TODO: ربط بـ API إخفاء السلسلة عند توفره
    setHiddenIds((prev) => new Set([...prev, ...ids]));
    setSelected(new Set());
    toast(t("تم إخفاء السلاسل المحددة", "Selected series hidden"));
  };

  const applyAdult = (ids: number[]) => {
    // TODO: ربط بـ API تمييز +18 عند توفره
    setAdultOverrides((prev) => {
      const next = { ...prev };
      ids.forEach((id) => (next[id] = true));
      return next;
    });
    setSelected(new Set());
    toast(t("تم التمييز كـ +18", "Marked as +18"));
  };

  const deleteMutation = trpc.admin.deleteManga.useMutation();
  const updateMutation = trpc.admin.updateManga.useMutation();
  const fixCoversMutation = trpc.admin.fixMissingCovers.useMutation();

  /** إصلاح الأغلفة الناقصة — دفعة من 50 سلسلة */
  const fixCovers = () => {
    fixCoversMutation.mutate(
      { limit: 50 },
      {
        onSuccess: (res) => {
          query.refetch();
          toast(
            t(
              `فُحصت ${res.scanned} سلسلة — أُصلح ${res.fixed} غلاف — فشل ${res.failed}`,
              `Scanned ${res.scanned} — fixed ${res.fixed} covers — ${res.failed} failed`,
            ),
            res.failed > 0 ? "info" : "success",
          );
        },
        onError: () => toast(t("تعذّر إصلاح الأغلفة", "Couldn't fix covers"), "danger"),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const ids = deleteTarget;
    // حذف حقيقي عبر الـ API لكل سلسلة محددة
    Promise.allSettled(ids.map((id) => deleteMutation.mutateAsync({ id }))).then((results) => {
      const failed = results.filter((r) => r.status === "rejected").length;
      setSelected(new Set());
      setDeleteTarget(null);
      query.refetch();
      if (failed > 0) {
        toast(t(`تعذّر حذف ${failed} سلسلة`, `Failed to delete ${failed} series`), "danger");
      } else {
        toast(t("تم حذف السلسلة نهائياً", "Series deleted permanently"), "danger");
      }
    });
  };

  const openEdit = (m: AdminMangaRow) => {
    setEditing(m);
    setDraft({ ...m });
  };

  const saveEdit = () => {
    if (!draft) return;
    // تحديث حقيقي عبر admin.updateManga — فقط الحقول المدعومة في العقد
    const status: "ongoing" | "completed" =
      draft.status === "مكتمل" || draft.statusRaw === "completed" ? "completed" : "ongoing";
    updateMutation.mutate(
      {
        id: draft.id,
        title: draft.title,
        coverUrl: draft.cover,
        description: draft.description,
        status,
        isTrending: draft.isTrending,
      },
      {
        onSuccess: () => {
          if (draft.isAdult !== editing?.isAdult) {
            setAdultOverrides((prev) => ({ ...prev, [draft.id]: draft.isAdult }));
          }
          setEditing(null);
          query.refetch();
          toast(t("تم حفظ التعديلات", "Changes saved"));
        },
        onError: () => toast(t("تعذّر حفظ التعديلات", "Couldn't save changes"), "danger"),
      },
    );
  };

  const dirty = draft && editing && JSON.stringify(draft) !== JSON.stringify(editing);

  const toggleDraftGenre = (g: string) => {
    if (!draft) return;
    const has = draft.genres.includes(g);
    setDraft({ ...draft, genres: has ? draft.genres.filter((x) => x !== g) : [...draft.genres, g] });
  };

  return (
    <div className="space-y-4">
      {/* شريط الأدوات */}
      <div className="glass flex flex-wrap items-center gap-2.5 !rounded-2xl p-3">
        <div className="relative min-w-48 flex-1">
          <Search size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-app-3" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("ابحث بعنوان السلسلة…", "Search by title…")}
            className="input-glass w-full !py-2.5 !ps-10 text-sm"
          />
        </div>
        <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }} className="input-glass !py-2.5 text-sm">
          <option value="الكل">{t("كل المصادر", "All sources")}</option>
          {sourceOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="input-glass !py-2.5 text-sm">
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{s === "الكل" ? t("كل الحالات", "All statuses") : s}</option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="input-glass !py-2.5 text-sm">
          {TYPE_FILTERS.map((s) => (
            <option key={s} value={s}>{s === "الكل" ? t("كل الأنواع", "All types") : s}</option>
          ))}
        </select>
        <button
          onClick={fixCovers}
          disabled={fixCoversMutation.isPending}
          className="btn-glass !px-4 !py-2.5 text-xs disabled:opacity-50"
          title={t("إعادة جلب الأغلفة الناقصة من المصدر (دفعة 50)", "Re-fetch missing covers from sources (batch of 50)")}
        >
          <ImageOff size={14} />
          {fixCoversMutation.isPending ? t("جارٍ الإصلاح…", "Fixing…") : t("إصلاح الأغلفة", "Fix covers")}
        </button>
      </div>

      {/* شريط الإجراءات الجماعية */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="glass-strong flex flex-wrap items-center gap-2 rounded-2xl border !border-primary-soft/40 p-3"
          >
            <span className="text-sm font-semibold text-app">
              {selected.size} {t("محدد", "selected")}
            </span>
            <div className="ms-auto flex gap-2">
              <button onClick={() => applyHide([...selected])} className="btn-glass !px-4 !py-2 text-xs">
                <EyeOff size={14} /> {t("إخفاء", "Hide")}
              </button>
              <button onClick={() => applyAdult([...selected])} className="btn-glass !px-4 !py-2 text-xs">
                <ShieldAlert size={14} /> {t("تمييز كـ +18", "Mark +18")}
              </button>
              <button
                onClick={() => setDeleteTarget([...selected])}
                className="btn-glass !border-danger/50 !px-4 !py-2 text-xs !text-danger"
              >
                <Trash2 size={14} /> {t("حذف", "Delete")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* القائمة */}
      {query.isLoading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="glass">
          <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
        </div>
      ) : visible.length === 0 ? (
        <div className="glass">
          <EmptyState title={t("لا نتائج", "No results")} caption={t("جرّب تعديل البحث أو الفلاتر.", "Try adjusting search or filters.")} />
        </div>
      ) : (
        <>
          {/* جدول سطح المكتب */}
          <div className="glass hidden overflow-x-auto !rounded-2xl md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app text-xs text-app-3">
                  <th className="w-10 p-3"></th>
                  <th className="p-3 text-start font-semibold">{t("السلسلة", "Series")}</th>
                  <th className="p-3 text-start font-semibold">{t("المصدر", "Source")}</th>
                  <th className="p-3 text-start font-semibold">{t("الفصول", "Chapters")}</th>
                  <th className="p-3 text-start font-semibold">{t("الحالة", "Status")}</th>
                  <th className="p-3 text-start font-semibold">{t("آخر فحص", "Last scan")}</th>
                  <th className="p-3 text-start font-semibold">{t("إجراءات", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m, i) => (
                  <motion.tr
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 20) * 0.02 }}
                    className={`border-b border-app/50 transition-colors ${
                      selected.has(m.id) ? "bg-primary-soft/12" : "hover:bg-primary-soft/5"
                    } ${hiddenIds.has(m.id) ? "opacity-50" : ""}`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={() => toggleSelect(m.id)}
                        className="h-4 w-4 accent-[var(--primary)]"
                        aria-label={m.title}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <img src={m.cover} alt="" className="h-14 w-10 rounded-lg object-cover" loading="lazy" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="max-w-52 truncate font-semibold text-app">{m.title}</span>
                            {m.isAdult && (
                              <span className="rounded-md bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold text-danger">+18</span>
                            )}
                            {m.isTrending && (
                              <span className="flex items-center gap-0.5 rounded-md bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                                <Flame size={10} /> {t("شائع", "Trending")}
                              </span>
                            )}
                          </div>
                          {m.altTitle && <div className="max-w-52 truncate text-xs text-app-3" dir="ltr">{m.altTitle}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="glass-chip !px-2.5 !py-1 !text-[11px]" dir="ltr">{m.source}</span>
                    </td>
                    <td className="p-3 tabular-nums text-app-2">{m.chapters}</td>
                    <td className="p-3">
                      <span
                        className={`glass-chip !px-2.5 !py-1 !text-[11px] font-semibold ${
                          m.status === "مكتمل" ? "!border-success/40 text-success" : "!border-warning/40 text-warning"
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-app-3">{m.lastScan}</td>
                    <td className="p-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => openEdit(m)} className="btn-icon !h-8 !w-8" aria-label={t("تعديل", "Edit")}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => applyHide([m.id])} className="btn-icon !h-8 !w-8" aria-label={t("إخفاء", "Hide")}>
                          <EyeOff size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget([m.id])}
                          className="btn-icon !h-8 !w-8 hover:!border-danger/50 hover:!text-danger"
                          aria-label={t("حذف", "Delete")}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* بطاقات الموبايل */}
          <div className="space-y-2.5 md:hidden">
            {visible.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE, delay: i * 0.03 }}
                className={`glass flex items-center gap-3 !rounded-2xl p-3 ${hiddenIds.has(m.id) ? "opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() => toggleSelect(m.id)}
                  className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                  aria-label={m.title}
                />
                <img src={m.cover} alt="" className="h-16 w-11 rounded-lg object-cover" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-app">{m.title}</span>
                    {m.isAdult && (
                      <span className="rounded-md bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold text-danger">+18</span>
                    )}
                    {m.isTrending && (
                      <span className="flex items-center gap-0.5 rounded-md bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                        <Flame size={10} /> {t("شائع", "Trending")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-app-3">
                    <span dir="ltr">{m.source}</span> · {m.chapters} {t("فصل", "ch")} · {m.status}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <button onClick={() => openEdit(m)} className="btn-icon !h-8 !w-8" aria-label={t("تعديل", "Edit")}>
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget([m.id])}
                    className="btn-icon !h-8 !w-8 hover:!border-danger/50 hover:!text-danger"
                    aria-label={t("حذف", "Delete")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* الترقيم */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={perPage}
          onChange={(e) => {
            setPerPage(Number(e.target.value));
            setPage(1);
          }}
          className="input-glass !py-2 text-sm"
        >
          {[10, 20, 50].map((n) => (
            <option key={n} value={n}>{n}/{t("صفحة", "page")}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 7).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`glass-chip !px-3.5 !py-1.5 tabular-nums ${
                page === p ? "!border-transparent !bg-[#E0561F] !text-white" : ""
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Drawer التعديل */}
      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent side="right" className="glass-strong w-full overflow-y-auto border-app sm:max-w-md">
          {draft && (
            <>
              <SheetHeader>
                <SheetTitle className="font-display flex items-center gap-2 text-app">
                  {t("تعديل السلسلة", "Edit series")}
                  {dirty && (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-warning">
                      <span className="animate-pulse-soft h-2 w-2 rounded-full bg-warning" />
                      {t("غير محفوظ", "Unsaved")}
                    </span>
                  )}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-5 flex flex-col gap-4 pb-24">
                <div className="flex items-start gap-4">
                  <img src={draft.cover} alt="" className="h-36 w-24 rounded-xl border border-app object-cover" />
                  <button
                    type="button"
                    onClick={() => toast(t("رفع الغلاف يتطلب تكامل التخزين (قريباً)", "Cover upload needs storage integration"), "info")}
                    className="btn-glass !px-4 !py-2 text-xs"
                  >
                    <Upload size={14} /> {t("تغيير الغلاف", "Change cover")}
                  </button>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("العنوان", "Title")}</label>
                  <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="input-glass w-full text-sm" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("رابط الغلاف", "Cover URL")}</label>
                  <input dir="ltr" value={draft.cover} onChange={(e) => setDraft({ ...draft, cover: e.target.value })} className="input-glass w-full text-left text-sm" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("العنوان البديل", "Alt title")}</label>
                  <input dir="ltr" value={draft.altTitle ?? ""} onChange={(e) => setDraft({ ...draft, altTitle: e.target.value })} className="input-glass w-full text-left text-sm" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("الوصف", "Description")}</label>
                  <textarea rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="input-glass w-full resize-none text-sm" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("التصنيفات", "Genres")}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {GENRES.filter((g) => !g.adult).map((g) => (
                      <button
                        key={g.name}
                        type="button"
                        onClick={() => toggleDraftGenre(g.name)}
                        className={`glass-chip !px-3 !py-1 !text-xs ${
                          draft.genres.includes(g.name)
                            ? "!border-transparent !bg-[#E0561F] !text-white"
                            : ""
                        }`}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("الحالة", "Status")}</label>
                    <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className="input-glass w-full text-sm">
                      <option value="مستمر">مستمر</option>
                      <option value="مكتمل">مكتمل</option>
                      <option value="متوقف">متوقف</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("النوع", "Type")}</label>
                    <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} className="input-glass w-full text-sm">
                      <option value="مانهوا">مانهوا</option>
                      <option value="مانجا">مانجا</option>
                      <option value="مانها">مانها</option>
                    </select>
                  </div>
                </div>
                <div className="glass flex items-center justify-between !rounded-2xl p-3.5">
                  <span className="flex items-center gap-2 text-sm font-semibold text-app">
                    <ShieldAlert size={16} className="text-danger" />
                    {t("محتوى +18", "Adult +18")}
                  </span>
                  <Switch checked={draft.isAdult} onCheckedChange={(v) => setDraft({ ...draft, isAdult: v })} />
                </div>
                <div className="glass flex items-center justify-between !rounded-2xl p-3.5">
                  <span className="flex items-center gap-2 text-sm font-semibold text-app">
                    <Flame size={16} className="text-warning" />
                    {t("شائع (ترند)", "Trending")}
                  </span>
                  <Switch checked={draft.isTrending} onCheckedChange={(v) => setDraft({ ...draft, isTrending: v })} />
                </div>
              </div>
              <div className="glass-strong absolute inset-x-0 bottom-0 flex gap-2 border-t border-app p-4">
                <button onClick={() => setEditing(null)} className="btn-glass flex-1 !py-2.5 text-sm">
                  {t("إلغاء", "Cancel")}
                </button>
                <button onClick={saveEdit} disabled={updateMutation.isPending} className="btn-primary flex-1 !py-2.5 text-sm disabled:opacity-50">
                  {updateMutation.isPending ? t("جارٍ الحفظ…", "Saving…") : t("حفظ التعديلات", "Save changes")}
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* تأكيد الحذف */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="glass-strong border-app">
          <DialogHeader>
            <DialogTitle className="font-display text-app">{t("تأكيد الحذف", "Confirm deletion")}</DialogTitle>
            <DialogDescription className="text-app-2">
              {t("سيتم حذف", "Will delete")} {deleteTarget?.length ?? 0}{" "}
              {t("سلسلة نهائياً مع كل فصولها وبيانات القراءة المرتبطة. لا يمكن التراجع.", "series permanently with all chapters. This cannot be undone.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button onClick={() => setDeleteTarget(null)} className="btn-glass !px-5 !py-2.5 text-sm">
              {t("إلغاء", "Cancel")}
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="btn-primary !border-none !bg-none !px-5 !py-2.5 text-sm disabled:opacity-50"
              style={{ background: "var(--danger)" }}
            >
              <Trash2 size={15} /> {t("حذف نهائي", "Delete permanently")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
