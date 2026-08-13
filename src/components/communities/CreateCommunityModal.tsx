/**
 * مودال طلب إنشاء مجتمع جديد — يُرسل communities.requestCreate ويُعرض ضمن «طلباتي».
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Lock, Globe, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { useToast } from "@/components/library/toast";
import { ColorPalettePicker, CommunityImageField } from "./fields";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface CreateCommunityModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateCommunityModal({ open, onClose }: CreateCommunityModalProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [color, setColor] = useState("#7C3AED");
  const [isPrivate, setIsPrivate] = useState(false);
  const [mangaSlug, setMangaSlug] = useState("");
  const [debouncedSlug, setDebouncedSlug] = useState("");

  // مهلة قصيرة قبل الاستعلام عن المانجا بالـ slug
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSlug(mangaSlug.trim()), 450);
    return () => window.clearTimeout(id);
  }, [mangaSlug]);

  const mangaQ = trpc.manga.getBySlug.useQuery(
    { slug: debouncedSlug },
    { enabled: debouncedSlug.length > 0, retry: false },
  );
  const linkedManga = debouncedSlug ? (mangaQ.data ?? null) : null;

  const reset = () => {
    setName("");
    setDescription("");
    setImageUrl("");
    setColor("#7C3AED");
    setIsPrivate(false);
    setMangaSlug("");
    setDebouncedSlug("");
  };

  const createMut = trpc.communities.requestCreate.useMutation({
    onSuccess: () => {
      toast(t("أُرسل طلبك — ستصلك الموافقة من الإدارة قريباً", "Request sent — admins will review it soon"));
      void utils.communities.myCreateRequests.invalidate();
      reset();
      onClose();
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const slugInvalid = debouncedSlug.length > 0 && mangaQ.isSuccess && !mangaQ.data;
  const canSubmit =
    name.trim().length >= 2 && !createMut.isPending && !slugInvalid;

  const submit = () => {
    if (!canSubmit) return;
    createMut.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      color,
      isPrivate,
      mangaId: linkedManga?.id ?? undefined,
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[84] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.98 }}
            transition={{ duration: 0.3, ease: EASE }}
            role="dialog"
            aria-modal="true"
            aria-label={t("أنشئ مجتمعك", "Create your community")}
            className="glass-strong fixed inset-x-0 bottom-0 z-[85] max-h-[88vh] overflow-y-auto rounded-t-3xl p-5 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(94vw,480px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-app">
                {t("أنشئ مجتمعك", "Create your community")}
              </h3>
              <button className="btn-icon !h-8 !w-8" onClick={onClose} aria-label={t("إغلاق", "Close")}>
                <X size={15} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <span className="text-xs font-semibold text-app-3">
                  {t("اسم المجتمع", "Community name")}
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  placeholder={t("مثال: عشاق المانهوا", "e.g. Manhwa lovers")}
                  className="input-glass mt-2 w-full text-sm"
                />
              </div>

              <div>
                <span className="text-xs font-semibold text-app-3">
                  {t("الوصف (اختياري)", "Description (optional)")}
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder={t("عن ماذا يتحدث مجتمعك؟", "What is your community about?")}
                  className="input-glass mt-2 w-full resize-none text-sm"
                />
              </div>

              <CommunityImageField
                value={imageUrl}
                onChange={setImageUrl}
                onError={(m) => toast(m, { kind: "info" })}
              />

              <ColorPalettePicker value={color} onChange={setColor} />

              {/* الخصوصية */}
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("الخصوصية", "Privacy")}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!isPrivate}
                  onClick={() => setIsPrivate(false)}
                  className={`glass-chip justify-center !rounded-2xl !py-2.5 text-xs font-bold ${
                    !isPrivate ? "!border-[var(--border-glow)] text-primary" : ""
                  }`}
                >
                  <Globe size={14} />
                  {t("عام — يظهر في الاكتشاف", "Public — listed in discovery")}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isPrivate}
                  onClick={() => setIsPrivate(true)}
                  className={`glass-chip justify-center !rounded-2xl !py-2.5 text-xs font-bold ${
                    isPrivate ? "!border-[var(--border-glow)] text-primary" : ""
                  }`}
                >
                  <Lock size={14} />
                  {t("خاص — بالدعوات فقط", "Private — invite only")}
                </button>
              </div>

              {/* ربط بمانجا */}
              <div>
                <span className="text-xs font-semibold text-app-3">
                  {t("ربط بمانجا بالـ slug (اختياري)", "Link a manga by slug (optional)")}
                </span>
                <input
                  value={mangaSlug}
                  onChange={(e) => setMangaSlug(e.target.value)}
                  dir="ltr"
                  placeholder="solo-leveling"
                  className="input-glass mt-2 w-full text-sm"
                />
                {debouncedSlug && mangaQ.isLoading && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-app-3">
                    <Loader2 size={12} className="animate-spin" />
                    {t("جارٍ البحث عن العمل…", "Looking up the title…")}
                  </p>
                )}
                {linkedManga && (
                  <p className="mt-1.5 text-[11px] font-semibold text-success">
                    {t("سيتم الربط بـ:", "Will link to:")} {linkedManga.title}
                  </p>
                )}
                {slugInvalid && (
                  <p className="mt-1.5 text-[11px] font-semibold text-danger">
                    {t("لا يوجد عمل بهذا الـ slug", "No title with this slug")}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="btn-primary w-full !py-3 text-sm disabled:opacity-50"
              >
                {createMut.isPending ? t("جارٍ الإرسال…", "Sending…") : t("إرسال طلب الإنشاء", "Submit create request")}
              </button>
              <p className="text-center text-[11px] leading-5 text-app-3">
                {t(
                  "يراجع فريق الإدارة الطلب قبل إنشاء المجتمع — بحد أقصى ٣ مجتمعات مملوكة.",
                  "Admins review the request first — up to 3 owned communities.",
                )}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
