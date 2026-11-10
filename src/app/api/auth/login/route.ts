import { NextResponse } from "next/server";
import { checkPassphrase, cookieOptions, newSessionToken, SESSION_COOKIE } from "@/lib/session";

/** POST { passphrase } → sets the httpOnly session cookie (see src/lib/session.ts). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!checkPassphrase(typeof body?.passphrase === "string" ? body.passphrase : null))
    return NextResponse.json({ error: "Sai passphrase" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, newSessionToken(), cookieOptions);
  return res;
}
