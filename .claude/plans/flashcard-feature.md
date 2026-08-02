# Flashcard Feature — Implementation Plan

## Goal
Spaced-repetition flashcards built on top of words already saved by the user. Single guest user today (`GUEST_USER_ID`), designed to not require rework when real multi-user auth returns. Long-term/deep-use tool (university Chinese study), not a casual toy — schema favors correctness over minimalism.

## Data model (Turso)

Add to `src/lib/turso.ts` (`initSchema()`), following the existing `CREATE TABLE IF NOT EXISTS` + `PRAGMA table_info` migration pattern already used for `user_words`/`notebook_groups`.

```sql
-- One row per (user, word) ever added to flashcards. Deck-independent SRS state.
-- Keyed on exact `simp` string, so a compound (学生) and its component chars (学, 生)
-- are naturally separate rows — no dedup logic needed, confirmed with user.
CREATE TABLE IF NOT EXISTS flashcard_cards (
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
  excluded_at       TEXT,             -- blacklist: NULL = active, timestamp = user explicitly removed
  UNIQUE (user_id, simp)
);
CREATE INDEX IF NOT EXISTS idx_flashcard_cards_due ON flashcard_cards(user_id, due_at);
CREATE INDEX IF NOT EXISTS idx_flashcard_cards_lapses ON flashcard_cards(user_id, lapses);

-- Manual decks only. Auto decks (HSK level, month-added, leech) are NOT stored here —
-- computed live by filtering flashcard_cards + dictionary.json at query time.
CREATE TABLE IF NOT EXISTS flashcard_decks (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Membership junction for MANUAL decks only.
CREATE TABLE IF NOT EXISTS flashcard_deck_cards (
  deck_id   TEXT NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  card_id   TEXT NOT NULL REFERENCES flashcard_cards(id) ON DELETE CASCADE,
  added_at  TEXT NOT NULL,
  PRIMARY KEY (deck_id, card_id)
);

-- One row per COMPLETED session only. Abandoned sessions write nothing.
CREATE TABLE IF NOT EXISTS flashcard_sessions (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  deck_id            TEXT,              -- NULL/sentinel if deck_id refers to an auto deck (store a deck descriptor, not FK, since auto decks aren't rows)
  deck_label         TEXT NOT NULL,     -- denormalized deck name at time of session, since auto-deck "identity" isn't a stable FK
  started_at         TEXT NOT NULL,
  finished_at        TEXT NOT NULL,
  total_words        INTEGER NOT NULL,
  passed_first_try   INTEGER NOT NULL,
  failed_first_try   INTEGER NOT NULL,  -- = lapses recorded this session
  total_attempts     INTEGER NOT NULL   -- includes recycled retries; friction signal
);
CREATE INDEX IF NOT EXISTS idx_flashcard_sessions_deck ON flashcard_sessions(user_id, deck_label, finished_at DESC);
```

Note on `flashcard_sessions.deck_id`: manual decks have a real id; auto decks (e.g. "HSK3") don't have a row anywhere, so sessions against them are identified by `deck_label` (e.g. `"hsk:3"`, `"month:2026-08"`, `"leech"`) rather than a foreign key. Query "last session score for deck X" by `deck_label`, not `deck_id`, for auto decks.

## Auto deck definitions (computed live, not stored)

All auto decks filter **the user's own saved words** (`flashcard_cards`), never the raw dictionary. Every query below implicitly adds `AND excluded_at IS NULL` — blacklisted words never appear in any deck, manual or auto:

```sql
-- All words
SELECT * FROM flashcard_cards WHERE user_id = ? AND excluded_at IS NULL;

-- HSK level N (dictionary.json hsk field looked up per simp, not stored redundantly in Turso)
SELECT * FROM flashcard_cards WHERE user_id = ? AND excluded_at IS NULL AND simp IN (<hsk=N words from dictionary>);

-- Added in a given month
SELECT * FROM flashcard_cards WHERE user_id = ? AND excluded_at IS NULL AND strftime('%Y-%m', created_at) = ?;

-- Leech / hard words
SELECT * FROM flashcard_cards WHERE user_id = ? AND excluded_at IS NULL AND lapses >= 3;
```

Confirmed with user: dictionary's `hsk` field (already present in `dictionary.json`, no new data source) is an algorithmic difficulty tier covering ~117K of 119K entries (not a curated official exam list — e.g. "HSK3" = 9,337 dictionary words), but since auto decks filter *saved* words only, this doesn't matter in practice — a deck only ever contains words the user explicitly added. **Confirmed: use as-is, no official list sourcing planned.**

Additionally, an **"Excluded"** pseudo-deck (`WHERE excluded_at IS NOT NULL`) is the home for blacklist management — appears in the deck list like any other auto deck, opens to a `WordRow` list with a restore (`restoreWord`) button per word instead of a study button.

Deck list view needs, per deck: **due count** (live query, `due_at <= now()` and `excluded_at IS NULL`) and **last session score** (`passed_first_try / total_words` from most recent `flashcard_sessions` row for that deck).

## Auto-add-on-view (confirmed with user)

Every word viewed (not searched — `user_history.type = 'word'`, not `'search'`) automatically becomes a flashcard, no explicit action required. Hook point: `addWordEntry("word", simp)` inside `openWord()` (`src/app/page.tsx:30`) and the tab-switch effect (`src/app/page.tsx:69`) — both already fire on every word view, including per-character tabs of a compound. Add a server-side upsert alongside that call:

```sql
INSERT INTO flashcard_cards (id, user_id, simp, due_at, created_at)
VALUES (?, ?, ?, datetime('now'), datetime('now'))
ON CONFLICT (user_id, simp) DO NOTHING;
```

`DO NOTHING` is deliberate: repeat views must never reset existing SM-2 state, and must never silently un-blacklist a word the user explicitly excluded (`excluded_at`) — only the explicit "restore" action (not yet designed, flagged below) may do that.

Consequence accepted by user: every lookup — even a one-off spelling check — permanently enters the SRS queue unless explicitly blacklisted afterward. This is why the blacklist (`excluded_at`) exists: it's the escape hatch for "I looked this up, I don't want to study it."

## "Add to Flashcards" button (confirmed placement)

Lives on each word's detail tab (`WordTabContent`). Since auto-add-on-view already guarantees membership in "All words" + relevant auto decks the moment a word is viewed, this button's only job is filing the word into a **manual** deck — its dropdown lists manual decks only, never auto decks (you can't "add to HSK3", membership there is derived, not assigned). A second control on the same tab — "Remove from Flashcards" — sets `excluded_at = now()`, removing the word from every deck (manual and auto) at once.

## Algorithm — standard SM-2, binary grading

UI shows 2 buttons only: **"Got it"** / **"What is this?"** — mapped to SM-2 quality `q`:
- Got it → `q = 5`
- What is this? → `q = 2`

Standard SM-2 update (`src/core/srs.ts`, pure function, no I/O):

```
function gradeCard(card, q):
  if q < 3:  // fail
    card.repetitions = 0
    card.interval_days = 1
    card.lapses += 1
  else:  // pass
    if card.repetitions == 0: card.interval_days = 1
    elif card.repetitions == 1: card.interval_days = 6
    else: card.interval_days = round(card.interval_days * card.ease_factor)
    card.repetitions += 1

  card.ease_factor = max(1.3, card.ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  card.due_at = today + card.interval_days days
  card.last_reviewed_at = now
  return card
```

This is unmodified textbook SM-2 — no custom tuning. New cards start `ease_factor = 2.5, repetitions = 0, interval_days = 0, due_at = now` (immediately due).

## Session flow (confirmed design)

1. **Build queue**: due + new cards for the selected deck (manual or auto), shuffled. **No automatic daily new-card cap** (confirmed with user — their actual pace is 30-40 new words/week in coherent batches like a reading session's vocab; an invisible cap would arbitrarily defer part of a batch they explicitly want to learn together, for no benefit). Instead, the start-session screen shows the full due+new count and **lets the user optionally choose a smaller session size** before starting (default: everything) — self-paced, not system-throttled. This matters because of rules 5-7 below: a large all-new batch is a genuine single long commitment (must-pass-all, atomic-save-only), so the user needs the *option* to start smaller, just not to have it decided for them silently.
2. **Grade-once rule**: each word's SM-2 update happens on its *first* answer in the session only. A `graded: Set<cardId>` tracks this in memory.
3. **Got it** (first time): compute `gradeCard(card, q=5)` in memory, mark graded, remove from active queue.
4. **What is this?** (first time): flip card to reveal full answer (reuse `WordInfoBox`/`StrokeBox`), compute `gradeCard(card, q=2)` in memory, mark graded, **reinsert into queue at a random position with a minimum gap** (e.g. ≥3 cards later) — not adjacent.
5. **Reappearance after a fail**: purely reinforcement. No further SM-2 write regardless of outcome (word already in `graded`). If failed again, reinsert again at random position. **No retry cap — confirmed with user**: a word can recycle indefinitely until passed.
6. **Session completion**: queue empty (every word passed at least once).
7. **Persistence — atomic, confirmed with user**: nothing is written to Turso during the session. On completion only, one `db.batch()` call: upsert all touched `flashcard_cards` rows + insert one `flashcard_sessions` row (`started_at`/`finished_at` → duration, `passed_first_try`, `failed_first_try`, `total_attempts` from the in-memory tally). **If the app closes mid-session, nothing is saved at all** — not even words already answered "Got it" — and the deck's due queue is unchanged next time.

## Server actions (new file: `src/app/actions/flashcards.ts`)

Reference for CRUD shape: `git show 0df9ece:src/app/actions/notebook.ts` (old notebook feature, removed in `7f60c8d`, same author/pattern to follow — deck CRUD, add/remove word).

- `getDecks()` — manual decks + fixed auto-deck descriptors (All words, HSK1–7 present in user's saved words, months present, Leech, **Excluded**), each with due count + last score (Excluded shows an excluded-word count instead, not a due count — it's not a studyable deck, just a management list)
- `createDeck(title)`, `renameDeck(id, title)`, `deleteDeck(id)`
- `addWordToDeck(deckId, simp)` — creates `flashcard_cards` row if missing; if the word was excluded, **silently clears `excluded_at`** (deliberately filing a word into a deck is a strong enough signal to undo a prior exclusion) — then creates the `flashcard_deck_cards` row
- `removeWordFromDeck(deckId, cardId)` — manual-deck membership only
- `excludeWord(simp)` — sets `excluded_at`, removes word from every deck (manual + auto) at once
- `restoreWord(simp)` — clears `excluded_at` directly, used from the "Excluded" pseudo-deck
- `getDeckWords(deckId | autoDeckDescriptor)` — for deck detail / manage-words view
- `startSession(deckId | autoDeckDescriptor, limit?)` — returns the shuffled queue (card data + word info) for the client to run entirely in memory; `limit` supports the user-chosen smaller session size
- `submitSession(result)` — the one atomic `db.batch()` write described above
- (upsert-on-view, `ON CONFLICT DO NOTHING`, called from wherever `addWordEntry("word", simp)` fires today)

## UI

Explicitly deferred — confirmed with user that everything visual (screens, layout, styling, review-card design) can change freely later without touching schema/algorithm. The only things that are NOT "just UI" (changing them later means revisiting schema/algorithm too): binary grading, atomic session commit, random-reinsertion mechanic, deck definitions, auto-add-on-view, blacklist semantics.

## Build order

1. Migration: add the 4 tables to `src/lib/turso.ts`, including `flashcard_cards.excluded_at`.
2. `src/core/srs.ts` — pure `gradeCard()` function, unit-testable with no DB.
3. `src/app/actions/flashcards.ts` — deck CRUD, exclude/restore, `startSession`/`submitSession`.
4. Wire the auto-add-on-view upsert into the existing `addWordEntry("word", simp)` call sites (`src/app/page.tsx:30` and `:69`).
5. "Add to Flashcards" (manual deck picker) + "Remove from Flashcards" (exclude) buttons on `WordTabContent`.
6. Deck list screen (due count + last score per deck, including the "Excluded" pseudo-deck with its excluded-word count).
7. Study session screen (session-size choice, queue runner, 2-button grading, flip-on-fail, random reinsertion).
8. Manual deck management (create deck, deck detail/remove-word view).
9. "Excluded" pseudo-deck detail view (`WordRow` list + restore button per word).
