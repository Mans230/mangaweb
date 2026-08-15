import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, LogOut, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/components/LanguageProvider";
import GlassModal from "@/components/library/GlassModal";
import { useToast } from "@/components/library/toast";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function DangerZone() {
  const { t } = useLanguage();
  const { logout } = useAuth();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [shake, setShake] = useState(0);

  const CONFIRM_WORD = t("حذف", "delete");

  const attemptDelete = () => {
    if (confirmText.trim() !== CONFIRM_WORD) {
      setShake((s) => s + 1);
      return;
    }
    // TODO(api): ربط حذف الحساب بـ endpoint عند توفره — حالياً واجهة فقط
    setModalOpen(false);
    setConfirmText("");
    toast(t("طلب حذف الحساب مسجّل (واجهة تجريبية)", "Account deletion requested (UI demo)"), { kind: "info" });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="glass !border-danger/40 p-5 md:p-6"
    >
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger">
          <AlertTriangle size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-app">{t("منطقة الخطر", "Danger zone")}</div>
          <p className="text-[11.5px] text-app-3">
            {t("إجراءات حساسة على حسابك — تعامل معها بحذر.", "Sensitive account actions — handle with care.")}
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => logout()}
            className="btn-glass !px-4 !py-2 text-xs !text-danger !border-danger/40"
          >
            <LogOut size={13} />
            {t("تسجيل الخروج", "Sign out")}
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-danger transition-colors hover:bg-danger/10"
          >
            <Trash2 size={13} />
            {t("حذف الحساب", "Delete account")}
          </button>
        </div>
      </div>

      <GlassModal open={modalOpen} onClose={() => setModalOpen(false)} title={t("حذف الحساب نهائياً؟", "Delete account permanently?")}>
        <p className="text-sm text-app-2">
          {t(
            "سيُحذف حسابك ومكتبتك وسجل قراءتك نهائياً. هذا الإجراء لا يمكن التراجع عنه.",
            "Your account, library, and reading history will be permanently deleted. This cannot be undone.",
          )}
        </p>
        <motion.div
          key={shake}
          animate={shake > 0 ? { x: [0, -4, 4, -4, 4, 0] } : {}}
          transition={{ duration: 0.3 }}
          className="mt-4"
        >
          <label className="mb-1.5 block text-xs font-medium text-app-3">
            {t("اكتب", "Type")} «{CONFIRM_WORD}» {t("للتأكيد", "to confirm")}
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && attemptDelete()}
            className="input-glass w-full !border-danger/40"
            placeholder={CONFIRM_WORD}
          />
        </motion.div>
        <div className="mt-5 flex gap-3">
          <button
            onClick={attemptDelete}
            className="btn-primary flex-1 !py-2.5 text-sm"
            style={{ background: "var(--danger)", boxShadow: "0 6px 20px rgba(251,113,133,.35)" }}
          >
            {t("حذف نهائي", "Delete permanently")}
          </button>
          <button onClick={() => setModalOpen(false)} className="btn-glass flex-1 !py-2.5 text-sm">
            {t("تراجع", "Cancel")}
          </button>
        </div>
      </GlassModal>
    </motion.section>
  );
}
