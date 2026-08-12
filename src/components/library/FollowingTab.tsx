import { useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { ArrowDownUp, BellOff, BookOpen, Sparkles } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import type { FollowItem } from "./data";
import { useToast } from "./toast";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface FollowingTabProps {
  following: FollowItem[];
  isLive: boolean;
  onChanged?: () => void;
}

type SortMode = "recent" | "alpha";

export default function FollowingTab({ following, isLive, onChanged }: FollowingTabProps) {
  const { t } = useLanguage();
  const [sort, setSort] = useState<SortMode>("recent");

  const sorted = [...following].sort((a, b) =>
    sort === "alpha" ? a.manga.title.localeCompare(b.manga.title, "ar") : 0,
  );

  if (following.length === 0) {
    return (
      <EmptyState
        title={t("لا تتابع أي عمل بعد", "Not following anything yet")}
        caption={t("تابع أعمالك المفضلة ليصلك تنبيه عند نزول فصل جديد.", "Follow titles to get notified when new chapters drop.")}
        ctaLabel={t("تصفّح الأعمال", "Browse titles")}
        ctaTo="/browse"
      />
    );
  }

  return (
    <div>
      {/* sort toggle */}
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setSort((s) => (s === "recent" ? "alpha" : "recent"))}
          className="glass-chip !py-1.5 text-xs font-semibold"
        >
          <ArrowDownUp size={13} />
          {sort === "recent" ? t("حسب آخر تحديث", "By last update") : t("أبجدي", "Alphabetical")}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {sorted.map((item, i) => (
          <FollowRow key={item.manga.id} item={item} index={i} isLive={isLive} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

function FollowRow({
  item,
  index,
  isLive,
  onChanged,
}: {
  item: FollowItem;
  index: number;
  isLive: boolean;
  onChanged?: () => void;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [gone, setGone] = useState(false);
  const utils = trpc.useUtils();

  // تقدّم القراءة الحقيقي لهذا العنوان (محمي — يتطلب دخول)
  const progressQ = trpc.library.getProgress.useQuery(
    { mangaId: item.manga.id },
    { enabled: isLive, retry: false, staleTime: 60_000 },
  );

  // TODO(api): عند غياب بيانات التقدم نشتق قيمة تقريبية ثابتة من المعرّف
  const derived = Math.max(1, Math.round(item.manga.chapters * (0.35 + ((item.manga.id * 13) % 50) / 100)));
  const lastRead = progressQ.data ? progressQ.data.readChapters : Math.min(derived, item.manga.chapters);
  const total = progressQ.data?.totalChapters || item.manga.chapters;
  const unread = Math.max(0, total - lastRead);
  const pct = total > 0 ? Math.min(100, (lastRead / total) * 100) : 0;

  const unfollow = trpc.library.toggleFollow.useMutation({
    onSettled: () => {
      void utils.library.getLibrary.invalidate();
      onChanged?.();
    },
  });

  if (gone) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.4, ease: EASE, delay: index * 0.05 }}
      className="glass flex items-center gap-4 !rounded-2xl p-3 md:p-4"
    >
      <Link to={`/manga/${item.manga.slug}`} className="shrink-0">
        <img
          src={item.manga.cover}
          alt={item.manga.title}
          loading="lazy"
          className="h-[108px] w-[72px] rounded-xl border border-app object-cover"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/manga/${item.manga.slug}`}
            className="truncate text-sm font-bold text-app transition-colors hover:text-primary md:text-base"
          >
            {item.manga.title}
          </Link>
          {unread > 0 && (
            <motion.span
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              className="flex items-center gap-1 rounded-full bg-accent-2 px-2.5 py-0.5 text-[10.5px] font-bold text-white shadow-sm"
            >
              <Sparkles size={11} />
              {t("فصل جديد!", "New chapter!")}
              {unread > 1 && <span>({unread.toLocaleString("ar")})</span>}
            </motion.span>
          )}
        </div>

        <div className="mt-1.5 text-[11.5px] text-app-3">
          {t("آخر فصل قرأته", "Last read")} {lastRead.toLocaleString("ar")} /{" "}
          {t("أحدث فصل", "Latest")} {total.toLocaleString("ar")} · {item.updatedAt}
        </div>

        {/* progress bar */}
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: `${pct}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: EASE }}
            className="gradient-primary h-full rounded-full"
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
        <Link
          to={`/manga/${item.manga.slug}/chapter/${Math.min(lastRead + 1, total)}`}
          className="btn-primary !px-4 !py-2 text-xs"
        >
          <BookOpen size={14} />
          {t("تابع القراءة", "Continue")}
        </Link>
        <button
          className="btn-icon !h-9 !w-9"
          aria-label={t("إلغاء المتابعة", "Unfollow")}
          onClick={() => {
            setGone(true);
            if (isLive) unfollow.mutate({ mangaId: item.manga.id });
            toast(t("أُلغيت المتابعة", "Unfollowed"));
          }}
        >
          <BellOff size={15} />
        </button>
      </div>
    </motion.div>
  );
}
