import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  like,
  lte,
  ne,
} from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  communities,
  communityBans,
  communityChatMessages,
  communityCreateRequests,
  communityInvites,
  communityJoinRequests,
  communityMembers,
  communityRoles,
  manga,
  notifications,
  users,
  type Community,
  type CommunityMember,
  type CommunityRole,
  type User,
} from "@db/schema";
import { getDb } from "./queries/connection";
import { checkRateLimit } from "./lib/rateLimit";
import { isUserCommunitiesEnabled } from "./lib/siteSettings";
import { createRouter, authedQuery, publicQuery } from "./middleware";

type Db = ReturnType<typeof getDb>;

const userCard = {
  id: users.id,
  name: users.name,
  username: users.username,
  avatarUrl: users.avatarUrl,
} as const;

/** الحد الأقصى للمجتمعات المملوكة لكل مستخدم */
const MAX_OWNED_COMMUNITIES = 3;
/** الاحتفاظ بآخر 5000 رسالة فقط لكل مجتمع */
const MAX_MESSAGES_PER_COMMUNITY = 5000;

// ================= أدوات مساعدة =================

function rateLimitOrThrow(key: string, limit: number, windowMs: number) {
  if (!checkRateLimit(key, limit, windowMs)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "محاولات كثيرة، جرب بعد شوية",
    });
  }
}

const imageUrlSchema = z
  .string()
  .trim()
  .url("رابط الصورة غير صالح")
  .max(2000)
  .refine((u) => /^https?:\/\//i.test(u), "رابط الصورة يجب أن يبدأ بـ http أو https");

export function generateInviteCode(): string {
  return randomBytes(16).toString("hex"); // 32 حرفاً
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "community";
}

export async function uniqueSlug(db: Db, name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 10; i++) {
    const candidate =
      i === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    const exists = await db.query.communities.findFirst({
      where: eq(communities.slug, candidate),
      columns: { id: true },
    });
    if (!exists) return candidate;
  }
  return `${base}-${randomBytes(6).toString("hex")}`;
}

async function getMember(
  db: Db,
  communityId: number,
  userId: number,
): Promise<CommunityMember | undefined> {
  return db.query.communityMembers.findFirst({
    where: and(
      eq(communityMembers.communityId, communityId),
      eq(communityMembers.userId, userId),
    ),
  });
}

async function getRole(
  db: Db,
  roleId: number | null,
): Promise<CommunityRole | undefined> {
  if (!roleId) return undefined;
  return db.query.communityRoles.findFirst({
    where: eq(communityRoles.id, roleId),
  });
}

/** هل المستخدم مالك أو مشرف (canModerate) أو أدمن الموقع؟ */
function canModerateCommunity(
  community: Community,
  role: CommunityRole | undefined,
  user: User,
): boolean {
  return (
    user.role === "admin" ||
    community.ownerId === user.id ||
    role?.canModerate === true
  );
}

/** يجلب المجتمع ويتحقق أن المستخدم مالك/مشرف — يرمي FORBIDDEN خلاف ذلك */
async function requireModerator(
  db: Db,
  communityId: number,
  user: User,
): Promise<{ community: Community; member?: CommunityMember }> {
  const community = await db.query.communities.findFirst({
    where: eq(communities.id, communityId),
  });
  if (!community) {
    throw new TRPCError({ code: "NOT_FOUND", message: "المجتمع غير موجود" });
  }
  const member = await getMember(db, communityId, user.id);
  const role = await getRole(db, member?.roleId ?? null);
  if (!canModerateCommunity(community, role, user)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "هذه الصلاحية للمالك والمشرفين فقط",
    });
  }
  return { community, member };
}

/** الكتابة ممنوعة عند أرشفة المجتمع أو تعطيل مجتمعات المستخدمين */
async function assertCommunityWritable(community: Community): Promise<void> {
  if (community.archivedAt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "هذا المجتمع مؤرشف — القراءة فقط",
    });
  }
  if (!(await isUserCommunitiesEnabled())) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "مجتمعات المستخدمين معطّلة حالياً — القراءة فقط",
    });
  }
}

/** التحقق أن الهدف ليس المالك، وأن المشرف لا يتعدى على مشرف آخر */
async function assertTargetModeratable(
  db: Db,
  community: Community,
  actor: User,
  targetUserId: number,
): Promise<void> {
  if (targetUserId === community.ownerId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "لا يمكن اتخاذ إجراء ضد مالك المجتمع",
    });
  }
  if (actor.id !== community.ownerId && actor.role !== "admin") {
    const targetMember = await getMember(db, community.id, targetUserId);
    const targetRole = await getRole(db, targetMember?.roleId ?? null);
    if (targetRole?.canModerate) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "المالك فقط يمكنه اتخاذ إجراء ضد المشرفين",
      });
    }
  }
}

/** استخراج @mentions وإنشاء إشعارات للأعضاء المذكورين (عدا الكاتب) */
async function notifyMentions(
  db: Db,
  community: Community,
  messageId: number,
  content: string,
  author: User,
): Promise<void> {
  const usernames = [
    ...new Set(
      [...content.matchAll(/@([A-Za-z0-9_]{2,24})/g)].map((m) =>
        m[1].toLowerCase(),
      ),
    ),
  ];
  if (usernames.length === 0) return;
  const mentioned = await db
    .select({ user: userCard, member: communityMembers })
    .from(communityMembers)
    .innerJoin(users, eq(communityMembers.userId, users.id))
    .where(
      and(
        eq(communityMembers.communityId, community.id),
        inArray(users.username, usernames),
        ne(users.id, author.id),
      ),
    );
  if (mentioned.length === 0) return;
  await db.insert(notifications).values(
    mentioned.map(({ user }) => ({
      userId: user.id,
      type: "mention",
      payload: {
        communityId: community.id,
        communitySlug: community.slug,
        communityName: community.name,
        messageId,
        fromUsername: author.username ?? undefined,
        excerpt: content.slice(0, 120),
      },
    })),
  );
}

/** حذف الرسائل الأقدم من آخر 5000 رسالة في المجتمع */
async function pruneOldMessages(db: Db, communityId: number): Promise<void> {
  const [cutoff] = await db
    .select({ id: communityChatMessages.id })
    .from(communityChatMessages)
    .where(eq(communityChatMessages.communityId, communityId))
    .orderBy(desc(communityChatMessages.id))
    .limit(1)
    .offset(MAX_MESSAGES_PER_COMMUNITY);
  if (cutoff) {
    await db
      .delete(communityChatMessages)
      .where(
        and(
          eq(communityChatMessages.communityId, communityId),
          lte(communityChatMessages.id, cutoff.id),
        ),
      );
  }
}

/** التحقق من صلاحية قراءة مجتمع خاص: عضوية أو كود دعوة صحيح */
async function assertCanRead(
  db: Db,
  community: Community,
  userId: number | undefined,
  inviteCode?: string,
): Promise<void> {
  if (!community.isPrivate) return;
  if (userId !== undefined) {
    const member = await getMember(db, community.id, userId);
    if (member) return;
  }
  if (inviteCode) {
    const invite = await db.query.communityInvites.findFirst({
      where: eq(communityInvites.communityId, community.id),
    });
    if (invite && invite.code === inviteCode) return;
  }
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "هذا المجتمع خاص — تحتاج عضوية أو رابط دعوة",
  });
}

const communityInputPayload = z.object({
  name: z.string().trim().min(2, "الاسم قصير جداً").max(120),
  description: z.string().trim().max(2000).nullish(),
  imageUrl: imageUrlSchema.nullish(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "اللون يجب أن يكون بصيغة #RRGGBB")
    .nullish(),
  isPrivate: z.boolean().default(false),
  mangaId: z.number().int().positive().nullish(),
});

// ================= الراوتر =================

export const communitiesRouter = createRouter({
  /** اكتشاف المجتمعات العامة النشطة + بحث بالاسم (الخاصة مستثناة دائماً) */
  discovery: publicQuery
    .input(
      z.object({
        search: z.string().trim().min(1).max(120).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input }) => {
      // عند تعطيل مجتمعات المستخدمين تُخفى من الاكتشاف (القراءة المباشرة تبقى متاحة)
      if (!(await isUserCommunitiesEnabled())) return { items: [] };
      const db = getDb();
      const conditions = [
        eq(communities.isPrivate, false),
        isNull(communities.archivedAt),
      ];
      if (input.search) {
        conditions.push(like(communities.name, `%${input.search}%`));
      }
      const rows = await db
        .select({
          community: communities,
          memberCount: count(communityMembers.userId),
          messageCount: count(communityChatMessages.id),
        })
        .from(communities)
        .leftJoin(
          communityMembers,
          eq(communityMembers.communityId, communities.id),
        )
        .leftJoin(
          communityChatMessages,
          eq(communityChatMessages.communityId, communities.id),
        )
        .where(and(...conditions))
        .groupBy(communities.id)
        .orderBy(desc(count(communityChatMessages.id)))
        .limit(input.limit);
      return {
        items: rows.map((r) => ({
          ...r.community,
          memberCount: r.memberCount,
          messageCount: r.messageCount,
        })),
      };
    }),

  /** بيانات مجتمع بالـ slug — الخاص للأعضاء أو حاملي كود الدعوة فقط */
  getBySlug: publicQuery
    .input(
      z.object({
        slug: z.string().trim().min(1).max(150),
        inviteCode: z.string().trim().max(32).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const community = await db.query.communities.findFirst({
        where: eq(communities.slug, input.slug),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المجتمع غير موجود" });
      }
      await assertCanRead(db, community, ctx.user?.id, input.inviteCode);
      const [[{ memberCount }], myMembership] = await Promise.all([
        db
          .select({ memberCount: count() })
          .from(communityMembers)
          .where(eq(communityMembers.communityId, community.id)),
        ctx.user
          ? getMember(db, community.id, ctx.user.id)
          : Promise.resolve(undefined),
      ]);
      const myRole = await getRole(db, myMembership?.roleId ?? null);
      const roles = await db
        .select()
        .from(communityRoles)
        .where(eq(communityRoles.communityId, community.id));
      return {
        ...community,
        memberCount,
        roles,
        myMembership: myMembership
          ? {
              roleId: myMembership.roleId,
              roleName: myRole?.name ?? null,
              canModerate:
                ctx.user !== undefined &&
                canModerateCommunity(community, myRole, ctx.user),
              isOwner: ctx.user?.id === community.ownerId,
              mutedUntil: myMembership.mutedUntil,
            }
          : null,
      };
    }),

  /** رسائل المجتمع: الأحدث بعد afterId (تصاعدي) للـ polling، أو الأحدث limit */
  messages: publicQuery
    .input(
      z.object({
        communityId: z.number().int().positive(),
        afterId: z.number().int().positive().optional(),
        inviteCode: z.string().trim().max(32).optional(),
        limit: z.number().int().min(1).max(50).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const community = await db.query.communities.findFirst({
        where: eq(communities.id, input.communityId),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المجتمع غير موجود" });
      }
      await assertCanRead(db, community, ctx.user?.id, input.inviteCode);
      const conditions = [
        eq(communityChatMessages.communityId, community.id),
        isNull(communityChatMessages.deletedAt),
      ];
      if (input.afterId !== undefined) {
        conditions.push(gt(communityChatMessages.id, input.afterId));
      }
      const rows = await db
        .select({
          message: communityChatMessages,
          user: userCard,
          roleName: communityRoles.name,
        })
        .from(communityChatMessages)
        .innerJoin(users, eq(communityChatMessages.userId, users.id))
        .leftJoin(
          communityMembers,
          and(
            eq(communityMembers.communityId, community.id),
            eq(communityMembers.userId, communityChatMessages.userId),
          ),
        )
        .leftJoin(
          communityRoles,
          eq(communityRoles.id, communityMembers.roleId),
        )
        .where(and(...conditions))
        .orderBy(
          input.afterId !== undefined
            ? asc(communityChatMessages.id)
            : desc(communityChatMessages.id),
        )
        .limit(input.limit);
      return rows.map((r) => ({
        ...r.message,
        user: r.user,
        roleName: r.roleName ?? null,
      }));
    }),

  /** الرسائل المثبتة (للجميع في العام، وللأعضاء/الدعوة في الخاص) */
  pinnedMessages: publicQuery
    .input(
      z.object({
        communityId: z.number().int().positive(),
        inviteCode: z.string().trim().max(32).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const community = await db.query.communities.findFirst({
        where: eq(communities.id, input.communityId),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المجتمع غير موجود" });
      }
      await assertCanRead(db, community, ctx.user?.id, input.inviteCode);
      const rows = await db
        .select({
          message: communityChatMessages,
          user: userCard,
          roleName: communityRoles.name,
        })
        .from(communityChatMessages)
        .innerJoin(users, eq(communityChatMessages.userId, users.id))
        .leftJoin(
          communityMembers,
          and(
            eq(communityMembers.communityId, community.id),
            eq(communityMembers.userId, communityChatMessages.userId),
          ),
        )
        .leftJoin(
          communityRoles,
          eq(communityRoles.id, communityMembers.roleId),
        )
        .where(
          and(
            eq(communityChatMessages.communityId, community.id),
            isNull(communityChatMessages.deletedAt),
            gt(communityChatMessages.pinnedAt, new Date(0)),
          ),
        )
        .orderBy(desc(communityChatMessages.pinnedAt))
        .limit(20);
      return rows.map((r) => ({
        ...r.message,
        user: r.user,
        roleName: r.roleName ?? null,
      }));
    }),

  /** إرسال رسالة — أعضاء فقط، مع الحظر/الكتم/الوضع البطيء/المعدل/الإشعارات */
  sendMessage: authedQuery
    .input(
      z.object({
        communityId: z.number().int().positive(),
        content: z.string().trim().min(1, "الرسالة فارغة").max(500),
        imageUrl: imageUrlSchema.nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:msg:${ctx.user.id}`, 20, 60 * 1000);
      const db = getDb();
      const community = await db.query.communities.findFirst({
        where: eq(communities.id, input.communityId),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المجتمع غير موجود" });
      }
      await assertCommunityWritable(community);
      const banned = await db.query.communityBans.findFirst({
        where: and(
          eq(communityBans.communityId, community.id),
          eq(communityBans.userId, ctx.user.id),
        ),
      });
      if (banned) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "أنت محظور من هذا المجتمع",
        });
      }
      const member = await getMember(db, community.id, ctx.user.id);
      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "يجب أن تكون عضواً في المجتمع لإرسال الرسائل",
        });
      }
      const now = new Date();
      if (member.mutedUntil && member.mutedUntil > now) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "أنت مكتوم في هذا المجتمع حالياً",
        });
      }
      const role = await getRole(db, member.roleId);
      const isMod = canModerateCommunity(community, role, ctx.user);
      if (
        !isMod &&
        community.slowModeSeconds > 0 &&
        member.lastMessageAt &&
        now.getTime() - member.lastMessageAt.getTime() <
          community.slowModeSeconds * 1000
      ) {
        const wait = Math.ceil(
          (community.slowModeSeconds * 1000 -
            (now.getTime() - member.lastMessageAt.getTime())) /
            1000,
        );
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `الوضع البطيء مفعّل — انتظر ${wait} ثانية بين الرسائل`,
        });
      }
      const [{ id }] = await db
        .insert(communityChatMessages)
        .values({
          communityId: community.id,
          userId: ctx.user.id,
          content: input.content,
          imageUrl: input.imageUrl ?? null,
        })
        .$returningId();
      await db
        .update(communityMembers)
        .set({ lastMessageAt: now })
        .where(
          and(
            eq(communityMembers.communityId, community.id),
            eq(communityMembers.userId, ctx.user.id),
          ),
        );
      await notifyMentions(db, community, id, input.content, ctx.user);
      await pruneOldMessages(db, community.id);
      const [row] = await db
        .select({
          message: communityChatMessages,
          user: userCard,
          roleName: communityRoles.name,
        })
        .from(communityChatMessages)
        .innerJoin(users, eq(communityChatMessages.userId, users.id))
        .leftJoin(
          communityMembers,
          and(
            eq(communityMembers.communityId, community.id),
            eq(communityMembers.userId, communityChatMessages.userId),
          ),
        )
        .leftJoin(communityRoles, eq(communityRoles.id, communityMembers.roleId))
        .where(eq(communityChatMessages.id, id))
        .limit(1);
      return row
        ? { ...row.message, user: row.user, roleName: row.roleName ?? null }
        : null;
    }),

  /** مغادرة مجتمع — المالك لا يمكنه المغادرة */
  leave: authedQuery
    .input(z.object({ communityId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const community = await db.query.communities.findFirst({
        where: eq(communities.id, input.communityId),
        columns: { id: true, ownerId: true },
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المجتمع غير موجود" });
      }
      if (community.ownerId === ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "مالك المجتمع لا يمكنه المغادرة",
        });
      }
      await db
        .delete(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, community.id),
            eq(communityMembers.userId, ctx.user.id),
          ),
        );
      return { success: true };
    }),

  /** مجتمعاتي (عضوية أو ملكية) مع اسم الدور */
  myCommunities: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select({ community: communities, member: communityMembers })
      .from(communityMembers)
      .innerJoin(communities, eq(communityMembers.communityId, communities.id))
      .where(eq(communityMembers.userId, ctx.user.id))
      .orderBy(desc(communityMembers.createdAt));
    const roleNames = await Promise.all(
      rows.map((r) => getRole(db, r.member.roleId)),
    );
    return rows.map((r, i) => ({
      ...r.community,
      roleName: roleNames[i]?.name ?? null,
      isOwner: r.community.ownerId === ctx.user.id,
      mutedUntil: r.member.mutedUntil,
    }));
  }),

  // ================= إجراءات المالك/المشرفين =================

  /** قبول طلب انضمام — ينشئ صف عضوية */
  approveJoin: authedQuery
    .input(z.object({ requestId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const request = await db.query.communityJoinRequests.findFirst({
        where: eq(communityJoinRequests.id, input.requestId),
      });
      if (!request || request.status !== "pending") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "طلب الانضمام غير موجود أو تمت معالجته",
        });
      }
      const { community } = await requireModerator(
        db,
        request.communityId,
        ctx.user,
      );
      await assertCommunityWritable(community);
      await db
        .update(communityJoinRequests)
        .set({ status: "approved" })
        .where(eq(communityJoinRequests.id, request.id));
      await db
        .insert(communityMembers)
        .values({ communityId: community.id, userId: request.userId })
        .onDuplicateKeyUpdate({ set: { communityId: community.id } });
      return { success: true };
    }),

  /** رفض طلب انضمام */
  rejectJoin: authedQuery
    .input(z.object({ requestId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const request = await db.query.communityJoinRequests.findFirst({
        where: eq(communityJoinRequests.id, input.requestId),
      });
      if (!request || request.status !== "pending") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "طلب الانضمام غير موجود أو تمت معالجته",
        });
      }
      await requireModerator(db, request.communityId, ctx.user);
      await db
        .update(communityJoinRequests)
        .set({ status: "rejected" })
        .where(eq(communityJoinRequests.id, request.id));
      return { success: true };
    }),

  /** طرد عضو — يمكنه العودة بطلب انضمام جديد */
  kick: authedQuery
    .input(
      z.object({
        communityId: z.number().int().positive(),
        userId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const { community } = await requireModerator(db, input.communityId, ctx.user);
      await assertCommunityWritable(community);
      await assertTargetModeratable(db, community, ctx.user, input.userId);
      await db
        .delete(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, community.id),
            eq(communityMembers.userId, input.userId),
          ),
        );
      return { success: true };
    }),

  /** حظر دائم من المجتمع — يزيل العضوية ويمنع أي انضمام مستقبلي */
  ban: authedQuery
    .input(
      z.object({
        communityId: z.number().int().positive(),
        userId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const { community } = await requireModerator(db, input.communityId, ctx.user);
      await assertCommunityWritable(community);
      await assertTargetModeratable(db, community, ctx.user, input.userId);
      await db
        .delete(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, community.id),
            eq(communityMembers.userId, input.userId),
          ),
        );
      await db
        .insert(communityBans)
        .values({ communityId: community.id, userId: input.userId })
        .onDuplicateKeyUpdate({ set: { communityId: community.id } });
      // إلغاء أي طلب انضمام معلّق للمحظور
      await db
        .update(communityJoinRequests)
        .set({ status: "rejected" })
        .where(
          and(
            eq(communityJoinRequests.communityId, community.id),
            eq(communityJoinRequests.userId, input.userId),
            eq(communityJoinRequests.status, "pending"),
          ),
        );
      return { success: true };
    }),

  /** فك الحظر */
  unban: authedQuery
    .input(
      z.object({
        communityId: z.number().int().positive(),
        userId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const { community } = await requireModerator(db, input.communityId, ctx.user);
      await assertCommunityWritable(community);
      await db
        .delete(communityBans)
        .where(
          and(
            eq(communityBans.communityId, community.id),
            eq(communityBans.userId, input.userId),
          ),
        );
      return { success: true };
    }),

  /** كتم عضو — minutes رقم (مؤقت) أو null (دائم) */
  mute: authedQuery
    .input(
      z.object({
        communityId: z.number().int().positive(),
        userId: z.number().int().positive(),
        minutes: z.number().int().positive().max(60 * 24 * 365).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const { community } = await requireModerator(db, input.communityId, ctx.user);
      await assertCommunityWritable(community);
      await assertTargetModeratable(db, community, ctx.user, input.userId);
      const member = await getMember(db, community.id, input.userId);
      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "المستخدم ليس عضواً في هذا المجتمع",
        });
      }
      // MySQL timestamp حده الأقصى 2038 — الكتم الدائم يُخزَّن عند هذا السقف
      const mutedUntil =
        input.minutes === null
          ? new Date("2038-01-01T00:00:00Z")
          : new Date(Date.now() + input.minutes * 60 * 1000);
      await db
        .update(communityMembers)
        .set({ mutedUntil })
        .where(
          and(
            eq(communityMembers.communityId, community.id),
            eq(communityMembers.userId, input.userId),
          ),
        );
      return { success: true, mutedUntil };
    }),

  /** إلغاء الكتم */
  unmute: authedQuery
    .input(
      z.object({
        communityId: z.number().int().positive(),
        userId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const { community } = await requireModerator(db, input.communityId, ctx.user);
      await assertCommunityWritable(community);
      await db
        .update(communityMembers)
        .set({ mutedUntil: null })
        .where(
          and(
            eq(communityMembers.communityId, community.id),
            eq(communityMembers.userId, input.userId),
          ),
        );
      return { success: true };
    }),

  /** إنشاء دور مخصص باسم حر + علم canModerate */
  createRole: authedQuery
    .input(
      z.object({
        communityId: z.number().int().positive(),
        name: z.string().trim().min(1, "اسم الدور فارغ").max(60),
        canModerate: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const { community } = await requireModerator(db, input.communityId, ctx.user);
      await assertCommunityWritable(community);
      const exists = await db.query.communityRoles.findFirst({
        where: and(
          eq(communityRoles.communityId, community.id),
          eq(communityRoles.name, input.name),
        ),
      });
      if (exists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "يوجد دور بهذا الاسم مسبقاً",
        });
      }
      const [{ id }] = await db
        .insert(communityRoles)
        .values({
          communityId: community.id,
          name: input.name,
          canModerate: input.canModerate,
        })
        .$returningId();
      return { id, name: input.name, canModerate: input.canModerate };
    }),

  /** إعادة تسمية دور */
  renameRole: authedQuery
    .input(
      z.object({
        roleId: z.number().int().positive(),
        name: z.string().trim().min(1, "اسم الدور فارغ").max(60),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const role = await db.query.communityRoles.findFirst({
        where: eq(communityRoles.id, input.roleId),
      });
      if (!role) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الدور غير موجود" });
      }
      const { community } = await requireModerator(db, role.communityId, ctx.user);
      await assertCommunityWritable(community);
      await db
        .update(communityRoles)
        .set({ name: input.name })
        .where(eq(communityRoles.id, role.id));
      return { success: true };
    }),

  /** حذف دور — الأعضاء المعيّنون عليه يعودون بلا دور */
  deleteRole: authedQuery
    .input(z.object({ roleId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const role = await db.query.communityRoles.findFirst({
        where: eq(communityRoles.id, input.roleId),
      });
      if (!role) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الدور غير موجود" });
      }
      const { community } = await requireModerator(db, role.communityId, ctx.user);
      await assertCommunityWritable(community);
      await db.delete(communityRoles).where(eq(communityRoles.id, role.id));
      return { success: true };
    }),

  /** تعيين دور لعضو (أو إزالته بـ null) */
  setMemberRole: authedQuery
    .input(
      z.object({
        communityId: z.number().int().positive(),
        userId: z.number().int().positive(),
        roleId: z.number().int().positive().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const { community } = await requireModerator(db, input.communityId, ctx.user);
      await assertCommunityWritable(community);
      await assertTargetModeratable(db, community, ctx.user, input.userId);
      const member = await getMember(db, community.id, input.userId);
      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "المستخدم ليس عضواً في هذا المجتمع",
        });
      }
      if (input.roleId !== null) {
        const role = await db.query.communityRoles.findFirst({
          where: and(
            eq(communityRoles.id, input.roleId),
            eq(communityRoles.communityId, community.id),
          ),
        });
        if (!role) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "الدور غير موجود في هذا المجتمع",
          });
        }
      }
      await db
        .update(communityMembers)
        .set({ roleId: input.roleId })
        .where(
          and(
            eq(communityMembers.communityId, community.id),
            eq(communityMembers.userId, input.userId),
          ),
        );
      return { success: true };
    }),

  /** تعديل إعدادات المجتمع */
  updateSettings: authedQuery
    .input(
      z.object({
        communityId: z.number().int().positive(),
        name: z.string().trim().min(2).max(120).optional(),
        description: z.string().trim().max(2000).nullish(),
        imageUrl: imageUrlSchema.nullish(),
        color: z
          .string()
          .trim()
          .regex(/^#[0-9a-fA-F]{6}$/, "اللون يجب أن يكون بصيغة #RRGGBB")
          .nullish(),
        isPrivate: z.boolean().optional(),
        mangaId: z.number().int().positive().nullish(),
        slowModeSeconds: z.number().int().min(0).max(3600).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const { community } = await requireModerator(db, input.communityId, ctx.user);
      await assertCommunityWritable(community);
      if (input.mangaId != null) {
        const exists = await db.query.manga.findFirst({
          where: eq(manga.id, input.mangaId),
          columns: { id: true },
        });
        if (!exists) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "المانجا المرتبطة غير موجودة",
          });
        }
      }
      const patch: Partial<typeof communities.$inferInsert> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
      if (input.color !== undefined) patch.color = input.color;
      if (input.isPrivate !== undefined) patch.isPrivate = input.isPrivate;
      if (input.mangaId !== undefined) patch.mangaId = input.mangaId;
      if (input.slowModeSeconds !== undefined)
        patch.slowModeSeconds = input.slowModeSeconds;
      if (Object.keys(patch).length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "لا توجد تعديلات لحفظها",
        });
      }
      await db
        .update(communities)
        .set(patch)
        .where(eq(communities.id, community.id));
      return { success: true };
    }),

  /** تثبيت رسالة */
  pinMessage: authedQuery
    .input(z.object({ messageId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const message = await db.query.communityChatMessages.findFirst({
        where: eq(communityChatMessages.id, input.messageId),
      });
      if (!message || message.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الرسالة غير موجودة" });
      }
      const { community } = await requireModerator(db, message.communityId, ctx.user);
      await assertCommunityWritable(community);
      await db
        .update(communityChatMessages)
        .set({ pinnedAt: new Date() })
        .where(eq(communityChatMessages.id, message.id));
      return { success: true };
    }),

  /** إلغاء تثبيت رسالة */
  unpinMessage: authedQuery
    .input(z.object({ messageId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const message = await db.query.communityChatMessages.findFirst({
        where: eq(communityChatMessages.id, input.messageId),
      });
      if (!message) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الرسالة غير موجودة" });
      }
      const { community } = await requireModerator(db, message.communityId, ctx.user);
      await assertCommunityWritable(community);
      await db
        .update(communityChatMessages)
        .set({ pinnedAt: null })
        .where(eq(communityChatMessages.id, message.id));
      return { success: true };
    }),

  /** حذف رسالة (حذف ناعم) — المشرفون فقط؛ الأعضاء لا يمكنهم حذف رسائلهم */
  deleteMessage: authedQuery
    .input(z.object({ messageId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const message = await db.query.communityChatMessages.findFirst({
        where: eq(communityChatMessages.id, input.messageId),
      });
      if (!message || message.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الرسالة غير موجودة" });
      }
      const { community } = await requireModerator(db, message.communityId, ctx.user);
      await assertCommunityWritable(community);
      await db
        .update(communityChatMessages)
        .set({ deletedAt: new Date(), pinnedAt: null })
        .where(eq(communityChatMessages.id, message.id));
      return { success: true };
    }),

  /** إعادة توليد رابط الدعوة (كود واحد لكل مجتمع) */
  regenerateInvite: authedQuery
    .input(z.object({ communityId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:mod:${ctx.user.id}`, 60, 60 * 1000);
      const db = getDb();
      const { community } = await requireModerator(db, input.communityId, ctx.user);
      await assertCommunityWritable(community);
      const code = generateInviteCode();
      await db
        .insert(communityInvites)
        .values({ communityId: community.id, code })
        .onDuplicateKeyUpdate({ set: { code } });
      return { code };
    }),

  /** قائمة الأعضاء — للمالك/المشرفين فقط */
  listMembers: authedQuery
    .input(
      z.object({
        communityId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const { community } = await requireModerator(db, input.communityId, ctx.user);
      const rows = await db
        .select({
          member: communityMembers,
          user: userCard,
          roleName: communityRoles.name,
          roleCanModerate: communityRoles.canModerate,
        })
        .from(communityMembers)
        .innerJoin(users, eq(communityMembers.userId, users.id))
        .leftJoin(communityRoles, eq(communityRoles.id, communityMembers.roleId))
        .where(eq(communityMembers.communityId, community.id))
        .orderBy(asc(communityMembers.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows.map((r) => ({
        ...r.member,
        user: r.user,
        roleName: r.roleName ?? null,
        canModerate: r.roleCanModerate === true,
        isOwner: r.user.id === community.ownerId,
      }));
    }),

  /** طلبات الانضمام المعلقة — للمالك/المشرفين فقط */
  listJoinRequests: authedQuery
    .input(z.object({ communityId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const { community } = await requireModerator(db, input.communityId, ctx.user);
      const rows = await db
        .select({ request: communityJoinRequests, user: userCard })
        .from(communityJoinRequests)
        .innerJoin(users, eq(communityJoinRequests.userId, users.id))
        .where(
          and(
            eq(communityJoinRequests.communityId, community.id),
            eq(communityJoinRequests.status, "pending"),
          ),
        )
        .orderBy(desc(communityJoinRequests.createdAt))
        .limit(100);
      return rows.map((r) => ({ ...r.request, user: r.user }));
    }),

  // ================= إجراءات أي مستخدم =================

  /** طلب إنشاء مجتمع — بحد أقصى 3 (مملوكة + طلبات معلقة) */
  requestCreate: authedQuery
    .input(communityInputPayload)
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:create:${ctx.user.id}`, 5, 60 * 1000);
      if (!(await isUserCommunitiesEnabled())) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "إنشاء المجتمعات معطّل حالياً",
        });
      }
      const db = getDb();
      if (input.mangaId != null) {
        const exists = await db.query.manga.findFirst({
          where: eq(manga.id, input.mangaId),
          columns: { id: true },
        });
        if (!exists) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "المانجا المرتبطة غير موجودة",
          });
        }
      }
      const [[{ owned }], [{ pending }]] = await Promise.all([
        db
          .select({ owned: count() })
          .from(communities)
          .where(eq(communities.ownerId, ctx.user.id)),
        db
          .select({ pending: count() })
          .from(communityCreateRequests)
          .where(
            and(
              eq(communityCreateRequests.userId, ctx.user.id),
              eq(communityCreateRequests.status, "pending"),
            ),
          ),
      ]);
      if (owned + pending >= MAX_OWNED_COMMUNITIES) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `لا يمكنك امتلاك أكثر من ${MAX_OWNED_COMMUNITIES} مجتمعات (بما فيها الطلبات المعلقة)`,
        });
      }
      const [{ id }] = await db
        .insert(communityCreateRequests)
        .values({
          userId: ctx.user.id,
          payload: {
            name: input.name,
            description: input.description ?? null,
            imageUrl: input.imageUrl ?? null,
            color: input.color ?? null,
            isPrivate: input.isPrivate,
            mangaId: input.mangaId ?? null,
          },
        })
        .$returningId();
      return { id, status: "pending" as const };
    }),

  /** طلبات إنشاء المجتمعات الخاصة بي مع سبب الرفض إن وجد */
  myCreateRequests: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(communityCreateRequests)
      .where(eq(communityCreateRequests.userId, ctx.user.id))
      .orderBy(desc(communityCreateRequests.createdAt))
      .limit(50);
  }),

  /**
   * طلب انضمام — بالـ slug للمجتمعات العامة، وبكود الدعوة للخاصة.
   * الانضمام يتطلب موافقة المالك/المشرف دائماً.
   */
  requestJoin: authedQuery
    .input(
      z
        .object({
          slug: z.string().trim().min(1).max(150).optional(),
          inviteCode: z.string().trim().min(1).max(32).optional(),
        })
        .refine((v) => v.slug !== undefined || v.inviteCode !== undefined, {
          message: "أرسل slug أو كود دعوة",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      rateLimitOrThrow(`communities:join:${ctx.user.id}`, 10, 60 * 1000);
      if (!(await isUserCommunitiesEnabled())) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "الانضمام للمجتمعات معطّل حالياً",
        });
      }
      const db = getDb();
      let community: Community | undefined;
      if (input.inviteCode !== undefined) {
        const invite = await db.query.communityInvites.findFirst({
          where: eq(communityInvites.code, input.inviteCode),
        });
        if (!invite) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "رابط الدعوة غير صالح",
          });
        }
        community = await db.query.communities.findFirst({
          where: eq(communities.id, invite.communityId),
        });
      } else if (input.slug !== undefined) {
        community = await db.query.communities.findFirst({
          where: eq(communities.slug, input.slug),
        });
        // المجتمعات الخاصة لا تُكتشف إلا عبر الدعوة
        if (community?.isPrivate) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "هذا المجتمع خاص — تحتاج رابط دعوة للانضمام",
          });
        }
      }
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المجتمع غير موجود" });
      }
      if (community.archivedAt) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "هذا المجتمع مؤرشف — لا يمكن الانضمام إليه",
        });
      }
      const banned = await db.query.communityBans.findFirst({
        where: and(
          eq(communityBans.communityId, community.id),
          eq(communityBans.userId, ctx.user.id),
        ),
      });
      if (banned) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "أنت محظور من هذا المجتمع",
        });
      }
      const member = await getMember(db, community.id, ctx.user.id);
      if (member) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "أنت عضو في هذا المجتمع بالفعل",
        });
      }
      // فرض طلب معلّق واحد فقط لكل (مجتمع، مستخدم) برمجياً
      const pendingRequest = await db.query.communityJoinRequests.findFirst({
        where: and(
          eq(communityJoinRequests.communityId, community.id),
          eq(communityJoinRequests.userId, ctx.user.id),
          eq(communityJoinRequests.status, "pending"),
        ),
      });
      if (pendingRequest) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "لديك طلب انضمام معلّق لهذا المجتمع",
        });
      }
      const [{ id }] = await db
        .insert(communityJoinRequests)
        .values({ communityId: community.id, userId: ctx.user.id })
        .$returningId();
      return { id, status: "pending" as const, communityId: community.id };
    }),

  // ================= الإشعارات =================

  /** إشعاراتي (الأحدث أولاً) */
  myNotifications: authedQuery
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      return db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, ctx.user.id))
        .orderBy(desc(notifications.id))
        .limit(input.limit);
    }),

  /** عدد الإشعارات غير المقروءة (للجرس) */
  unreadNotificationsCount: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const [{ total }] = await db
      .select({ total: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ctx.user.id),
          isNull(notifications.readAt),
        ),
      );
    return { count: total };
  }),

  /** تعليم إشعارات كمقروءة — ids محددة أو الكل */
  markNotificationsRead: authedQuery
    .input(
      z.object({
        ids: z.array(z.number().int().positive()).max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [
        eq(notifications.userId, ctx.user.id),
        isNull(notifications.readAt),
      ];
      if (input.ids && input.ids.length > 0) {
        conditions.push(inArray(notifications.id, input.ids));
      }
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(...conditions));
      return { success: true };
    }),
});
