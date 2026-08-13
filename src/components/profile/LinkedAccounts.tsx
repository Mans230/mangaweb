import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, Check, Copy, KeyRound, Link2, Loader2, Mail, RefreshCw, Send, Unlink, Zap } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useToast } from "@/components/library/toast";
import GlassModal from "@/components/library/GlassModal";
import PasswordResetHelp from "@/components/auth/PasswordResetHelp";
import { trpc } from "@/providers/trpc";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const TG_BOT = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? "egmangabot";
const TG_WIDGET_ENABLED = Boolean(import.meta.env.VITE_TELEGRAM_BOT_USERNAME);

type TelegramAuthPayload = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    onTelegramLinkAuth?: (user: TelegramAuthPayload) => void;
  }
}

interface LinkedAccountsProps {
  email: string | null;
  telegramLinked: boolean;
  telegramUsername?: string | null;
}

export default function LinkedAccounts({ email, telegramLinked, telegramUsername }: LinkedAccountsProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [tgModal, setTgModal] = useState(false);
  const [resetHelpOpen, setResetHelpOpen] = useState(false);

  const unlinkMutation = trpc.auth.unlinkTelegram.useMutation({
    onSuccess: () => {
      void utils.auth.me.invalidate();
      toast(t("أُلغي ربط تليجرام", "Telegram unlinked"));
    },
    onError: (e) =>
      toast(e.message || t("تعذر إلغاء الربط — حاول مجدداً", "Could not unlink — try again"), { kind: "info" }),
  });

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
              {telegramLinked && telegramUsername
                ? <span dir="ltr">@{telegramUsername}</span>
                : t("الربط يفعّل إشعارات الفصول الجديدة والتحميل الكامل.", "Linking enables new-chapter notifications and full downloads.")}
            </p>
          </div>
          {telegramLinked ? (
            <button
              onClick={() => unlinkMutation.mutate()}
              disabled={unlinkMutation.isPending}
              className="btn-glass !px-4 !py-2 text-xs !text-danger !border-danger/40 disabled:opacity-60"
            >
              {unlinkMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Unlink size={13} />}
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
              {telegramLinked ? (
                <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10.5px] font-bold text-success">
                  <BadgeCheck size={11} />
                  {t("موثّق عبر تليجرام", "Verified via Telegram")}
                </span>
              ) : (
                <span className="glass-chip flex items-center gap-1 !py-0.5 text-[10.5px] font-bold text-app-3">
                  {t("غير موثّق — اربط تليجرام", "Not verified — link Telegram")}
                </span>
              )}
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

      <TelegramModal open={tgModal} onClose={() => setTgModal(false)} />
      <PasswordResetHelp
        open={resetHelpOpen}
        onClose={() => setResetHelpOpen(false)}
        botUsername={TG_BOT}
      />
    </motion.section>
  );
}

/** مودال ربط تليجرام: ربط فوري عبر Telegram Login Widget أو رمز ربط يُرسله المستخدم للبوت. */
function TelegramModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [code, setCode] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast(t("نُسخ الرمز", "Code copied"));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(t("تعذر النسخ — انسخ الرمز يدويًا", "Copy failed — copy the code manually"), { kind: "info" });
    }
  };

  const linkCodeMutation = trpc.auth.createLinkCode.useMutation({
    onSuccess: (data) => setCode(data.code),
    onError: () =>
      toast(t("تعذر توليد رمز الربط — حاول مجدداً", "Could not generate a link code — try again"), { kind: "info" }),
  });

  const linkWidgetMutation = trpc.auth.linkTelegramViaWidget.useMutation({
    onSuccess: () => {
      setWidgetError(null);
      void utils.auth.me.invalidate();
      toast(t("تم ربط تليجرام بنجاح", "Telegram linked successfully"));
      onClose();
    },
    // أخطاء 409 تصل برسالة عربية من الخادم — تُعرض كما هي
    onError: (e) => setWidgetError(e.message),
  });

  useEffect(() => {
    if (open) {
      setWidgetError(null);
      if (!code && !linkCodeMutation.isPending) {
        linkCodeMutation.mutate();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Telegram Login Widget — ربط فوري بالحساب الحالي
  const widgetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !TG_WIDGET_ENABLED || !widgetRef.current) return;
    window.onTelegramLinkAuth = (user) => {
      setWidgetError(null);
      linkWidgetMutation.mutate(user);
    };
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", TG_BOT);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "14");
    script.setAttribute("data-onauth", "onTelegramLinkAuth(user)");
    widgetRef.current.innerHTML = "";
    widgetRef.current.appendChild(script);
    return () => {
      delete window.onTelegramLinkAuth;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const checkLinked = async () => {
    setChecking(true);
    try {
      // تجاوز كاش auth.me (staleTime 5 دقائق) بقراءة مباشرة من الخادم
      await utils.auth.me.invalidate();
      const me = await utils.client.auth.me.query();
      if (me?.telegramId) {
        toast(t("تم ربط تليجرام بنجاح", "Telegram linked successfully"));
        onClose();
      } else {
        toast(t("لم يكتمل الربط بعد — أرسل الرمز للبوت ثم أعد التحقق", "Not linked yet — send the code to the bot, then re-check"), { kind: "info" });
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <GlassModal open={open} onClose={onClose} title={t("ربط حساب تليجرام", "Link Telegram account")}>
      {/* الطريقة الأولى: ربط فوري عبر ودجت تليجرام */}
      {TG_WIDGET_ENABLED && (
        <div className="mb-5">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-app">
            <Zap size={14} className="text-accent" />
            {t("ربط فوري بحساب تليجرام", "Instant link with your Telegram account")}
          </p>
          <div className="flex justify-center">
            {linkWidgetMutation.isPending ? (
              <Loader2 size={24} className="animate-spin text-app-3" />
            ) : (
              <div ref={widgetRef} className="flex justify-center" />
            )}
          </div>
          {widgetError && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-medium text-danger"
            >
              {widgetError}
            </motion.p>
          )}
          <div className="mt-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-xs text-app-3">{t("أو عبر رمز الربط", "or via link code")}</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>
        </div>
      )}

      {/* الطريقة الثانية: رمز الربط عبر البوت */}
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

      <div className="my-4 flex flex-col items-center gap-2">
        {code ? (
          <>
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
            <button
              onClick={copyCode}
              className="btn-glass !px-3 !py-1.5 text-xs"
              aria-label={t("نسخ الرمز", "Copy code")}
            >
              {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
              {copied ? t("نُسخ!", "Copied!") : t("نسخ الرمز", "Copy code")}
            </button>
          </>
        ) : (
          <Loader2 size={24} className="animate-spin text-app-3" />
        )}
      </div>

      <a
        href={code ? `https://t.me/${TG_BOT}?start=${code}` : `https://t.me/${TG_BOT}`}
        target="_blank"
        rel="noreferrer"
        className="btn-glass w-full !py-2.5 text-sm"
      >
        <Send size={15} />
        {t("فتح البوت في تليجرام", "Open bot in Telegram")}
      </a>

      <p className="glass mt-3 !rounded-xl px-3 py-2 text-[11.5px] leading-relaxed text-app-3">
        {t(
          "الكود صالح 10 دقائق ويُستخدم مرة واحدة. إذا رد البوت «غير موجود»: ولّد كودًا جديدًا وأرسله فورًا.",
          "The code is valid for 10 minutes and can be used once. If the bot replies “not found”: generate a new code and send it immediately.",
        )}
      </p>

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
