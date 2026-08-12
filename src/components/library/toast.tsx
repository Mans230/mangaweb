import { useCallback, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, Undo2, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  kind: "success" | "info";
  action?: ToastAction;
}

/* مخزن عام بسيط على مستوى الوحدة — يجمع تنبيهات كل المكوّنات الفرعية في نافذة عرض واحدة. */
let toasts: ToastItem[] = [];
let nextId = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function pushToast(message: string, opts?: { kind?: "success" | "info"; action?: ToastAction }) {
  const id = ++nextId;
  toasts = [...toasts.slice(-2), { id, message, kind: opts?.kind ?? "success", action: opts?.action }];
  emit();
  window.setTimeout(() => dismissToast(id), 4000);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * نظام تنبيهات خفيف مخصص للصفحات (بدون الاعتماد على Toaster عام).
 * كل صفحة تركّب <ToastViewport/> واحدة، وأي مكوّن فرعي ينادي toast().
 */
export function useToast() {
  const current = useSyncExternalStore(subscribe, () => toasts);
  const toast = useCallback(
    (message: string, opts?: { kind?: "success" | "info"; action?: ToastAction }) =>
      pushToast(message, opts),
    [],
  );
  const dismiss = useCallback((id: number) => dismissToast(id), []);
  return { toasts: current, toast, dismiss };
}

export function ToastViewport() {
  const { t } = useLanguage();
  const { toasts: current, dismiss } = useToast();
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-24 z-[90] flex flex-col items-center gap-2 md:inset-x-auto md:end-6 md:bottom-auto md:top-20 md:items-end">
      <AnimatePresence>
        {current.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="glass-strong pointer-events-auto flex items-center gap-3 !rounded-2xl px-4 py-3 text-sm text-app shadow-lg"
          >
            {item.kind === "success" ? (
              <CheckCircle2 size={17} className="shrink-0 text-success" />
            ) : (
              <Info size={17} className="shrink-0 text-accent-2" />
            )}
            <span className="font-medium">{item.message}</span>
            {item.action && (
              <button
                onClick={() => {
                  item.action!.onClick();
                  dismiss(item.id);
                }}
                className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary/10"
              >
                <Undo2 size={13} />
                {item.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(item.id)}
              aria-label={t("إغلاق", "Dismiss")}
              className="shrink-0 text-app-3 transition-colors hover:text-app"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
