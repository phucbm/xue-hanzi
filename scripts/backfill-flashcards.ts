/**
 * backfill-flashcards.ts
 *
 * Creates a flashcard_cards row for every word in user_history that doesn't
 * already have one — catches words viewed before the auto-add-on-view hook
 * existed, or added to history through a path that doesn't call
 * upsertFlashcardOnView(). Safe to re-run anytime: existing cards are left
 * untouched (ON CONFLICT DO NOTHING), so it never resets SM-2 state or
 * un-excludes a blacklisted word.
 *
 * New cards get created_at = the word's original view timestamp (not "now"),
 * so month-bucket auto-decks stay accurate to when the word was actually
 * first looked up.
 *
 * Run: npm run backfill:flashcards
 */
import { createClient } from "@libsql/client";

const GUEST_USER_ID = "anonymous";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    console.error("Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
    process.exit(1);
  }
  const db = createClient({ url, authToken });

  const [historyRes, existingRes] = await Promise.all([
    db.execute({ sql: "SELECT label, timestamp FROM user_history WHERE type = 'word'", args: [] }),
    db.execute({ sql: "SELECT simp FROM flashcard_cards WHERE user_id = ?", args: [GUEST_USER_ID] }),
  ]);

  const existing = new Set(existingRes.rows.map((r) => r.simp as string));
  const statements: { sql: string; args: (string | number)[] }[] = [];
  const added: string[] = [];

  for (const row of historyRes.rows) {
    const simp = row.label as string;
    if (!simp || existing.has(simp)) continue;
    existing.add(simp);
    const createdAt = new Date(Number(row.timestamp)).toISOString();
    statements.push({
      sql: `INSERT INTO flashcard_cards (id, user_id, simp, due_at, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, simp) DO NOTHING`,
      args: [crypto.randomUUID(), GUEST_USER_ID, simp, createdAt, createdAt],
    });
    added.push(simp);
  }

  if (statements.length > 0) {
    await db.batch(statements, "write");
  }

  console.log(`Added ${added.length} new flashcard(s):`, added.join(", ") || "(none)");
}

main();
