/**
 * مودال نشر ريل — رفع فيديو من الجهاز (catbox عبر upload.uploadVideo) مع
 * تقدّم، كابشن ≤300، ربط اختياري بمانهوا (بحث بسيط)، وتنبيه مراجعة الإدارة.
 * الرفع للموثّقين فقط (emailVerifiedAt | telegramId | googleId).
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, Film, Loader2, ShieldAlert, Upload, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/components/LanguageProvider";
import { useToast } from "@/components/library/toast";
import { useDirectUpload, VIDEO_ACCEPT } from "@/lib/upload";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const MAX_CAPTION = 300;

interface UploadReelModalProps {
  open: boolean;
  onClose: () => void;
}

export default function UploadReelModal({ open, onClose }: UploadReelModalProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [mangaQuery, setMangaQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [pickedManga, setPickedManga] = useState<{ id: number; title: string } | null>(null);

  // رفع مباشر multipart إلى /api/upload — تقدّم حقيقي ويعمل مع الملفات الكبيرة
  const { upload, uploading, progress, error: uploadError } = useDirectUpload("video");

  const verified = Boolean(
    user && (user.emailVerifiedAt || user.telegramId || (user as { googleId?: string | null }).googleId),
  );

  // معاينة محلية للفيديو المختار
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(mangaQuery.trim()), 400);
    return () => window.clearTimeout(id);
  }, [mangaQuery]);

  const mangaQ = trpc.manga.list.useQuery(
    { search: debouncedQuery, limit: 5, page: 1 },
    { enabled: debouncedQuery.length > 1 && !pickedManga, retry: false },
  );
  const mangaResults = mangaQ.data?.items ?? [];

  const reset = () => {
    setFile(null);
    setCaption("");
    setMangaQuery("");
    setDebouncedQuery("");
    setPickedManga(null);
  };

  const submitMut = trpc.reels.submit.useMutation({
    onSuccess: () => {
      toast(t("أُرسل الريل — سيُراجع من الإدارة قبل النشر", "Reel submitted — admins will review it before publishing"));
      void utils.reels.feed.invalidate();
      reset();
      onClose();
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const busy = uploading || submitMut.isPending;

  const submit = async () => {
    if (!file || busy) return;
    const url = await upload(file);
    if (!url) return;
    submitMut.mutate({
      videoUrl: url,
      caption: caption.trim() || undefined,
      mangaId: pickedManga?.id,
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
            className="fixed inset-0 z-[86] bg-black/55 backdrop-blur-sm"
            onClick={busy ? undefined : onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.98 }}
            transition={{ duration: 0.3, ease: EASE }}
            role="dialog"
            aria-modal="true"
            aria-label={t("انشر ريل", "Post a reel")}
            className="glass-strong fixed inset-x-0 bottom-0 z-[87] max-h-[88dvh] overflow-y-auto !rounded-t-3xl p-5 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(94vw,460px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:!rounded-3xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-app">
                {t("انشر ريل", "Post a reel")}
              </h3>
              <button className="btn-icon !h-8 !w-8" onClick={onClose} disabled={busy} aria-label={t("إغلاق", "Close")}>
                <X size={15} />
              </button>
            </div>

            {!verified ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/15 text-warning">
                  <ShieldAlert size={24} />
                </span>
                <p className="text-sm font-bold text-app">
                  {t("النشر للحسابات الموثّقة فقط", "Posting is for verified accounts only")}
                </p>
                <p className="max-w-xs text-xs leading-5 text-app-3">
                  {t(
                    "وثّق حسابك بربط تليجرام أو توثيق بريدك من صفحة «حسابي» ثم عُد لنشر ريلزك.",
                    "Verify your account by linking Telegram or verifying your email from “My Account”, then come back to post.",
                  )}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* اختيار الفيديو */}
                {preview ? (
                  <div className="relative overflow-hidden rounded-2xl border border-app bg-black">
                    <video src={preview} className="mx-auto max-h-56 w-full object-contain" muted playsInline controls />
                    <button
                      onClick={() => setFile(null)}
                      disabled={busy}
                      className="btn-icon absolute end-2 top-2 !h-8 !w-8 !bg-black/50"
                      aria-label={t("إزالة الفيديو", "Remove video")}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label className="glass flex cursor-pointer flex-col items-center gap-2 !rounded-2xl border-dashed px-4 py-8 text-center transition-colors hover:border-primary/50">
                    <Film size={26} className="text-primary" />
                    <span className="text-sm font-bold text-app">
                      {t("اختر فيديو من جهازك", "Pick a video from your device")}
                    </span>
                    <span className="text-[11px] text-app-3">mp4 / webm / mov — ≤ 200MB</span>
                    <input
                      type="file"
                      accept={VIDEO_ACCEPT}
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}

                {/* تقدّم الرفع */}
                {uploading && (
                  <div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/15 dark:bg-white/10">
                      <div
                        className="gradient-primary h-full rounded-full transition-all duration-300"
                        style={{ width: `${progress ?? 5}%` }}
                      />
                    </div>
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-app-3">
                      <Loader2 size={11} className="animate-spin" />
                      {t("جارٍ رفع الفيديو…", "Uploading video…")} {progress ?? 0}%
                    </p>
                  </div>
                )}
                {uploadError && (
                  <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
                    {uploadError}
                  </p>
                )}

                {/* الكابشن */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-app-3">
                      {t("وصف (اختياري)", "Caption (optional)")}
                    </span>
                    <span className="text-[10px] tabular-nums text-app-3">
                      {caption.length}/{MAX_CAPTION}
                    </span>
                  </div>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION))}
                    rows={2}
                    maxLength={MAX_CAPTION}
                    placeholder={t("اكتب وصفاً قصيراً للريل…", "Write a short caption…")}
                    className="input-glass mt-1.5 w-full resize-none text-sm"
                  />
                </div>

                {/* ربط بمانهوا */}
                <div>
                  <span className="text-xs font-semibold text-app-3">
                    {t("ربط بمانهوا (اختياري)", "Link a title (optional)")}
                  </span>
                  {pickedManga ? (
                    <div className="glass-chip mt-1.5 w-fit !py-1.5 text-xs font-bold text-primary">
                      <BadgeCheck size={13} />
                      {pickedManga.title}
                      <button
                        onClick={() => setPickedManga(null)}
                        className="ms-1 text-app-3 hover:text-danger"
                        aria-label={t("إزالة الربط", "Remove link")}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        value={mangaQuery}
                        onChange={(e) => setMangaQuery(e.target.value)}
                        placeholder={t("ابحث باسم المانهوا…", "Search by title…")}
                        className="input-glass mt-1.5 w-full !py-2 text-sm"
                      />
                      {debouncedQuery.length > 1 && (
                        <div className="mt-1.5 flex flex-col gap-1">
                          {mangaQ.isLoading ? (
                            <p className="flex items-center gap-1.5 text-[11px] text-app-3">
                              <Loader2 size={11} className="animate-spin" />
                              {t("جارٍ البحث…", "Searching…")}
                            </p>
                          ) : mangaResults.length === 0 ? (
                            <p className="text-[11px] text-app-3">{t("لا نتائج", "No results")}</p>
                          ) : (
                            mangaResults.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => setPickedManga({ id: m.id, title: m.title })}
                                className="glass flex items-center gap-2 !rounded-xl px-2.5 py-1.5 text-start text-xs font-semibold text-app transition-colors hover:border-primary/40"
                              >
                                {m.coverUrl && (
                                  <img src={m.coverUrl} alt="" className="h-8 w-6 rounded object-cover" />
                                )}
                                <span className="line-clamp-1">{m.title}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <button
                  onClick={() => void submit()}
                  disabled={!file || busy}
                  className="btn-primary w-full !py-3 text-sm disabled:opacity-50"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  {busy ? t("جارٍ النشر…", "Posting…") : t("نشر الريل", "Post reel")}
                </button>
                <p className="text-center text-[11px] leading-5 text-app-3">
                  {t(
                    "سيُراجع الريل من الإدارة قبل ظهوره للجميع.",
                    "Your reel will be reviewed by admins before it appears to everyone.",
                  )}
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
