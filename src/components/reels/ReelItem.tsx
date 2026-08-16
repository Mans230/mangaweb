/**
 * ريل واحد بملء الشاشة — فيديو يعمل/يتوقف تلقائياً حسب الظهور
 * (IntersectionObserver) ويسجّل مشاهدة بعد ٣ ثوانٍ من التشغيل الفعلي.
 */
import { useEffect, useRef, useState } from "react";
import { proxyImg } from "@/lib/manga";
import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Eye,
  Heart,
  MessageCircle,
  Play,
  Share2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/components/LanguageProvider";
import { useToast } from "@/components/library/toast";

export interface ReelFeedItem {
  id: number;
  videoUrl: string;
  caption: string | null;
  likesCount: number;
  viewsCount: number;
  createdAt: Date | string;
  liked: boolean;
  user: {
    id: number;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  manga: { id: number; title: string; slug: string } | null;
}

interface ReelItemProps {
  reel: ReelFeedItem;
  onOpenComments: (reel: ReelFeedItem) => void;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function ReelItem({ reel, onOpenComments }: ReelItemProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewedRef = useRef(false);
  const viewTimerRef = useRef<number | null>(null);

  const [liked, setLiked] = useState(reel.liked);
  const [likes, setLikes] = useState(reel.likesCount);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);

  const viewMut = trpc.reels.view.useMutation();
  const likeMut = trpc.reels.like.useMutation({
    onError: () => {
      setLiked(false);
      setLikes((v) => Math.max(0, v - 1));
    },
  });
  const unlikeMut = trpc.reels.unlike.useMutation({
    onError: () => {
      setLiked(true);
      setLikes((v) => v + 1);
    },
  });

  /* تشغيل/إيقاف تلقائي حسب الظهور + تسجيل مشاهدة بعد ٣ ثوانٍ */
  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root || !video) return;

    const clearViewTimer = () => {
      if (viewTimerRef.current !== null) {
        window.clearTimeout(viewTimerRef.current);
        viewTimerRef.current = null;
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          video.play().then(() => setPaused(false)).catch(() => setPaused(true));
          if (!viewedRef.current) {
            clearViewTimer();
            viewTimerRef.current = window.setTimeout(() => {
              viewedRef.current = true;
              viewMut.mutate({ reelId: reel.id });
            }, 3000);
          }
        } else {
          video.pause();
          clearViewTimer();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(root);
    return () => {
      observer.disconnect();
      clearViewTimer();
      video.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reel.id]);

  const toggleLike = () => {
    if (!isAuthenticated) {
      toast(t("سجّل الدخول للإعجاب", "Sign in to like"), { kind: "info" });
      return;
    }
    if (liked) {
      setLiked(false);
      setLikes((v) => Math.max(0, v - 1));
      unlikeMut.mutate({ reelId: reel.id });
    } else {
      setLiked(true);
      setLikes((v) => v + 1);
      likeMut.mutate({ reelId: reel.id });
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/fun/reels?r=${reel.id}`;
    const nav = navigator as Navigator & { share?: (d: { title: string; text?: string; url: string }) => Promise<void> };
    try {
      if (nav.share) {
        await nav.share({ title: t("ريل من زيكو مانجا", "A reel from zeko-manga"), text: reel.caption ?? undefined, url });
        return;
      }
      throw new Error("no-share");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast(t("نُسخ رابط الريل", "Reel link copied"));
      } catch {
        toast(t("تعذّرت المشاركة", "Could not share"), { kind: "info" });
      }
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().then(() => setPaused(false));
    } else {
      video.pause();
      setPaused(true);
    }
  };

  const authorName = reel.user.name ?? reel.user.username ?? t("مستخدم", "User");

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full snap-start snap-always overflow-hidden bg-black"
    >
      <video
        ref={videoRef}
        src={reel.videoUrl}
        className="absolute inset-0 h-full w-full object-contain"
        loop
        muted={muted}
        playsInline
        preload="metadata"
        onClick={togglePlay}
      />

      {/* مؤشر الإيقاف المؤقت */}
      {paused && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 z-10 flex items-center justify-center"
          aria-label={t("تشغيل", "Play")}
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur">
            <Play size={28} className="ms-1" />
          </span>
        </button>
      )}

      {/* تدرّج سفلي للقراءة */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-44 bg-gradient-to-t from-black/85 to-transparent" />

      {/* عمود الإجراءات الجانبي */}
      <div className="absolute bottom-24 end-3 z-10 flex flex-col items-center gap-4">
        <button
          onClick={toggleLike}
          className="flex flex-col items-center gap-1 text-white"
          aria-label={t("إعجاب", "Like")}
        >
          <motion.span
            key={String(liked)}
            initial={{ scale: liked ? 0.6 : 1 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 16 }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur"
          >
            <Heart size={22} className={liked ? "fill-red-500 text-red-500" : ""} />
          </motion.span>
          <span className="text-[11px] font-bold tabular-nums">{formatCount(likes)}</span>
        </button>

        <button
          onClick={() => onOpenComments(reel)}
          className="flex flex-col items-center gap-1 text-white"
          aria-label={t("التعليقات", "Comments")}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur">
            <MessageCircle size={22} />
          </span>
          <span className="text-[11px] font-bold">{t("تعليق", "Comments")}</span>
        </button>

        <button
          onClick={share}
          className="flex flex-col items-center gap-1 text-white"
          aria-label={t("مشاركة", "Share")}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur">
            <Share2 size={20} className="rtl:-scale-x-100" />
          </span>
          <span className="text-[11px] font-bold">{t("مشاركة", "Share")}</span>
        </button>

        <span className="flex flex-col items-center gap-1 text-white/80">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur">
            <Eye size={20} />
          </span>
          <span className="text-[11px] font-bold tabular-nums">{formatCount(reel.viewsCount)}</span>
        </span>

        <button
          onClick={() => setMuted((v) => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
          aria-label={muted ? t("تشغيل الصوت", "Unmute") : t("كتم الصوت", "Mute")}
        >
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </div>

      {/* معلومات الريل */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 p-4 pe-20 pb-5">
        <div className="flex items-center gap-2.5">
          <img
            src={proxyImg(reel.user.avatarUrl) || "/avatar-1.png"}
            alt=""
            className="h-9 w-9 rounded-full border border-white/30 object-cover"
          />
          <span className="flex items-center gap-1 text-sm font-bold text-white">
            {authorName}
            <BadgeCheck size={14} className="text-accent-2" />
          </span>
        </div>
        {reel.caption && (
          <p className="line-clamp-2 text-[13px] leading-5 text-white/90">{reel.caption}</p>
        )}
        {reel.manga && (
          <Link
            to={`/manga/${reel.manga.slug}`}
            className="glass-chip w-fit !border-white/25 !bg-white/10 !py-1 text-[11px] font-bold text-white"
          >
            📚 {reel.manga.title}
          </Link>
        )}
      </div>
    </div>
  );
}

