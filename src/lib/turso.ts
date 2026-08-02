import { createClient } from "@libsql/client";

function createTursoClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) return null;
  return createClient({ url, authToken });
}

export const db = createTursoClient();

// Run once per process — no-ops on subsequent cold starts thanks to IF NOT EXISTS / IF EXISTS
export async function initSchema() {
  if (!db) return;

  // Send all idempotent DDL in one batch (single network round trip to Turso)
  await db.batch(
    [
      `DROP TABLE IF EXISTS viewed_words`,
      `CREATE TABLE IF NOT EXISTS user_words (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL,
        simp            TEXT NOT NULL,
        view_count      INTEGER NOT NULL DEFAULT 1,
        first_viewed_at TEXT NOT NULL,
        last_viewed_at  TEXT NOT NULL,
        UNIQUE (user_id, simp)
      )`,
      `CREATE TABLE IF NOT EXISTS ai_explanations (
        simp         TEXT NOT NULL,
        user_id      TEXT NOT NULL,
        content      TEXT NOT NULL,
        model        TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        PRIMARY KEY (simp, user_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ai_explanations_simp_generated
        ON ai_explanations(simp, generated_at DESC)`,
      `CREATE TABLE IF NOT EXISTS ai_usage_log (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        called_at  TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user_called
        ON ai_usage_log(user_id, called_at)`,
      `CREATE TABLE IF NOT EXISTS notebook_groups (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        title       TEXT NOT NULL,
        description TEXT,
        type        TEXT NOT NULL DEFAULT 'manual',
        sort_order  INTEGER DEFAULT 0,
        slug        TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_notebook_groups_user
        ON notebook_groups(user_id, sort_order)`,
      `CREATE TABLE IF NOT EXISTS notebook_lyrics (
        id             TEXT PRIMARY KEY,
        group_id       TEXT NOT NULL UNIQUE REFERENCES notebook_groups(id) ON DELETE CASCADE,
        content        TEXT NOT NULL,
        youtube_url    TEXT,
        translation    TEXT,
        translated_at  TEXT,
        auto_extract   INTEGER DEFAULT 0,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS word_etymology_links (
        word                 TEXT PRIMARY KEY,
        etymological_related TEXT DEFAULT '[]',
        created_at           TEXT NOT NULL,
        updated_at           TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS user_history (
        id         TEXT PRIMARY KEY,
        type       TEXT NOT NULL,
        label      TEXT NOT NULL,
        timestamp  INTEGER NOT NULL,
        view_count INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_user_history_timestamp
        ON user_history(timestamp DESC)`,
      `CREATE TABLE IF NOT EXISTS flashcard_cards (
        id                TEXT PRIMARY KEY,
        user_id           TEXT NOT NULL,
        simp              TEXT NOT NULL,
        ease_factor       REAL NOT NULL DEFAULT 2.5,
        interval_days     INTEGER NOT NULL DEFAULT 0,
        repetitions       INTEGER NOT NULL DEFAULT 0,
        lapses            INTEGER NOT NULL DEFAULT 0,
        due_at            TEXT NOT NULL,
        last_reviewed_at  TEXT,
        created_at        TEXT NOT NULL,
        excluded_at       TEXT,
        UNIQUE (user_id, simp)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_flashcard_cards_due
        ON flashcard_cards(user_id, due_at)`,
      `CREATE INDEX IF NOT EXISTS idx_flashcard_cards_lapses
        ON flashcard_cards(user_id, lapses)`,
      `CREATE TABLE IF NOT EXISTS flashcard_decks (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        title       TEXT NOT NULL,
        sort_order  INTEGER DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS flashcard_deck_cards (
        deck_id   TEXT NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
        card_id   TEXT NOT NULL REFERENCES flashcard_cards(id) ON DELETE CASCADE,
        added_at  TEXT NOT NULL,
        PRIMARY KEY (deck_id, card_id)
      )`,
      `CREATE TABLE IF NOT EXISTS flashcard_sessions (
        id                 TEXT PRIMARY KEY,
        user_id            TEXT NOT NULL,
        deck_id            TEXT,
        deck_label         TEXT NOT NULL,
        started_at         TEXT NOT NULL,
        finished_at        TEXT NOT NULL,
        total_words        INTEGER NOT NULL,
        passed_first_try   INTEGER NOT NULL,
        failed_first_try   INTEGER NOT NULL,
        total_attempts     INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_flashcard_sessions_deck
        ON flashcard_sessions(user_id, deck_label, finished_at DESC)`,
    ],
    "write"
  );

  // PRAGMA checks for conditional ALTER TABLE migrations (can't be batched — need the result first).
  // Run both in parallel to save one round trip.
  const [tableInfo, groupsInfo] = await Promise.all([
    db.execute(`PRAGMA table_info(user_words)`),
    db.execute(`PRAGMA table_info(notebook_groups)`),
  ]);

  const existingCols = new Set(
    tableInfo.rows.map((r) => (r as Record<string, unknown>).name as string)
  );
  const groupCols = new Set(
    groupsInfo.rows.map((r) => (r as Record<string, unknown>).name as string)
  );

  const alterStmts: string[] = [];
  for (const [col, def] of [
    ["group_ids",    "TEXT DEFAULT '[]'"],
    ["note",         "TEXT"],
    ["custom_links", "TEXT DEFAULT '[]'"],
  ] as [string, string][]) {
    if (!existingCols.has(col)) {
      alterStmts.push(`ALTER TABLE user_words ADD COLUMN ${col} ${def}`);
    }
  }
  if (!groupCols.has("slug")) {
    alterStmts.push(`ALTER TABLE notebook_groups ADD COLUMN slug TEXT`);
  }
  if (alterStmts.length > 0) {
    await db.batch(alterStmts, "write");
  }
}
