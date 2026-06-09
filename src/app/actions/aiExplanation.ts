"use server";

import { db, initSchema } from "@/lib/turso";
import { GUEST_USER_ID } from "@/lib/aiConstants";

export interface AiExplanation {
  simp: string;
  userId: string;
  content: string;
  model: string;
  generatedAt: string;
}

let schemaReady = false;

async function ready(): Promise<boolean> {
  if (!db) return false;
  if (!schemaReady) {
    await initSchema();
    schemaReady = true;
  }
  return true;
}

function toExplanation(row: Record<string, unknown>): AiExplanation {
  return {
    simp: row.simp as string,
    userId: row.user_id as string,
    content: row.content as string,
    model: row.model as string,
    generatedAt: row.generated_at as string,
  };
}

export async function getAiExplanation(simp: string): Promise<AiExplanation | null> {
  if (!(await ready())) return null;

  const latest = await db!.execute({
    sql: "SELECT * FROM ai_explanations WHERE simp = ? ORDER BY generated_at DESC LIMIT 1",
    args: [simp],
  });
  return latest.rows[0] ? toExplanation(latest.rows[0] as Record<string, unknown>) : null;
}

export async function saveAiExplanation(
  simp: string,
  content: string,
  model: string
): Promise<void> {
  if (!(await ready())) return;

  const now = new Date().toISOString();

  await db!.execute({
    sql: `
      INSERT INTO ai_explanations (simp, user_id, content, model, generated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(simp, user_id) DO UPDATE SET
        content      = excluded.content,
        model        = excluded.model,
        generated_at = excluded.generated_at
    `,
    args: [simp, GUEST_USER_ID, content, model, now],
  });
}

