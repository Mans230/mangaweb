import { Link } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { LogIn, X } from "lucide-react";
import { LOGIN_PATH } from "@/const";
import { useLanguage } from "@/components/LanguageProvider";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

interface AuthPromptProps {
  open: boolean;
  onClose: () => void;
}

/**
 * تنبيه الزائر عند محاولة استخدام ميزة تتطلب تسجيل الدخول —
 * بطاقة سفلية على الموبايل / بطاقة عائمة على الديسكتوب.
 */
export default function AuthPrompt({ open, onClose }: AuthPromptProps) {
  const { t } = useLanguage();

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-x-3 bottom-24 z-[75] sm:end-6 sm:start-auto sm:bottom-auto sm:top-24 sm:w-80">
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="glass-strong rounded-2xl p-5"
            role="alert"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label={t("إغلاق", "Close")}
              className="absolute end-3 top-3 text-app-3 transition-colors hover:text-app"
            >
              <X size={16} />
            </button>
            <div className="flex items-center gap-3">
              <span className="gradient-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                <LogIn size={18} />
              </span>
              <div>
                <p className="text-sm font-bold text-app">{t("سجّل لتفعيل الميزة", "Sign in to unlock")}</p>
                <p className="mt-0.5 text-xs leading-5 text-app-3">
                  {t("المتابعة والمفضلة والتقييم والتعليق للأعضاء فقط.", "Follow, favorite, rating and comments are for members.")}
                </p>
              </div>
            </div>
            <Link to={LOGIN_PATH} className="btn-primary mt-4 w-full !py-2.5 text-sm">
              {t("تسجيل الدخول", "Sign in")}
            </Link>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
