import bcrypt from "bcrypt";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { env } from "./lib/env";
import {
  appendSessionCookie,
  appendSessionCookieClear,
  sessionTokenFromHeaders,
} from "./lib/auth";
import {
  deleteSessionByToken,
  listUserSessions,
  recordSession,
  revokeUserSession,
} from "./lib/sessions";
import { sendEmail } from "./lib/email";
import { emailCodes, passwordResetCodes, sessions, users } from "@db/schema";
import { and, eq, gt, ne } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { createLinkCode } from "./lib/linkCodes";
import {
  telegramDisplayName,
  telegramWidgetSchema,
  verifyTelegramWidget,
} from "./lib/telegram";
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
  notificationsTelegram: z.boolean().optional(),
  dnd: z.boolean().optional(),
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
    const token = sessionTokenFromHeaders(ctx.req.headers);
    if (token) {
      await deleteSessionByToken(token).catch(() => {});
    }
    appendSessionCookieClear(ctx.resHeaders, ctx.req.headers);
    return { success: true };
  }),

  /** قائمة جلسات المستخدم الحالية (الأحدث نشاطاً أولاً) */
  sessions: authedQuery.query(async ({ ctx }) => {
    const token = sessionTokenFromHeaders(ctx.req.headers) ?? undefined;
    return listUserSessions(Number(ctx.user.id), token);
  }),

  /** إلغاء جلسة يملكها المستخدم الحالي */
  revokeSession: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const ok = await revokeUserSession(Number(ctx.user.id), input.id);
      if (!ok) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الجلسة غير موجودة" });
      }
      return { success: true };
    }),

  /**
   * إرسال كود توثيق إيميل (6 أرقام، صالح 10 دقائق).
   * الإرسال الفعلي عبر SMTP لو توفّر SMTP_URL، وإلا يُسجَّل في اللوج
   * ويُعاد الكود كـ devCode في وضع غير production.
   */
  sendEmailCode: authedQuery.mutation(async ({ ctx }) => {
    assertAuthRateLimit("sendEmailCode", ctx.req);
    const email = ctx.user.email;
    if (!email) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "لا يوجد بريد إلكتروني مرتبط بهذا الحساب",
      });
    }
    if (ctx.user.emailVerifiedAt) {
      return { success: true, alreadyVerified: true };
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const db = getDb();
    await db.delete(emailCodes).where(eq(emailCodes.userId, ctx.user.id));
    await db.insert(emailCodes).values({
      userId: ctx.user.id,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    const sent = await sendEmail(
      email,
      "كود توثيق البريد — Zeko",
      `كود التوثيق الخاص بك: ${code}\nصالح لمدة 10 دقائق.`,
    );
    return {
      success: true,
      alreadyVerified: false,
      sent,
      ...(env.isProduction ? {} : { devCode: sent ? undefined : code }),
    };
  }),

  /** التحقق من كود البريد وتعليم emailVerifiedAt */
  verifyEmail: authedQuery
    .input(z.object({ code: z.string().trim().regex(/^\d{6}$/) }))
    .mutation(async ({ ctx, input }) => {
      assertAuthRateLimit("verifyEmail", ctx.req);
      const db = getDb();
      const row = await db.query.emailCodes.findFirst({
        where: and(
          eq(emailCodes.userId, ctx.user.id),
          eq(emailCodes.code, input.code),
          gt(emailCodes.expiresAt, new Date()),
        ),
      });
      if (!row) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "الكود غير صحيح أو منتهي الصلاحية",
        });
      }
      await db.delete(emailCodes).where(eq(emailCodes.userId, ctx.user.id));
      await db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, ctx.user.id));
      return { success: true };
    }),

  /**
   * تغيير كلمة المرور عبر البريد — الخطوة 1:
   * إرسال كود من 6 أرقام (صالح 10 دقائق) إلى بريد المستخدم الحالي.
   */
  sendPasswordChangeCode: authedQuery.mutation(async ({ ctx }) => {
    assertAuthRateLimit("sendPasswordChangeCode", ctx.req);
    const email = ctx.user.email;
    if (!email) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "لا يوجد بريد إلكتروني مرتبط بهذا الحساب",
      });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const db = getDb();
    await db
      .delete(passwordResetCodes)
      .where(eq(passwordResetCodes.userId, ctx.user.id));
    await db.insert(passwordResetCodes).values({
      userId: ctx.user.id,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    const sent = await sendEmail(
      email,
      "كود تغيير كلمة المرور — Zeko",
      `كود تغيير كلمة المرور الخاص بك: ${code}\nصالح لمدة 10 دقائق.\nإن لم تطلب تغيير كلمة المرور تجاهل هذه الرسالة.`,
    );
    return {
      success: true,
      sent,
      ...(env.isProduction ? {} : { devCode: sent ? undefined : code }),
    };
  }),

  /**
   * تغيير كلمة المرور عبر البريد — الخطوة 2:
   * التحقق من الكود ثم تعيين كلمة المرور الجديدة وإلغاء كل الجلسات الأخرى.
   */
  changePasswordWithCode: authedQuery
    .input(
      z
        .object({
          code: z.string().trim().regex(/^\d{6}$/),
          password: z
            .string()
            .min(8, "كلمة المرور 8 أحرف على الأقل")
            .max(100),
          confirmPassword: z.string(),
        })
        .refine((d) => d.password === d.confirmPassword, {
          message: "كلمتا المرور غير متطابقتين",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      assertAuthRateLimit("changePasswordWithCode", ctx.req);
      const db = getDb();
      const row = await db.query.passwordResetCodes.findFirst({
        where: and(
          eq(passwordResetCodes.userId, ctx.user.id),
          eq(passwordResetCodes.code, input.code),
          gt(passwordResetCodes.expiresAt, new Date()),
        ),
      });
      if (!row) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "الكود غير صحيح أو منتهي الصلاحية",
        });
      }
      // الكود يُستهلك مرة واحدة مهما كانت النتيجة اللاحقة
      await db
        .delete(passwordResetCodes)
        .where(eq(passwordResetCodes.userId, ctx.user.id));

      const passwordHash = await bcrypt.hash(input.password, 12);
      await db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, ctx.user.id));

      // أمان: إلغاء كل الجلسات الأخرى بعد تغيير كلمة المرور (الحالية تبقى)
      const token = sessionTokenFromHeaders(ctx.req.headers);
      if (token) {
        await db
          .delete(sessions)
          .where(and(eq(sessions.userId, ctx.user.id), ne(sessions.token, token)));
      }
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
      if (input.notificationsTelegram !== undefined)
        patch.notificationsTelegram = input.notificationsTelegram;
      if (input.dnd !== undefined) patch.dnd = input.dnd;

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

      const regToken = appendSessionCookie(
        ctx.resHeaders,
        ctx.req.headers,
        Number(user.id),
      );
      await recordSession(Number(user.id), regToken, ctx.req);
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

  /**
   * تسجيل الدخول/الربط عبر Telegram Login Widget — بناء جديد.
   * - مستخدم مسجّل: ربط تليجرام بحسابه (مع فحوص التعارض).
   * - زائر: دخول بحساب مربوط أو إنشاء حساب جديد تلقائياً.
   */
  telegramLogin: publicQuery
    .input(telegramWidgetSchema)
    .mutation(async ({ ctx, input }) => {
      assertAuthRateLimit("telegramLogin", ctx.req);
      if (!env.telegramBotToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "تسجيل الدخول عبر تليجرام غير مفعّل على هذا الخادم",
        });
      }

      const verdict = verifyTelegramWidget(input, env.telegramBotToken);
      if (!verdict.ok) {
        console.warn(`[auth] telegramLogin رفض (${verdict.reason}) للمعرّف ${input.id}`);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            verdict.reason === "stale"
              ? "انتهت صلاحية بيانات تليجرام — أعد المحاولة"
              : "بيانات تليجرام غير صالحة",
        });
      }

      const telegramId = String(input.id);

      /* ===== حالة الربط: مستخدم مسجّل دخوله بالفعل ===== */
      if (ctx.user) {
        const userId = Number(ctx.user.id);
        if (ctx.user.telegramId && ctx.user.telegramId !== telegramId) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "حسابك مربوط بتليجرام آخر — افصل الربط الحالي أولاً",
          });
        }
        const takenBy = await findUserByTelegramId(telegramId);
        if (takenBy && Number(takenBy.id) !== userId) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "حساب تليجرام هذا مربوط بحساب آخر",
          });
        }
        try {
          await linkTelegramToUser(userId, telegramId, input.username, input.photo_url);
        } catch (err) {
          if (isDuplicateEntry(err)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "حساب تليجرام هذا مربوط بحساب آخر",
            });
          }
          throw err;
        }
        if (!ctx.user.avatarUrl && input.photo_url) {
          await updateUserProfile(userId, { avatarUrl: input.photo_url });
        }
        return { success: true, linked: true };
      }

      /* ===== حالة الدخول: زائر ===== */
      let user = await findUserByTelegramId(telegramId);
      if (user?.bannedAt) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذا الحساب محظور" });
      }

      if (!user) {
        try {
          user = await createUser({
            telegramId,
            telegramUsername: input.username ?? null,
            name: telegramDisplayName(input),
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
        // حدّث بيانات تليجرام المخزنة (الصورة/اليوزرنيم قد يتغيران)
        await getDb()
          .update(users)
          .set({
            telegramPhotoUrl: input.photo_url ?? user.telegramPhotoUrl,
            telegramUsername: input.username ?? user.telegramUsername,
          })
          .where(eq(users.id, user.id));
        // املأ الصورة الشخصية من تليجرام لو فارغة
        if (!user.avatarUrl && input.photo_url) {
          await updateUserProfile(Number(user.id), { avatarUrl: input.photo_url });
          user = { ...user, avatarUrl: input.photo_url };
        }
      }

      // ترقية لأدمن تلقائياً لو المعرّف ضمن القائمة البيضاء
      if (user.role !== "admin" && env.adminTelegramIds.includes(telegramId)) {
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
    .input(telegramWidgetSchema)
    .mutation(async ({ ctx, input }) => {
      assertAuthRateLimit("linkTelegramViaWidget", ctx.req);
      if (!env.telegramBotToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ربط تيليجرام غير مفعّل على هذا الخادم",
        });
      }
      const verdict = verifyTelegramWidget(input, env.telegramBotToken);
      if (!verdict.ok) {
        console.warn(`[auth] linkTelegramViaWidget رفض (${verdict.reason}) للمعرّف ${input.id}`);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            verdict.reason === "stale"
              ? "انتهت صلاحية بيانات تليجرام — أعد المحاولة"
              : "بيانات تيليجرام غير صالحة",
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
