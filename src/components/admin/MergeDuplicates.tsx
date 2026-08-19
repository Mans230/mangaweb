import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GitMerge, Layers, Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import EmptyState from "@/components/EmptyState";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { proxyImg, timeAgo } from "@/lib/manga";
import { EASE } from "./adminUtils";
import type { DuplicateGroup, DuplicateItem, RouterOutputs } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

type ApiMangaItem = RouterOutputs["admin"]["listManga"]["items"][number];

const qualityStyles: Record<string, string> = {
  عالية: "!border-success/40 text-success",
  متوسطة: "!border-warning/40 text-warning",
  منخفضة: "!border-danger/40 text-danger",
};

/** تطبيع العنوان للكشف عن التكرار: توحيد الحروف العربية وإزالة الرموز */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function qualityOf(rating: number): DuplicateItem["quality"] {
  if (rating >= 4.5) return "عالية";
  if (rating >= 3.5) return "متوسطة";
  return "منخفضة";
}

/** كشف مجموعات التكرار من بيانات المانجا الحقيقية (عنوان أو عنوان بديل متطابق) */
function detectDuplicateGroups(items: ApiMangaItem[]): DuplicateGroup[] {
  const buckets = new Map<string, DuplicateItem[]>();
  for (const m of items) {
    const item: DuplicateItem = {
      id: Number(m.id),
      title: m.title,
      cover: proxyImg(m.coverUrl) || "/placeholder-cover.svg",
      source: m.source.name,
      chapters: m.chapterCount,
      updatedAt: timeAgo(m.updatedAt),
      quality: qualityOf(m.rating ?? 0),
      description: m.description ?? "",
    };
    const keys = new Set(
      [m.title, ...(m.altTitles ?? [])]
        .map(normalizeTitle)
        .filter((k) => k.length >= 3),
    );
    for (const key of keys) {
      const list = buckets.get(key) ?? [];
      if (!list.some((x) => x.id === item.id)) list.push(item);
      buckets.set(key, list);
    }
  }

  const groups: DuplicateGroup[] = [];
  const seen = new Set<string>();
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    const memberSig = list
      .map((x) => x.id)
      .sort((a, b) => a - b)
      .join("-");
    if (seen.has(memberSig)) continue;
    seen.add(memberSig);
    groups.push({ id: `g-${key}-${memberSig}`, title: list[0].title, items: list });
  }
  return groups;
}

export default function MergeDuplicates() {
  const { t } = useLanguage();
  const toast = useAdminToast();

  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [baseId, setBaseId] = useState<number | null>(null);
  const [fieldPicks, setFieldPicks] = useState<Record<string, number>>({});
  const [confirmGroup, setConfirmGroup] = useState<DuplicateGroup | null>(null);
  const [merging, setMerging] = useState(false);

  const query = trpc.admin.listManga.useQuery(
    { page: 1, limit: 100 },
    { retry: false },
  );
  const mergeMutation = trpc.admin.mergeDuplicates.useMutation();

  const groups = useMemo(() => {
    const detected = detectDuplicateGroups(query.data?.items ?? []);
    return detected.filter((g) => !ignoredIds.has(g.id));
  }, [query.data, ignoredIds]);

  const active = groups.find((g) => g.id === activeId) ?? groups[0] ?? null;
  const base = baseId ?? active?.items[0]?.id ?? null;

  const selectGroup = (id: string) => {
    setActiveId(id);
    setBaseId(null);
    setFieldPicks({});
  };

  const ignoreGroup = (id: string) => {
    setIgnoredIds((prev) => new Set([...prev, id]));
    if (activeId === id) setActiveId(null);
    toast(t("تم تجاهل المجموعة", "Group ignored"), "info");
  };

  const doMerge = () => {
    if (!confirmGroup || base === null) return;
    setMerging(true);
    const duplicates = confirmGroup.items.filter((it) => it.id !== base);

    // دمج كل نسخة مكررة في الأساسية عبر الـ API — المجموعة تُزال فقط عند نجاح الكل
    let pending = duplicates.length;
    let failed = false;
    const finishOne = (ok: boolean) => {
      if (!ok) failed = true;
      pending -= 1;
      if (pending > 0) return;
      setMerging(false);
      if (failed) {
        toast(t("فشل دمج بعض النسخ — حاول مجدداً", "Some copies failed to merge — try again"), "danger");
        void query.refetch();
        return;
      }
      setConfirmGroup(null);
      setActiveId(null);
      setBaseId(null);
      void query.refetch();
      toast(t("تم الدمج بنجاح", "Merged successfully"));
    };
    duplicates.forEach((d) => {
      mergeMutation.mutate(
        { primaryId: base, duplicateId: d.id },
        { onSuccess: () => finishOne(true), onError: () => finishOne(false) },
      );
    });
  };

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="w-full shrink-0 space-y-2.5 lg:w-80">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
        <div className="skeleton h-64 flex-1" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="glass">
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      {/* قائمة المجموعات */}
      <div className="w-full shrink-0 lg:w-80">
        <h3 className="font-display mb-3 text-sm font-bold text-app">
          {t("مجموعات مكررة مكتشفة", "Detected duplicate groups")}
          <span className="glass-chip ms-2 !px-2 !py-0.5 !text-[11px] tabular-nums">{groups.length}</span>
        </h3>
        {groups.length === 0 ? (
          <div className="glass">
            <EmptyState title={t("لا مكررات", "No duplicates")} caption={t("كل السلاسل نظيفة من التكرار.", "All series are duplicate-free.")} />
          </div>
        ) : (
          <ul className="space-y-2.5">
            {groups.map((g, i) => (
              <motion.li
                key={g.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, ease: EASE, delay: i * 0.06 }}
              >
                <button
                  onClick={() => selectGroup(g.id)}
                  className={`glass w-full !rounded-2xl p-3.5 text-start transition-all ${
                    active?.id === g.id ? "ring-2 ring-[var(--border-glow)]" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img src={g.items[0].cover} alt="" className="h-14 w-10 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-app">{g.title}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-app-3">
                        <Layers size={11} />
                        {t(`${g.items.length} نسخ`, `${g.items.length} copies`)}
                      </div>
                    </div>
                    <div className="flex shrink-0 -space-x-1.5 space-x-reverse">
                      {g.items.map((it) => (
                        <span
                          key={it.id}
                          title={it.source}
                          className="h-2.5 w-2.5 rounded-full border border-[var(--surface-strong)]"
                          style={{ background: "var(--primary-soft)" }}
                        />
                      ))}
                    </div>
                  </div>
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </div>

      {/* لوحة المقارنة */}
      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait">
          {active ? (
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                {active.items.map((it, i) => {
                  const isBase = base === it.id;
                  return (
                    <motion.div
                      key={it.id}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: EASE, delay: i * 0.08 }}
                      className={`glass relative flex flex-col gap-3 !rounded-2xl p-4 transition-all ${
                        isBase ? "ring-2 ring-[var(--primary)] ring-offset-0" : ""
                      }`}
                    >
                      {isBase && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="gradient-primary absolute -top-2.5 start-4 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                        >
                          <Star size={10} /> {t("الأساسية", "Primary")}
                        </motion.span>
                      )}
                      <div className="flex items-start gap-3">
                        <img src={it.cover} alt="" className="h-24 w-16 rounded-xl border border-app object-cover" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-app">{it.title}</div>
                          <span className="glass-chip mt-1.5 !px-2.5 !py-0.5 !text-[11px]" dir="ltr">{it.source}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
                        <div className="rounded-xl bg-[var(--surface)] p-1.5">
                          <div className="font-bold tabular-nums text-app">{it.chapters}</div>
                          <div className="text-app-3">{t("فصل", "ch")}</div>
                        </div>
                        <div className="rounded-xl bg-[var(--surface)] p-1.5">
                          <div className="font-bold text-app">{it.updatedAt}</div>
                          <div className="text-app-3">{t("تحديث", "updated")}</div>
                        </div>
                        <div className="rounded-xl bg-[var(--surface)] p-1.5">
                          <span className={`glass-chip !border !px-2 !py-0 !text-[10px] font-bold ${qualityStyles[it.quality]}`}>
                            {it.quality}
                          </span>
                          <div className="mt-1 text-app-3">{t("الجودة", "quality")}</div>
                        </div>
                      </div>
                      <label className="mt-auto flex cursor-pointer items-center gap-2.5 rounded-xl border border-app p-2.5 text-sm font-semibold text-app transition-colors hover:border-[var(--border-glow)]">
                        <input
                          type="radio"
                          name={`base-${active.id}`}
                          checked={isBase}
                          onChange={() => setBaseId(it.id)}
                          className="h-4 w-4 accent-[var(--primary)]"
                        />
                        {t("اختر الأساسية", "Set as primary")}
                      </label>
                    </motion.div>
                  );
                })}
              </div>

              {/* منتقي الحقول */}
              <div className="glass mt-4 !rounded-2xl p-4">
                <h4 className="font-display mb-3 text-sm font-bold text-app">
                  {t("مصدر كل حقل بعد الدمج", "Field sources after merge")}
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    { key: "cover", label: t("الغلاف من", "Cover from") },
                    { key: "description", label: t("الوصف من", "Description from") },
                  ].map((field) => (
                    <div key={field.key} className="rounded-xl border border-app p-3">
                      <div className="mb-2 text-xs font-semibold text-app-2">{field.label}</div>
                      <div className="space-y-1.5">
                        {active.items.map((it) => (
                          <label key={it.id} className="flex cursor-pointer items-center gap-2 text-sm text-app-2">
                            <input
                              type="radio"
                              name={`${field.key}-${active.id}`}
                              checked={(fieldPicks[field.key] ?? base) === it.id}
                              onChange={() => setFieldPicks((prev) => ({ ...prev, [field.key]: it.id }))}
                              className="h-3.5 w-3.5 accent-[var(--primary)]"
                            />
                            <span dir="ltr">{it.source}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* شريط الإجراءات */}
              <div className="glass-strong sticky bottom-20 z-20 mt-4 flex flex-wrap gap-3 rounded-2xl border p-3.5 lg:bottom-4">
                <button onClick={() => setConfirmGroup(active)} className="btn-primary flex-1 !py-2.5 text-sm">
                  <GitMerge size={16} />
                  {t("دمج", "Merge")} ({active.items.length} {t("نسخ", "copies")})
                </button>
                <button onClick={() => ignoreGroup(active.id)} className="btn-glass !px-5 !py-2.5 text-sm">
                  {t("تجاهل المجموعة", "Ignore group")}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass">
              <EmptyState title={t("اختر مجموعة", "Pick a group")} caption={t("اختر مجموعة من القائمة لمقارنة النسخ جنباً إلى جنب.", "Select a group to compare copies side by side.")} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* تأكيد الدمج */}
      <Dialog open={!!confirmGroup} onOpenChange={(open) => !open && setConfirmGroup(null)}>
        <DialogContent className="glass-strong border-app">
          <DialogHeader>
            <DialogTitle className="font-display text-app">{t("تأكيد الدمج", "Confirm merge")}</DialogTitle>
            <DialogDescription className="text-app-2">
              {confirmGroup && (
                <>
                  {t("سيتم دمج", "Merging")} {confirmGroup.items.length} {t("سلاسل في «", "series into «")}
                  {confirmGroup.items.find((it) => it.id === base)?.title}»
                  {" — "}
                  {t("إجمالي الفصول:", "total chapters:")}{" "}
                  <span className="tabular-nums" dir="ltr">
                    {confirmGroup.items.map((it) => it.chapters).join("+")}
                  </span>
                  . {t("ستنتقل الفصول والمفضلات والتقييمات للنسخة الأساسية.", "Chapters, favorites and ratings will move to the primary copy.")}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button onClick={() => setConfirmGroup(null)} className="btn-glass !px-5 !py-2.5 text-sm">
              {t("إلغاء", "Cancel")}
            </button>
            <button onClick={doMerge} disabled={merging} className="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-60">
              {merging ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <GitMerge size={15} />
              )}
              {t("تنفيذ الدمج", "Execute merge")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
