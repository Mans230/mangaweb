import { useRef, useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { Heart, Image as ImageIcon, Loader2, Send, Trash2, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/hooks/useAuth";
import { proxyImg, timeAgo } from "@/lib/manga";
import { useImageUpload, IMAGE_ACCEPT } from "@/lib/upload";
import { trpc } from "@/providers/trpc";
import { LOGIN_PATH } from "@/const";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/** خلاصة بوستات الأعضاء — نشر نصّي + صورة + إعجابات */
export default function PostsFeed() {
  const { t, lang } = useLanguage();
  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();
  const feedQ = trpc.posts.feed.useQuery(undefined, { retry: false });

  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const { upload, uploading } = useImageUpload();
  const fileRef = useRef<HTMLInputElement>(null);

  const createMut = trpc.posts.create.useMutation({
    onSuccess: () => {
      setBody("");
      setImageUrl(null);
      void utils.posts.feed.invalidate();
    },
  });
  const likeMut = trpc.posts.toggleLike.useMutation({
    onSuccess: () => void utils.posts.feed.invalidate(),
  });
  const removeMut = trpc.posts.remove.useMutation({
    onSuccess: () => void utils.posts.feed.invalidate(),
  });

  const pickImage = async (f: File | undefined) => {
    if (!f) return;
    const u = await upload(f);
    if (u) setImageUrl(u);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = () => {
    if (!body.trim() || createMut.isPending) return;
    createMut.mutate({ body: body.trim(), imageUrl });
  };

  const posts = feedQ.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* composer */}
      {isAuthenticated ? (
        <div className="glass flex flex-col gap-2.5 !rounded-2xl p-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 1000))}
            rows={2}
            placeholder={t("شارك حاجة مع الأعضاء…", "Share something with members…")}
            className="input-glass w-full resize-none text-sm"
          />
          {imageUrl && (
            <div className="relative w-fit">
              <img src={proxyImg(imageUrl)} alt="" className="max-h-40 rounded-xl border border-app object-contain" />
              <button
                onClick={() => setImageUrl(null)}
                className="btn-icon absolute -end-2 -top-2 !h-6 !w-6 !text-danger"
                aria-label={t("إزالة", "Remove")}
              >
                <X size={12} />
              </button>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={(e) => void pickImage(e.target.files?.[0])} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn-glass !px-3 !py-1.5 text-xs disabled:opacity-50"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
              {t("صورة", "Image")}
            </button>
            <button
              onClick={submit}
              disabled={!body.trim() || createMut.isPending}
              className="btn-primary !px-5 !py-2 text-xs disabled:opacity-50"
            >
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} className={lang === "ar" ? "rtl:-scale-x-100" : ""} />}
              {t("نشر", "Post")}
            </button>
          </div>
        </div>
      ) : (
        <Link to={LOGIN_PATH} className="glass block !rounded-2xl px-4 py-4 text-center text-sm font-semibold text-primary">
          {t("سجّل الدخول للنشر والتفاعل", "Sign in to post and interact")}
        </Link>
      )}

      {/* feed */}
      {feedQ.isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-28 w-full !rounded-2xl" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="glass !rounded-2xl px-4 py-10 text-center text-sm text-app-3">
          {t("لا بوستات بعد — كن أول من ينشر!", "No posts yet — be the first!")}
        </p>
      ) : (
        posts.map((p) => {
          const name = p.author.name ?? `#${p.author.id}`;
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="glass !rounded-2xl p-4"
            >
              <div className="mb-2 flex items-center gap-2.5">
                <img
                  src={proxyImg(p.author.avatarUrl) || "/placeholder-avatar.svg"}
                  alt=""
                  onError={(e) => {
                    if (!e.currentTarget.src.endsWith("/placeholder-avatar.svg"))
                      e.currentTarget.src = "/placeholder-avatar.svg";
                  }}
                  className="h-9 w-9 shrink-0 rounded-full border border-app object-cover"
                />
                <div className="min-w-0 flex-1">
                  {p.author.username ? (
                    <Link to={`/u/${p.author.username}`} className="truncate text-sm font-bold text-app hover:text-primary">
                      {name}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-bold text-app">{name}</span>
                  )}
                  <div className="text-[11px] text-app-3">{timeAgo(p.createdAt, lang)}</div>
                </div>
                {(p.mine || user?.role === "admin") && (
                  <button
                    onClick={() => removeMut.mutate({ postId: p.id })}
                    disabled={removeMut.isPending}
                    className="btn-icon !h-8 !w-8 !text-danger"
                    aria-label={t("حذف", "Delete")}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-7 text-app-2">{p.body}</p>
              {p.imageUrl && (
                <a href={proxyImg(p.imageUrl)} target="_blank" rel="noopener noreferrer">
                  <img src={proxyImg(p.imageUrl)} alt="" className="mt-2.5 max-h-96 w-full rounded-xl border border-app object-contain" />
                </a>
              )}
              <div className="mt-3 flex items-center gap-4 border-t border-app pt-2.5">
                <button
                  onClick={() => isAuthenticated && likeMut.mutate({ postId: p.id })}
                  disabled={!isAuthenticated || likeMut.isPending}
                  className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${p.liked ? "text-danger" : "text-app-3 hover:text-danger"}`}
                >
                  <Heart size={15} className={p.liked ? "fill-danger" : ""} />
                  {p.likes}
                </button>
              </div>
            </motion.div>
          );
        })
      )}
    </div>
  );
}
