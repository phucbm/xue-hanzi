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
  flagged_hard_at   TEXT,     -- NULL = not flagged, timestamp = user marked it hard
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
  total_words, passed_first_try, failed_first_try, total_attempts,
  ahead_of_schedule  INTEGER NOT NULL DEFAULT 0  -- practice session, see below
);

-- One row per graded review, EVER — the only true history in this feature.
-- Everything else (flashcard_cards) is current-state-only and gets
-- overwritten; this table is append-only. Stores raw SM-2 numbers, never a
-- precomputed mastery tier — see "Review log" below for why.
CREATE TABLE flashcard_review_log (
  id, user_id,
  card_id     TEXT NOT NULL REFERENCES flashcard_cards(id) ON DELETE CASCADE,
  session_id  TEXT REFERENCES flashcard_sessions(id) ON DELETE SET NULL,
  simp        TEXT NOT NULL,
  quality     INTEGER NOT NULL,  -- 2 or 5 (SrsQuality)
  counted     INTEGER NOT NULL,  -- 1 = real due review, 0 = practice — see below
  ease_factor_after, interval_days_after, repetitions_after, lapses_after,
  reviewed_at TEXT NOT NULL
);
```

Note: this app doesn't run with `PRAGMA foreign_keys = ON`, so the `ON DELETE
CASCADE`/`SET NULL` above are documentation of intent, not enforced by
SQLite — every delete path (`forgetWord`, `deleteDeck`) does the cascading
explicitly in application code. Don't rely on the FK alone if you add a new
delete path; check what else references the row first.

`flashcard_sessions.deck_id` is only set for manual decks; auto decks (e.g.
`hsk:3`) don't have a row anywhere, so their sessions are identified by
`deck_label` instead of a foreign key. **`deck_label` for an auto deck must
be the stable descriptor** (`"hsk:1"`, `"all"`, `"leech"`, `"month:2026-08"`)
**, not the display title** (`"HSK 1"`) — `FlashcardEngine.lastSessionMaps()`
looks up "last score/session for this deck" by that descriptor. Storing the
title instead (what `StudySession.tsx` originally did, silently, for every
auto-deck session) makes the lookup never match, so `DeckListItem.lastScore`/
`lastSessionAt` stay `null` forever even though sessions completed fine —
this shipped broken and only surfaced once the deck list started actually
displaying "last studied" info. `StudySession.tsx`'s `submit()` now branches
on `isAutoDeckId(deckId)` to decide which one to send; manual decks still get
the human title (their lookup uses the real `deck_id` FK instead, so the
label there is genuinely just denormalized display text, per the original
design). If you ever see `lastScore`/`lastSessionAt` stuck at null for an
auto deck despite completed sessions, check this first.

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
hatch. **Words viewed before this feature existed (or added via a path that
skips `upsertFlashcardOnView`) are not retroactively added automatically** —
run `npm run backfill:flashcards` (`scripts/backfill-flashcards.ts`) to catch
them up. It reads `user_history WHERE type='word'`, upserts any label missing
from `flashcard_cards` (`ON CONFLICT DO NOTHING`, so it's idempotent — safe
to re-run anytime, e.g. after a manual DB import or while this feature is
still pre-release and history predates it), and uses the word's *original*
view timestamp as `created_at` so month-bucket auto-decks stay accurate
instead of bucketing everything into "the month I happened to run the
script." New cards land with `due_at` = that same past timestamp, so they
show up as due immediately (see Deck taxonomy below) rather than waiting a
full cycle before the user sees them.

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
- **Leech**: `lapses >= LEECH_LAPSE_THRESHOLD` (3, in `src/core/flashcard-types.ts`) **OR**
  `flagged_hard_at IS NOT NULL` — manually flagging a word as hard (the
  "Đánh dấu khó" action, see Word actions below) puts it in the same bucket
  as auto-detected leeches, on purpose: one place for "needs extra
  attention," whether the algorithm or the user decided that.
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

0. **Start-screen metrics**: before a session begins, `StudySession.tsx`
   fetches `getDeckMetrics(deckId)` (`FlashcardEngine.getDeckMetrics()`) —
   the same shape of info as the dashboard's `SystemMetrics` but scoped to
   this one deck: `total`, `dueToday`, `nextDueAt`, a `mastery` breakdown
   (new/learning/mastered), `leechCount`, and `newCards` (see below).
   Rendered as a compact card (mini mastery bar + leech count + next-due
   line + newly-added chips) above the "Bắt đầu" button, so the user can
   judge whether restudying is worth it without leaving the page. When
   `dueToday === 0` and `nextDueAt` is set, the card shows **"Cần học lại
   vào ngày mai"** / **"Cần học lại trong N ngày nữa"**
   (`formatNextDueMessage()`, built on the shared `daysUntil()` helper in
   `flashcard-types.ts` — the same helper backs `DeckList.tsx`'s terser
   "còn N ngày" row caption, so the two screens never disagree on the count).
   - **Newly-added badge/list**: `DeckListItem.newLast24h` (deck list) and
     `DeckMetrics.newCards` (start screen) both come from
     `FlashcardEngine.newCards()` — cards whose `created_at` falls in a
     **rolling 24h window from now**, not a calendar day. Deliberately keyed
     on `created_at` alone, independent of `dueAt`/`repetitions`/mastery:
     the point is "words you just looked up," so studying the deck today
     must not make a just-added word disappear from the badge before the
     24h window itself elapses. `DeckList.tsx` shows a small "N từ mới"
     pill next to the deck title (`Sparkles` icon) whenever `newLast24h >
     0` — the 24h window itself isn't spelled out in the badge text (it's
     documented here instead), to keep the row from getting noisy; the
     start-screen metrics card lists the actual words as clickable
     chips (`c.simp`, opens `/word/[simp]` in a new tab via the same
     `handleExploreWord` used by the in-session reveal). Worded "mới thêm
     trong 24 giờ qua" rather than bare "Mới" to avoid colliding with the
     unrelated "Mới" mastery tier (never-reviewed) shown right above it in
     the same card.
1. **Build queue**: due cards for the deck, shuffled. No daily new-card cap —
   the start screen shows the full due count and lets the user optionally
   pick a smaller session size, self-paced rather than system-throttled.
   **Ahead-of-schedule fallback**: if nothing in the deck is due yet,
   `startSession` doesn't block the deck — it falls back to every active
   card in the deck instead (`aheadOfSchedule: true` in `StartSessionResult`,
   computed once at session start: `pool = due.length === 0 && words.length > 0
   ? words : due`, so a session's queue is always homogeneous — either all due
   or all practice, never a mix). Surfaced in the start screen's copy and as a
   badge during/after the session. **These practice reviews never touch
   `flashcard_cards`** — see "Real vs. practice reviews" below for why this
   exists and how it's enforced. A deck's "Học" button is only disabled when
   it's truly empty (`DeckListItem.total === 0`), never just because nothing
   is due (`DeckListItem.count === 0`) — those are two different fields on
   purpose.
2. **Grade-once rule**: each card's SM-2 update happens on its *first* answer
   only, tracked in memory (`gradedRef` in `StudySession.tsx`).
3. **Đã nhớ** (first time): grade `q=5`, remove from queue.
4. **Chưa nhớ?** (first time): reveal the **full word detail view**
   (`WordTabContent` — the same component the word detail page and
   `/word/[simp]` use: AI explanation, definitions, etymology, related
   words, stroke animation — not just a stroke box), grade `q=2`, reinsert
   into the queue at a random position with a minimum 3-card gap.
   `WordTabContent`'s action row also carries the word-actions menu (see
   below), so flagging/excluding/deleting a word is available right there
   during review, no need to leave the session. Related/etymology words
   inside the reveal open in a **new tab** — clicking one doesn't navigate
   away from (and abandon) the in-memory session queue.
5. **Reappearance after a fail**: pure reinforcement, no further SM-2 write.
   No retry cap — a word can recycle indefinitely until passed.
6. **Completion**: queue empty (every word passed at least once).
7. **Persistence — atomic**: nothing is written during the session. On
   completion, one `db.batch()` call writes one `flashcard_sessions` row plus
   one `flashcard_review_log` row per graded card — and, only for a real
   (non-practice) session, an `UPDATE flashcard_cards` per graded card too
   (see below). If the app closes mid-session, nothing is saved — not even
   cards already marked "Đã nhớ".

## Real vs. practice reviews — the cramming fix

**The problem this solves**: before `aheadOfSchedule` gated persistence,
restudying an already-fully-reviewed deck (e.g. running HSK 1 ten times in
one day, once due count hit 0 thanks to the fallback above) advanced every
card's SM-2 `interval_days` every single time, since `gradeCard()` has no
same-day gate. Ten passes in one day could push a card past
`MASTERED_INTERVAL_DAYS` within the day — "mastered" a word had never
actually been spaced-repeated. Real SM-2/Anki mastery requires *time between
reviews*, not just repetition count.

**The fix**: `submitSession` (`app/actions/flashcards.ts`) branches on the
session's `aheadOfSchedule` flag decided once at `startSession()`:

- **Real session** (`aheadOfSchedule: false`, queue was actually due cards):
  `UPDATE flashcard_cards SET ease_factor/interval_days/repetitions/lapses/
  due_at/last_reviewed_at = ...` per card (the client-computed `gradeCard()`
  output), **and** a `flashcard_review_log` row with `counted = 1` storing
  that same post-grade state.
- **Practice session** (`aheadOfSchedule: true`, queue was the "nothing due,
  study anyway" fallback): **no write to `flashcard_cards` at all** — the
  client's `gradeCard()` output for these cards is computed (for the
  in-session UI: pass/fail, reinsertion-on-fail) but silently discarded at
  submit time. Instead, `submitSession` re-fetches each card's *current*
  (unchanged) `ease_factor/interval_days/repetitions/lapses` fresh from the
  DB and writes a `flashcard_review_log` row with `counted = 0` and those
  unchanged numbers — logging "you reviewed this word, here's where it
  already stood," not "here's what today's answer changed."

Either way a `flashcard_sessions` row is written (`ahead_of_schedule` column
mirrors the session-level flag), so streak/heatmap/last-score all still see
practice sessions as activity — practice is real study time and should count
toward showing up daily. It just can't fast-forward a card's schedule.

**Net effect**: a card's `due_at` only ever moves forward via a review that
was actually due. Repeating a deck same-day is honest practice — reinforces
memory, shows up in history and streak — but never fabricates spacing that
didn't happen. Getting to "mastered" still requires passing the same card
across multiple real due-reviews spread over the SM-2-computed intervals
(1 day → 6 days → growing by `ease` each time), which is the actual SM-2/Anki
mastery guarantee.

**Degradation over time** (a related but *not yet implemented* idea raised
during design): a card that reaches `MASTERED_INTERVAL_DAYS` and then isn't
reviewed again for a long stretch (e.g. 6 months) arguably should demote back
to "learning" even without a fresh review, since real recall likely decayed.
Today `classifyMastery()` is purely a function of `interval_days`/
`repetitions` — there's no time-decay/degrade pass. Not built; flagging it
here so a future session doesn't have to re-derive the idea from scratch.

## Review log (`flashcard_review_log`)

Append-only history — the only table in this feature that is never
overwritten, only inserted into (contrast `flashcard_cards`, which is
current-state-only and gets clobbered every review). One row per graded
answer, real or practice, holding `quality` (2 or 5), `counted` (1 real / 0
practice, see above), and the four raw SM-2 fields *as of that row*
(`ease_factor_after`, `interval_days_after`, `repetitions_after`,
`lapses_after`).

Read via `getWordReviewHistory(simp)` → `ReviewLogEntry[]`
(`src/core/flashcard-types.ts`), newest first. **Not wired into any UI yet**
— this pass only added the schema + write path + read action, deliberately
scoped that way. Building a per-word history view (e.g. "how many times has
this word reached mastered, and when") is future work; the data already
being captured is what makes that buildable later without a backfill.

Deliberately **no precomputed mastery tier is stored** on each row — derive
it on read with `FlashcardEngine.classifyMastery({ repetitions:
repetitionsAfter, intervalDays: intervalDaysAfter })` so historical rows
always reflect the *current* `MASTERED_INTERVAL_DAYS` threshold. If that
threshold is ever retuned, old history reinterprets correctly instead of
staying stamped with whatever tier definition was live when the row was
written.

`forgetWord` cascades to this table (`DELETE FROM flashcard_review_log WHERE
card_id = ?`, alongside deleting the card itself) — "forget" means erasing
all memory of the word, history included, not just resetting its SM-2 state.

## Word actions (`AddToFlashcardsButton.tsx`)

Despite the name, this is the single "Flashcard actions" menu for a word —
one component, reused in three places: `WordTabContent`'s action row (word
detail page, and by extension the study-session reveal above), and next to
each result row in `search-dialog.tsx`. One entry point everywhere a word
appears, rather than duplicated per-surface controls.

- **Add to a manual deck** — unchanged from before; lists manual decks only.
- **Đánh dấu khó (flag hard)** — `flagWordHard`/`unflagWordHard`, sets/clears
  `flagged_hard_at`. Toggle, `closeOnClick={false}` so the menu stays open.
- **Loại khỏi Flashcards / Khôi phục** — `excludeWord`/`restoreWord`, the
  existing soft blacklist (`excluded_at`).
- **Quên từ này... (forget)** — `forgetWord`, destructive, confirmed via
  `AlertDialog` first. Deletes the `flashcard_cards` row (+ its
  `flashcard_deck_cards` memberships) **and every `user_history` row with
  that exact label** (word and search entries alike) — "as if you'd never
  looked it up at all," not the soft-hide that exclude does. Irreversible;
  viewing the word again afterward starts a brand-new card via
  `upsertFlashcardOnView`, with no memory of the old SM-2 state.

`getWordFlashcardStatus(simp)` returns the current `cardId`/`excluded`/
`flaggedHard`/`deckIds` so the menu can render its toggles' current state;
it's re-fetched after every action (`refresh()`), not optimistically assumed.

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
tiers, driving each deck row's bg tint + colored dot + "Thành thạo X%" text
in `/flashcards`. Suppressed (`tier: null`) below
`MIN_CARDS_FOR_FLUENCY_COLOR` (3) active cards — a 1-card deck that happens
to be mastered would read as 100% green, which is noise, not signal.

**`DeckListItem` per-deck fields** (`DeckList.tsx`'s `DeckRow`): `total`
(every active card in the deck, regardless of due status — only `total === 0`
disables the "Học" button, see the ahead-of-schedule note above), `count`
(due today), `nextDueAt` (earliest `due_at` among cards not yet due; only
rendered when `count === 0` — if something's already due, the count itself
already answers "when," so this is purely the "nothing to do right now, come
back in N days" case), `newLast24h` (count of cards created in a rolling 24h
window — see the newly-added badge/list note under Study session flow),
`fluency` (above), `lastScore` + `lastSessionAt` (score and `finished_at` of
the deck's most recently completed session, both null if never studied) —
together these are what a user needs to decide whether to restudy a deck
without opening it.

## Dashboard (`/flashcards`, `FlashcardDashboard.tsx`)

Sourced from `getSystemMetrics()`. Every metric ships a **visible caption in
the UI itself** explaining exactly how it's computed — not a tooltip, not
this doc alone. If you add a new metric, give it the same treatment.

- **Từ cần ôn hôm nay** (due today) / **Đã học hôm nay** (words reviewed
  today, real + practice) / **Chuỗi ngày học** (streak) / **Tỷ lệ nhớ**
  (retention, all-time `passed_first_try / total_words`) — 4 stat tiles.
  "Đã học hôm nay" is computed client-side, not from `SystemMetrics`
  directly — `FlashcardDashboard.tsx` reads it off `computeHeatmap()`'s last
  cell (today, by definition — see below) instead of re-bucketing sessions,
  so it can never disagree with the heatmap's own today value.
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

components/word/AddToFlashcardsButton.tsx — the word-actions menu (deck picker,
  flag hard, exclude/restore, forget) — used by WordTabContent (→ word detail
  page + study-session reveal) AND search-dialog.tsx's result rows
components/layout/AppLayoutWithHistory.tsx — AppLayout wired to useHistory(), used by all /flashcards pages
components/theme-provider.tsx, theme-toggle.tsx — light/dark toggle (footer);
  next-themes was already a dependency but had no ThemeProvider wired up
  before this, so dark mode was unreachable regardless of OS preference
components/home/FlashcardTeaser.tsx — due-count/streak summary on the homepage welcome screen
```

## Known tunable knobs (not derived from external standards)

- `MASTERED_INTERVAL_DAYS = 21` (`flashcard-types.ts`)
- `LEECH_LAPSE_THRESHOLD = 3` (`flashcard-types.ts`)
- `MIN_CARDS_FOR_FLUENCY_COLOR = 3` (`flashcard-engine.ts`)
- `SESSION_LOG_LIMIT = 500` (`actions/flashcards.ts`) — caps how much session
  history feeds the engine per request; plenty for the 14-week heatmap and
  per-deck last-score lookups without the query growing unbounded over time.
- Reinsertion gap after a fail: `REINSERT_MIN_GAP = 3` cards (`StudySession.tsx`)
