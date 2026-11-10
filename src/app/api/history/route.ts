import { NextResponse } from "next/server";
import { db } from "@/lib/turso";
import { isAuthedRequest } from "@/lib/session";
import type { HistoryEntry } from "@/core/types";

export async function GET(req: Request) {
  if (!isAuthedRequest(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db)
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  const result = await db.execute(
    "SELECT id, type, label, timestamp, view_count FROM user_history ORDER BY timestamp DESC"
  );
  const entries: HistoryEntry[] = result.rows.map((r) => ({
    id: r.id as string,
    type: r.type as "search" | "word",
    label: r.label as string,
    timestamp: Number(r.timestamp),
    viewCount: Number(r.view_count),
  }));
  return NextResponse.json(entries);
}

export async function DELETE(req: Request) {
  if (!isAuthedRequest(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db)
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  await db.execute("DELETE FROM user_history");
  return NextResponse.json({ ok: true });
}
