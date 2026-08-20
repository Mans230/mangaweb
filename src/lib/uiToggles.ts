import { trpc } from "@/providers/trpc";

/**
 * مفاتيح إظهار/إخفاء أقسام الواجهة (يتحكم بها الأدمن من لوحة الإعدادات).
 * hideCommunities: إخفاء كل روابط وصفحات المجتمعات.
 * hideReels: إخفاء ريلز Fun (قسم الفيديوهات).
 * الافتراضي عند فشل الاستعلام: كل شيء ظاهر (لا كسر للواجهة).
 */
export interface TelegramCta {
  title?: string;
  body?: string;
  button?: string;
  url?: string;
  fontScale?: number;
}

export function useUiToggles(): {
  hideCommunities: boolean;
  hideReels: boolean;
  hideStore: boolean;
  /** رابط جروب المناقشة الخارجي — فارغ = الزر مخفي */
  communityGroupUrl: string;
  /** محتوى بطاقة تليجرام (يتحكم به الأدمن) — null = الافتراضي */
  telegramCta: TelegramCta | null;
} {
  const query = trpc.manga.uiToggles.useQuery(undefined, {
    retry: false,
    // كاش قصير + إعادة جلب عند العودة للتاب حتى يظهر تغيير الأدمن خلال ثوانٍ لا دقيقة
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
  });
  return {
    hideCommunities: query.data?.hideCommunities ?? false,
    hideReels: query.data?.hideReels ?? false,
    hideStore: query.data?.hideStore ?? false,
    communityGroupUrl: query.data?.communityGroupUrl ?? "",
    telegramCta: query.data?.telegramCta ?? null,
  };
}
