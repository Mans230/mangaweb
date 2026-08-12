import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router";
import { useLanguage } from "./LanguageProvider";

const STORAGE_KEY = "zeko-age-confirmed";

export function isAgeConfirmed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

interface AgeGateModalProps {
  open: boolean;
  cover?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export default function AgeGateModal({ open, cover, onConfirm, onClose }: AgeGateModalProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(open);

  useEffect(() => setVisible(open), [open]);

  const confirm = () => {
    window.localStorage.setItem(STORAGE_KEY, "1");
    onConfirm();
  };

  const decline = () => {
    onClose();
    navigate("/");
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("تأكيد العمر", "Age confirmation")}
        >
          {/* blurred backdrop */}
          <div className="absolute inset-0 overflow-hidden bg-black/50 backdrop-blur-xl">
            {cover && (
              <img src={cover} alt="" className="h-full w-full scale-125 object-cover opacity-25 blur-2xl" />
            )}
          </div>

          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 16 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong relative w-full max-w-sm rounded-3xl p-7 text-center"
          >
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger text-xl font-extrabold text-white shadow-lg">
              +18
            </span>
            <h2 className="font-display mt-4 text-xl font-bold text-app">
              {t("هل عمرك 18 سنة أو أكثر؟", "Are you 18 or older?")}
            </h2>
            <p className="mt-2 text-sm text-app-2">
              {t(
                "هذا المحتوى مصنّف للبالغين. بالمتابعة أنت تؤكد أن عمرك 18 سنة فأكثر.",
                "This content is rated for adults. By continuing you confirm you are 18 or older."
              )}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={confirm} className="btn-primary !py-3 text-sm">
                {t("نعم، متابعة", "Yes, continue")}
              </button>
              <button onClick={decline} className="btn-glass !py-3 text-sm">
                {t("لا، عودة", "No, go back")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
