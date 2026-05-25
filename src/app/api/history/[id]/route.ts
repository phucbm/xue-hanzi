import { NextResponse } from "next/server";
import { db, initSchema } from "@/lib/turso";
import { verifyHistoryPassphrase } from "@/lib/historyAuth";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyHistoryPassphrase(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db)
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  await initSchema();
  const { id } = await params;
  const body = await req.json();
  await db.execute({
    sql: `INSERT OR REPLACE INTO user_history (id, type, label, timestamp, view_count, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      body.type,
      body.label,
      body.timestamp,
      body.viewCount,
      new Date().toISOString(),
    ],
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyHistoryPassphrase(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!db)
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  await initSchema();
  const { id } = await params;
  await db.execute({
    sql: "DELETE FROM user_history WHERE id = ?",
    args: [id],
  });
  return NextResponse.json({ ok: true });
}
