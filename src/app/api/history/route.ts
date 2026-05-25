import { NextResponse } from "next/server";
import { db, initSchema } from "@/lib/turso";
import { verifyHistoryPassphrase } from "@/lib/historyAuth";
import type { HistoryEntry } from "@/core/types";

export async function GET(req: Request) {
  if (!verifyHistoryPassphrase(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db)
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  await initSchema();
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
  if (!verifyHistoryPassphrase(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db)
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  await initSchema();
  await db.execute("DELETE FROM user_history");
  return NextResponse.json({ ok: true });
}
