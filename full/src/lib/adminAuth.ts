import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "turtle123";
const SESSION_TTL_SECONDS = 60 * 60 * 4;
const COOKIE_NAME = "protocol_admin_session";

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || ADMIN_PASSWORD;
}

function sign(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isAdminCredential(username: unknown, password: unknown) {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export function createAdminSessionToken() {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ user: ADMIN_USERNAME, expiresAt }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSessionToken(token?: string) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      user?: string;
      expiresAt?: number;
    };
    return parsed.user === ADMIN_USERNAME && typeof parsed.expiresAt === "number" && parsed.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export async function setAdminSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createAdminSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearAdminSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function hasAdminSession() {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(COOKIE_NAME)?.value);
}
