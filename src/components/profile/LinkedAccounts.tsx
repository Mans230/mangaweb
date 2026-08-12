import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, KeyRound, Link2, Loader2, Mail, RefreshCw, Send, Unlink } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useToast } from "@/components/library/toast";
import GlassModal from "@/components/library/GlassModal";
import { trpc } from "@/providers/trpc";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const TG_KEY = "zeko-telegram-linked";
const TG_BOT = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? "zeko_manga_bot";

interface LinkedAccountsProps {
  email: string | null;
  telegramLinked: boolean;
  onTelegramChange: (linked: boolean) => void;
}

export default function LinkedAccounts({ email, telegramLinked, onTelegramChange }: LinkedAccountsProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [tgModal, setTgModal] = useState(false);

  const unlinkTelegram = () => {
    window.localStorage.removeItem(TG_KEY);
    onTelegramChange(false);
    toast(t("أُلغي ربط تليجرام", "Telegram unlinked"));
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="glass p-6 md:p-8"
    >
      <h3 className="font-display mb-5 text-base font-bold text-app">
        {t("الحسابات المرتبطة", "Linked accounts")}
      </h3>

      <div className="flex flex-col gap-3">
        {/* Telegram */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, ease: EASE, delay: 0 }}
          className="glass flex flex-wrap items-center gap-3 !rounded-2xl p-4"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-2/20 text-accent-2">
            <Send size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-bold text-app">
              {t("تليجرام", "Telegram")}
              {telegramLinked && (
                <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10.5px] font-bold text-success">
                  <BadgeCheck size={11} />
                  {t("مرتبط", "Linked")}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11.5px] text-app-3">
              {t("الربط يفعّل إشعارات الفصول الجديدة والتحميل الكامل.", "Linking enables new-chapter notifications and full downloads.")}
            </p>
          </div>
          {telegramLinked ? (
            <button onClick={unlinkTelegram} className="btn-glass !px-4 !py-2 text-xs !text-danger !border-danger/40">
              <Unlink size={13} />
              {t("إلغاء الربط", "Unlink")}
            </button>
          ) : (
            <button onClick={() => setTgModal(true)} className="btn-primary !px-4 !py-2 text-xs">
              <Link2 size={13} />
              {t("ربط الحساب", "Link account")}
            </button>
          )}
        </motion.div>

        {/* Google */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.07 }}
          className="glass flex flex-wrap items-center gap-3 !rounded-2xl p-4"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden>
              <path d="M21.35 11.1H12v2.9h5.35c-.5 2.4-2.55 3.9-5.35 3.9a5.9 5.9 0 1 1 0-11.8c1.5 0 2.85.55 3.9 1.45l2.2-2.2A7.9 7.9 0 1 0 12 19.9c4.55 0 7.7-3.2 7.7-7.7 0-.4-.05-.75-.15-1.1Z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-app">{t("جوجل", "Google")}</div>
            <p className="mt-0.5 text-[11.5px] text-app-3">
              {t("سجّل دخولك عبر جوجل ليتم الربط تلقائياً.", "Sign in with Google to link automatically.")}
            </p>
          </div>
          <span className="glass-chip !py-1 text-[11px]">{t("غير مرتبط", "Not linked")}</span>
        </motion.div>

        {/* Email */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.14 }}
          className="glass flex flex-wrap items-center gap-3 !rounded-2xl p-4"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-success/15 text-success">
            <Mail size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-bold text-app">
              {t("البريد الإلكتروني", "Email")}
              <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10.5px] font-bold text-success">
                <BadgeCheck size={11} />
                {t("موثّق", "Verified")}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11.5px] text-app-3" dir="ltr">
              {email ?? "—"}
            </p>
          </div>
          <button
            onClick={() => toast(t("تغيير كلمة المرور يتم عبر بريدك", "Password change happens via email"), { kind: "info" })}
            className="btn-glass !px-4 !py-2 text-xs"
          >
            <KeyRound size={13} />
            {t("تغيير كلمة المرور", "Change password")}
          </button>
        </motion.div>
      </div>

      <TelegramModal
        open={tgModal}
        onClose={() => setTgModal(false)}
        onLinked={() => {
          window.localStorage.setItem(TG_KEY, "1");
          onTelegramChange(true);
          setTgModal(false);
        }}
      />
    </motion.section>
  );
}

/** مودال ربط تليجرام: رمز ربط حقيقي من الخادم يُرسله المستخدم للبوت، ثم يتحقق من حالة الربط. */
function TelegramModal({
  open,
  onClose,
  onLinked,
}: {
  open: boolean;
  onClose: () => void;
  onLinked: () => void;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [code, setCode] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const linkCodeMutation = trpc.auth.createLinkCode.useMutation({
    onSuccess: (data) => setCode(data.code),
    onError: () =>
      toast(t("تعذر توليد رمز الربط — حاول مجدداً", "Could not generate a link code — try again"), { kind: "info" }),
  });

  useEffect(() => {
    if (open && !code && !linkCodeMutation.isPending) {
      linkCodeMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const checkLinked = async () => {
    setChecking(true);
    try {
      const me = await utils.auth.me.fetch();
      if (me?.telegramId) {
        window.localStorage.setItem(TG_KEY, "1");
        onLinked();
        toast(t("تم ربط تليجرام بنجاح", "Telegram linked successfully"));
      } else {
        toast(t("لم يكتمل الربط بعد — أرسل الرمز للبوت ثم أعد التحقق", "Not linked yet — send the code to the bot, then re-check"), { kind: "info" });
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <GlassModal open={open} onClose={onClose} title={t("ربط حساب تليجرام", "Link Telegram account")}>
      <ol className="flex list-none flex-col gap-3 text-sm text-app-2">
        <li className="flex gap-2.5">
          <span className="gradient-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">1</span>
          <span>
            {t("افتح بوت زيكو مانجا على تليجرام وأرسل", "Open the zeko-manga bot on Telegram and send")}{" "}
            <code className="glass-chip !px-2 !py-0.5 text-xs font-bold" dir="ltr">/start</code>
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="gradient-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">2</span>
          <span>
            {t("أرسل رمز الربط هذا للبوت:", "Send this linking code to the bot:")}
          </span>
        </li>
      </ol>

      <div className="my-4 flex justify-center">
        {code ? (
          <motion.span
            key={code}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="glass-strong gradient-text rounded-2xl px-6 py-3 font-display text-3xl font-extrabold tracking-[0.3em]"
            dir="ltr"
          >
            {code}
          </motion.span>
        ) : (
          <Loader2 size={24} className="animate-spin text-app-3" />
        )}
      </div>

      <a
        href={`https://t.me/${TG_BOT}`}
        target="_blank"
        rel="noreferrer"
        className="btn-glass w-full !py-2.5 text-sm"
      >
        <Send size={15} />
        {t("فتح البوت في تليجرام", "Open bot in Telegram")}
      </a>

      <p className="mt-4 text-center text-xs font-medium text-app-3">
        {t("بعد إرسال الرمز للبوت، اضغط زر التحقق:", "After sending the code to the bot, press verify:")}
      </p>

      <button onClick={checkLinked} disabled={checking} className="btn-primary mt-2 w-full !py-2.5 text-sm disabled:opacity-60">
        {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        {t("تحقق من الربط", "Check linking status")}
      </button>
    </GlassModal>
  );
}
