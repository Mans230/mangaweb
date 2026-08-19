import { useState } from "react";
import { Link } from "react-router";
import { Check, Layers, ListPlus, Plus } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import GlassModal from "@/components/library/GlassModal";
import { ToastViewport, useToast } from "@/components/library/toast";

interface AddToListModalProps {
  open: boolean;
  onClose: () => void;
  mangaId: number;
  mangaTitle: string;
}

/**
 * مودال «أضف إلى قائمة» — يعرض قوائم المستخدم مع حالة العضوية،
 * وإنشاء قائمة جديدة inline، والإضافة/الإزالة بنقرة.
 */
export default function AddToListModal({ open, onClose, mangaId, mangaTitle }: AddToListModalProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  // عضوية محلية متفائلة: listId → موجود؟
  const [membership, setMembership] = useState<Record<number, boolean>>({});

  const listsQ = trpc.lists.myLists.useQuery(undefined, {
    enabled: open,
    retry: false,
  });
  const lists = listsQ.data ?? [];
  // عضوية هذه المانجا في كل قائمة — تُجلب عناصر القوائم عند الفتح (القوائم قليلة عادة)
  const itemsQs = trpc.useQueries((t) =>
    lists.map((l) => t.lists.listItems({ listId: l.id }, { enabled: open, retry: false })),
  );
  const serverMembership: Record<number, boolean> = {};
  lists.forEach((l, i) => {
    const items = itemsQs[i]?.data?.items;
    if (items) serverMembership[l.id] = items.some((it) => it.manga.id === mangaId);
  });
  const isMemberOf = (listId: number) => membership[listId] ?? serverMembership[listId] ?? false;

  const addMut = trpc.lists.addToList.useMutation({
    onSuccess: (_d, vars) => {
      setMembership((p) => ({ ...p, [vars.listId]: true }));
      void utils.lists.myLists.invalidate();
      toast(t("أُضيفت إلى القائمة", "Added to list"));
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });
  const removeMut = trpc.lists.removeFromList.useMutation({
    onSuccess: (_d, vars) => {
      setMembership((p) => ({ ...p, [vars.listId]: false }));
      void utils.lists.myLists.invalidate();
      void utils.lists.listItems.invalidate();
      toast(t("أُزيلت من القائمة", "Removed from list"));
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });
  const createMut = trpc.lists.createList.useMutation({
    onSuccess: (list) => {
      setNewName("");
      setCreateError(null);
      void utils.lists.myLists.invalidate();
      // أضف المانجا مباشرة للقائمة الجديدة
      addMut.mutate({ listId: list.id, mangaId });
    },
    onError: (e) => setCreateError(e.message),
  });

  const toggle = (listId: number) => {
    const isMember = membership[listId] ?? false;
    if (isMember) removeMut.mutate({ listId, mangaId });
    else addMut.mutate({ listId, mangaId });
  };

  const submitCreate = () => {
    const name = newName.trim();
    if (!name) return setCreateError(t("اسم القائمة مطلوب", "List name is required"));
    createMut.mutate({ name });
  };

  return (
    <>
    {/* صفحة المانجا لا تركّب ToastViewport — نركّبها هنا لتظهر تنبيهات الإضافة */}
    <ToastViewport />
    <GlassModal open={open} onClose={onClose} title={t("أضف إلى قائمة", "Add to list")}>
      <p className="mb-4 line-clamp-1 text-xs text-app-3">{mangaTitle}</p>

      {listsQ.isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-14 !rounded-2xl" />
          ))}
        </div>
      ) : lists.length === 0 ? (
        <p className="mb-2 flex items-center gap-2 rounded-2xl bg-black/5 px-4 py-3 text-xs text-app-3 dark:bg-white/5">
          <Layers size={14} />
          {t("لا قوائم بعد — أنشئ أول قائمة بالأسفل.", "No lists yet — create your first one below.")}
        </p>
      ) : (
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pe-1">
          {lists.map((list) => {
            const isMember = isMemberOf(list.id);
            const pending =
              (addMut.isPending && addMut.variables?.listId === list.id) ||
              (removeMut.isPending && removeMut.variables?.listId === list.id);
            return (
              <button
                key={list.id}
                onClick={() => toggle(list.id)}
                disabled={pending}
                className={`glass flex items-center gap-3 !rounded-2xl p-2.5 text-start transition-colors ${
                  isMember ? "!border-primary/60" : "hover:border-[var(--border-glow)]"
                } ${pending ? "opacity-60" : ""}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/10 dark:bg-white/5">
                  {list.covers[0] ? (
                    <img src={list.covers[0]} alt="" aria-hidden loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <Layers size={16} className="text-app-3" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-app">{list.name}</span>
                  <span className="text-[11px] text-app-3">
                    {list.itemCount.toLocaleString("ar")} {t("عمل", "titles")}
                  </span>
                </span>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    isMember ? "gradient-primary border-transparent" : "border-app text-transparent"
                  }`}
                >
                  <Check size={13} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* إنشاء قائمة جديدة inline */}
      <div className="mt-4 border-t border-app pt-4">
        <label className="mb-1.5 block text-xs font-semibold text-app-2">
          {t("قائمة جديدة", "New list")}
        </label>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setCreateError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && submitCreate()}
            maxLength={80}
            placeholder={t("مثال: أقرأها لاحقاً", "e.g. Read later")}
            className="input-glass flex-1 !py-2.5 text-sm"
          />
          <button
            onClick={submitCreate}
            disabled={createMut.isPending || !newName.trim()}
            className="btn-primary shrink-0 !px-4 !py-2.5 text-sm disabled:opacity-50"
          >
            <Plus size={15} />
            {t("إنشاء", "Create")}
          </button>
        </div>
        {createError && <p className="mt-2 text-xs font-semibold text-danger">{createError}</p>}
      </div>

      <Link
        to="/library?tab=lists"
        onClick={onClose}
        className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary-soft"
      >
        <ListPlus size={13} />
        {t("إدارة كل القوائم من المكتبة", "Manage all lists in the library")}
      </Link>
    </GlassModal>
    </>
  );
}
