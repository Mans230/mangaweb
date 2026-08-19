import { useLanguage } from "@/components/LanguageProvider";
import Reactions from "@/components/Reactions";
import CommentsSection from "@/components/comments/CommentsSection";

interface ChapterCommentsProps {
  mangaId: number | null;
  chapterId: number | null;
  /** توفّر معرّفات قاعدة البيانات (وضع API) */
  fromApi: boolean;
  chapterNumber: number;
  onTotalChange?: (total: number) => void;
}

/**
 * تعليقات الفصل داخل القارئ — رياكشنات هذا الفصل + نظام التعليقات المشترك
 * (ردود، لايك/ديسلايك، حظر، إبلاغ) نفسه المستخدم في صفحة المانجا.
 */
export default function ChapterComments({
  mangaId,
  chapterId,
  fromApi,
  chapterNumber,
  onTotalChange,
}: ChapterCommentsProps) {
  const { t } = useLanguage();

  if (!fromApi || mangaId === null || chapterId === null) {
    return (
      <section className="mx-3 mb-28 md:mx-0">
        <p className="py-10 text-center text-sm text-app-3">
          {t("التعليقات غير متاحة لهذا الفصل", "Comments are unavailable for this chapter")}
        </p>
      </section>
    );
  }

  return (
    <section className="mx-3 mb-28 md:mx-0" aria-label={t("تعليقات الفصل", "Chapter comments")}>
      <div className="mb-4">
        <Reactions
          targetType="chapter"
          targetId={chapterId}
          title={t("ما رأيك في هذا الفصل؟", "What did you think of this chapter?")}
        />
      </div>
      <CommentsSection
        mangaId={mangaId}
        chapterId={chapterId}
        onTotalChange={onTotalChange}
        title={t(`تعليقات الفصل ${chapterNumber}`, `Chapter ${chapterNumber} comments`)}
      />
    </section>
  );
}
