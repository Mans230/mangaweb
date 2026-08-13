/**
 * درج إعدادات المجتمع (للمالك/المشرفين): الاسم/الوصف/الصورة/اللون/الخصوصية/
 * الوضع البطيء/ربط مانجا + توليد رابط دعوة ونسخه.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Globe, Link2, Loader2, Lock, RefreshCw, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { useToast } from "@/components/library/toast";
import { ColorPalettePicker, CommunityImageField } from "./fields";
import type { CommunityDetails } from "./shared";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function SettingsDrawer({
  open,
  onClose,
  community,
}: {
  open: boolean;
  onClose: () => void;
  community: CommunityDetails;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description ?? "");
  const [imageUrl, setImageUrl] = useState(community.imageUrl ?? "");
  const [color, setColor] = useState(community.color ?? "#7C3AED");
  const [isPrivate, setIsPrivate] = useState(community.isPrivate);
  const [slowMode, setSlowMode] = useState(String(community.slowModeSeconds));
  const [mangaSlug, setMangaSlug] = useState("");
  const [debouncedSlug, setDebouncedSlug] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  // مزامنة الحقول عند فتح الدرج لمجتمع محدّث
  useEffect(() => {
    if (open) {
      setName(community.name);
      setDescription(community.description ?? "");
      setImageUrl(community.imageUrl ?? "");
      setColor(community.color ?? "#7C3AED");
      setIsPrivate(community.isPrivate);
      setSlowMode(String(community.slowModeSeconds));
      setMangaSlug("");
      setDebouncedSlug("");
      setInviteLink("");
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, community.id]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSlug(mangaSlug.trim()), 450);
    return () => window.clearTimeout(id);
  }, [mangaSlug]);

  const mangaQ = trpc.manga.getBySlug.useQuery(
    { slug: debouncedSlug },
    { enabled: debouncedSlug.length > 0, retry: false },
  );
  const linkedManga = debouncedSlug ? (mangaQ.data ?? null) : null;
  const slugInvalid = debouncedSlug.length > 0 && mangaQ.isSuccess && !mangaQ.data;

  const updateMut = trpc.communities.updateSettings.useMutation({
    onSuccess: () => {
      toast(t("تم حفظ الإعدادات", "Settings saved"));
      void utils.communities.getBySlug.invalidate({ slug: community.slug });
      onClose();
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const inviteMut = trpc.communities.regenerateInvite.useMutation({
    onSuccess: ({ code }) => {
      setInviteLink(`${window.location.origin}/c/${community.slug}?invite=${code}`);
      toast(t("تم توليد رابط دعوة جديد", "New invite link generated"));
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const save = () => {
    const slow = Number.parseInt(slowMode, 10);
    const slowModeSeconds = Number.isFinite(slow) && slow >= 0 ? Math.min(slow, 3600) : 0;
    let mangaId: number | null | undefined;
    if (debouncedSlug && linkedManga) mangaId = linkedManga.id;
    else if (!mangaSlug.trim()) mangaId = community.mangaId ? null : undefined;
    else mangaId = undefined; // slug مكتوب لكن غير محلول بعد — لا نغيّر الربط
    updateMut.mutate({
      communityId: community.id,
      name: name.trim(),
      description: description.trim() || null,
      imageUrl: imageUrl.trim() || null,
      color,
      isPrivate,
      slowModeSeconds,
      mangaId,
    });
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast(t("تعذّر النسخ — انسخ الرابط يدوياً", "Copy failed — copy the link manually"), { kind: "info" });
    }
  };

  const canSave = name.trim().length >= 2 && !slugInvalid && !updateMut.isPending;

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
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.32, ease: EASE }}
            className="glass-strong fixed inset-x-0 bottom-0 z-[85] flex max-h-[88vh] flex-col rounded-t-3xl p-5 md:inset-x-auto md:inset-y-0 md:end-0 md:max-h-none md:w-[420px] md:rounded-none md:rounded-s-3xl"
            role="dialog"
            aria-modal="true"
            aria-label={t("إعدادات المجتمع", "Community settings")}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-app">{t("إعدادات المجتمع", "Community settings")}</h3>
              <button className="btn-icon !h-8 !w-8" onClick={onClose} aria-label={t("إغلاق", "Close")}>
                <X size={15} />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pe-1">
              <div>
                <span className="text-xs font-semibold text-app-3">{t("الاسم", "Name")}</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  className="input-glass mt-2 w-full text-sm"
                />
              </div>

              <div>
                <span className="text-xs font-semibold text-app-3">{t("الوصف", "Description")}</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  className="input-glass mt-2 w-full resize-none text-sm"
                />
              </div>

              <CommunityImageField
                value={imageUrl}
                onChange={setImageUrl}
                onError={(m) => toast(m, { kind: "info" })}
              />

              <ColorPalettePicker value={color} onChange={setColor} />

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
                  {t("عام", "Public")}
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
                  {t("خاص", "Private")}
                </button>
              </div>

              <div>
                <span className="text-xs font-semibold text-app-3">
                  {t("الوضع البطيء (ثوانٍ بين الرسائل، 0 = معطّل)", "Slow mode (seconds between messages, 0 = off)")}
                </span>
                <input
                  value={slowMode}
                  onChange={(e) => setSlowMode(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={4}
                  className="input-glass mt-2 w-full text-sm"
                />
              </div>

              <div>
                <span className="text-xs font-semibold text-app-3">
                  {t("ربط بمانجا بالـ slug (اتركه فارغاً لإلغاء الربط)", "Link manga by slug (empty = unlink)")}
                </span>
                <input
                  value={mangaSlug}
                  onChange={(e) => setMangaSlug(e.target.value)}
                  dir="ltr"
                  placeholder="solo-leveling"
                  className="input-glass mt-2 w-full text-sm"
                />
                {community.mangaId && !mangaSlug.trim() && (
                  <p className="mt-1.5 text-[11px] text-app-3">
                    {t("مرتبط حالياً بعمل — اكتب slug جديداً للتغيير.", "Currently linked — type a new slug to change.")}
                  </p>
                )}
                {debouncedSlug && mangaQ.isLoading && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-app-3">
                    <Loader2 size={12} className="animate-spin" />
                    {t("جارٍ البحث…", "Looking up…")}
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

              {/* رابط الدعوة */}
              <div className="glass flex flex-col gap-2 !rounded-2xl p-3">
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-app-2">
                  <Link2 size={12} />
                  {t("رابط الدعوة", "Invite link")}
                </span>
                {inviteLink ? (
                  <div className="flex items-center gap-2">
                    <input readOnly value={inviteLink} dir="ltr" className="input-glass flex-1 !rounded-xl !py-2 text-[11px]" />
                    <button onClick={() => void copyInvite()} className="btn-glass shrink-0 !px-3 !py-2 text-[11px]">
                      {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                      {copied ? t("نُسخ", "Copied") : t("نسخ", "Copy")}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => inviteMut.mutate({ communityId: community.id })}
                    disabled={inviteMut.isPending}
                    className="btn-glass !py-2.5 text-xs disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={inviteMut.isPending ? "animate-spin" : ""} />
                    {t("توليد رابط دعوة جديد", "Generate new invite link")}
                  </button>
                )}
                <p className="text-[10.5px] leading-4 text-app-3">
                  {t("توليد رابط جديد يُبطل الروابط السابقة.", "Generating a new link invalidates previous ones.")}
                </p>
              </div>

              <button onClick={save} disabled={!canSave} className="btn-primary w-full !py-3 text-sm disabled:opacity-50">
                {updateMut.isPending ? t("جارٍ الحفظ…", "Saving…") : t("حفظ الإعدادات", "Save settings")}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
