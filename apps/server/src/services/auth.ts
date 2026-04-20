import { jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config";
import { createSession, deleteSession, findSession } from "./db";
import { createId } from "./ids";
import { getOidcClientSecret, getSettings } from "./settings";

const sessionCookie = "screenshot_session";
const stateCookie = "screenshot_oidc_state";
const nonceCookie = "screenshot_oidc_nonce";
const returnToCookie = "screenshot_oidc_return_to";

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
};

let cachedDiscovery: Discovery | null = null;

export type AuthUser = {
  email: string;
};

export function getCurrentUser(c: Context): AuthUser | null {
  const sid = readSignedSessionId(getCookie(c, sessionCookie));
  if (!sid) return null;
  const session = findSession(sid);
  return session ? { email: session.email } : null;
}

export async function requireUser(c: Context, next: Next) {
  const user = getCurrentUser(c);
  if (!user) {
    return c.json({ error: "Authentication required" }, 401);
  }

  c.set("user", user);
  await next();
}

export function oidcReady(): boolean {
  return getSettings().oidcConfigured;
}

export async function startLogin(c: Context): Promise<Response> {
  const settings = getSettings();
  if (!settings.oidcConfigured) {
    return c.json({ error: "OIDC is not configured" }, 503);
  }

  const returnTo = safeReturnTo(c.req.query("returnTo")) ?? "/admin";
  if (getCurrentUser(c)) {
    return c.redirect(returnTo);
  }

  const discovery = await getDiscovery();
  const state = createId(32);
  const nonce = createId(32);
  const url = new URL(discovery.authorization_endpoint);

  url.searchParams.set("client_id", settings.oidcClientId);
  url.searchParams.set("redirect_uri", settings.oidcRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);

  setShortCookie(c, stateCookie, state);
  setShortCookie(c, nonceCookie, nonce);
  setShortCookie(c, returnToCookie, returnTo);

  return c.redirect(url.toString());
}

export async function finishLogin(c: Context): Promise<Response> {
  const settings = getSettings();
  if (!settings.oidcConfigured) {
    return c.redirect("/admin?error=oidc_not_configured");
  }

  const expectedState = getCookie(c, stateCookie);
  const expectedNonce = getCookie(c, nonceCookie);
  const returnTo = safeReturnTo(getCookie(c, returnToCookie)) ?? "/admin";
  const state = c.req.query("state");
  const code = c.req.query("code");

  deleteCookie(c, stateCookie, cookieOptions());
  deleteCookie(c, nonceCookie, cookieOptions());
  deleteCookie(c, returnToCookie, cookieOptions());

  if (!code || !state || !expectedState || state !== expectedState || !expectedNonce) {
    return c.redirect("/admin?error=invalid_oidc_state");
  }

  const discovery = await getDiscovery();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: settings.oidcRedirectUri,
    client_id: settings.oidcClientId,
    client_secret: getOidcClientSecret()
  });

  const tokenResponse = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!tokenResponse.ok) {
    return c.redirect("/admin?error=token_exchange_failed");
  }

  const tokenPayload = (await tokenResponse.json()) as { id_token?: string };
  if (!tokenPayload.id_token) {
    return c.redirect("/admin?error=missing_id_token");
  }

  const claims = await verifyIdToken(tokenPayload.id_token, expectedNonce);
  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  const allowedEmail = settings.adminEmail.toLowerCase();

  if (!email || email !== allowedEmail) {
    return c.redirect("/admin?error=email_not_allowed");
  }

  const sid = createId(48);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  createSession(sid, email, expiresAt);

  setCookie(c, sessionCookie, signSessionId(sid), {
    ...cookieOptions(),
    maxAge: 60 * 60 * 24 * 14
  });

  return c.redirect(addCallbackMarker(returnTo));
}

export function logout(c: Context): Response {
  const sid = readSignedSessionId(getCookie(c, sessionCookie));
  if (sid) deleteSession(sid);
  deleteCookie(c, sessionCookie, cookieOptions());
  return c.redirect("/");
}

async function getDiscovery(): Promise<Discovery> {
  if (cachedDiscovery) return cachedDiscovery;
  const issuer = getSettings().oidcIssuerUrl.replace(/\/$/, "");
  const response = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!response.ok) throw new Error("Could not load OIDC discovery document");
  cachedDiscovery = (await response.json()) as Discovery;
  return cachedDiscovery;
}

async function verifyIdToken(idToken: string, nonce: string): Promise<JWTPayload> {
  const settings = getSettings();
  const discovery = await getDiscovery();
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
  const result = await jwtVerify(idToken, jwks, {
    issuer: discovery.issuer,
    audience: settings.oidcClientId
  });

  if (result.payload.nonce !== nonce) {
    throw new Error("Invalid OIDC nonce");
  }

  return result.payload;
}

function setShortCookie(c: Context, name: string, value: string): void {
  setCookie(c, name, value, {
    ...cookieOptions(),
    maxAge: 60 * 10
  });
}

export function loginUrlFor(pathname: string, search = ""): string {
  const returnTo = safeReturnTo(`${pathname}${search}`) ?? "/admin";
  return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

function safeReturnTo(value: string | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/auth/")) return null;
  return value;
}

function addCallbackMarker(returnTo: string): string {
  const url = new URL(returnTo, "http://screenshot.local");
  url.searchParams.set("auth", "callback");
  return `${url.pathname}${url.search}`;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.appOrigin.startsWith("https://"),
    sameSite: "Lax" as const,
    path: "/",
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {})
  };
}

function signSessionId(id: string): string {
  return `${id}.${signatureFor(id)}`;
}

function readSignedSessionId(value: string | undefined): string | null {
  if (!value) return null;
  const [id, signature] = value.split(".");
  if (!id || !signature) return null;

  const expected = signatureFor(id);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.byteLength !== right.byteLength) return null;

  return timingSafeEqual(left, right) ? id : null;
}

function signatureFor(id: string): string {
  return createHmac("sha256", config.sessionSecret || "screenshot-dev-session-secret").update(id).digest("base64url");
}
