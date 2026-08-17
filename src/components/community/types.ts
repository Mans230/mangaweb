/**
 * أنواع وأدوات مشتركة لصفحة المجتمع.
 * Reply-lite: الاقتباس يُضمَّن في نص الرسالة نفسه بسطر أول يبدأ بـ "> "
 * (الخادم لا يخزن مرجع رد — التنسيق كله من جهة العميل).
 */

export interface CommunityUser {
  id: number;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export interface CommunityMessage {
  id: number;
  mangaId: number;
  userId: number;
  body: string;
  createdAt: Date | string;
  user: CommunityUser;
}

export function displayName(u: CommunityUser): string {
  return u.username ?? u.name ?? "مستخدم";
}

export function avatarSrc(u: CommunityUser): string {
  return proxyImg(u.avatarUrl) || "/placeholder-avatar.svg";
}

/** يبني نص ردّ يقتبس الرسالة المطلوبة في سطر أول. */
export function buildQuotedBody(replyTo: CommunityMessage, text: string): string {
  const excerpt = replyTo.body.split("\n").pop()!.slice(0, 140);
  return `> ${displayName(replyTo.user)}: ${excerpt}\n${text}`;
}

/** يفصل سطر الاقتباس (إن وجد) عن متن الرسالة. */
export function parseBody(body: string): { quote: string | null; text: string } {
  if (!body.startsWith("> ")) return { quote: null, text: body };
  const nl = body.indexOf("\n");
  if (nl <= 2) return { quote: null, text: body };
  return { quote: body.slice(2, nl), text: body.slice(nl + 1) };
}
import { proxyImg } from "@/lib/manga";
