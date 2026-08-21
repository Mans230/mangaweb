import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Palette, RotateCcw, Save } from "lucide-react";
import ErrorState from "@/components/ErrorState";
import { useLanguage } from "@/components/LanguageProvider";
import { trpc } from "@/providers/trpc";
import { applyBranding, type BrandingConfig } from "@/lib/branding";
import { EASE } from "./adminUtils";
import { useAdminToast } from "./AdminToast";

/** حقول الألوان الخمسة المعروضة في اللوحة */
const COLOR_FIELDS: Array<{
  key: keyof BrandingConfig["colors"];
  ar: string;
  en: string;
}> = [
  { key: "primary", ar: "اللون الأساسي", en: "Primary" },
  { key: "primarySoft", ar: "الأساسي الفاتح", en: "Primary soft" },
  { key: "accent", ar: "اللون المميّز", en: "Accent" },
  { key: "accent2", ar: "المميّز الثانوي", en: "Accent 2" },
  { key: "primaryInk", ar: "لون النص فوق الأساسي", en: "Ink on primary" },
];

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** صف تحكّم بلون واحد: منتقي لوني + إدخال HEX نصّي */
function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = value === "" || HEX_RE.test(value);
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        aria-label={label}
        value={HEX_RE.test(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-app/20 bg-transparent p-0.5"
      />
      <div className="min-w-0 flex-1">
        <label className="mb-1 block text-xs font-semibold text-app-2">{label}</label>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#141211"
          spellCheck={false}
          className={`input-glass w-full font-mono text-sm ${
            valid ? "" : "!border-danger"
          }`}
        />
      </div>
    </div>
  );
}

export default function ThemeBranding() {
  const { t } = useLanguage();
  const toast = useAdminToast();
  const query = trpc.admin.getBranding.useQuery(undefined, { retry: false });

  // مسودّة محلّية: null = لم يُعدّل المستخدم بعد ⇒ نعرض قيمة السيرفر
  const [draft, setDraft] = useState<BrandingConfig | null>(null);
  const cfg: BrandingConfig | null = draft ?? query.data ?? null;

  const patch = (partial: Partial<BrandingConfig>) =>
    setDraft((prev) => ({ ...(prev ?? query.data!), ...partial }));
  const patchColor = (key: keyof BrandingConfig["colors"], v: string) =>
    setDraft((prev) => {
      const base = prev ?? query.data!;
      return { ...base, colors: { ...base.colors, [key]: v } };
    });

  const save = trpc.admin.setBranding.useMutation({
    onSuccess: () => {
      toast(t("تم حفظ الهوية البصرية", "Branding saved"));
      if (cfg) applyBranding(cfg); // تطبيق فوري في تبويب الأدمن نفسه
      setDraft(null);
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  const reset = trpc.admin.resetBranding.useMutation({
    onSuccess: (data) => {
      toast(t("تمت الإعادة إلى الافتراضي", "Reset to defaults"));
      applyBranding(data as BrandingConfig);
      setDraft(null);
      query.refetch();
    },
    onError: (e) => toast(e.message, "danger"),
  });

  // تحقّق: كل الألوان غير الفارغة يجب أن تكون HEX صالحة قبل الحفظ
  const colorsValid =
    !cfg ||
    Object.values(cfg.colors).every((v) => v === "" || HEX_RE.test(v));

  return (
    <motion.section
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="glass !rounded-2xl p-4 md:p-5"
    >
      <h3 className="font-display mb-1 flex items-center gap-2 text-sm font-bold text-app">
        <Palette size={16} className="text-accent" />
        {t("الثيم والهوية البصرية", "Theme & branding")}
      </h3>
      <p className="mb-4 text-xs text-app-2">
        {t(
          "تُطبَّق التغييرات على كل الموقع. اترك أي لون فارغاً للرجوع إلى الثيم الأساسي.",
          "Changes apply site-wide. Leave any color empty to fall back to the base theme.",
        )}
      </p>

      {query.isLoading ? (
        <div className="skeleton h-64" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} retrying={query.isRefetching} />
      ) : cfg ? (
        <div className="space-y-5">
          {/* الألوان */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-wide text-app-2">
              {t("الألوان", "Colors")}
            </span>
            <div className="grid gap-3 sm:grid-cols-2">
              {COLOR_FIELDS.map((f) => (
                <ColorRow
                  key={f.key}
                  label={t(f.ar, f.en)}
                  value={cfg.colors[f.key] ?? ""}
                  onChange={(v) => patchColor(f.key, v)}
                />
              ))}
            </div>
          </div>

          {/* العلامة التجارية */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-wide text-app-2">
              {t("العلامة التجارية", "Brand")}
            </span>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-app-2">
                  {t("اسم الموقع", "Site name")}
                </label>
                <input
                  value={cfg.siteName}
                  onChange={(e) => patch({ siteName: e.target.value })}
                  placeholder="MangaWeb"
                  className="input-glass w-full text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-app-2">
                  {t("إيموجي الفافيكون", "Favicon emoji")}
                </label>
                <input
                  value={cfg.faviconEmoji}
                  onChange={(e) => patch({ faviconEmoji: e.target.value })}
                  placeholder="📚"
                  className="input-glass w-full text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-2">
                {t("رابط الشعار (URL)", "Logo URL")}
              </label>
              <input
                value={cfg.logoUrl}
                onChange={(e) => patch({ logoUrl: e.target.value })}
                placeholder="https://…/logo.png"
                dir="ltr"
                className="input-glass w-full text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-2">
                {t("وصف الموقع (SEO)", "Site description (SEO)")}
              </label>
              <textarea
                rows={2}
                value={cfg.siteDescription}
                onChange={(e) => patch({ siteDescription: e.target.value })}
                placeholder={t("منصّة قراءة المانجا…", "Read manga online…")}
                className="input-glass w-full resize-none text-sm"
              />
            </div>
          </div>

          {/* CSS مخصّص */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-app-2">
              {t("CSS مخصّص (متقدّم)", "Custom CSS (advanced)")}
            </label>
            <textarea
              rows={5}
              value={cfg.customCss}
              onChange={(e) => patch({ customCss: e.target.value })}
              placeholder={"/* .btn-primary { border-radius: 999px; } */"}
              spellCheck={false}
              dir="ltr"
              className="input-glass w-full resize-y font-mono text-xs"
            />
          </div>

          {/* أزرار */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              disabled={reset.isPending}
              onClick={() => reset.mutate()}
              className="btn-ghost !px-4 !py-2.5 text-sm disabled:opacity-50"
            >
              {reset.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RotateCcw size={14} />
              )}
              {t("إعادة للافتراضي", "Reset")}
            </button>
            <button
              disabled={save.isPending || !colorsValid || !draft}
              onClick={() => draft && save.mutate(draft)}
              className="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-50"
            >
              {save.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {t("حفظ", "Save")}
            </button>
          </div>
          {!colorsValid && (
            <p className="text-end text-xs text-danger">
              {t("بعض الألوان غير صالحة (استخدم #rrggbb)", "Some colors are invalid (use #rrggbb)")}
            </p>
          )}
        </div>
      ) : null}
    </motion.section>
  );
}
