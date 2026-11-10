import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * session.ts — the owner's login, server side. The passphrase (HISTORY_PASSPHRASE) is typed once per device in the
 * History sheet; /api/auth/login checks it and sets an httpOnly cookie holding `v1.<issued ms>.<HMAC>`, signed with
 * the passphrase itself (changing it logs every device out). The passphrase is never stored in the browser.
 *
 * Every flashcard server action and every /api/history* route checks it (requireSession / isAuthedRequest).
 * A request may also send `Authorization: Bearer <passphrase>` (scripts, curl).
 */
export const SESSION_COOKIE = "hch_session";
export const SESSION_MAX_AGE = 400 * 24 * 3600; // seconds; the most browsers keep a cookie

const secret = () => process.env.HISTORY_PASSPHRASE || null;
const mac = (key: string, data: string) => createHmac("sha256", key).update(data).digest("base64url");
const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function checkPassphrase(pass: string | null | undefined): boolean {
  const key = secret();
  return !!key && !!pass && same(pass, key);
}

export function newSessionToken(now = Date.now()): string {
  const key = secret();
  if (!key) throw new Error("HISTORY_PASSPHRASE is not set");
  return `v1.${now}.${mac(key, `v1.${now}`)}`;
}

export function verifySessionToken(token: string | null | undefined, now = Date.now()): boolean {
  const key = secret();
  const m = /^v1\.(\d+)\.([\w-]+)$/.exec(token ?? "");
  if (!key || !m) return false;
  if (now - Number(m[1]) > SESSION_MAX_AGE * 1000) return false;
  return same(m[2], mac(key, `v1.${m[1]}`));
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};

function cookieFrom(header: string | null): string | null {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** A route handler's request: the session cookie, or the passphrase as a Bearer token. */
export function isAuthedRequest(req: Request): boolean {
  if (verifySessionToken(cookieFrom(req.headers.get("cookie")))) return true;
  const auth = req.headers.get("Authorization") ?? "";
  return checkPassphrase(auth.startsWith("Bearer ") ? auth.slice(7) : null);
}

/** In a server action or server component: is the owner logged in on this device? */
export async function hasSession(): Promise<boolean> {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** In a server action: throws unless the owner is logged in. */
export async function requireSession(): Promise<void> {
  if (!(await hasSession())) throw new Error("Chưa đăng nhập: nhập passphrase ở mục Lịch sử");
}
