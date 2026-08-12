import type { Context } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { randomBytes } from "crypto";
import { Paths } from "@contracts/constants";
import { env } from "./env";
import { appendSessionCookie } from "./auth";
import {
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  touchLastSignIn,
} from "../queries/users";

const STATE_COOKIE = "zeko_google_state";

export function isGoogleEnabled(): boolean {
  return Boolean(env.googleClientId && env.googleClientSecret);
}

function callbackUrl(c: Context): string {
  const base = env.siteUrl || new URL(c.req.url).origin;
  return `${base}${Paths.googleCallback}`;
}

export function googleAuthStartHandler() {
  return (c: Context) => {
    if (!isGoogleEnabled()) {
      return c.json({ error: "Google login is not configured" }, 404);
    }
    const state = randomBytes(16).toString("hex");
    setCookie(c, STATE_COOKIE, state, {
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      secure: env.isProduction,
      maxAge: 600,
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", env.googleClientId);
    url.searchParams.set("redirect_uri", callbackUrl(c));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    return c.redirect(url.toString(), 302);
  };
}

type GoogleUserInfo = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

export function googleCallbackHandler() {
  return async (c: Context) => {
    if (!isGoogleEnabled()) {
      return c.json({ error: "Google login is not configured" }, 404);
    }
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error === "access_denied") {
      return c.redirect(Paths.login, 302);
    }
    const storedState = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: "/" });
    if (!code || !state || !storedState || state !== storedState) {
      return c.json({ error: "Invalid OAuth state" }, 400);
    }

    try {
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: env.googleClientId,
          client_secret: env.googleClientSecret,
          redirect_uri: callbackUrl(c),
        }).toString(),
      });
      if (!tokenResp.ok) {
        throw new Error(`Token exchange failed (${tokenResp.status})`);
      }
      const { access_token } = (await tokenResp.json()) as {
        access_token: string;
      };

      const profileResp = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        { headers: { Authorization: `Bearer ${access_token}` } },
      );
      if (!profileResp.ok) {
        throw new Error(`Profile fetch failed (${profileResp.status})`);
      }
      const profile = (await profileResp.json()) as GoogleUserInfo;
      if (!profile.sub) {
        throw new Error("Google profile missing subject");
      }

      let user = await findUserByGoogleId(profile.sub);
      if (!user && profile.email) {
        user = await findUserByEmail(profile.email);
      }
      if (!user) {
        user = await createUser({
          googleId: profile.sub,
          email: profile.email ?? null,
          name: profile.name ?? profile.email ?? `google_${profile.sub}`,
          avatarUrl: profile.picture ?? null,
          lastSignInAt: new Date(),
        });
      } else {
        await touchLastSignIn(Number(user.id));
      }

      const resHeaders = new Headers();
      appendSessionCookie(resHeaders, c.req.raw.headers, Number(user.id));
      const setCookieHeader = resHeaders.get("set-cookie");
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          ...(setCookieHeader ? { "set-cookie": setCookieHeader } : {}),
        },
      });
    } catch (err) {
      console.error("[google-oauth] Callback failed", err);
      return c.json({ error: "Google login failed" }, 500);
    }
  };
}
