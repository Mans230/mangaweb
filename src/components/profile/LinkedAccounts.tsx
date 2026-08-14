import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, Check, Copy, KeyRound, Link2, Loader2, Mail, RefreshCw, Send, Unlink, Zap } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useToast } from "@/components/library/toast";
import GlassModal from "@/components/library/GlassModal";
import PasswordResetHelp from "@/components/auth/PasswordResetHelp";
import TelegramLoginButton from "@/components/auth/TelegramLoginButton";
import { trpc } from "@/providers/trpc";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

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
  /** البريد موثّق بكود (emailVerifiedAt) */
  emailVerified?: boolean;
  telegramLinked: boolean;
  telegramUsername?: string | null;
  googleLinked?: boolean;
}

/** شارة حالة موحّدة: مرتبط (أخضر) / غير مرتبط (رمادي) */
function StatusBadge({ linked, label }: { linked: boolean; label?: string }) {
  const { t } = useLanguage();
  return linked ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10.5px] font-bold text-success">
      <BadgeCheck size={11} />
      {label ?? t("مرتبط", "Linked")}
    </span>
  ) : (
    <span className="glass-chip inline-flex shrink-0 items-center !py-0.5 text-[10.5px] font-bold text-app-3">
      {label ?? t("غير مرتبط", "Not linked")}
    </span>
  );
}

/** كارت حساب مربوط: صف علوي (أيقونة + اسم + شارة) ثم وصف ثم زر واحد — بلا أي تداخل */
function AccountCard({
  icon,
  title,
  badge,
  desc,
  action,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  badge: React.ReactNode;
  desc: React.ReactNode;
  action: React.ReactNode;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, ease: EASE, delay }}
      className="glass flex flex-col gap-3 !rounded-2xl p-4"
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-app">{title}</span>
        {badge}
      </div>
      <p className="text-[11.5px] leading-relaxed text-app-3">{desc}</p>
      <div className="flex justify-end">{action}</div>
    </motion.div>
  );
}

const cardIconCls = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl";

export default function LinkedAccounts({ email, emailVerified = false, telegramLinked, telegramUsername, googleLinked = false }: LinkedAccountsProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [tgModal, setTgModal] = useState(false);
  const [resetHelpOpen, setResetHelpOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  // اسم بوت تليجرام من الخادم (auth.providers) — لا متغيرات build-time
  const providersQ = trpc.auth.providers.useQuery(undefined, {
    staleTime: Infinity,
    retry: false,
  });
  const tgBot =
    (providersQ.data as { telegramBotUsername?: string | null } | undefined)
      ?.telegramBotUsername ?? null;

  const unlinkMutation = trpc.auth.unlinkTelegram.useMutation({
    onSuccess: () => {
      void utils.auth.me.invalidate();
      toast(t("أُلغي ربط تليجرام", "Telegram unlinked"));
    },
    onError: (e) =>
      toast(e.message || t("تعذر إلغاء الربط — حاول مجدداً", "Could not unlink — try again"), { kind: "info" }),
  });

  /** زر ربط تليجرام: المودال يعرض الودجت الفوري إن كان اسم البوت متاحًا وإلا تدفق رمز الربط */
  const onTelegramLink = () => {
    if (!providersQ.isLoading && !tgBot) {
      toast(t("الربط الفوري بالودجت غير متاح حالياً — استخدم رمز الربط", "Instant widget linking is unavailable — use the link code"), { kind: "info" });
    }
    setTgModal(true);
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
        <AccountCard
          delay={0}
          icon={<span className={`${cardIconCls} bg-accent-2/20 text-accent-2`}><Send size={19} /></span>}
          title={t("تليجرام", "Telegram")}
          badge={<StatusBadge linked={telegramLinked} />}
          desc={
            telegramLinked && telegramUsername
              ? <span dir="ltr">@{telegramUsername}</span>
              : t("الربط يفعّل إشعارات الفصول الجديدة والتحميل الكامل.", "Linking enables new-chapter notifications and full downloads.")
          }
          action={
            telegramLinked ? (
              <button
                onClick={() => unlinkMutation.mutate()}
                disabled={unlinkMutation.isPending}
                className="btn-glass !px-4 !py-2 text-xs !text-danger !border-danger/40 disabled:opacity-60"
              >
                {unlinkMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Unlink size={13} />}
                {t("إلغاء الربط", "Unlink")}
              </button>
            ) : (
              <button onClick={onTelegramLink} className="btn-primary !px-4 !py-2 text-xs">
                <Link2 size={13} />
                {t("ربط بتليجرام", "Link Telegram")}
              </button>
            )
          }
        />

        {/* Google */}
        <AccountCard
          delay={0.07}
          icon={
            <span className={`${cardIconCls} bg-accent/15 text-accent`}>
              <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden>
                <path d="M21.35 11.1H12v2.9h5.35c-.5 2.4-2.55 3.9-5.35 3.9a5.9 5.9 0 1 1 0-11.8c1.5 0 2.85.55 3.9 1.45l2.2-2.2A7.9 7.9 0 1 0 12 19.9c4.55 0 7.7-3.2 7.7-7.7 0-.4-.05-.75-.15-1.1Z" />
              </svg>
            </span>
          }
          title={t("جوجل", "Google")}
          badge={<StatusBadge linked={googleLinked} />}
          desc={
            googleLinked
              ? t("حسابك مرتبط بجوجل — يمكنك الدخول به مباشرة.", "Your account is linked to Google — you can sign in with it directly.")
              : t("سجّل دخولك عبر جوجل ليتم الربط تلقائياً.", "Sign in with Google to link automatically.")
          }
          action={
            googleLinked ? (
              <span className="glass-chip !py-1.5 text-[11px] font-bold text-success">
                <BadgeCheck size={12} />
                {t("جاهز للدخول", "Ready to sign in")}
              </span>
            ) : (
              <a href="/api/auth/google" className="btn-glass !px-4 !py-2 text-xs">
                <Link2 size={13} />
                {t("ربط عبر جوجل", "Link via Google")}
              </a>
            )
          }
        />

        {/* Email */}
        <AccountCard
          delay={0.14}
          icon={<span className={`${cardIconCls} bg-success/15 text-success`}><Mail size={19} /></span>}
          title={t("البريد الإلكتروني", "Email")}
          badge={
            emailVerified ? (
              <StatusBadge linked label={t("موثّق ✅", "Verified ✅")} />
            ) : telegramLinked ? (
              <StatusBadge linked label={t("موثّق عبر تليجرام", "Verified via Telegram")} />
            ) : (
              <StatusBadge linked={false} label={t("غير موثّق", "Not verified")} />
            )
          }
          desc={<span dir="ltr" className="break-all">{email ?? "—"}</span>}
          action={
            <div className="flex items-center gap-2">
              {!emailVerified && email && (
                <button
                  onClick={() => setVerifyOpen(true)}
                  className="btn-primary !px-4 !py-2 text-xs"
                >
                  <BadgeCheck size={13} />
                  {t("توثيق", "Verify")}
                </button>
              )}
              <button
                onClick={() => toast(t("تغيير كلمة المرور يتم عبر بريدك", "Password change happens via email"), { kind: "info" })}
                className="btn-glass !px-4 !py-2 text-xs"
              >
                <KeyRound size={13} />
                {t("تغيير كلمة المرور", "Change password")}
              </button>
            </div>
          }
        />
      </div>

      <TelegramModal open={tgModal} onClose={() => setTgModal(false)} botUsername={tgBot} />
      <EmailVerifyModal open={verifyOpen} onClose={() => setVerifyOpen(false)} />
      <PasswordResetHelp
        open={resetHelpOpen}
        onClose={() => setResetHelpOpen(false)}
        botUsername={tgBot}
      />
    </motion.section>
  );
}

/** مودال ربط تليجرام: ربط فوري عبر Telegram Login Widget أو رمز ربط يُرسله المستخدم للبوت. */
function TelegramModal({ open, onClose, botUsername: tgBot }: { open: boolean; onClose: () => void; botUsername: string | null }) {
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

  // الودجت الرسمي عبر auth.telegramLogin — الباكند يربط تلقائياً عند وجود جلسة
  const linkWidgetMutation = trpc.auth.telegramLogin.useMutation({
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

  // Telegram Login Widget — ربط فوري بالحساب الحالي (المكوّن المشترك)

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
      {/* الطريقة الأولى: ربط فوري عبر ودجت تليجرام — يتطلب اسم البوت من الخادم */}
      {tgBot && (
        <div className="mb-5">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-app">
            <Zap size={14} className="text-accent" />
            {t("ربط فوري بحساب تليجرام", "Instant link with your Telegram account")}
          </p>
          <div className="flex justify-center">
            {linkWidgetMutation.isPending ? (
              <Loader2 size={24} className="animate-spin text-app-3" />
            ) : (
              <TelegramLoginButton
                botUsername={tgBot}
                onAuth={(u) => {
                  setWidgetError(null);
                  linkWidgetMutation.mutate(u);
                }}
              />
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

      {tgBot && (
        <a
          href={code ? `https://t.me/${tgBot}?start=${code}` : `https://t.me/${tgBot}`}
          target="_blank"
          rel="noreferrer"
          className="btn-glass w-full !py-2.5 text-sm"
        >
          <Send size={15} />
          {t("فتح البوت في تليجرام", "Open bot in Telegram")}
        </a>
      )}

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

/** مودال توثيق البريد — إرسال كود ثم إدخاله للتحقق */
function EmailVerifyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  // devCode يظهر فقط خارج production (بلا SMTP) لتسهيل التجربة
  const [devCode, setDevCode] = useState<string | null>(null);

  const sendMut = trpc.auth.sendEmailCode.useMutation({
    onSuccess: (data) => {
      setSent(true);
      const dev = (data as { devCode?: string }).devCode;
      if (dev) setDevCode(dev);
      toast(t("أُرسل كود التوثيق لبريدك", "Verification code sent to your email"));
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });
  const verifyMut = trpc.auth.verifyEmail.useMutation({
    onSuccess: () => {
      void utils.auth.me.invalidate();
      toast(t("تم توثيق بريدك بنجاح ✅", "Email verified successfully ✅"));
      onClose();
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  useEffect(() => {
    if (open && !sent && !sendMut.isPending) {
      sendMut.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const verify = () => {
    if (code.trim().length < 4 || verifyMut.isPending) return;
    verifyMut.mutate({ code: code.trim() });
  };

  return (
    <GlassModal open={open} onClose={onClose} title={t("توثيق البريد الإلكتروني", "Verify your email")}>
      <p className="text-sm leading-6 text-app-2">
        {t(
          "أرسلنا كوداً من 6 أرقام إلى بريدك — أدخله هنا لتوثيق حسابك.",
          "We sent a 6-digit code to your email — enter it here to verify your account.",
        )}
      </p>
      {devCode && (
        <p className="glass mt-3 !rounded-xl px-3 py-2 text-center text-xs text-app-3">
          {t("وضع التطوير — الكود:", "Dev mode — code:")}{" "}
          <span className="font-bold tracking-[0.3em]" dir="ltr">{devCode}</span>
        </p>
      )}
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={(e) => e.key === "Enter" && verify()}
        dir="ltr"
        inputMode="numeric"
        placeholder="••••••"
        className="input-glass mt-4 w-full text-center text-xl font-bold tracking-[0.4em]"
      />
      <button
        onClick={verify}
        disabled={code.length < 4 || verifyMut.isPending}
        className="btn-primary mt-4 w-full !py-2.5 text-sm disabled:opacity-50"
      >
        {verifyMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} />}
        {t("تأكيد التوثيق", "Confirm verification")}
      </button>
      <button
        onClick={() => sendMut.mutate()}
        disabled={sendMut.isPending}
        className="btn-glass mt-2 w-full !py-2 text-xs disabled:opacity-50"
      >
        {sendMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        {t("إعادة إرسال الكود", "Resend code")}
      </button>
    </GlassModal>
  );
}
