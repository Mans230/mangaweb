import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Search, Trash2 } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { timeAgo } from "@/lib/manga";
import { EASE } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

const PAGE_SIZE = 20;

interface AdminCommentRow {
  id: number;
  content: string;
  author: string;
  mangaTitle?: string | null;
  createdAt?: string | Date | null;
}

/** تطبيع دفاعي لصف التعليق — شكل الحقول قد يختلف قليلاً عن العقد */
function normalizeComment(raw: unknown): AdminCommentRow | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const id = Number(c.id);
  if (!Number.isFinite(id)) return null;
  const user = c.user as { name?: string | null } | undefined;
  const manga = c.manga as { title?: string | null } | undefined;
  return {
    id,
    content: String(c.content ?? ""),
    author: user?.name ?? "مستخدم",
    mangaTitle: manga?.title ?? (typeof c.mangaTitle === "string" ? c.mangaTitle : null),
    createdAt: (c.createdAt as string | Date | undefined) ?? null,
  };
}

export default function CommentsManager() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const [mangaIdInput, setMangaIdInput] = useState("");
  const [offset, setOffset] = useState(0);

  const mangaId = useMemo(() => {
    const n = Number(mangaIdInput.trim());
    return Number.isInteger(n) && n > 0 ? n : undefined;
  }, [mangaIdInput]);

  const query = trpc.admin.listComments.useQuery(
    { mangaId, limit: PAGE_SIZE, offset },
    { retry: false, placeholderData: (prev) => prev },
  );

  const deleteMutation = trpc.admin.deleteComment.useMutation({
    onSuccess: () => {
      query.refetch();
      toast(t("تم حذف التعليق", "Comment deleted"), "danger");
    },
    onError: () => toast(t("تعذّر حذف التعليق", "Couldn't delete comment"), "danger"),
  });

  // الاستجابة قد تكون { items, total } أو مصفوفة مباشرة
  const { comments, total } = useMemo(() => {
    const d: unknown = query.data;
    const rawItems = Array.isArray(d)
      ? d
      : Array.isArray((d as { items?: unknown } | undefined)?.items)
        ? (d as { items: unknown[] }).items
        : [];
    const total =
      !Array.isArray(d) && typeof (d as { total?: unknown } | undefined)?.total === "number"
        ? (d as { total: number }).total
        : rawItems.length;
    return {
      comments: rawItems.map(normalizeComment).filter((c): c is AdminCommentRow => !!c),
      total,
    };
  }, [query.data]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4">
      {/* شريط الأدوات */}
      <div className="glass flex flex-wrap items-center gap-2.5 !rounded-2xl p-3">
        <div className="relative min-w-48 flex-1">
          <Search size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-app-3" />
          <input
            dir="ltr"
            inputMode="numeric"
            value={mangaIdInput}
            onChange={(e) => {
              setMangaIdInput(e.target.value);
              setOffset(0);
            }}
            placeholder={t("فلترة برقم المانجا (اختياري)…", "Filter by manga ID (optional)…")}
            className="input-glass w-full !py-2.5 !ps-10 text-left text-sm"
          />
        </div>
        <span className="glass-chip !px-3 !py-1.5 text-xs text-app-2">
          <MessageSquare size={13} />
          {total} {t("تعليق", "comments")}
        </span>
      </div>

      {/* القائمة */}
      {query.isLoading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="glass">
          <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
        </div>
      ) : comments.length === 0 ? (
        <div className="glass">
          <EmptyState title={t("لا تعليقات", "No comments")} caption={t("لا نتائج مطابقة.", "No matches.")} />
        </div>
      ) : (
        <div className="space-y-2.5">
          {comments.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 15) * 0.02 }}
              className="glass flex items-start gap-3 !rounded-2xl p-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-app-3">
                  <span className="font-bold text-app">{c.author}</span>
                  {c.mangaTitle && <span className="glass-chip !px-2 !py-0.5 !text-[10px]">{c.mangaTitle}</span>}
                  {c.createdAt && <span>{timeAgo(c.createdAt)}</span>}
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-app-2">{c.content}</p>
              </div>
              <button
                onClick={() => deleteMutation.mutate({ id: c.id })}
                disabled={deleteMutation.isPending}
                className="btn-icon !h-8 !w-8 shrink-0 hover:!border-danger/50 hover:!text-danger disabled:opacity-50"
                aria-label={t("حذف التعليق", "Delete comment")}
              >
                <Trash2 size={14} />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* ترقيم */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 7).map((p) => (
            <button
              key={p}
              onClick={() => setOffset((p - 1) * PAGE_SIZE)}
              className={`glass-chip !px-3.5 !py-1.5 tabular-nums ${
                page === p ? "!border-transparent !bg-gradient-to-l !from-[#7C3AED] !to-[#E879F9] !text-white" : ""
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
