/**
 * زر Telegram Login Widget الرسمي — بناء جديد من الصفر.
 *
 * يحمّل telegram-widget.js مرة واحدة، ويربط callback عالمي فريد،
 * ويكشف الفشل الصامت (حجب المتصفح/الشبكة) خلال 4 ثوانٍ عبر onWidgetFailed.
 * لا يُعرض شيء بدون botUsername.
 */
import { useEffect, useRef } from "react";

export type TelegramAuthPayload = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

const WIDGET_SRC = "https://telegram.org/js/telegram-widget.js?22";
const WIDGET_FAIL_MS = 4000;

let seq = 0;

interface TelegramLoginButtonProps {
  /** اسم البوت (بدون @) — من auth.providers */
  botUsername?: string | null;
  /** يُستدعى بحمولة تليجرام الموقّعة عند نجاح المصادقة */
  onAuth: (user: TelegramAuthPayload) => void;
  /** يُستدعى عند فشل تحميل الودجت (محجوب/شبكة) لعرض بديل */
  onWidgetFailed?: () => void;
  size?: "large" | "medium" | "small";
  /** إظهار صورة المستخدم داخل الزر */
  userpic?: boolean;
  className?: string;
}

export default function TelegramLoginButton({
  botUsername,
  onAuth,
  onWidgetFailed,
  size = "large",
  userpic = true,
  className,
}: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // مراجع ثابتة لأحدث المعالجات — لا إعادة تحميل للودجت مع كل render
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;
  const onFailRef = useRef(onWidgetFailed);
  onFailRef.current = onWidgetFailed;

  useEffect(() => {
    const container = containerRef.current;
    if (!botUsername || !container) return;

    const callbackName = `telegramWidgetAuth_${++seq}`;
    const store = window as unknown as Record<string, ((u: TelegramAuthPayload) => void) | undefined>;
    store[callbackName] = (user) => onAuthRef.current(user);

    const script = document.createElement("script");
    script.src = WIDGET_SRC;
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", size);
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-onauth", `${callbackName}(user)`);
    script.setAttribute("data-request-access", "write");
    if (!userpic) script.setAttribute("data-userpic", "false");
    script.onerror = () => onFailRef.current?.();

    container.innerHTML = "";
    container.appendChild(script);

    // كشف الفشل الصامت: لو مفيش iframe اتبنى خلال المهلة يبقى الودجت محجوب
    const watchdog = window.setTimeout(() => {
      if (!container.querySelector("iframe")) onFailRef.current?.();
    }, WIDGET_FAIL_MS);

    return () => {
      window.clearTimeout(watchdog);
      delete store[callbackName];
      container.innerHTML = "";
    };
  }, [botUsername, size, userpic]);

  if (!botUsername) return null;

  return (
    <div className={className ?? "flex justify-center"} dir="ltr">
      <div ref={containerRef} className="flex min-h-10 items-center justify-center" />
    </div>
  );
}
