/**
 * بانر تثبيت PWA صغير — يظهر مرة واحدة عند beforeinstallprompt،
 * ويُحفظ رفضه في localStorage (pwa-dismissed).
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

const KEY = "pwa-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaInstallBanner() {
  const { t } = useLanguage();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === "1";
    } catch {
      dismissed = false;
    }
    if (dismissed) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt().catch(() => {});
    const choice = await deferred.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setVisible(false);
    else dismiss();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="glass-strong fixed inset-x-3 bottom-20 z-[60] flex items-center gap-3 !rounded-2xl p-3 md:inset-x-auto md:bottom-5 md:end-5 md:w-80"
          role="status"
        >
          <span className="gradient-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <Download size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-app">
              {t("ثبّت تطبيق زيكو مانجا", "Install zeko-manga app")}
            </span>
            <span className="block text-[11px] text-app-3">
              {t("وصول أسرع من شاشتك الرئيسية.", "Faster access from your home screen.")}
            </span>
          </span>
          <button onClick={() => void install()} className="btn-primary shrink-0 !px-3.5 !py-2 text-xs">
            {t("تثبيت", "Install")}
          </button>
          <button
            onClick={dismiss}
            className="btn-icon !h-7 !w-7 shrink-0"
            aria-label={t("إغلاق", "Dismiss")}
          >
            <X size={13} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
