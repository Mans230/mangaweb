import * as cookie from "cookie";
import jwt from "jsonwebtoken";
import { Session } from "@contracts/constants";
import { Errors } from "@contracts/errors";
import { env } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { findUserById } from "../queries/users";

type SessionPayload = {
  userId: number;
};

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: Math.floor(Session.maxAgeMs / 1000),
  });
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    const userId = Number(payload.userId);
    if (!Number.isFinite(userId) || userId <= 0) return null;
    return { userId };
  } catch {
    return null;
  }
}

/** استخراج توكن الجلسة الخام من ترويسات الطلب (cookies) */
export function sessionTokenFromHeaders(headers: Headers): string | null {
  const cookies = cookie.parse(headers.get("cookie") || "");
  return cookies[Session.cookieName] ?? null;
}

/** يُلحق كوكي الجلسة ويعيد التوكن المُوقَّع (لتسجيله في جدول sessions) */
export function appendSessionCookie(
  resHeaders: Headers,
  reqHeaders: Headers,
  userId: number,
): string {
  const opts = getSessionCookieOptions(reqHeaders);
  const token = signSessionToken({ userId });
  resHeaders.append(
    "set-cookie",
    cookie.serialize(Session.cookieName, token, {
      httpOnly: opts.httpOnly,
      path: opts.path,
      sameSite: opts.sameSite?.toLowerCase() as "lax" | "none" | "strict",
      secure: opts.secure,
      maxAge: Session.maxAgeMs / 1000,
    }),
  );
  return token;
}

export function appendSessionCookieClear(
  resHeaders: Headers,
  reqHeaders: Headers,
) {
  const opts = getSessionCookieOptions(reqHeaders);
  resHeaders.append(
    "set-cookie",
    cookie.serialize(Session.cookieName, "", {
      httpOnly: opts.httpOnly,
      path: opts.path,
      sameSite: opts.sameSite?.toLowerCase() as "lax" | "none" | "strict",
      secure: opts.secure,
      maxAge: 0,
    }),
  );
}

export async function authenticateRequest(headers: Headers) {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies[Session.cookieName];
  if (!token) {
    throw Errors.forbidden("Invalid authentication token.");
  }
  const claim = verifySessionToken(token);
  if (!claim) {
    throw Errors.forbidden("Invalid authentication token.");
  }
  const user = await findUserById(claim.userId);
  if (!user) {
    throw Errors.forbidden("User not found. Please re-login.");
  }
  // Never expose the password hash through the request context
  return { ...user, passwordHash: null };
}
