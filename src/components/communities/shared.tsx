/**
 * أنواع وأدوات مشتركة لمجتمعات المستخدمين (trpc.communities.*).
 */
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";

export type RouterOutputs = inferRouterOutputs<AppRouter>;

export type CommunityCard =
  RouterOutputs["communities"]["discovery"]["items"][number];
export type CommunityDetails = RouterOutputs["communities"]["getBySlug"];
export type CommunityRoleRow = CommunityDetails["roles"][number];
export type CommunityChatMsg = RouterOutputs["communities"]["messages"][number];
export type CommunityMemberRow =
  RouterOutputs["communities"]["listMembers"][number];
export type CommunityJoinRequestRow =
  RouterOutputs["communities"]["listJoinRequests"][number];
export type MyCommunityRow = RouterOutputs["communities"]["myCommunities"][number];
export type MyCreateRequestRow =
  RouterOutputs["communities"]["myCreateRequests"][number];
export type MyNotificationRow =
  RouterOutputs["communities"]["myNotifications"][number];

/** لون المجتمع أو البديل البنفسجي الافتراضي */
export function communityColor(color: string | null | undefined): string {
  return color ?? "#7C3AED";
}

/** أفاتار المجتمع: صورة إن وُجدت وإلا كتلة ملونة بأول حرف من الاسم */
export function CommunityAvatar({
  name,
  imageUrl,
  color,
  size = "md",
}: {
  name: string;
  imageUrl?: string | null;
  color?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const cls =
    size === "lg"
      ? "h-20 w-20 rounded-2xl text-2xl md:h-24 md:w-24"
      : size === "sm"
        ? "h-10 w-10 rounded-xl text-sm"
        : "h-14 w-14 rounded-2xl text-lg";
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        loading="lazy"
        decoding="async"
        className={`${cls} shrink-0 border border-app object-cover shadow-md`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${cls} flex shrink-0 select-none items-center justify-center border border-app font-display font-extrabold text-white shadow-md`}
      style={{
        background: `linear-gradient(135deg, ${communityColor(color)}, #E879F9)`,
      }}
    >
      {name.trim().charAt(0) || "م"}
    </span>
  );
}
