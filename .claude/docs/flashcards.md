# Flashcards — Architecture

Spaced-repetition study built on top of words the user has already looked up —
not a separate vocabulary list. Single guest user (`GUEST_USER_ID`), same
pattern as the rest of the app (see root `CLAUDE.md`). Long-term/deep-use tool
(university Chinese study), not a casual toy — the schema and algorithm favor
correctness over minimalism.

## Data model (Turso)

Defined in `src/lib/turso.ts` (`initSchema()`).

```sql
-- One row per (user, word) ever added to flashcards. Deck-independent SRS state.
-- Keyed on exact `simp`, so a compound (学生) and its component chars (学, 生)
-- are naturally separate rows — no dedup logic needed.
CREATE TABLE flashcard_cards (
  id, user_id, simp,
  ease_factor       REAL DEFAULT 2.5,
  interval_days     INTEGER DEFAULT 0,
  repetitions       INTEGER DEFAULT 0,
  lapses            INTEGER DEFAULT 0,
  due_at            TEXT NOT NULL,
  last_reviewed_at  TEXT,
  created_at        TEXT NOT NULL,
  excluded_at       TEXT,     -- NULL = active, timestamp = user blacklisted it
  UNIQUE (user_id, simp)
);

-- Manual decks only. Auto decks (HSK/month/leech) are never stored — computed
-- live by filtering flashcard_cards at query time.
CREATE TABLE flashcard_decks (id, user_id, title, sort_order, created_at, updated_at);

-- Membership junction, manual decks only.
CREATE TABLE flashcard_deck_cards (deck_id, card_id, added_at);

-- One row per COMPLETED session only. Abandoned sessions write nothing.
CREATE TABLE flashcard_sessions (
  id, user_id,
  deck_id, deck_label,   -- deck_id is NULL for auto decks (no FK target — see below)
  started_at, finished_at,
  total_words, passed_first_try, failed_first_try, total_attempts
);
```

`flashcard_sessions.deck_id` is only set for manual decks; auto decks (e.g.
`hsk:3`) don't have a row anywhere, so their sessions are identified by
`deck_label` instead of a foreign key.

## SM-2 algorithm

`src/core/srs.ts` — pure, unmodified textbook SM-2, no I/O:

- Binary grading only: **Đã nhớ** (`q=5`) / **Chưa nhớ?** (`q=2`) — no 6-point scale.
- Fail (`q<3`): `repetitions=0`, `interval=1`, `lapses+=1`.
- Pass: `interval=1` (1st rep) → `6` (2nd rep) → `round(interval * ease)` (3rd+).
- `ease = max(1.3, ease + (0.1 - (5-q) * (0.08 + (5-q)*0.02)))`.
- New cards: `ease=2.5, repetitions=0, interval=0, due_at=now` — immediately due.

## Auto-add-on-view

Every word *viewed* (not searched) becomes a flashcard automatically —
`upsertFlashcardOnView(simp)` in `src/app/actions/flashcards.ts`, called from
three places: `src/app/page.tsx` (`openWord` + the tab-switch effect, so
per-character tabs of a compound count too) and `src/app/word/[simp]/WordDetailPage.tsx`.

```sql
INSERT INTO flashcard_cards (id, user_id, simp, due_at, created_at)
VALUES (?, ?, ?, datetime('now'), datetime('now'))
ON CONFLICT (user_id, simp) DO NOTHING;
```

`DO NOTHING` is deliberate: a repeat view must never reset existing SM-2 state
and must never silently un-exclude a blacklisted word. Consequence: every
lookup — even a one-off spelling check — permanently enters the SRS queue
unless explicitly excluded afterward. `excluded_at` (see below) is the escape
hatch. **Words viewed before this feature existed are not retroactively
added** — there is no backfill in the codebase; a one-time backfill script was
run directly against the database when this shipped (not committed — it read
`user_history WHERE type='word'` and upserted each into `flashcard_cards`,
using the original view timestamp as `created_at` so month-buckets stayed
accurate). If this is ever needed again, same approach: a throwaway script,
not a persisted feature.

## Deck taxonomy

**Auto decks** (`src/core/flashcard-engine.ts`, computed live from
`flashcard_cards`, never stored): `all`, `hsk:{1-7}`, `month:{YYYY-MM}`,
`leech`. Every auto/manual deck implicitly filters `excluded_at IS NULL`.

- **HSK buckets**: level comes from `chinese-lexicon`'s algorithmic difficulty
  tier (`getEntries(simp)[0].statistics.hskLevel`), **not a curated official
  exam word list** — it covers ~117K of 119K dictionary entries. Since decks
  only ever contain words the user explicitly saved, this doesn't matter for
  deck membership, but it does mean "% of HSK 3 mastered" is relative to this
  app's own bucketing, not a verified external benchmark. This caveat is
  shown directly in the dashboard UI (not just here) — see Dashboard below.
- **Leech**: `lapses >= LEECH_LAPSE_THRESHOLD` (3, in `src/core/flashcard-types.ts`).
- **Excluded** (`EXCLUDED_DECK_ID = "excluded"`): a pseudo-deck, not studyable
  — the blacklist-management view (`/flashcards/excluded`), lists
  `excluded_at IS NOT NULL` words with a restore button.

**Manual decks** are real `flashcard_decks` rows. "Add to Flashcards" on a
word's detail tab only files it into a *manual* deck (you can't "add to
HSK3" — that membership is derived, not assigned); a separate "Remove from
Flashcards" control sets `excluded_at`, which hides the word everywhere
(manual and auto) without touching manual-deck membership rows — restoring
un-hides it back into exactly the decks it was already in.

## Study session flow

1. **Build queue**: due cards for the deck, shuffled. No daily new-card cap —
   the start screen shows the full due count and lets the user optionally
   pick a smaller session size, self-paced rather than system-throttled.
2. **Grade-once rule**: each card's SM-2 update happens on its *first* answer
   only, tracked in memory (`gradedRef` in `StudySession.tsx`).
3. **Đã nhớ** (first time): grade `q=5`, remove from queue.
4. **Chưa nhớ?** (first time): reveal full word info, grade `q=2`, reinsert
   into the queue at a random position with a minimum 3-card gap.
5. **Reappearance after a fail**: pure reinforcement, no further SM-2 write.
   No retry cap — a word can recycle indefinitely until passed.
6. **Completion**: queue empty (every word passed at least once).
7. **Persistence — atomic**: nothing is written during the session. On
   completion, one `db.batch()` call upserts every touched card's final SM-2
   state plus one `flashcard_sessions` row. If the app closes mid-session,
   nothing is saved — not even cards already marked "Đã nhớ".

## `FlashcardEngine` — the domain layer

`src/core/flashcard-engine.ts` is a plain class, **no I/O**, constructed once
per request from rows already fetched from Turso:

```ts
const engine = new FlashcardEngine(cards, decks, deckCards, sessions);
engine.getDecks()          // DeckListItem[] — due count, last score, fluency color
engine.getDeckWords(id)    // FlashcardCard[] for a given deck/auto-deck id
engine.getSystemMetrics()  // SystemMetrics — dashboard data (see below)

FlashcardEngine.classifyMastery(card)  // static: "new" | "learning" | "mastered"
FlashcardEngine.isLeech(card)          // static
FlashcardEngine.fluencyOf(cards)       // static: DeckFluency for a set of cards
```

`src/app/actions/flashcards.ts` (`"use server"`) is a thin I/O layer: one
`loadEngine()` helper runs 4 queries (cards, decks, deck-card links, last
`SESSION_LOG_LIMIT=500` sessions) and constructs the engine; every read-heavy
exported action is `const engine = await loadEngine(); return engine.method();`.
CRUD actions that don't need aggregate views (`createDeck`, `excludeWord`,
`addWordToDeck`, etc.) still write directly — no reason to round-trip through
the engine for a single-row write.

**Why this split**: adding a new metric or deck type later means adding one
method to `FlashcardEngine` — not a new query plus a new copy of the
due-count/grouping logic. The mastery-tier definition, the leech threshold,
and the HSK grouping all live in exactly one place each, reused by the deck
list, the deck-fluency color, and the dashboard.

Two constants (`MASTERED_INTERVAL_DAYS`, `LEECH_LAPSE_THRESHOLD`) live in
`src/core/flashcard-types.ts`, **not** in `flashcard-engine.ts`, on purpose:
`flashcard-engine.ts` imports `chinese-lexicon` (Node-only) for HSK lookups,
so anything imported by client components must come from `flashcard-types.ts`
or `flashcard-streak.ts` instead — never from the engine file directly, or
the client bundle breaks (`Module not found: Can't resolve 'fs'`).

## Mastery tiers (shared everywhere)

Defined once (`FlashcardEngine.classifyMastery`), used by the mastery bar,
the HSK mastery bars, and each deck's fluency color:

| Tier | Condition |
|---|---|
| New | `repetitions === 0` (never answered) |
| Learning | answered at least once, `interval_days < MASTERED_INTERVAL_DAYS` |
| Mastered | `interval_days >= MASTERED_INTERVAL_DAYS` (21 — Anki's "mature card" convention) |

`MASTERED_INTERVAL_DAYS` is a tunable knob, not derived from any standard.

**Deck fluency**: `FlashcardEngine.fluencyOf(cards)` — a weighted score
(new=0, learning=0.5, mastered=1, averaged) bucketed back into the same 3
tiers, driving each deck row's bg tint + colored dot in `/flashcards`.
Suppressed (`tier: null`) below `MIN_CARDS_FOR_FLUENCY_COLOR` (3) active
cards — a 1-card deck that happens to be mastered would read as 100% green,
which is noise, not signal.

## Dashboard (`/flashcards`, `FlashcardDashboard.tsx`)

Sourced from `getSystemMetrics()`. Every metric ships a **visible caption in
the UI itself** explaining exactly how it's computed — not a tooltip, not
this doc alone. If you add a new metric, give it the same treatment.

- **Từ cần ôn hôm nay** (due today) / **Tỷ lệ nhớ** (retention, all-time
  `passed_first_try / total_words`) / **Chuỗi ngày học** (streak) — 3 stat tiles.
- **Streak + activity heatmap are computed client-side**
  (`src/core/flashcard-streak.ts`), not server-side. Reason: "which calendar
  day" a session falls on depends on the viewer's local timezone, and this
  app is used across multiple devices — the server has no way to know that,
  so `getSystemMetrics()` ships the raw `sessions: {finishedAt, totalWords}[]`
  log and the browser buckets it into local calendar days.
  - Streak convention: stays alive through today even before you've studied
    *today* — only breaks once a full calendar day passes with zero sessions.
- **Mastery bar**: stacked New/Learning/Mastered, colors validated for
  colorblind-safety and contrast (see Colors below).
- **HSK mastery bars**: % mastered per HSK level present among saved words —
  ships the "not an official exam list" caveat inline (see HSK buckets above).
- **Leech banner**: shown when `leechCount > 0`, states the `>= 3 lần` threshold inline.
- **Activity heatmap**: last 14 weeks, GitHub-style grid, intensity relative
  to the busiest day in the window (not an absolute word-count scale).

## Colors

New CSS custom properties in `src/app/globals.css` (`@theme inline` +
`:root`/`.dark`), following the file's existing OKLCH convention:

- `--mastery-learning`, `--mastery-mastered` — the 2 hue-bearing mastery-tier
  colors ("New" reuses the existing neutral `--muted-foreground` token).
- `--heat-1` through `--heat-4` — sequential heatmap ramp, one hue (the
  app's primary navy), monotone lightness.

All validated with the dataviz skill's `validate_palette.js` (categorical
checks: lightness band, chroma floor, CVD separation under simulated
protanopia/deuteranopia, normal-vision floor, contrast vs the card surface —
both light and dark mode) before being wired into any component. If you add
another status/categorical color to this feature, validate it the same way
rather than eyeballing a hex value.

## File map

```
core/
  srs.ts                — pure SM-2 gradeCard()
  flashcard-types.ts     — shared types + MASTERED_INTERVAL_DAYS/LEECH_LAPSE_THRESHOLD
                           (client-safe: no chinese-lexicon dependency)
  flashcard-engine.ts    — FlashcardEngine class (server-only: imports chinese-lexicon)
  flashcard-streak.ts    — computeStreak()/computeHeatmap() (client-safe, pure)

app/actions/flashcards.ts — "use server" I/O layer: loadEngine() + CRUD

app/flashcards/
  page.tsx                    — server component: getDecks() + getSystemMetrics()
  DeckList.tsx                — deck list, fluency-colored rows, create-deck dialog
  FlashcardDashboard.tsx      — hero stats, mastery bar, HSK bars, leech banner, heatmap
  study/StudySession.tsx      — session runner (start screen → grading → completion)
  deck/[deckId]/DeckDetail.tsx — manual deck rename/delete/word-management
  excluded/ExcludedList.tsx   — blacklist view + restore

components/word/AddToFlashcardsButton.tsx — manual-deck picker + exclude/restore, on WordTabContent
components/layout/AppLayoutWithHistory.tsx — AppLayout wired to useHistory(), used by all /flashcards pages
```

## Known tunable knobs (not derived from external standards)

- `MASTERED_INTERVAL_DAYS = 21` (`flashcard-types.ts`)
- `LEECH_LAPSE_THRESHOLD = 3` (`flashcard-types.ts`)
- `MIN_CARDS_FOR_FLUENCY_COLOR = 3` (`flashcard-engine.ts`)
- `SESSION_LOG_LIMIT = 500` (`actions/flashcards.ts`) — caps how much session
  history feeds the engine per request; plenty for the 14-week heatmap and
  per-deck last-score lookups without the query growing unbounded over time.
- Reinsertion gap after a fail: `REINSERT_MIN_GAP = 3` cards (`StudySession.tsx`)
