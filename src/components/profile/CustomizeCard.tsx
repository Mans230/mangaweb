import { useEffect, useRef, useState } from "react";
import { proxyImg } from "@/lib/manga";
import { motion } from "framer-motion";
import {
  AtSign,
  Check,
  Image as ImageIcon,
  Loader2,
  Send,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { useToast } from "@/components/library/toast";
import { useImageUpload, IMAGE_ACCEPT } from "@/lib/upload";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const USERNAME_RE = /^[A-Za-z0-9._-]{3,20}$/;

interface CustomizeCardProps {
  username: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  telegramLinked: boolean;
}

/**
 * «تخصيص الملف» — اسم المستخدم + الصورة الشخصية + صورة الغلاف.
 * كل التغييرات عبر auth.updateProfile ويُبطل كاش auth.me بعدها.
 * الصور: تليجرام (تلقائي عند الربط للأفاتار) + رفع من جهاز المستخدم فقط.
 */
export default function CustomizeCard({
  username,
  avatarUrl,
  bannerUrl,
  telegramLinked,
}: CustomizeCardProps) {
  const { t } = useLanguage();

  return (
    <motion.section
      id="profile-customize"
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="glass scroll-mt-24 p-4 md:p-6"
    >
      <h3 className="font-display mb-5 text-base font-bold text-app">
        {t("تخصيص الملف", "Customize profile")}
      </h3>
      <div className="flex flex-col divide-y divide-[var(--border)]">
        <UsernameRow username={username} />
        <ImageRow
          kind="avatar"
          value={avatarUrl}
          telegramLinked={telegramLinked}
          title={t("الصورة الشخصية", "Avatar")}
          desc={t(
            "تظهر في ملفك ورسائلك في المجتمع.",
            "Shown on your profile and community messages.",
          )}
        />
        <ImageRow
          kind="banner"
          value={bannerUrl}
          telegramLinked={false}
          title={t("صورة الغلاف", "Banner")}
          desc={t(
            "خلفية رأس صفحة ملفك الشخصي.",
            "Background of your profile page header.",
          )}
        />
      </div>
    </motion.section>
  );
}

/* ================= اسم المستخدم ================= */
function UsernameRow({ username }: { username: string | null }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState(username ?? "");
  const [error, setError] = useState<string | null>(null);

  const updateMut = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      setError(null);
      void utils.auth.me.invalidate();
      toast(t("حُفظ اسم المستخدم", "Username saved"));
    },
    onError: (e) => setError(e.message),
  });

  const save = () => {
    const value = draft.trim();
    if (value === (username ?? "")) return;
    if (!USERNAME_RE.test(value)) {
      setError(
        t(
          "اسم المستخدم: 3-20 حرفاً (أحرف إنجليزية، أرقام، . _ - فقط)",
          "Username: 3-20 chars (English letters, digits, . _ - only)",
        ),
      );
      return;
    }
    updateMut.mutate({ username: value });
  };

  return (
    <div className="py-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft/15 text-primary">
          <AtSign size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-app">{t("اسم المستخدم", "Username")}</div>
          <p className="text-[11.5px] text-app-3">
            {t(
              "3-20 حرفاً: أحرف إنجليزية وأرقام و . _ - فقط — ويمكن تغييره مرة كل 30 يوماً.",
              "3-20 chars: English letters, digits and . _ - only — changeable once every 30 days.",
            )}
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-app-3">
              @
            </span>
            <input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && save()}
              dir="ltr"
              maxLength={20}
              placeholder="username"
              className="input-glass w-full !py-2.5 ps-7 text-sm"
            />
          </div>
          <button
            onClick={save}
            disabled={updateMut.isPending || !draft.trim() || draft.trim() === (username ?? "")}
            className="btn-primary shrink-0 !px-4 !py-2.5 text-sm disabled:opacity-50"
          >
            {updateMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {t("حفظ", "Save")}
          </button>
        </div>
      </div>
      {/* أخطاء الخادم: CONFLICT (الاسم مستخدم) / FORBIDDEN (فترة الـ 30 يوماً) تصل برسالة عربية جاهزة */}
      {error && <p className="mt-2 ps-14 text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}

/* ================= صف صورة (أفاتار/غلاف) ================= */
function ImageRow({
  kind,
  value,
  telegramLinked,
  title,
  desc,
}: {
  kind: "avatar" | "banner";
  value: string | null;
  telegramLinked: boolean;
  title: string;
  desc: string;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [error, setError] = useState<string | null>(null);
  // فشل تحميل المعاينة (مضيف محجوب/بروكسي) — اعرض الأيقونة بدل صورة مكسورة
  const [previewBroken, setPreviewBroken] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setPreviewBroken(false), [value]);
  const { upload, uploading } = useImageUpload();

  const updateMut = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      setError(null);
      void utils.auth.me.invalidate();
      toast(t("حُدّثت الصورة", "Image updated"));
    },
    onError: (e) => setError(e.message),
  });

  const apply = (url: string | null) => {
    updateMut.mutate(
      kind === "avatar" ? { avatarUrl: url } : { bannerUrl: url },
    );
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("اختر ملف صورة", "Pick an image file"));
      return;
    }
    setError(null);
    const url = await upload(file);
    if (url) {
      apply(url);
    } else {
      setError(t("فشل رفع الصورة — جرّب مرة أخرى", "Image upload failed — try again"));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="py-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* معاينة */}
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-soft/15 text-primary">
          {value && !previewBroken ? (
            kind === "avatar" ? (
              <img src={proxyImg(value)} alt="" onError={() => setPreviewBroken(true)} className="h-full w-full rounded-full object-cover" />
            ) : (
              <img src={proxyImg(value)} alt="" onError={() => setPreviewBroken(true)} className="h-full w-full object-cover" />
            )
          ) : kind === "avatar" ? (
            <User size={17} />
          ) : (
            <ImageIcon size={17} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-bold text-app">
            {title}
            {/* (أ) صورة تليجرام تُملأ تلقائياً من الباكند عند الربط */}
            {kind === "avatar" && telegramLinked && (
              <span className="glass-chip !px-2.5 !py-0.5 !text-[10.5px] font-semibold text-accent-2">
                <Send size={11} />
                {t("متزامنة مع تليجرام", "Synced from Telegram")}
              </span>
            )}
          </div>
          <p className="text-[11.5px] text-app-3">{desc}</p>
        </div>
        {value && (
          <button
            onClick={() => apply(null)}
            disabled={updateMut.isPending}
            className="btn-icon !h-9 !w-9 !text-danger"
            aria-label={t("إزالة الصورة", "Remove image")}
            title={t("إزالة الصورة", "Remove image")}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* رفع من الجهاز فقط (jpg/png/webp/gif) — بدون خيار الرابط لتوفير المساحة */}
      <div className="mt-3 flex items-center gap-2 ps-14">
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(e) => void onPickFile(e.target.files?.[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || updateMut.isPending}
          className="btn-primary inline-flex h-9 w-9 shrink-0 items-center justify-center !px-0 !py-0 disabled:opacity-50"
          aria-label={t("رفع من جهازك", "Upload from device")}
          title={t("رفع من جهازك", "Upload from device")}
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
        </button>
      </div>
      {error && <p className="mt-2 ps-14 text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}
