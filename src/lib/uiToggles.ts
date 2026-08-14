import { trpc } from "@/providers/trpc";

/**
 * مفاتيح إظهار/إخفاء أقسام الواجهة (يتحكم بها الأدمن من لوحة الإعدادات).
 * hideCommunities: إخفاء كل روابط وصفحات المجتمعات.
 * hideReels: إخفاء ريلز Fun (قسم الفيديوهات).
 * الافتراضي عند فشل الاستعلام: كل شيء ظاهر (لا كسر للواجهة).
 */
export function useUiToggles(): { hideCommunities: boolean; hideReels: boolean } {
  const query = trpc.manga.uiToggles.useQuery(undefined, {
    retry: false,
    staleTime: 60 * 1000,
  });
  return {
    hideCommunities: query.data?.hideCommunities ?? false,
    hideReels: query.data?.hideReels ?? false,
  };
}
