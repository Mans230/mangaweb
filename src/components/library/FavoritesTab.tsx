import { useEffect, useState } from "react";
import { AnimatePresence, Reorder, motion, useDragControls } from "framer-motion";
import { GripVertical, Heart } from "lucide-react";
import MangaCard from "@/components/MangaCard";
import EmptyState from "@/components/EmptyState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import type { MangaCardData, MangaStatus, MangaType } from "@/lib/manga";
import type { LibManga } from "./data";
import { useToast } from "./toast";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/** تحويل LibManga إلى شكل MangaCardData الذي تتوقعه MangaCard (بيانات حقيقية من الـ API). */
function toCardManga(lib: LibManga): MangaCardData {
  return {
    id: lib.id,
    slug: lib.slug,
    title: lib.title,
    cover: lib.cover,
    type: (lib.type as MangaType) || "مانهوا",
    status: (lib.status as MangaStatus) || "مستمر",
    rating: lib.rating,
    ratingCount: lib.ratingCount,
    chapters: lib.chapters,
    views: lib.views,
    genres: lib.genres,
    synopsis: lib.synopsis,
    source: lib.source,
    isAdult: lib.isAdult,
    updatedAt: "",
  };
}

interface FavoritesTabProps {
  favorites: LibManga[];
  isLive: boolean; // البيانات من الـ API (تفعّل الـ mutations)
  onChanged?: () => void;
}

export default function FavoritesTab({ favorites, isLive, onChanged }: FavoritesTabProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [items, setItems] = useState<LibManga[]>(favorites);
  const [removed, setRemoved] = useState<LibManga[]>([]);
  const utils = trpc.useUtils();

  useEffect(() => {
    setItems(favorites);
    setRemoved([]);
  }, [favorites]);

  const toggleFav = trpc.library.toggleFavorite.useMutation({
    onSettled: () => {
      void utils.library.getLibrary.invalidate();
      onChanged?.();
    },
  });

  const remove = (m: LibManga) => {
    setItems((prev) => prev.filter((x) => x.id !== m.id));
    setRemoved((prev) => [...prev, m]);
    if (isLive) toggleFav.mutate({ mangaId: m.id });
    toast(t("أُزيلت من المفضلة", "Removed from favorites"), {
      action: {
        label: t("تراجع", "Undo"),
        onClick: () => {
          setRemoved((prev) => prev.filter((x) => x.id !== m.id));
          setItems((prev) => [...prev, m]);
          if (isLive) toggleFav.mutate({ mangaId: m.id });
        },
      },
    });
  };

  const visible = items.filter((m) => !removed.some((r) => r.id === m.id));

  if (visible.length === 0) {
    return (
      <EmptyState
        title={t("لا مفضلات بعد", "No favorites yet")}
        caption={t("أضف أعمالك المحبوبة بالضغط على القلب في صفحة المانجا.", "Add titles you love using the heart on any manga page.")}
        ctaLabel={t("اكتشف أعمالاً جديدة", "Discover new titles")}
        ctaTo="/browse"
      />
    );
  }

  return (
    <Reorder.Group
      axis="y"
      values={visible.map((m) => m.id)}
      onReorder={(ids) => {
        const byId = new Map(visible.map((m) => [m.id, m]));
        // TODO(api): حفظ الترتيب المخصص على الخادم عند توفر endpoint لذلك
        setItems(ids.map((id) => byId.get(id)!).filter(Boolean));
      }}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-5 xl:grid-cols-6"
      as="div"
    >
      <AnimatePresence mode="popLayout">
        {visible.map((m, i) => (
          <FavCard key={m.id} manga={m} index={i} onRemove={() => remove(m)} />
        ))}
      </AnimatePresence>
    </Reorder.Group>
  );
}

function FavCard({
  manga: m,
  index: i,
  onRemove,
}: {
  manga: LibManga;
  index: number;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={m.id}
      as="div"
      initial={{ opacity: 0, scale: 0.95, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.3 } }}
      transition={{ duration: 0.4, ease: EASE, delay: i * 0.06 }}
      className="group/fav relative"
      dragListener={false}
      dragControls={controls}
    >
      <MangaCard manga={toCardManga(m)} />
      {/* remove heart */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={onRemove}
        aria-label={t("إزالة من المفضلة", "Remove from favorites")}
        className="glass-strong absolute -top-2 end-2 z-10 flex h-8 w-8 items-center justify-center rounded-full text-danger shadow-md transition-transform hover:scale-110"
      >
        <Heart size={15} fill="currentColor" />
      </motion.button>
      {/* drag handle */}
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        aria-label={t("اسحب لإعادة الترتيب", "Drag to reorder")}
        className="glass-strong absolute -top-2 start-2 z-10 flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-full text-app-3 opacity-0 shadow-md transition-opacity focus:opacity-100 group-hover/fav:opacity-100"
      >
        <GripVertical size={14} />
      </button>
    </Reorder.Item>
  );
}
