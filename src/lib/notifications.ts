/**
 * مركز الإشعارات — واجهة مكتوبة ضد عقد الباكند المتفق عليه:
 *
 *   trpc.notifications.list.useQuery()
 *     → { items: NotificationItem[], unreadCount: number }
 *   trpc.notifications.markRead.useMutation({ id?: number })
 *     — بدون id = تعليم الكل كمقروء.
 *
 * الباكند لم يسلّم راوتر notifications بعد، لذا نستخدم cast مرن هنا
 * (TODO: بعد تسليم api/router.ts الراوتر، احذف هذا الغلاف واستعمل
 * trpc.notifications مباشرة — الأسماء مطابقة للعقد).
 * عند فشل الاستعلام (الراوتر غير موجود): الجرس يظهر بدون badge ولا يكسر شيئاً.
 */
import { trpc } from "@/providers/trpc";

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  mangaId: number | null;
  chapterId: number | null;
  /** slug المانجا إن وفره الباكند لاحقاً (اختياري) */
  mangaSlug?: string | null;
  /** رقم الفصل إن وفره الباكند لاحقاً (اختياري) */
  chapterNumber?: number | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsListResult {
  items: NotificationItem[];
  unreadCount: number;
}

interface NotificationsApi {
  list: {
    useQuery: (
      input?: void,
      opts?: { retry?: boolean; enabled?: boolean; refetchInterval?: number },
    ) => {
      data: NotificationsListResult | undefined;
      isLoading: boolean;
      isError: boolean;
      refetch: () => Promise<unknown>;
    };
  };
  markRead: {
    useMutation: (opts?: {
      onSuccess?: () => void;
    }) => {
      mutate: (input: { id?: number }) => void;
      isPending: boolean;
    };
  };
}

// cast مرن حتى يسلّم الباكند trpc.notifications بنفس الأسماء
const api = (trpc as unknown as { notifications: NotificationsApi }).notifications;

export function useNotificationsList(enabled: boolean) {
  return api.list.useQuery(undefined, {
    retry: false,
    enabled,
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead(onSuccess?: () => void) {
  return api.markRead.useMutation({ onSuccess });
}
