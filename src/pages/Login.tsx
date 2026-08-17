import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, LogIn, Send, UserPlus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/components/LanguageProvider";
import PasswordResetHelp from "@/components/auth/PasswordResetHelp";
import TelegramLoginButton from "@/components/auth/TelegramLoginButton";
import { ToastViewport, useToast } from "@/components/library/toast";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const REF_KEY = "zeko_ref";

type TelegramAuthPayload = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramAuthPayload) => void;
  }
}

type Mode = "login" | "register";

export default function Login() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const refParam = searchParams.get("ref");

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [widgetFailed, setWidgetFailed] = useState(false);
  const [resetHelpOpen, setResetHelpOpen] = useState(false);
  const { t } = useLanguage();
  const { toast } = useToast();

  // كود الدعوة من رابط ?ref= — يُخزَّن محلياً ليصمد عبر تدفقات OAuth/تليجرام
  useEffect(() => {
    if (refParam && /^\d+$/.test(refParam)) {
      localStorage.setItem(REF_KEY, refParam);
    }
  }, [refParam]);

  const providersQ = trpc.auth.providers.useQuery(undefined, {
    staleTime: Infinity,
    retry: false,
  });
  const googleEnabled = providersQ.data?.google ?? false;
  // اسم البوت يُقرأ من الخادم فقط (auth.providers) — لا اعتماد على متغيرات build-time
  const providers = providersQ.data as
    | {
        telegramBotUsername?: string | null;
        telegramBotId?: string | null;
      }
    | undefined;
  const botUsername = providers?.telegramBotUsername ?? null;
  const botId = providers?.telegramBotId ?? null;
  // لا نخفي الزر أثناء تحميل providers — نعرض skeleton حتى تصل الإجابة
  const telegramEnabled = providersQ.data?.telegram ?? true;
  const telegramOAuthUrl = botId
    ? `https://oauth.telegram.org/auth?bot_id=${botId}&origin=${encodeURIComponent(
        window.location.origin,
      )}&request_access=write&return_to=${encodeURIComponent(
        window.location.origin + "/login",
      )}`
    : null;
  // فولباك دائم متاح طالما اسم البوت معروف — يفتح محادثة البوت مباشرة
  const telegramFallbackUrl = botUsername ? `https://t.me/${botUsername}` : null;

  const onSuccess = async () => {
    setFormError(null);
    await utils.invalidate();
    navigate("/", { replace: true });
  };

  const onError = (message?: string) => {
    setFormError(message ?? "حدث خطأ غير متوقع — حاول مرة أخرى");
  };

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess,
    onError: (e) => onError(
      e.data?.code === "UNAUTHORIZED"
        ? "البريد الإلكتروني أو كلمة المرور غير صحيحة"
        : e.message,
    ),
  });
  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      localStorage.removeItem(REF_KEY);
      void onSuccess();
    },
    onError: (e) => onError(
      e.data?.code === "CONFLICT"
        ? "يوجد حساب مسجل بهذا البريد الإلكتروني"
        : e.message,
    ),
  });
  const telegramMutation = trpc.auth.telegramLogin.useMutation({
    onSuccess,
    onError: (e) => {
      onError(e.message);
      toast(t(
        "تعذر تسجيل الدخول عبر تليجرام — تأكد أن البوت مفعّل أو جرّب طريقة أخرى",
        "Could not sign in with Telegram — make sure the bot is enabled or try another method",
      ), { kind: "info" });
    },
  });

  const busy =
    loginMutation.isPending ||
    registerMutation.isPending ||
    telegramMutation.isPending;

  // Telegram Login Widget — المكوّن المشترك يكشف الفشل الصامت عبر onWidgetFailed

  // معالجة العودة من OAuth تليجرام — صيغتان:
  // 1) hash fragment (#tgAuthResult=<base64 JSON>) — صيغة الرجوع الحالية من oauth.telegram.org
  // 2) query params (?id=...&hash=...&auth_date=...)
  useEffect(() => {
    const m = /[#&]tgAuthResult=([^&]+)/.exec(window.location.hash);
    if (m) {
      try {
        const decoded = JSON.parse(
          decodeURIComponent(escape(window.atob(decodeURIComponent(m[1])))),
        ) as TelegramAuthPayload;
        if (decoded?.id && decoded?.hash && decoded?.auth_date) {
          telegramMutation.mutate(decoded);
        } else {
          onError("بيانات تليجرام ناقصة — حاول مجدداً");
        }
      } catch {
        onError("تعذّرت قراءة بيانات تليجرام — حاول مجدداً");
      }
      window.history.replaceState(null, "", "/login");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const hash = params.get("hash");
    const authDate = params.get("auth_date");
    if (!id || !hash || !authDate) return;
    const payload: TelegramAuthPayload = {
      id: Number(id),
      first_name: params.get("first_name") ?? "",
      auth_date: Number(authDate),
      hash,
    };
    const lastName = params.get("last_name");
    const username = params.get("username");
    const photoUrl = params.get("photo_url");
    if (lastName) payload.last_name = lastName;
    if (username) payload.username = username;
    if (photoUrl) payload.photo_url = photoUrl;
    telegramMutation.mutate(payload);
    window.history.replaceState(null, "", "/login");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirect if already signed in
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const validate = (): string | null => {
    if (mode === "register" && name.trim().length === 0) {
      return "الاسم مطلوب";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return "أدخل بريداً إلكترونياً صحيحاً";
    }
    if (password.length < 8) {
      return "كلمة المرور يجب ألا تقل عن 8 أحرف";
    }
    return null;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    const payload = { email: email.trim().toLowerCase(), password };
    if (mode === "login") {
      loginMutation.mutate(payload);
    } else {
      const refCode =
        refParam && /^\d+$/.test(refParam)
          ? refParam
          : (localStorage.getItem(REF_KEY) ?? undefined);
      registerMutation.mutate({
        ...payload,
        name: name.trim(),
        ...(refCode ? { refCode } : {}),
      });
    }
  };

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      {/* ambient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="animate-blob-a absolute -top-24 start-8 h-72 w-72 rounded-full bg-primary-soft/25 blur-3xl" />
        <div className="animate-blob-b absolute bottom-0 end-4 h-80 w-80 rounded-full bg-accent/15 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
        className="glass-strong relative w-full max-w-md p-6 md:p-8"
      >
        <div className="mb-6 text-center">
          <h1 className="font-display gradient-text text-2xl font-extrabold md:text-3xl">
            {mode === "login" ? "أهلاً بعودتك" : "انضم إلى زيكو مانجا"}
          </h1>
          <p className="mt-2 text-sm text-app-3">
            {mode === "login"
              ? "سجّل الدخول لمتابعة قراءتك ومكتبتك"
              : "أنشئ حسابك واحفظ مكتبتك وتقدّمك في القراءة"}
          </p>
        </div>

        {/* Tabs */}
        <div className="glass mb-6 grid grid-cols-2 gap-1 !rounded-2xl p-1" role="tablist">
          {(
            [
              { key: "login", label: "تسجيل الدخول", icon: LogIn },
              { key: "register", label: "حساب جديد", icon: UserPlus },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={mode === tab.key}
              onClick={() => {
                setMode(tab.key);
                setFormError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all ${
                mode === tab.key
                  ? "gradient-primary text-white shadow"
                  : "text-app-2 hover:text-app"
              }`}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {mode === "register" && (
            <div>
              <label htmlFor="name" className="mb-1.5 block text-xs font-bold text-app-2">
                الاسم
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسمك المعروض"
                className="input-glass w-full"
                autoComplete="name"
                required
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-bold text-app-2">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-glass w-full"
              dir="ltr"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-bold text-app-2">
              كلمة المرور
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8 أحرف على الأقل"
                className="input-glass w-full !pe-11"
                dir="ltr"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-app-3 transition-colors hover:text-app"
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {mode === "login" && (
              <button
                type="button"
                onClick={() => setResetHelpOpen(true)}
                className="mt-1.5 text-xs font-medium text-app-3 transition-colors hover:text-accent"
              >
                {t("نسيت كلمة المرور؟", "Forgot your password?")}
              </button>
            )}
          </div>

          {formError && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-medium text-danger"
            >
              {formError}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-primary w-full !py-3 text-sm disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : mode === "login" ? (
              <LogIn size={16} />
            ) : (
              <UserPlus size={16} />
            )}
            {mode === "login" ? "تسجيل الدخول" : "إنشاء الحساب"}
          </button>
          {mode === "register" && (
            <p className="text-center text-[11.5px] leading-relaxed text-app-3">
              {t(
                "بعد التسجيل وثّق حسابك بربط تليجرام من صفحة «حسابي» لتفعيل الاستعادة والإشعارات.",
                "After signing up, verify your account by linking Telegram from the “My Account” page to enable recovery and notifications.",
              )}
            </p>
          )}
        </form>

        {/* منطقة مزوّدي الدخول تظهر دائماً — skeleton أثناء التحميل ثم الودجت ثم الزر البديل */}
        {(providersQ.isLoading || telegramEnabled || googleEnabled) && (
          <>
            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--border)]" />
              <span className="text-xs text-app-3">أو تابع عبر</span>
              <span className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <div className="flex flex-col items-center gap-3">
              {providersQ.isLoading ? (
                <div className="skeleton h-11 w-full max-w-72 !rounded-xl" aria-hidden />
              ) : telegramEnabled ? (
                <div className="flex w-full flex-col items-center gap-2">
                  {!widgetFailed && botUsername && (
                    <TelegramLoginButton
                      botUsername={botUsername}
                      onAuth={(u) => telegramMutation.mutate(u)}
                      onWidgetFailed={() => setWidgetFailed(true)}
                    />
                  )}
                  {(widgetFailed || !botUsername) && (telegramOAuthUrl ?? telegramFallbackUrl) && (
                    <a
                      href={(telegramOAuthUrl ?? telegramFallbackUrl)!}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#229ED9] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
                    >
                      <Send size={16} />
                      الدخول عبر تليجرام
                    </a>
                  )}
                  {telegramFallbackUrl ? (
                    <a
                      href={telegramFallbackUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11.5px] font-medium text-app-3 underline-offset-2 transition-colors hover:text-accent hover:underline"
                    >
                      {t("لا يظهر زر تليجرام؟ اضغط هنا", "Telegram button not showing? Click here")}
                    </a>
                  ) : (
                    !botUsername && (
                      <p className="text-center text-[11.5px] text-app-3">
                        {t(
                          "الدخول عبر تليجرام غير متاح حالياً — استخدم البريد الإلكتروني",
                          "Telegram sign-in is unavailable right now — use email instead",
                        )}
                      </p>
                    )
                  )}
                </div>
              ) : null}

              {googleEnabled && (
                <a href="/api/auth/google" className="btn-glass w-full !py-2.5 text-sm">
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden>
                    <path d="M21.35 11.1H12v2.9h5.35c-.5 2.4-2.55 3.9-5.35 3.9a5.9 5.9 0 1 1 0-11.8c1.5 0 2.85.55 3.9 1.45l2.2-2.2A7.9 7.9 0 1 0 12 19.9c4.55 0 7.7-3.2 7.7-7.7 0-.4-.05-.75-.15-1.1Z" />
                  </svg>
                  المتابعة عبر جوجل
                </a>
              )}
            </div>
          </>
        )}
      </motion.div>

      <PasswordResetHelp
        open={resetHelpOpen}
        onClose={() => setResetHelpOpen(false)}
        botUsername={botUsername}
      />
      <ToastViewport />
    </div>
  );
}
