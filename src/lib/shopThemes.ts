import { useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";

/**
 * تطبيق ثيم المتجر المشترى — يضبط/يزيل سمة data-shop-theme على <html>،
 * وقيم CSS الخاصة بكل ثيم معرّفة في نهاية src/index.css.
 * يقبل itemKey كاملاً (مثل "theme_amoled") أو الاسم المختصر.
 */
export function applyShopTheme(itemKey: string | null): void {
  const root = document.documentElement;
  if (!itemKey) {
    root.removeAttribute("data-shop-theme");
    return;
  }
  root.setAttribute("data-shop-theme", itemKey.replace(/^theme_/, ""));
}

/**
 * هوك عام: يجلب الثيم المُفعَّل للمستخدم الحالي ويطبّقه تلقائياً،
 * وينظّف السمة عند تسجيل الخروج أو إزالة المكوّن.
 */
export function useShopTheme(): void {
  const { isAuthenticated } = useAuth();
  const mineQ = trpc.shop.mine.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
  const equipped = isAuthenticated ? (mineQ.data?.equippedTheme ?? null) : null;

  useEffect(() => {
    applyShopTheme(equipped);
    return () => applyShopTheme(null);
  }, [equipped]);
}
