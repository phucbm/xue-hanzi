import { NextResponse } from "next/server";
import { verifyHistoryPassphrase } from "@/lib/historyAuth";

export async function POST(req: Request) {
  if (verifyHistoryPassphrase(req)) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid passphrase" }, { status: 401 });
}
