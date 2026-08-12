import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, LogIn, UserPlus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const TELEGRAM_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as
  | string
  | undefined;

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

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const providersQ = trpc.auth.providers.useQuery(undefined, {
    staleTime: Infinity,
    retry: false,
  });
  const googleEnabled = providersQ.data?.google ?? false;
  const telegramEnabled =
    Boolean(TELEGRAM_BOT_USERNAME) && (providersQ.data?.telegram ?? true);

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
    onSuccess,
    onError: (e) => onError(
      e.data?.code === "CONFLICT"
        ? "يوجد حساب مسجل بهذا البريد الإلكتروني"
        : e.message,
    ),
  });
  const telegramMutation = trpc.auth.telegramLogin.useMutation({
    onSuccess,
    onError: (e) => onError(e.message),
  });

  const busy =
    loginMutation.isPending ||
    registerMutation.isPending ||
    telegramMutation.isPending;

  // Telegram Login Widget
  const telegramRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!telegramEnabled || !TELEGRAM_BOT_USERNAME || !telegramRef.current) {
      return;
    }
    window.onTelegramAuth = (user) => telegramMutation.mutate(user);
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", TELEGRAM_BOT_USERNAME);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "14");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    telegramRef.current.innerHTML = "";
    telegramRef.current.appendChild(script);
    return () => {
      delete window.onTelegramAuth;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegramEnabled]);

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
      registerMutation.mutate({ ...payload, name: name.trim() });
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
        </form>

        {(telegramEnabled || googleEnabled) && (
          <>
            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--border)]" />
              <span className="text-xs text-app-3">أو تابع عبر</span>
              <span className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <div className="flex flex-col items-center gap-3">
              {telegramEnabled && (
                <div ref={telegramRef} className="flex justify-center" />
              )}

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
    </div>
  );
}
