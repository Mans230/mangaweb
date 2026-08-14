/**
 * زر Telegram Login Widget الرسمي — يحمّل telegram-widget.js ويستدعي
 * auth.telegramLogin عند نجاح المصادقة. لا يظهر إطلاقاً بدون
 * VITE_TELEGRAM_BOT_USERNAME (أو botUsername ممرّر).
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";

export type TelegramAuthPayload = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

type CallbackStore = Record<string, ((user: TelegramAuthPayload) => void) | undefined>;

const ENV_BOT = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;

let callbackSeq = 0;

interface TelegramLoginButtonProps {
  /** اسم البوت — الافتراضي من VITE_TELEGRAM_BOT_USERNAME */
  botUsername?: string | null;
  /** معالج مخصص — الافتراضي: auth.telegramLogin ثم إبطال الكاش */
  onAuth?: (user: TelegramAuthPayload) => void;
  onError?: (message: string) => void;
  /** يُستدعى عند فشل تحميل الودجت (محجوب/شبكة) */
  onWidgetFailed?: () => void;
  size?: "large" | "medium" | "small";
  className?: string;
}

export default function TelegramLoginButton({
  botUsername,
  onAuth,
  onError,
  onWidgetFailed,
  size = "large",
  className,
}: TelegramLoginButtonProps) {
  const bot = botUsername ?? ENV_BOT ?? null;
  const containerRef = useRef<HTMLDivElement>(null);
  const [callbackName] = useState(() => `onTelegramAuth_${++callbackSeq}`);
  const utils = trpc.useUtils();

  const loginMut = trpc.auth.telegramLogin.useMutation({
    onSuccess: () => {
      void utils.invalidate();
    },
    onError: (e) => onError?.(e.message),
  });

  // مرجع ثابت لأحدث معالج حتى لا يعاد تحميل الودجت مع كل render
  const handlerRef = useRef<(u: TelegramAuthPayload) => void>(() => {});
  handlerRef.current = (u) => (onAuth ? onAuth(u) : loginMut.mutate(u));
  const failedRef = useRef<(() => void) | undefined>(undefined);
  failedRef.current = onWidgetFailed;

  useEffect(() => {
    const container = containerRef.current;
    if (!bot || !container) return;
    const store = window as unknown as CallbackStore;
    store[callbackName] = (user) => handlerRef.current(user);
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", bot);
    script.setAttribute("data-size", size);
    script.setAttribute("data-radius", "14");
    script.setAttribute("data-onauth", `${callbackName}(user)`);
    script.setAttribute("data-request-access", "write");
    script.onerror = () => failedRef.current?.();
    container.innerHTML = "";
    container.appendChild(script);
    // بعد 5 ثوانٍ: إن لم يُنشأ iframe فالودجت فشل silently
    const timeout = window.setTimeout(() => {
      if (!container.querySelector("iframe")) failedRef.current?.();
    }, 5000);
    return () => {
      window.clearTimeout(timeout);
      delete store[callbackName];
    };
  }, [bot, size, callbackName]);

  if (!bot) return null;

  return (
    <div className={className ?? "flex justify-center"}>
      <div ref={containerRef} className="flex justify-center" />
      {loginMut.isPending && (
        <span className="sr-only" role="status">
          جارٍ تسجيل الدخول عبر تليجرام…
        </span>
      )}
    </div>
  );
}
