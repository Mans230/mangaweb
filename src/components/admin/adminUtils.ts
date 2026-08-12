/**
 * أدوات وأنواع خاصة بلوحة الأدمن — بلا أي بيانات وهمية.
 * البيانات تأتي حصرياً من trpc.admin.* وعند الفشل تُعرض حالة خطأ حقيقية.
 */
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import type { SourceName } from "@/lib/manga";

/** مخرجات الـ API (لأنواع التحويل في مكونات الأدمن) */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

export type SourceStatus = "active" | "paused" | "blocked";
export type RequestStatus = "pending" | "added" | "rejected";

export function sourceStatusLabel(s: SourceStatus): string {
  if (s === "paused") return "بطيء";
  if (s === "blocked") return "محظور";
  return "نشط";
}

export function requestStatusLabel(s: RequestStatus): string {
  if (s === "added") return "تمت الإضافة";
  if (s === "rejected") return "مرفوض";
  return "قيد المراجعة";
}

/* ================= نماذج عرض الأدمن ================= */

export interface AdminMangaRow {
  id: number;
  slug: string;
  title: string;
  altTitle?: string;
  cover: string;
  type: string;
  status: string;
  chapters: number;
  rating: number;
  source: string;
  isAdult: boolean;
  lastScan: string;
  genres: string[];
  description: string;
}

export interface AdminSourceCard {
  id: number;
  name: SourceName | string;
  baseUrl: string;
  status: SourceStatus;
  lastScan: string;
  mangaCount: number;
  enabled: boolean;
}

export interface AdminUserRow {
  id: number;
  name: string;
  username: string;
  email: string;
  avatar: string | null;
  role: "admin" | "user";
  joinedAt: string;
}

export interface AdminRequestRow {
  id: number;
  title: string;
  requester: string;
  date: string;
  sourceName: SourceName | null;
  sourceUrl?: string;
  note?: string;
  addedSlug?: string;
  status: RequestStatus;
}

/* ================= دمج المكرر ================= */

export interface DuplicateItem {
  id: number; // id صف المانجا (يُرسل لـ mergeDuplicates)
  title: string;
  cover: string;
  source: string;
  chapters: number;
  updatedAt: string;
  quality: "عالية" | "متوسطة" | "منخفضة";
  description: string;
}

export interface DuplicateGroup {
  id: string;
  title: string;
  items: DuplicateItem[];
}
