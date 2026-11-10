import { NextResponse } from "next/server";
import { checkPassphrase, cookieOptions, isAuthedRequest, newSessionToken, SESSION_COOKIE } from "@/lib/session";

/** The older login (Bearer passphrase); kept for clients not yet updated. It sets the session cookie too. */
export async function POST(req: Request) {
  if (!isAuthedRequest(req)) return NextResponse.json({ error: "Invalid passphrase" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  const auth = req.headers.get("Authorization") ?? "";
  if (checkPassphrase(auth.startsWith("Bearer ") ? auth.slice(7) : null)) res.cookies.set(SESSION_COOKIE, newSessionToken(), cookieOptions);
  return res;
}
