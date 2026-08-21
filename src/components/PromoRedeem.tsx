import { useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";

/**
 * بطاقة استبدال كود ترويجي (مستخدم مسجّل).
 * تعرض النتيجة داخلياً (بلا توست) لتعمل في أي صفحة دون ToastViewport،
 * وتستدعي onRedeemed بعد النجاح ليحدّث كل استضافة استعلاماتها الخاصة.
 */
export default function PromoRedeem({ onRedeemed }: { onRedeemed?: () => void }) {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const redeem = trpc.promo.redeem.useMutation({
    onSuccess: (res) => {
      const reward =
        res.rewardType === "premium_days"
          ? t(`+${res.amount} يوم بريميوم`, `+${res.amount} premium days`)
          : t(`+${res.amount} كوين`, `+${res.amount} coins`);
      setMsg({ ok: true, text: t(`تم! ${reward}`, `Done! ${reward}`) });
      setCode("");
      onRedeemed?.();
    },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  });

  if (!isAuthenticated) return null;

  const submit = () => {
    const c = code.trim();
    if (!c) return;
    setMsg(null);
    redeem.mutate({ code: c });
  };

  return (
    <div className="glass !rounded-2xl p-4">
      <h2 className="font-display mb-2 flex items-center gap-2 text-base font-bold text-app">
        <Gift size={16} className="text-accent-2" />
        {t("استبدال كود", "Redeem a code")}
      </h2>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={t("أدخل الكود", "Enter code")}
          dir="ltr"
          className="input-glass min-w-0 flex-1 font-mono text-sm"
        />
        <button
          disabled={redeem.isPending || code.trim() === ""}
          onClick={submit}
          className="btn-primary shrink-0 !px-5 !py-2.5 text-sm disabled:opacity-50"
        >
          {redeem.isPending ? <Loader2 size={14} className="animate-spin" /> : t("استبدال", "Redeem")}
        </button>
      </div>
      {msg && (
        <p className={`mt-2 text-xs font-semibold ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
