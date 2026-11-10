import { NextResponse } from "next/server";
import { isAuthedRequest } from "@/lib/session";

/** GET → { loggedIn } for this device's cookie. */
export async function GET(req: Request) {
  return NextResponse.json({ loggedIn: isAuthedRequest(req) }, { headers: { "Cache-Control": "no-store" } });
}
