import bcrypt from "bcrypt";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { env } from "./lib/env";
import {
  appendSessionCookie,
  appendSessionCookieClear,
} from "./lib/auth";
import { createLinkCode } from "./lib/linkCodes";
import { verifyTelegramAuth } from "./lib/telegram";
import {
  createUser,
  findUserByEmail,
  findUserByTelegramId,
  findUserByUsername,
  linkTelegramToUser,
  setUserRole,
  touchLastSignIn,
  unlinkTelegramFromUser,
  updateUserProfile,
} from "./queries/users";
import { checkRateLimit, clientIp } from "./lib/rateLimit";
import { createRouter, authedQuery, publicQuery } from "./middleware";

/** حد المحاولات لإجراءات auth الحساسة: 10 محاولات / 5 دقائق / IP */
const AUTH_RATE_LIMIT = 10;
const AUTH_RATE_WINDOW_MS = 5 * 60 * 1000;

function assertAuthRateLimit(action: string, req: Request) {
  const key = `${action}:${clientIp(req)}`;
  if (!checkRateLimit(key, AUTH_RATE_LIMIT, AUTH_RATE_WINDOW_MS)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "محاولات كثيرة، جرب بعد شوية",
    });
  }
}

const credentialsSchema = z.object({
  email: z.string().email("Invalid email address").max(320),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

const registerSchema = credentialsSchema.extend({
  name: z.string().min(1, "Name is required").max(255),
});

const USERNAME_RE = /^[A-Za-z0-9._-]{3,20}$/;
const USERNAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 يوماً

const updateProfileSchema = z.object({
  username: z
    .string()
    .regex(
      USERNAME_RE,
      "اسم المستخدم: 3-20 حرفاً (أحرف إنجليزية، أرقام، . _ -)",
    )
    .optional(),
  avatarUrl: z.string().trim().url().max(2000).nullable().optional(),
  bannerUrl: z.string().trim().url().max(2000).nullable().optional(),
});

const telegramAuthSchema = z.object({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number(),
  hash: z.string(),
});

function isDuplicateEntry(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "ER_DUP_ENTRY"
  );
}

export const authRouter = createRouter({
  me: authedQuery.query((opts) => opts.ctx.user),

  logout: authedQuery.mutation(async ({ ctx }) => {
    appendSessionCookieClear(ctx.resHeaders, ctx.req.headers);
    return { success: true };
  }),

  /**
   * تحديث البروفايل: username (3-20 حرفاً، فريد، مرة كل 30 يوماً)
   * + avatarUrl / bannerUrl (null = مسح، undefined = بلا تغيير).
   */
  updateProfile: authedQuery
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      assertAuthRateLimit("updateProfile", ctx.req);
      const userId = Number(ctx.user.id);
      const patch: Parameters<typeof updateUserProfile>[1] = {};

      if (input.username !== undefined && input.username !== ctx.user.username) {
        if (ctx.user.usernameChangedAt) {
          const elapsed =
            Date.now() - new Date(ctx.user.usernameChangedAt).getTime();
          if (elapsed < USERNAME_COOLDOWN_MS) {
            const daysLeft = Math.ceil(
              (USERNAME_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000),
            );
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `لا يمكنك تغيير اسم المستخدم إلا مرة كل 30 يوماً — متبقٍ ${daysLeft} يوم`,
            });
          }
        }
        const taken = await findUserByUsername(input.username);
        if (taken && Number(taken.id) !== userId) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "هذا الاسم مستخدم",
          });
        }
        patch.username = input.username;
        patch.usernameChangedAt = new Date();
      }

      if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;
      if (input.bannerUrl !== undefined) patch.bannerUrl = input.bannerUrl;

      if (Object.keys(patch).length) {
        try {
          await updateUserProfile(userId, patch);
        } catch (err) {
          if (isDuplicateEntry(err)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "هذا الاسم مستخدم",
            });
          }
          throw err;
        }
      }
      return { success: true };
    }),

  register: publicQuery
    .input(registerSchema)
    .mutation(async ({ ctx, input }) => {
      assertAuthRateLimit("register", ctx.req);
      const email = input.email.toLowerCase();
      const existing = await findUserByEmail(email);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists",
        });
      }

      const passwordHash = await bcrypt.hash(input.password, 12);
      let user;
      try {
        user = await createUser({
          email,
          passwordHash,
          name: input.name,
          lastSignInAt: new Date(),
        });
      } catch (err) {
        if (isDuplicateEntry(err)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this email already exists",
          });
        }
        throw err;
      }

      appendSessionCookie(ctx.resHeaders, ctx.req.headers, Number(user.id));
      return { success: true, user: { ...user, passwordHash: null } };
    }),

  login: publicQuery
    .input(credentialsSchema)
    .mutation(async ({ ctx, input }) => {
      assertAuthRateLimit("login", ctx.req);
      const user = await findUserByEmail(input.email);
      const invalid = () =>
        new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      if (!user || !user.passwordHash) {
        throw invalid();
      }
      const ok = await bcrypt.compare(input.password, user.passwordHash);
      if (!ok) {
        throw invalid();
      }
      if (user.bannedAt) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "هذا الحساب محظور",
        });
      }
      // Upgrade existing accounts whose email is in ADMIN_EMAILS on every login
      if (
        user.role !== "admin" &&
        user.email &&
        env.adminEmails.includes(user.email.toLowerCase())
      ) {
        await setUserRole(Number(user.id), "admin");
        user.role = "admin";
      }
      await touchLastSignIn(Number(user.id));
      appendSessionCookie(ctx.resHeaders, ctx.req.headers, Number(user.id));
      return { success: true, user: { ...user, passwordHash: null } };
    }),

  telegramLogin: publicQuery
    .input(telegramAuthSchema)
    .mutation(async ({ ctx, input }) => {
      assertAuthRateLimit("telegramLogin", ctx.req);
      if (!env.telegramBotToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Telegram login is not configured on this server",
        });
      }
      if (!verifyTelegramAuth(input, env.telegramBotToken)) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid Telegram authentication data",
        });
      }

      const telegramId = String(input.id);
      let user = await findUserByTelegramId(telegramId);
      if (user?.bannedAt) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "هذا الحساب محظور",
        });
      }
      if (!user) {
        try {
          user = await createUser({
            telegramId,
            telegramUsername: input.username ?? null,
            name:
              [input.first_name, input.last_name].filter(Boolean).join(" ") ||
              input.username ||
              `tg_${telegramId}`,
            avatarUrl: input.photo_url ?? null,
            lastSignInAt: new Date(),
          });
        } catch (err) {
          if (isDuplicateEntry(err)) {
            user = await findUserByTelegramId(telegramId);
          }
          if (!user) throw err;
        }
      } else {
        await touchLastSignIn(Number(user.id));
        // املأ الصورة تلقائياً من تيليجرام لو كانت فارغة
        if (!user.avatarUrl && input.photo_url) {
          await updateUserProfile(Number(user.id), {
            avatarUrl: input.photo_url,
          });
          user = { ...user, avatarUrl: input.photo_url };
        }
      }

      // Grant admin role on every login when the Telegram id is allow-listed
      if (
        user.role !== "admin" &&
        env.adminTelegramIds.includes(String(input.id))
      ) {
        await setUserRole(Number(user.id), "admin");
        user = { ...user, role: "admin" };
      }

      appendSessionCookie(ctx.resHeaders, ctx.req.headers, Number(user.id));
      return { success: true, user: { ...user, passwordHash: null } };
    }),

  providers: publicQuery.query(() => ({
    telegram: Boolean(env.telegramBotToken && env.telegramBotUsername),
    telegramBotUsername: env.telegramBotUsername || null,
    // الجزء الرقمي العام من توكن البوت (قبل ":") — مطلوب لرابط OAuth البديل
    telegramBotId: env.telegramBotToken ? env.telegramBotToken.split(":")[0] : null,
    google: Boolean(env.googleClientId && env.googleClientSecret),
  })),

  createLinkCode: authedQuery.mutation(async ({ ctx }) => {
    const { code, expiresAt } = await createLinkCode(Number(ctx.user.id));
    return { code, expiresAt };
  }),

  unlinkTelegram: authedQuery.mutation(async ({ ctx }) => {
    await unlinkTelegramFromUser(Number(ctx.user.id));
    return { success: true };
  }),

  linkTelegramViaWidget: authedQuery
    .input(telegramAuthSchema)
    .mutation(async ({ ctx, input }) => {
      assertAuthRateLimit("linkTelegramViaWidget", ctx.req);
      if (!env.telegramBotToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ربط تيليجرام غير مفعّل على هذا الخادم",
        });
      }
      if (!verifyTelegramAuth(input, env.telegramBotToken)) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "بيانات تيليجرام غير صالحة",
        });
      }

      const userId = Number(ctx.user.id);
      const telegramId = String(input.id);

      // One-link rule: current account already linked to a different Telegram account
      if (ctx.user.telegramId && ctx.user.telegramId !== telegramId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "هذا الحساب مربوط بحساب تيليجرام آخر، ألغِ الربط الحالي أولاً",
        });
      }

      // One-link rule: this Telegram account belongs to a different user
      const existing = await findUserByTelegramId(telegramId);
      if (existing && Number(existing.id) !== userId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "حساب تيليجرام هذا مربوط بحساب آخر",
        });
      }

      try {
        await linkTelegramToUser(userId, telegramId, input.username);
        // املأ الصورة من تيليجرام لو كانت فارغة
        if (!ctx.user.avatarUrl && input.photo_url) {
          await updateUserProfile(userId, { avatarUrl: input.photo_url });
        }
      } catch (err) {
        if (isDuplicateEntry(err)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "حساب تيليجرام هذا مربوط بحساب آخر",
          });
        }
        throw err;
      }
      return { success: true };
    }),
});
