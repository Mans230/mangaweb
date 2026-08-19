import { useEffect, useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { ChevronDown, MessageSquareText, Send, Star, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/components/LanguageProvider";
import { useToast } from "@/components/library/toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { proxyImg, timeAgo } from "@/lib/manga";
import { renderWithSpoilers } from "@/lib/spoiler";
import { LOGIN_PATH } from "@/const";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const PAGE_SIZE = 10;
const MAX_LEN = 1000;

interface ReviewItem {
  id: number;
  userId: number;
  userName: string | null;
  avatarUrl: string | null;
  stars: number;
  text: string;
  createdAt: string | Date;
}

interface Props {
  mangaId: number;
  isEn?: boolean;
}

/** نجوم عرض فقط */
function StarsRow({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= value ? "fill-amber-400 text-amber-400" : "text-app-3"}
        />
      ))}
    </span>
  );
}

/**
 * قسم المراجعات النصية — يعتمد على engagement.reviews / myReview / rate(review) / deleteReview.
 * المسجّل يكتب مراجعة واحدة مع تقييمه (تُحدَّث عند إعادة النشر)، والزائر يرى دعوة تسجيل.
 */
export default function ReviewsSection({ mangaId, isEn = false }: Props) {
  const { t, lang } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const L = (ar: string, en: string) => (isEn ? en : t(ar, en));
  const tfmt = isEn ? "en" : lang;

  /* ---------- القائمة (تراكمية مع «عرض المزيد») ---------- */
  const [page, setPage] = useState(1);
  const [acc, setAcc] = useState<ReviewItem[]>([]);
  // إعادة ضبط عند تغيّر المانجا (render-adjust)
  const [accFor, setAccFor] = useState(mangaId);
  if (mangaId !== accFor) {
    setAccFor(mangaId);
    setPage(1);
    setAcc([]);
  }

  const reviewsQ = trpc.engagement.reviews.useQuery(
    { mangaId, page, limit: PAGE_SIZE },
    { retry: false },
  );
  useEffect(() => {
    const d = reviewsQ.data;
    if (!d) return;
    setAcc((prev) => {
      if (page === 1) return d.items as ReviewItem[];
      const seen = new Set(prev.map((r) => r.id));
      return [...prev, ...(d.items as ReviewItem[]).filter((r) => !seen.has(r.id))];
    });
  }, [reviewsQ.data, page]);

  const total = reviewsQ.data?.total ?? 0;
  const hasMore = acc.length < total;

  /* ---------- مراجعتي + المحرر ---------- */
  const myQ = trpc.engagement.myReview.useQuery(
    { mangaId },
    { enabled: isAuthenticated, retry: false },
  );
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");
  const [hoverStar, setHoverStar] = useState(0);
  // مزامنة أولية من الخادم (render-adjust)
  const [initFor, setInitFor] = useState<number | null>(null);
  if (!myQ.isLoading && initFor !== mangaId) {
    setInitFor(mangaId);
    setStars(myQ.data?.stars ?? 0);
    setText(myQ.data?.text ?? "");
  }

  const invalidate = () => {
    utils.engagement.reviews.invalidate();
    utils.engagement.myReview.invalidate();
    utils.engagement.getRating.invalidate();
  };

  const publishM = trpc.engagement.rate.useMutation({
    onSuccess: () => {
      toast(L("تم نشر تقييمك ومراجعتك", "Your rating and review are live"));
      invalidate();
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });
  const delM = trpc.engagement.deleteReview.useMutation({
    onSuccess: () => {
      setText("");
      toast(L("حُذفت مراجعتك (بقي تقييمك بالنجوم)", "Review deleted (star rating kept)"));
      invalidate();
    },
    onError: (e) => toast(e.message, { kind: "info" }),
  });

  const publish = () => {
    if (stars < 1) {
      toast(L("اختار عدد النجوم أولاً", "Pick a star rating first"), { kind: "info" });
      return;
    }
    const trimmed = text.trim();
    publishM.mutate({ mangaId, stars, review: trimmed ? trimmed : undefined });
  };

  const pending = publishM.isPending || delM.isPending;
  const hasMyReview = !!(myQ.data?.text);

  return (
    <section className="relative z-10 mx-4 mt-10 md:mx-auto md:max-w-6xl">
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        {/* الترويسة */}
        <div className="mb-5 flex items-center gap-3">
          <span className="gradient-primary flex h-10 w-10 items-center justify-center rounded-2xl">
            <MessageSquareText size={18} />
          </span>
          <h2 className="font-display text-lg font-extrabold text-app">
            {L("المراجعات", "Reviews")}
          </h2>
          {total > 0 && (
            <span className="glass-chip px-2.5 py-1 text-[11px] font-bold tabular-nums" dir="ltr">
              {total}
            </span>
          )}
        </div>

        {/* المحرر / دعوة التسجيل */}
        {isAuthenticated ? (
          <div className="glass mb-6 rounded-3xl p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold text-app-2">
                {L("تقييمك:", "Your rating:")}
              </span>
              <span className="flex items-center gap-1" dir="ltr">
                {[1, 2, 3, 4, 5].map((i) => {
                  const active = i <= (hoverStar || stars);
                  return (
                    <button
                      key={i}
                      type="button"
                      onMouseEnter={() => setHoverStar(i)}
                      onMouseLeave={() => setHoverStar(0)}
                      onClick={() => setStars(i)}
                      aria-label={`${i} ${L("نجوم", "stars")}`}
                      className="transition-transform hover:scale-110"
                    >
                      <Star
                        size={22}
                        className={active ? "fill-amber-400 text-amber-400" : "text-app-3"}
                      />
                    </button>
                  );
                })}
              </span>
              {stars > 0 && (
                <span className="text-[11px] font-semibold tabular-nums text-app-3" dir="ltr">
                  {stars}/5
                </span>
              )}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
              rows={3}
              maxLength={MAX_LEN}
              placeholder={L(
                "اكتب مراجعتك (اختياري) — بدون روابط أو حرق للأحداث…",
                "Write your review (optional) — no links or spoilers…",
              )}
              className="input-glass mt-3 w-full resize-none !rounded-2xl px-4 py-3 text-sm leading-7"
            />
            <p className="mt-1.5 text-[11px] text-app-3">
              {L(
                "لإخفاء الحرق ضع النص بين ||…|| — يظهر مموّهاً حتى يضغطه القارئ.",
                "Hide spoilers by wrapping text in ||…|| — shown blurred until the reader taps.",
              )}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={publish}
                disabled={pending}
                className="btn-primary flex items-center gap-2 !px-5 !py-2.5 text-xs font-bold disabled:opacity-50"
              >
                <Send size={14} className={isEn ? "" : "rtl:-scale-x-100"} />
                {pending
                  ? L("جارٍ النشر…", "Publishing…")
                  : hasMyReview
                    ? L("تحديث المراجعة", "Update review")
                    : L("انشر التقييم", "Publish")}
              </button>
              {hasMyReview && (
                <button
                  type="button"
                  onClick={() => delM.mutate({ mangaId })}
                  disabled={pending}
                  className="btn-glass flex items-center gap-1.5 !px-4 !py-2.5 text-xs font-bold text-danger disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  {L("حذف مراجعتي", "Delete my review")}
                </button>
              )}
              <span className="ms-auto text-[10.5px] tabular-nums text-app-3" dir="ltr">
                {text.length}/{MAX_LEN}
              </span>
            </div>
          </div>
        ) : (
          <div className="glass mb-6 flex flex-wrap items-center gap-3 rounded-3xl p-5">
            <p className="text-sm text-app-2">
              {L("سجّل دخولك لتكتب مراجعتك وتقيّم العمل", "Log in to write a review and rate this title")}
            </p>
            <Link to={LOGIN_PATH} className="btn-primary ms-auto !px-5 !py-2.5 text-xs font-bold">
              {L("تسجيل الدخول", "Log in")}
            </Link>
          </div>
        )}

        {/* القائمة */}
        {reviewsQ.isLoading && acc.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-24 !rounded-3xl" />
            ))}
          </div>
        ) : acc.length === 0 ? (
          <div className="glass rounded-3xl p-8 text-center">
            <p className="text-sm font-semibold text-app-2">
              {L("لا مراجعات بعد", "No reviews yet")}
            </p>
            <p className="mt-1 text-xs text-app-3">
              {L("كن أول من يشارك رأيه", "Be the first to share your thoughts")}
            </p>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {acc.map((r, i) => {
                const mine = user?.id === r.userId;
                return (
                  <motion.li
                    key={r.id}
                    initial={{ y: 16, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true, margin: "-5%" }}
                    transition={{ duration: 0.4, ease: EASE, delay: (i % PAGE_SIZE) * 0.04 }}
                    className={`glass rounded-3xl p-4 ${mine ? "border-primary/40" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9">
                        <AvatarImage src={proxyImg(r.avatarUrl) || undefined} alt={r.userName ?? ""} />
                        <AvatarFallback className="text-xs font-bold">
                          {(r.userName ?? "?").trim().charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-bold text-app">
                            {r.userName ?? L("مستخدم", "User")}
                          </span>
                          {mine && (
                            <span className="glass-chip px-2 py-0.5 text-[10px] font-bold text-primary">
                              {L("مراجعتك", "You")}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <StarsRow value={r.stars} />
                          <span className="text-[10.5px] text-app-3">
                            {timeAgo(r.createdAt, tfmt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 whitespace-pre-line text-sm leading-7 text-app-2">
                      {renderWithSpoilers(r.text)}
                    </p>
                  </motion.li>
                );
              })}
            </ul>
            {hasMore && (
              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={reviewsQ.isFetching}
                  className="btn-glass inline-flex items-center gap-2 !px-6 !py-2.5 text-xs font-bold disabled:opacity-50"
                >
                  <ChevronDown size={14} />
                  {reviewsQ.isFetching ? L("جارٍ التحميل…", "Loading…") : L("عرض المزيد", "Load more")}
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </section>
  );
}
