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
  touchLastSignIn,
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

const telegramAuthSchema = z.object({
  id: z.number(),
  first_name: z.string(),
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
      }

      appendSessionCookie(ctx.resHeaders, ctx.req.headers, Number(user.id));
      return { success: true, user: { ...user, passwordHash: null } };
    }),

  providers: publicQuery.query(() => ({
    telegram: Boolean(env.telegramBotToken && env.telegramBotUsername),
    google: Boolean(env.googleClientId && env.googleClientSecret),
  })),

  createLinkCode: authedQuery.mutation(async ({ ctx }) => {
    const { code, expiresAt } = createLinkCode(Number(ctx.user.id));
    return { code, expiresAt };
  }),
});
