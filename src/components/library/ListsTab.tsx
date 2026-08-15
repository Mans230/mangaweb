import { useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Layers,
  ListPlus,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import GlassModal from "./GlassModal";
import { useToast } from "./toast";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

type MyList = {
  id: number;
  name: string;
  itemCount: number;
  covers: string[];
};

/**
 * "قوائمي" — قوائم مخصصة: شبكة بطاقات (٤ أغلفة + عدد) + إنشاء،
 * وعرض تفاصيل القائمة (عناصر/إزالة/إعادة تسمية/حذف) عند اختيارها.
 */
export default function ListsTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const listsQ = trpc.lists.myLists.useQuery(undefined, { retry: false });
  const lists = (listsQ.data ?? []) as MyList[];

  const invalidateLists = () => {
    void utils.lists.myLists.invalidate();
    void utils.lists.listItems.invalidate();
  };

  return (
    <div>
      <AnimatePresence mode="wait">
        {selectedId === null ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-app">
                {t("قوائمي المخصصة", "My custom lists")}
              </h3>
              <button
                onClick={() => setCreateOpen(true)}
                className="btn-primary !py-2 text-xs"
              >
                <Plus size={14} />
                {t("قائمة جديدة", "New list")}
              </button>
            </div>

            {listsQ.isLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton aspect-[4/5] !rounded-2xl" />
                ))}
              </div>
            ) : lists.length === 0 ? (
              <div className="flex flex-col items-center">
                <EmptyState
                  title={t("لا قوائم بعد", "No lists yet")}
                  caption={t(
                    "أنشئ قوائم بأسمائك — «أقرأها لاحقاً»، «أعمال مقروءة»، أو أي تصنيف يعجبك.",
                    "Create lists with your own names — 'Read later', 'Finished', or anything you like.",
                  )}
                />
                <button
                  onClick={() => setCreateOpen(true)}
                  className="btn-primary -mt-6 !py-2.5 text-sm"
                >
                  <Plus size={15} />
                  {t("أنشئ أول قائمة", "Create your first list")}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5">
                {lists.map((list, i) => (
                  <ListCard
                    key={list.id}
                    list={list}
                    index={i}
                    onOpen={() => setSelectedId(list.id)}
                  />
                ))}
                {/* بطاقة إنشاء سريعة */}
                <motion.button
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE, delay: lists.length * 0.05 }}
                  onClick={() => setCreateOpen(true)}
                  className="glass flex aspect-[4/5] flex-col items-center justify-center gap-3 !rounded-2xl border-dashed text-app-3 transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <span className="gradient-primary flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-md">
                    <ListPlus size={20} />
                  </span>
                  <span className="text-xs font-bold">{t("قائمة جديدة", "New list")}</span>
                </motion.button>
              </div>
            )}
            {/* نهاية شبكة القوائم */}
          </motion.div>
        ) : (
          <motion.div
            key={`detail-${selectedId}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <ListDetail
              listId={selectedId}
              onBack={() => setSelectedId(null)}
              onDeleted={() => {
                setSelectedId(null);
                invalidateLists();
              }}
              onChanged={invalidateLists}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <CreateListModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          invalidateLists();
          setSelectedId(id);
          toast(t("أُنشئت القائمة", "List created"));
        }}
      />
    </div>
  );
}

/* ================= بطاقة قائمة ================= */
function ListCard({ list, index, onOpen }: { list: MyList; index: number; onOpen: () => void }) {
  const { t } = useLanguage();
  const covers = list.covers.slice(0, 4);
  return (
    <motion.button
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: index * 0.05 }}
      whileHover={{ y: -4 }}
      onClick={onOpen}
      className="glass group flex flex-col overflow-hidden !rounded-2xl p-2 text-start transition-shadow hover:shadow-[0_16px_40px_rgba(224,86,31,0.18)]"
    >
      {/* شبكة ٢×٢ من الأغلفة */}
      <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-xl bg-black/10 dark:bg-white/5">
        {covers.length === 0 ? (
          <span className="col-span-2 row-span-2 flex items-center justify-center text-app-3">
            <Layers size={26} />
          </span>
        ) : (
          covers.map((src, i) => (
            <img
              key={`${src}-${i}`}
              src={src}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              className={`h-full w-full object-cover ${covers.length === 1 ? "col-span-2 row-span-2" : ""}`}
            />
          ))
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-1.5 pb-1 pt-2.5">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-bold text-app transition-colors group-hover:text-primary">
            {list.name}
          </h4>
          <p className="mt-0.5 text-[11px] text-app-3">
            {list.itemCount.toLocaleString("ar")} {t("عمل", "titles")}
          </p>
        </div>
        <ArrowRight size={15} className="shrink-0 text-app-3 transition-transform group-hover:-translate-x-0.5 rtl:rotate-180" />
      </div>
    </motion.button>
  );
}

/* ================= تفاصيل القائمة ================= */
function ListDetail({
  listId,
  onBack,
  onDeleted,
  onChanged,
}: {
  listId: number;
  onBack: () => void;
  onDeleted: () => void;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const itemsQ = trpc.lists.listItems.useQuery({ listId }, { retry: false });
  const list = itemsQ.data?.list;
  const items = itemsQ.data?.items ?? [];

  const renameMut = trpc.lists.renameList.useMutation({
    onSuccess: () => {
      setRenaming(false);
      setNameDraft(null);
      onChanged();
      toast(t("أُعيدت تسمية القائمة", "List renamed"));
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });
  const deleteMut = trpc.lists.deleteList.useMutation({
    onSuccess: () => {
      toast(t("حُذفت القائمة", "List deleted"));
      onDeleted();
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });
  const removeMut = trpc.lists.removeFromList.useMutation({
    onSuccess: () => {
      onChanged();
      toast(t("أُزيل العمل من القائمة", "Removed from list"));
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const submitRename = () => {
    const name = (nameDraft ?? "").trim();
    if (!name || name === list?.name) {
      setRenaming(false);
      return;
    }
    renameMut.mutate({ id: listId, name });
  };

  return (
    <div>
      {/* رأس التفاصيل */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="btn-icon !h-9 !w-9" aria-label={t("رجوع", "Back")}>
          <ArrowRight size={16} />
        </button>
        {renaming ? (
          <input
            autoFocus
            value={nameDraft ?? ""}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            maxLength={80}
            className="input-glass !py-1.5 text-base font-bold"
          />
        ) : (
          <h3 className="font-display min-w-0 flex-1 truncate text-lg font-bold text-app">
            {list?.name ?? "…"}
          </h3>
        )}
        {!renaming && (
          <div className="ms-auto flex items-center gap-2">
            <span className="glass-chip !px-3 !py-1 !text-[11px] font-semibold">
              {items.length.toLocaleString("ar")} {t("عمل", "titles")}
            </span>
            <button
              onClick={() => {
                setNameDraft(list?.name ?? "");
                setRenaming(true);
              }}
              className="btn-icon !h-9 !w-9"
              aria-label={t("إعادة تسمية", "Rename")}
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="btn-icon !h-9 !w-9 !text-danger"
              aria-label={t("حذف القائمة", "Delete list")}
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>

      {itemsQ.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton aspect-[2/3] !rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={t("القائمة فارغة", "List is empty")}
          caption={t(
            "أضف أعمالاً من زر «أضف إلى قائمة» في صفحة أي مانجا.",
            "Add titles via the 'Add to list' button on any manga page.",
          )}
          ctaLabel={t("تصفّح الأعمال", "Browse titles")}
          ctaTo="/browse"
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5 xl:grid-cols-6">
          <AnimatePresence mode="popLayout">
            {items.map((item, i) => (
              <motion.div
                key={item.manga.id}
                layout
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.25 } }}
                transition={{ duration: 0.35, ease: EASE, delay: i * 0.04 }}
                className="group relative"
              >
                <Link
                  to={`/manga/${item.manga.slug}`}
                  className="glass block overflow-hidden !rounded-2xl p-2 transition-shadow hover:shadow-[0_16px_40px_rgba(224,86,31,0.18)]"
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-[14px]">
                    <img
                      src={item.manga.coverUrl || "/cover-01.png"}
                      alt={item.manga.title}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="px-1.5 pb-1.5 pt-2.5">
                    <h4 className="truncate text-sm font-bold text-app">{item.manga.title}</h4>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-app-3">
                      <span className="flex items-center gap-1 font-semibold text-warning">
                        <Star size={11} fill="currentColor" />
                        {(item.manga.rating ?? 0).toFixed(1)}
                      </span>
                      <span>
                        {item.manga.chapterCount.toLocaleString("ar")} {t("فصل", "ch.")}
                      </span>
                    </div>
                  </div>
                </Link>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => removeMut.mutate({ listId, mangaId: item.manga.id })}
                  disabled={removeMut.isPending}
                  aria-label={t("إزالة من القائمة", "Remove from list")}
                  className="glass-strong absolute -top-2 end-2 z-10 flex h-8 w-8 items-center justify-center rounded-full text-danger shadow-md transition-transform hover:scale-110"
                >
                  <X size={14} />
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* تأكيد الحذف */}
      <GlassModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("حذف القائمة؟", "Delete list?")}
      >
        <p className="text-sm text-app-2">
          {t(
            "ستُحذف هذه القائمة نهائياً — الأعمال نفسها تبقى في مكتبتك.",
            "This list will be permanently deleted — the titles stay in your library.",
          )}
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => {
              setConfirmDelete(false);
              deleteMut.mutate({ id: listId });
            }}
            disabled={deleteMut.isPending}
            className="btn-primary flex-1 !py-2.5 text-sm !shadow-none"
            style={{ background: "var(--danger)" }}
          >
            {t("نعم، احذفها", "Yes, delete it")}
          </button>
          <button onClick={() => setConfirmDelete(false)} className="btn-glass flex-1 !py-2.5 text-sm">
            {t("إلغاء", "Cancel")}
          </button>
        </div>
      </GlassModal>
    </div>
  );
}

/* ================= مودال إنشاء قائمة ================= */
export function CreateListModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (listId: number) => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMut = trpc.lists.createList.useMutation({
    onSuccess: (list) => {
      setName("");
      setError(null);
      onCreated(list.id);
    },
    onError: (e) => setError(e.message),
  });

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError(t("اسم القائمة مطلوب", "List name is required"));
    createMut.mutate({ name: trimmed });
  };

  return (
    <GlassModal open={open} onClose={onClose} title={t("قائمة جديدة", "New list")}>
      <label className="mb-1.5 block text-xs font-semibold text-app-2">
        {t("اسم القائمة", "List name")}
      </label>
      <input
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        maxLength={80}
        placeholder={t("مثال: أقرأها لاحقاً", "e.g. Read later")}
        className="input-glass w-full !py-2.5 text-sm"
      />
      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
      <button
        onClick={submit}
        disabled={createMut.isPending || !name.trim()}
        className="btn-primary mt-4 w-full justify-center !py-2.5 text-sm disabled:opacity-50"
      >
        <Check size={15} />
        {createMut.isPending ? t("جارٍ الإنشاء…", "Creating…") : t("إنشاء القائمة", "Create list")}
      </button>
    </GlassModal>
  );
}
