import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Star,
  StarOff,
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
import { GENRES, formatNum, mangaStatusLabel, timeAgo, typeLabel } from "@/lib/manga";
import { EASE } from "./adminUtils";
import type { RouterOutputs } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

type MangaItem = RouterOutputs["admin"]["listManga"]["items"][number];
type ChapterItem = RouterOutputs["admin"]["listChapters"]["items"][number];

const PAGE_SIZE = 12;

/* ================= مودال تعديل المانجا ================= */
function EditMangaDialog({
  manga,
  onClose,
  onSaved,
}: {
  manga: MangaItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const [title, setTitle] = useState(manga.title);
  const [description, setDescription] = useState(manga.description ?? "");
  const [genres, setGenres] = useState<string[]>(manga.genres ?? []);
  const [type, setType] = useState<"manga" | "manhwa" | "manhua">(manga.type);
  const [status, setStatus] = useState<"ongoing" | "completed">(manga.status);
  const [isAdult, setIsAdult] = useState(manga.isAdult);
  const [isTrending, setIsTrending] = useState(manga.isTrending);

  const mutation = trpc.admin.editManga.useMutation({
    onSuccess: () => {
      toast(t("تم حفظ التعديلات", "Changes saved"));
      onSaved();
      onClose();
    },
    onError: (e) => toast(e.message || t("تعذّر الحفظ", "Couldn't save"), "danger"),
  });

  const save = () =>
    mutation.mutate({
      id: manga.id,
      title: title.trim(),
      description,
      genres,
      type,
      status,
      isAdult,
      isTrending,
    });

  const toggleGenre = (g: string) =>
    setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-strong max-h-[88vh] overflow-y-auto border-app sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-app">
            {t("تعديل السلسلة", "Edit series")}
          </DialogTitle>
          <DialogDescription className="truncate text-app-2">{manga.title}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("الاسم", "Title")}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-glass w-full text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("الوصف", "Description")}</label>
            <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="input-glass w-full resize-none text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("التصنيفات", "Genres")}</label>
            <div className="flex flex-wrap gap-1.5">
              {GENRES.filter((g) => !g.adult).map((g) => (
                <button
                  key={g.name}
                  type="button"
                  onClick={() => toggleGenre(g.name)}
                  className={`glass-chip !px-3 !py-1 !text-xs ${
                    genres.includes(g.name)
                      ? "!border-transparent !bg-gradient-to-l !from-[#7C3AED] !to-[#E879F9] !text-white"
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
              <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("النوع", "Type")}</label>
              <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="input-glass w-full text-sm">
                <option value="manhwa">{t("مانهوا", "Manhwa")}</option>
                <option value="manga">{t("مانجا", "Manga")}</option>
                <option value="manhua">{t("مانها", "Manhua")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("الحالة", "Status")}</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="input-glass w-full text-sm">
                <option value="ongoing">{t("مستمر", "Ongoing")}</option>
                <option value="completed">{t("مكتمل", "Completed")}</option>
              </select>
            </div>
          </div>
          <div className="glass flex items-center justify-between !rounded-2xl p-3.5">
            <span className="text-sm font-semibold text-app">{t("محتوى +18", "Adult +18")}</span>
            <Switch checked={isAdult} onCheckedChange={setIsAdult} />
          </div>
          <div className="glass flex items-center justify-between !rounded-2xl p-3.5">
            <span className="text-sm font-semibold text-app">{t("شائع (ترند)", "Trending")}</span>
            <Switch checked={isTrending} onCheckedChange={setIsTrending} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <button onClick={onClose} className="btn-glass flex-1 !py-2.5 text-sm">
            {t("إلغاء", "Cancel")}
          </button>
          <button onClick={save} disabled={mutation.isPending || !title.trim()} className="btn-primary flex-1 !py-2.5 text-sm disabled:opacity-50">
            {mutation.isPending ? t("جارٍ الحفظ…", "Saving…") : t("حفظ", "Save")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ================= مودال تغيير الغلاف ================= */
function CoverDialog({
  manga,
  onClose,
  onSaved,
}: {
  manga: MangaItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const currentCover = manga.coverOverrideUrl || manga.coverUrl || "/cover-01.png";
  const alternatives = trpc.admin.coverAlternatives.useQuery(
    { mangaId: manga.id },
    { retry: false },
  );

  const setCover = trpc.admin.setCover.useMutation({
    onSuccess: () => {
      toast(t("تم تحديث الغلاف", "Cover updated"));
      onSaved();
      onClose();
    },
    onError: (e) => toast(e.message || t("تعذّر تحديث الغلاف", "Couldn't update cover"), "danger"),
  });

  const uploadImage = trpc.upload.uploadImage.useMutation();

  const pickFile = async (file: File) => {
    setUploading(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const res = await uploadImage.mutateAsync({ dataBase64, filename: file.name });
      setCover.mutate({ mangaId: manga.id, url: res.url });
    } catch (e) {
      toast((e as Error).message || t("فشل رفع الصورة", "Image upload failed"), "danger");
    } finally {
      setUploading(false);
    }
  };

  const busy = setCover.isPending || uploading;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-strong max-h-[88vh] overflow-y-auto border-app sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-app">{t("تغيير الغلاف", "Change cover")}</DialogTitle>
          <DialogDescription className="truncate text-app-2">{manga.title}</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-4">
          <img src={currentCover} alt="" className="h-36 w-24 rounded-xl border border-app object-cover" />
          <div className="flex-1 space-y-2">
            <span className="text-xs font-semibold text-app-2">{t("الغلاف الحالي", "Current cover")}</span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="btn-glass w-full !py-2.5 text-xs disabled:opacity-50"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? t("جارٍ الرفع…", "Uploading…") : t("رفع صورة من الجهاز", "Upload from device")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* البدائل من مصادر أخرى */}
        <div>
          <span className="mb-2 block text-xs font-semibold text-app-2">
            {t("بدائل من مصادر أخرى", "Alternatives from other sources")}
          </span>
          {alternatives.isLoading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton aspect-[2/3]" />
              ))}
            </div>
          ) : (alternatives.data ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-app py-6 text-center text-xs text-app-3">
              {t("لا توجد أغلفة بديلة", "No alternative covers")}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {(alternatives.data ?? []).map((alt) => (
                <button
                  key={alt.mangaId}
                  type="button"
                  disabled={busy}
                  onClick={() => alt.coverUrl && setCover.mutate({ mangaId: manga.id, url: alt.coverUrl })}
                  className="group relative overflow-hidden rounded-xl border border-app transition-transform hover:scale-[1.03] disabled:opacity-50"
                >
                  <img src={alt.coverUrl ?? ""} alt="" className="aspect-[2/3] w-full object-cover" loading="lazy" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[11px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {t("اختيار", "Pick")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* رابط مباشر */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-app-2">
              <Link2 size={12} className="me-1 inline" />
              {t("رابط غلاف مباشر", "Direct cover URL")}
            </label>
            <input
              dir="ltr"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="input-glass w-full text-left text-sm"
            />
          </div>
          <button
            type="button"
            disabled={busy || !/^https?:\/\/.+/.test(url.trim())}
            onClick={() => setCover.mutate({ mangaId: manga.id, url: url.trim() })}
            className="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-50"
          >
            {t("تعيين", "Set")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================= دروار إدارة الفصول ================= */
function ChaptersSheet({
  manga,
  onClose,
}: {
  manga: MangaItem;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ChapterItem | null>(null);
  const [editNumber, setEditNumber] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ChapterItem | null>(null);

  const query = trpc.admin.listChapters.useQuery(
    { mangaId: manga.id, page, limit: 25 },
    { retry: false, placeholderData: (prev) => prev },
  );
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 25));

  const refresh = () => query.refetch();

  const hide = trpc.admin.hideChapter.useMutation({
    onSuccess: () => { toast(t("تم إخفاء الفصل", "Chapter hidden")); refresh(); },
    onError: (e) => toast(e.message, "danger"),
  });
  const unhide = trpc.admin.unhideChapter.useMutation({
    onSuccess: () => { toast(t("تم إظهار الفصل", "Chapter unhidden")); refresh(); },
    onError: (e) => toast(e.message, "danger"),
  });
  const del = trpc.admin.deleteChapter.useMutation({
    onSuccess: () => {
      toast(t("تم حذف الفصل نهائياً", "Chapter deleted"), "danger");
      setDeleteTarget(null);
      refresh();
    },
    onError: (e) => toast(e.message, "danger"),
  });
  const edit = trpc.admin.editChapter.useMutation({
    onSuccess: () => {
      toast(t("تم حفظ الفصل", "Chapter saved"));
      setEditing(null);
      refresh();
    },
    onError: (e) => toast(e.message, "danger"),
  });
  const rescrape = trpc.admin.rescrapeChapter.useMutation({
    onSuccess: (res) => {
      toast(t(`تم السكراب — ${res.pageCount} صفحة`, `Rescraped — ${res.pageCount} pages`));
      refresh();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const busyId =
    (hide.isPending && hide.variables?.id) ||
    (unhide.isPending && unhide.variables?.id) ||
    (rescrape.isPending && rescrape.variables?.id) ||
    null;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="glass-strong w-full overflow-y-auto border-app sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-display flex items-center gap-2 text-app">
            <Layers size={17} className="text-primary" />
            {t("فصول", "Chapters")}: <span className="truncate">{manga.title}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2 pb-8">
          {query.isLoading ? (
            [1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-14" />)
          ) : query.isError ? (
            <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
          ) : (query.data?.items ?? []).length === 0 ? (
            <EmptyState title={t("لا فصول", "No chapters")} caption={t("لم تُسحب فصول لهذه السلسلة بعد.", "No chapters scraped yet.")} />
          ) : (
            query.data!.items.map((ch) => {
              const hidden = !!ch.hiddenAt;
              return (
                <div
                  key={ch.id}
                  className={`glass flex items-center gap-3 !rounded-xl p-3 ${hidden ? "opacity-55" : ""}`}
                >
                  <span className="font-display w-12 shrink-0 text-center text-sm font-bold tabular-nums text-primary">
                    #{ch.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-app">
                      {ch.title || t("بدون عنوان", "No title")}
                    </div>
                    <div className="text-[11px] text-app-3">
                      {timeAgo(ch.createdAt)} · {ch.pageCount} {t("صفحة", "pages")} ·{" "}
                      {hidden ? (
                        <span className="font-semibold text-warning">{t("مخفي", "Hidden")}</span>
                      ) : (
                        <span className="font-semibold text-success">{t("ظاهر", "Visible")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {busyId === ch.id ? (
                      <span className="btn-icon !h-8 !w-8"><Loader2 size={14} className="animate-spin" /></span>
                    ) : (
                      <>
                        <button
                          onClick={() => (hidden ? unhide : hide).mutate({ id: ch.id })}
                          className="btn-icon !h-8 !w-8"
                          aria-label={hidden ? t("إظهار", "Unhide") : t("إخفاء", "Hide")}
                        >
                          {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button
                          onClick={() => {
                            setEditing(ch);
                            setEditNumber(String(ch.number));
                            setEditTitle(ch.title ?? "");
                          }}
                          className="btn-icon !h-8 !w-8"
                          aria-label={t("تعديل", "Edit")}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => rescrape.mutate({ id: ch.id })}
                          className="btn-icon !h-8 !w-8"
                          aria-label={t("إعادة سكراب", "Rescrape")}
                        >
                          <RefreshCw size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(ch)}
                          className="btn-icon !h-8 !w-8 hover:!border-danger/50 hover:!text-danger"
                          aria-label={t("حذف", "Delete")}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* ترقيم الفصول */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn-icon !h-8 !w-8 disabled:opacity-40"
                aria-label={t("السابق", "Prev")}
              >
                <ChevronRight size={15} />
              </button>
              <span className="text-xs tabular-nums text-app-2">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="btn-icon !h-8 !w-8 disabled:opacity-40"
                aria-label={t("التالي", "Next")}
              >
                <ChevronLeft size={15} />
              </button>
            </div>
          )}
        </div>

        {/* مودال تعديل فصل */}
        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="glass-strong border-app">
            <DialogHeader>
              <DialogTitle className="font-display text-app">
                {t("تعديل الفصل", "Edit chapter")} #{editing?.number}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("الرقم", "Number")}</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  dir="ltr"
                  value={editNumber}
                  onChange={(e) => setEditNumber(e.target.value)}
                  className="input-glass w-full text-left text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-app-2">{t("العنوان", "Title")}</label>
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="input-glass w-full text-sm" />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <button onClick={() => setEditing(null)} className="btn-glass flex-1 !py-2.5 text-sm">
                {t("إلغاء", "Cancel")}
              </button>
              <button
                disabled={edit.isPending || !Number(editNumber)}
                onClick={() =>
                  editing &&
                  edit.mutate({
                    id: editing.id,
                    number: Number(editNumber),
                    title: editTitle.trim() || undefined,
                  })
                }
                className="btn-primary flex-1 !py-2.5 text-sm disabled:opacity-50"
              >
                {edit.isPending ? t("جارٍ الحفظ…", "Saving…") : t("حفظ", "Save")}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* تأكيد حذف فصل */}
        <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <DialogContent className="glass-strong border-app">
            <DialogHeader>
              <DialogTitle className="font-display text-app">{t("حذف الفصل", "Delete chapter")}</DialogTitle>
              <DialogDescription className="text-app-2">
                {t("سيُحذف الفصل", "Chapter")} #{deleteTarget?.number}{" "}
                {t("نهائياً ولا يمكن التراجع.", "will be permanently deleted. This cannot be undone.")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <button onClick={() => setDeleteTarget(null)} className="btn-glass flex-1 !py-2.5 text-sm">
                {t("إلغاء", "Cancel")}
              </button>
              <button
                disabled={del.isPending}
                onClick={() => deleteTarget && del.mutate({ id: deleteTarget.id })}
                className="btn-primary flex-1 !border-none !bg-none !py-2.5 text-sm disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#FB7185,#F43F5E)" }}
              >
                <Trash2 size={14} /> {t("حذف نهائي", "Delete")}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

/* ================= طلبات التحديث ================= */
function UpdateRequestsPanel() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const [page, setPage] = useState(1);

  const query = trpc.admin.listUpdateRequests.useQuery(
    { status: "pending", page, limit: 10 },
    { retry: false, placeholderData: (prev) => prev },
  );
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 10));

  const resolve = trpc.admin.resolveUpdateRequest.useMutation({
    onSuccess: () => {
      toast(t("تم تعليم الطلب كمنجز", "Request resolved"));
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  return (
    <section className="glass !rounded-2xl p-4 md:p-5">
      <h3 className="font-display mb-3 flex items-center gap-2 text-sm font-bold text-app">
        <CheckCheck size={16} className="text-primary" />
        {t("طلبات التحديث", "Update requests")}
        {query.data && query.data.total > 0 && (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold tabular-nums text-warning">
            {query.data.total}
          </span>
        )}
      </h3>
      {query.isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-12" />)}</div>
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      ) : (query.data?.items ?? []).length === 0 ? (
        <p className="py-8 text-center text-sm text-app-3">
          {t("لا طلبات تحديث معلّقة", "No pending update requests")}
        </p>
      ) : (
        <div className="space-y-2">
          {query.data!.items.map((r) => (
            <div key={r.id} className="glass flex items-center gap-3 !rounded-xl p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-app">{r.manga.title}</div>
                <div className="truncate text-[11px] text-app-3">
                  @{r.user.username} · {timeAgo(r.createdAt)}
                </div>
              </div>
              <button
                disabled={resolve.isPending && resolve.variables?.id === r.id}
                onClick={() => resolve.mutate({ id: r.id })}
                className="btn-glass shrink-0 !px-4 !py-2 text-xs disabled:opacity-50"
              >
                {resolve.isPending && resolve.variables?.id === r.id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <CheckCheck size={13} />
                )}
                {t("تم", "Done")}
              </button>
            </div>
          ))}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-icon !h-8 !w-8 disabled:opacity-40" aria-label={t("السابق", "Prev")}>
                <ChevronRight size={15} />
              </button>
              <span className="text-xs tabular-nums text-app-2">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-icon !h-8 !w-8 disabled:opacity-40" aria-label={t("التالي", "Next")}>
                <ChevronLeft size={15} />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ================= المكوّن الرئيسي ================= */
export default function ContentManager() {
  const { t } = useLanguage();
  const toast = useAdminToast();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);

  const [editTarget, setEditTarget] = useState<MangaItem | null>(null);
  const [coverTarget, setCoverTarget] = useState<MangaItem | null>(null);
  const [chaptersTarget, setChaptersTarget] = useState<MangaItem | null>(null);

  // debounce للبحث
  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(id);
  }, [search]);

  const query = trpc.admin.listManga.useQuery(
    { page, limit: PAGE_SIZE, search: debounced || undefined },
    { retry: false, placeholderData: (prev) => prev },
  );
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));
  const refresh = () => query.refetch();

  const hideManga = trpc.admin.hideManga.useMutation({
    onSuccess: () => { toast(t("تم إخفاء السلسلة", "Series hidden")); refresh(); },
    onError: (e) => toast(e.message, "danger"),
  });
  const unhideManga = trpc.admin.unhideManga.useMutation({
    onSuccess: () => { toast(t("تم إظهار السلسلة", "Series unhidden")); refresh(); },
    onError: (e) => toast(e.message, "danger"),
  });
  const setFeatured = trpc.admin.setFeatured.useMutation({
    onSuccess: () => { toast(t("تم التثبيت كمميّزة", "Featured")); refresh(); },
    onError: (e) => toast(e.message, "danger"),
  });
  const unsetFeatured = trpc.admin.unsetFeatured.useMutation({
    onSuccess: () => { toast(t("أُلغي التمييز", "Unfeatured")); refresh(); },
    onError: (e) => toast(e.message, "danger"),
  });
  const rescrape = trpc.admin.rescrapeManga.useMutation({
    onSuccess: (res) => {
      toast(
        t(`اكتمل السكراب — ${res.chaptersAdded} فصل جديد`, `Rescrape done — ${res.chaptersAdded} new chapters`),
      );
      refresh();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const pendingId = useMemo(
    () =>
      (hideManga.isPending && hideManga.variables?.id) ||
      (unhideManga.isPending && unhideManga.variables?.id) ||
      (setFeatured.isPending && setFeatured.variables?.id) ||
      (unsetFeatured.isPending && unsetFeatured.variables?.id) ||
      (rescrape.isPending && rescrape.variables?.id) ||
      null,
    [hideManga, unhideManga, setFeatured, unsetFeatured, rescrape],
  );

  return (
    <div className="space-y-5">
      {/* بحث */}
      <div className="glass flex items-center gap-2.5 !rounded-2xl p-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-app-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("ابحث عن مانهوا بالاسم…", "Search series by name…")}
            className="input-glass w-full !py-2.5 !ps-10 text-sm"
          />
        </div>
      </div>

      {/* النتائج */}
      {query.isLoading ? (
        <div className="space-y-2.5">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-20" />)}</div>
      ) : query.isError ? (
        <div className="glass">
          <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
        </div>
      ) : (query.data?.items ?? []).length === 0 ? (
        <div className="glass">
          <EmptyState title={t("لا نتائج", "No results")} caption={t("جرّب اسماً مختلفاً.", "Try a different name.")} />
        </div>
      ) : (
        <div className="space-y-2.5">
          {query.data!.items.map((m, i) => {
            const hidden = !!m.hiddenAt;
            const featured = !!m.featuredAt;
            const cover = m.coverOverrideUrl || m.coverUrl || "/cover-01.png";
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 10) * 0.03 }}
                className={`glass !rounded-2xl p-3 ${hidden ? "opacity-60" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <img src={cover} alt="" className="h-16 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-app">{m.title}</span>
                      {m.isAdult && (
                        <span className="rounded-md bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold text-danger">+18</span>
                      )}
                      {featured && (
                        <span className="flex items-center gap-0.5 rounded-md bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                          <Star size={10} /> {t("مميّزة", "Featured")}
                        </span>
                      )}
                      {hidden && (
                        <span className="rounded-md bg-primary-soft/15 px-1.5 py-0.5 text-[10px] font-bold text-app-3">
                          {t("مخفية", "Hidden")}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-app-3">
                      <span dir="ltr">{m.source.name}</span> · {typeLabel(m.type)} ·{" "}
                      {mangaStatusLabel(m.status)} · {formatNum(m.chapterCount)} {t("فصل", "ch")}
                    </div>
                  </div>
                </div>
                {/* الأزرار — تلف على الموبايل */}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {pendingId === m.id ? (
                    <span className="btn-glass !px-4 !py-2 text-xs"><Loader2 size={13} className="animate-spin" /></span>
                  ) : (
                    <>
                      <button onClick={() => setEditTarget(m)} className="btn-glass !px-3 !py-2 text-xs">
                        <Pencil size={13} /> {t("تعديل", "Edit")}
                      </button>
                      <button
                        onClick={() => (hidden ? unhideManga : hideManga).mutate({ id: m.id })}
                        className="btn-glass !px-3 !py-2 text-xs"
                      >
                        {hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                        {hidden ? t("إظهار", "Unhide") : t("إخفاء", "Hide")}
                      </button>
                      <button
                        onClick={() => (featured ? unsetFeatured : setFeatured).mutate({ id: m.id })}
                        className={`btn-glass !px-3 !py-2 text-xs ${featured ? "!border-warning/50 !text-warning" : ""}`}
                      >
                        {featured ? <StarOff size={13} /> : <Star size={13} />}
                        {featured ? t("إلغاء التمييز", "Unfeature") : t("تمييز", "Feature")}
                      </button>
                      <button onClick={() => rescrape.mutate({ id: m.id })} className="btn-glass !px-3 !py-2 text-xs">
                        <RefreshCw size={13} /> {t("سكراب كامل", "Rescrape")}
                      </button>
                      <button onClick={() => setCoverTarget(m)} className="btn-glass !px-3 !py-2 text-xs">
                        <ImageIcon size={13} /> {t("الغلاف", "Cover")}
                      </button>
                      <button onClick={() => setChaptersTarget(m)} className="btn-glass !px-3 !py-2 text-xs">
                        <Layers size={13} /> {t("الفصول", "Chapters")}
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ترقيم */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-icon !h-9 !w-9 disabled:opacity-40" aria-label={t("السابق", "Prev")}>
            <ChevronRight size={16} />
          </button>
          <span className="text-sm tabular-nums text-app-2">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-icon !h-9 !w-9 disabled:opacity-40" aria-label={t("التالي", "Next")}>
            <ChevronLeft size={16} />
          </button>
        </div>
      )}

      {/* طلبات التحديث */}
      <UpdateRequestsPanel />

      {/* المودالات */}
      {editTarget && (
        <EditMangaDialog manga={editTarget} onClose={() => setEditTarget(null)} onSaved={refresh} />
      )}
      {coverTarget && (
        <CoverDialog manga={coverTarget} onClose={() => setCoverTarget(null)} onSaved={refresh} />
      )}
      {chaptersTarget && (
        <ChaptersSheet manga={chaptersTarget} onClose={() => setChaptersTarget(null)} />
      )}
    </div>
  );
}
