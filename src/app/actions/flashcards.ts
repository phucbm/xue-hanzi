"use server";

import { db, initSchema } from "@/lib/turso";
import { GUEST_USER_ID } from "@/lib/aiConstants";
import {
  capNewCards,
  EXCLUDED_DECK_ID,
  isAutoDeckId,
  type DeckListItem,
  type DeckSessionEntry,
  type FlashcardCard,
  type FlashcardDeck,
  type ReviewLogEntry,
  type SessionQueueCard,
  type SessionSubmitPayload,
} from "@/core/flashcard-types";
import {
  FlashcardEngine,
  type DeckCardLink,
  type DeckMetrics,
  type SessionLogRow,
  type SystemMetrics,
} from "@/core/flashcard-engine";

/** Cap on how much session history feeds the engine per request — plenty for
 * the "last score per deck" lookups, the retention rate, and the client-side
 * streak/heatmap (last ~14 weeks), without the query growing unbounded as
 * sessions accumulate over months of use. */
const SESSION_LOG_LIMIT = 500;

let schemaReady = false;

async function ready(): Promise<boolean> {
  if (!db) return false;
  if (!schemaReady) {
    await initSchema();
    schemaReady = true;
  }
  return true;
}

function toCard(row: Record<string, unknown>): FlashcardCard {
  return {
    id: row.id as string,
    simp: row.simp as string,
    easeFactor: row.ease_factor as number,
    intervalDays: row.interval_days as number,
    repetitions: row.repetitions as number,
    lapses: row.lapses as number,
    dueAt: row.due_at as string,
    lastReviewedAt: (row.last_reviewed_at as string | null) ?? null,
    createdAt: row.created_at as string,
    excludedAt: (row.excluded_at as string | null) ?? null,
    flaggedHardAt: (row.flagged_hard_at as string | null) ?? null,
  };
}

function toDeck(row: Record<string, unknown>): FlashcardDeck {
  return {
    id: row.id as string,
    title: row.title as string,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Fetches every table the engine needs (4 queries) and constructs it. Every
 * read-heavy action below goes through this — see FlashcardEngine for why
 * the aggregation/grouping logic lives there instead of here. */
async function loadEngine(): Promise<FlashcardEngine | null> {
  if (!(await ready())) return null;

  const [cardsRes, decksRes, deckCardsRes, sessionsRes] = await Promise.all([
    db!.execute({
      sql: "SELECT * FROM flashcard_cards WHERE user_id = ?",
      args: [GUEST_USER_ID],
    }),
    db!.execute({
      sql: "SELECT * FROM flashcard_decks WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC",
      args: [GUEST_USER_ID],
    }),
    db!.execute({
      sql: `SELECT dc.deck_id, dc.card_id FROM flashcard_deck_cards dc
            JOIN flashcard_decks d ON d.id = dc.deck_id
            WHERE d.user_id = ?`,
      args: [GUEST_USER_ID],
    }),
    db!.execute({
      sql: `SELECT id, deck_id, deck_label, started_at, finished_at, total_words, passed_first_try, failed_first_try, total_attempts, ahead_of_schedule
            FROM flashcard_sessions WHERE user_id = ? ORDER BY finished_at DESC LIMIT ?`,
      args: [GUEST_USER_ID, SESSION_LOG_LIMIT],
    }),
  ]);

  const cards = cardsRes.rows.map((r) => toCard(r as Record<string, unknown>));
  const decks = decksRes.rows.map((r) => toDeck(r as Record<string, unknown>));
  const deckCards: DeckCardLink[] = deckCardsRes.rows.map((r) => {
    const row = r as Record<string, unknown>;
    return { deckId: row.deck_id as string, cardId: row.card_id as string };
  });
  const sessions: SessionLogRow[] = sessionsRes.rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      deckId: (row.deck_id as string | null) ?? null,
      deckLabel: row.deck_label as string,
      startedAt: row.started_at as string,
      finishedAt: row.finished_at as string,
      totalWords: row.total_words as number,
      passedFirstTry: row.passed_first_try as number,
      failedFirstTry: row.failed_first_try as number,
      totalAttempts: row.total_attempts as number,
      aheadOfSchedule: (row.ahead_of_schedule as number) === 1,
    };
  });

  return new FlashcardEngine(cards, decks, deckCards, sessions);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Auto-add-on-view ─────────────────────────────────────────────────────────

/** Every word viewed becomes a flashcard automatically. DO NOTHING on repeat
 * views: must never reset existing SM-2 state or silently un-exclude a
 * blacklisted word. */
export async function upsertFlashcardOnView(simp: string): Promise<void> {
  if (!(await ready())) return;
  const trimmed = simp.trim();
  if (!trimmed) return;
  const now = new Date().toISOString();
  await db!.execute({
    sql: `INSERT INTO flashcard_cards (id, user_id, simp, due_at, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, simp) DO NOTHING`,
    args: [crypto.randomUUID(), GUEST_USER_ID, trimmed, now, now],
  });
}

// ── Word status (for WordTabContent buttons) ─────────────────────────────────

export interface WordFlashcardStatus {
  cardId: string | null;
  excluded: boolean;
  flaggedHard: boolean;
  deckIds: string[];
}

export async function getWordFlashcardStatus(simp: string): Promise<WordFlashcardStatus> {
  const empty: WordFlashcardStatus = { cardId: null, excluded: false, flaggedHard: false, deckIds: [] };
  if (!(await ready())) return empty;
  const trimmed = simp.trim();
  const cardRes = await db!.execute({
    sql: "SELECT id, excluded_at, flagged_hard_at FROM flashcard_cards WHERE user_id = ? AND simp = ?",
    args: [GUEST_USER_ID, trimmed],
  });
  const row = cardRes.rows[0] as Record<string, unknown> | undefined;
  if (!row) return empty;

  const cardId = row.id as string;
  const deckRes = await db!.execute({
    sql: "SELECT deck_id FROM flashcard_deck_cards WHERE card_id = ?",
    args: [cardId],
  });
  return {
    cardId,
    excluded: row.excluded_at != null,
    flaggedHard: row.flagged_hard_at != null,
    deckIds: deckRes.rows.map((r) => (r as Record<string, unknown>).deck_id as string),
  };
}

// ── Manual deck CRUD ──────────────────────────────────────────────────────────

export async function getManualDecks(): Promise<FlashcardDeck[]> {
  if (!(await ready())) return [];
  const result = await db!.execute({
    sql: "SELECT * FROM flashcard_decks WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC",
    args: [GUEST_USER_ID],
  });
  return result.rows.map((r) => toDeck(r as Record<string, unknown>));
}

export async function getDeck(deckId: string): Promise<FlashcardDeck | null> {
  if (!(await ready())) return null;
  const result = await db!.execute({
    sql: "SELECT * FROM flashcard_decks WHERE id = ? AND user_id = ?",
    args: [deckId, GUEST_USER_ID],
  });
  return result.rows[0] ? toDeck(result.rows[0] as Record<string, unknown>) : null;
}

export async function createDeck(title: string): Promise<FlashcardDeck | null> {
  if (!(await ready())) return null;
  const trimmed = title.trim();
  if (!trimmed) return null;

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const maxResult = await db!.execute({
    sql: "SELECT MAX(sort_order) as max_order FROM flashcard_decks WHERE user_id = ?",
    args: [GUEST_USER_ID],
  });
  const maxOrder = ((maxResult.rows[0] as Record<string, unknown>).max_order as number | null) ?? -1;

  await db!.execute({
    sql: `INSERT INTO flashcard_decks (id, user_id, title, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, GUEST_USER_ID, trimmed, maxOrder + 1, now, now],
  });

  return { id, title: trimmed, sortOrder: maxOrder + 1, createdAt: now, updatedAt: now };
}

export async function renameDeck(deckId: string, title: string): Promise<void> {
  if (!(await ready())) return;
  const trimmed = title.trim();
  if (!trimmed) return;
  await db!.execute({
    sql: "UPDATE flashcard_decks SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    args: [trimmed, new Date().toISOString(), deckId, GUEST_USER_ID],
  });
}

export async function deleteDeck(deckId: string): Promise<void> {
  if (!(await ready())) return;
  await db!.batch(
    [
      { sql: "DELETE FROM flashcard_deck_cards WHERE deck_id = ?", args: [deckId] },
      { sql: "DELETE FROM flashcard_decks WHERE id = ? AND user_id = ?", args: [deckId, GUEST_USER_ID] },
    ],
    "write"
  );
}

// ── Word <-> deck membership, exclude/restore ────────────────────────────────

/** Creates the flashcard_cards row if missing; deliberately filing a word into
 * a deck is a strong enough signal to silently clear a prior exclusion. */
export async function addWordToDeck(deckId: string, simp: string): Promise<void> {
  if (!(await ready())) return;
  const trimmed = simp.trim();
  if (!trimmed) return;

  const now = new Date().toISOString();
  await db!.execute({
    sql: `INSERT INTO flashcard_cards (id, user_id, simp, due_at, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, simp) DO UPDATE SET excluded_at = NULL`,
    args: [crypto.randomUUID(), GUEST_USER_ID, trimmed, now, now],
  });

  const cardRes = await db!.execute({
    sql: "SELECT id FROM flashcard_cards WHERE user_id = ? AND simp = ?",
    args: [GUEST_USER_ID, trimmed],
  });
  const cardId = (cardRes.rows[0] as Record<string, unknown> | undefined)?.id as string | undefined;
  if (!cardId) return;

  await db!.execute({
    sql: `INSERT INTO flashcard_deck_cards (deck_id, card_id, added_at)
          VALUES (?, ?, ?)
          ON CONFLICT(deck_id, card_id) DO NOTHING`,
    args: [deckId, cardId, now],
  });
}

/** Manual-deck membership only — leaves the flashcard_cards row (and its SRS
 * state / other deck memberships) untouched. */
export async function removeWordFromDeck(deckId: string, cardId: string): Promise<void> {
  if (!(await ready())) return;
  await db!.execute({
    sql: "DELETE FROM flashcard_deck_cards WHERE deck_id = ? AND card_id = ?",
    args: [deckId, cardId],
  });
}

/** excluded_at is a soft blacklist: every deck/due-count query below filters
 * on `excluded_at IS NULL`, so this hides the word everywhere (manual and
 * auto decks alike) without touching manual-deck membership rows —
 * restoreWord() below un-hides it back into exactly the decks it was already in. */
export async function excludeWord(simp: string): Promise<void> {
  if (!(await ready())) return;
  await db!.execute({
    sql: "UPDATE flashcard_cards SET excluded_at = ? WHERE user_id = ? AND simp = ?",
    args: [new Date().toISOString(), GUEST_USER_ID, simp.trim()],
  });
}

export async function restoreWord(simp: string): Promise<void> {
  if (!(await ready())) return;
  await db!.execute({
    sql: "UPDATE flashcard_cards SET excluded_at = NULL WHERE user_id = ? AND simp = ?",
    args: [GUEST_USER_ID, simp.trim()],
  });
}

/** Manual "mark as hard" — merged into the leech bucket alongside
 * auto-detected leeches (see FlashcardEngine.isLeech). Does not touch
 * `lapses`, so it never corrupts the real failure count. */
export async function flagWordHard(simp: string): Promise<void> {
  if (!(await ready())) return;
  await db!.execute({
    sql: "UPDATE flashcard_cards SET flagged_hard_at = ? WHERE user_id = ? AND simp = ?",
    args: [new Date().toISOString(), GUEST_USER_ID, simp.trim()],
  });
}

export async function unflagWordHard(simp: string): Promise<void> {
  if (!(await ready())) return;
  await db!.execute({
    sql: "UPDATE flashcard_cards SET flagged_hard_at = NULL WHERE user_id = ? AND simp = ?",
    args: [GUEST_USER_ID, simp.trim()],
  });
}

/** Permanently forgets a word: deletes its flashcard_cards row (all SM-2
 * state, deck memberships, review history) AND every user_history row for
 * that exact label (word and search entries alike) — "as if you'd never
 * looked it up at all", not just excluded_at soft-hiding. Irreversible; the
 * caller is responsible for confirming with the user first. If viewed again
 * later, it re-enters as a brand-new card via upsertFlashcardOnView. */
export async function forgetWord(simp: string): Promise<void> {
  if (!(await ready())) return;
  const trimmed = simp.trim();
  if (!trimmed) return;

  const cardRes = await db!.execute({
    sql: "SELECT id FROM flashcard_cards WHERE user_id = ? AND simp = ?",
    args: [GUEST_USER_ID, trimmed],
  });
  const cardId = (cardRes.rows[0] as Record<string, unknown> | undefined)?.id as string | undefined;

  const statements: { sql: string; args: string[] }[] = [];
  if (cardId) {
    statements.push({ sql: "DELETE FROM flashcard_review_log WHERE card_id = ?", args: [cardId] });
    statements.push({ sql: "DELETE FROM flashcard_deck_cards WHERE card_id = ?", args: [cardId] });
    statements.push({ sql: "DELETE FROM flashcard_cards WHERE id = ?", args: [cardId] });
  }
  statements.push({ sql: "DELETE FROM user_history WHERE label = ?", args: [trimmed] });

  await db!.batch(statements, "write");
}

// ── Deck list (due counts + last scores + fluency) ───────────────────────────

export async function getDecks(): Promise<DeckListItem[]> {
  const engine = await loadEngine();
  return engine ? engine.getDecks() : [];
}

// ── Deck detail / manage-words view ──────────────────────────────────────────

export async function getDeckWords(deckId: string): Promise<FlashcardCard[]> {
  const engine = await loadEngine();
  return engine ? engine.getDeckWords(deckId) : [];
}

/** Per-deck breakdown (total, due, next-due date, mastery, leech count,
 * fluency) — shown on the study-session start screen so a user can see the
 * deck's state before committing to a session. */
export async function getDeckMetrics(deckId: string): Promise<DeckMetrics | null> {
  const engine = await loadEngine();
  return engine ? engine.getDeckMetrics(deckId) : null;
}

/** Full session history for one deck, newest first — lets a user see (and
 * delete, via deleteSession) individual past sessions, e.g. a stray 1-word
 * test session that's skewing "last score" on the deck list. */
export async function getDeckSessions(deckId: string): Promise<DeckSessionEntry[]> {
  const engine = await loadEngine();
  return engine ? engine.getDeckSessions(deckId) : [];
}

/** Deletes one flashcard_sessions row. Does NOT revert the SM-2 state
 * (due_at/ease/repetitions/lapses) that the session's grading already wrote
 * to flashcard_cards — a session can share cards with other sessions before/
 * after it, so "undoing" it safely would require a full per-review undo
 * log, not just deleting the summary row. This only removes the session
 * from history/stats: the deck's "last score", the all-time retention rate,
 * and the activity heatmap/streak (SystemMetrics.sessions and
 * DeckListItem.lastScore both read the same table) — surfaced explicitly in
 * the caller's confirmation dialog.
 *
 * flashcard_review_log rows are orphaned (session_id -> NULL), never
 * deleted, per that table's declared `ON DELETE SET NULL` intent — it's the
 * one append-only, permanent history table in this feature (see
 * .claude/docs/flashcards.md, "Review log"); a session bookkeeping cleanup
 * must not erase the underlying per-word graded-review record. Contrast
 * forgetWord(), which *does* delete review_log rows — there the intent is
 * "erase all memory of this word," a fundamentally different operation. */
export async function deleteSession(sessionId: string): Promise<void> {
  if (!(await ready())) return;
  await db!.batch(
    [
      { sql: "UPDATE flashcard_review_log SET session_id = NULL WHERE session_id = ?", args: [sessionId] },
      { sql: "DELETE FROM flashcard_sessions WHERE id = ? AND user_id = ?", args: [sessionId, GUEST_USER_ID] },
    ],
    "write"
  );
}

// ── Dashboard metrics ─────────────────────────────────────────────────────────

export async function getSystemMetrics(): Promise<SystemMetrics | null> {
  const engine = await loadEngine();
  return engine ? engine.getSystemMetrics() : null;
}

// ── Study session ─────────────────────────────────────────────────────────────

export interface StartSessionResult {
  queue: SessionQueueCard[];
  /** True when nothing in the deck was due today, so the queue falls back to
   * every active card in the deck instead — studying ahead of schedule
   * rather than blocking the deck until something comes due. Cards graded
   * this way still update their SM-2 state normally on submit. */
  aheadOfSchedule: boolean;
  /** New-tier cards (repetitions === 0) that were due but held back by
   * NEW_CARDS_PER_SESSION — not lost, just excluded from *this* queue. Their
   * due_at is untouched, so they surface in the next session (today or any
   * day) once this batch has been graded and moved on. See
   * .claude/docs/flashcards.md, "New-card cap per session". */
  deferredNewCount: number;
}

/** Builds a session queue from due (or, if nothing's due, every active —
 * "ahead of schedule") cards, then caps how many never-reviewed cards
 * (repetitions === 0) go in: only NEW_CARDS_PER_SESSION, oldest-`createdAt`
 * first, so a burst of new cards (a lookup binge, or backfill:flashcards
 * dumping a whole history at once) drains in fixed-size batches across
 * however many sessions it takes, instead of flooding one session. Due
 * reviews (repetitions > 0) are never capped — see NEW_CARDS_PER_SESSION's
 * doc comment for why. */
export async function startSession(deckId: string): Promise<StartSessionResult> {
  const engine = await loadEngine();
  if (!engine) return { queue: [], aheadOfSchedule: false, deferredNewCount: 0 };
  const words = engine.getDeckWords(deckId);
  const now = new Date().toISOString();
  const due = words.filter((c) => c.dueAt <= now);
  const aheadOfSchedule = due.length === 0 && words.length > 0;
  const pool = aheadOfSchedule ? words : due;

  const { reviewCards, cappedNewCards, deferredNewCount } = capNewCards(pool);
  const shuffled = shuffle([...reviewCards, ...cappedNewCards]);
  return {
    queue: shuffled.map((c) => ({ ...c, isNew: c.repetitions === 0 })),
    aheadOfSchedule,
    deferredNewCount,
  };
}

/** The one atomic write for a completed session, in a single db.batch() call.
 * Nothing is written if the app closes mid-session — this is only ever
 * called on session completion.
 *
 * Branches on `aheadOfSchedule` (see StartSessionResult): a **real** session
 * (something was actually due) persists every touched card's graded SM-2
 * state and logs a `counted=1` review-log row per card. A **practice**
 * session (studied ahead of schedule — nothing was due) never writes to
 * flashcard_cards at all; it only logs `counted=0` review-log rows carrying
 * each card's unchanged current state, so a review timeline isn't missing
 * days that were actually studied, without pretending they advanced anything.
 * Either way, exactly one flashcard_sessions row is written, tagged with the
 * same flag, so streak/last-score history can be labeled honestly. */
export async function submitSession(payload: SessionSubmitPayload): Promise<void> {
  if (!(await ready())) return;
  const { deckId, deckLabel, startedAt, finishedAt, results, totalAttempts, aheadOfSchedule } = payload;
  if (results.length === 0) return;

  const isManual = !isAutoDeckId(deckId) && deckId !== EXCLUDED_DECK_ID;
  const passedFirstTry = results.filter((r) => r.firstQuality === 5).length;
  const failedFirstTry = results.length - passedFirstTry;
  const sessionId = crypto.randomUUID();

  // Session row goes first — review-log rows below reference it by id.
  const statements: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: `INSERT INTO flashcard_sessions (id, user_id, deck_id, deck_label, started_at, finished_at, total_words, passed_first_try, failed_first_try, total_attempts, ahead_of_schedule)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        sessionId,
        GUEST_USER_ID,
        isManual ? deckId : null,
        deckLabel,
        startedAt,
        finishedAt,
        results.length,
        passedFirstTry,
        failedFirstTry,
        totalAttempts,
        aheadOfSchedule ? 1 : 0,
      ],
    },
  ];

  if (aheadOfSchedule) {
    // Practice session: never touch flashcard_cards. Log each card's
    // CURRENT (unchanged) state — fetched fresh, not the client's
    // gradeCard() output, since that computation is never actually applied.
    const ids = results.map((r) => r.card.id);
    const currentRes = await db!.execute({
      sql: `SELECT id, ease_factor, interval_days, repetitions, lapses FROM flashcard_cards WHERE id IN (${ids.map(() => "?").join(",")})`,
      args: ids,
    });
    const currentById = new Map(
      currentRes.rows.map((r) => [(r as Record<string, unknown>).id as string, r as Record<string, unknown>])
    );
    for (const r of results) {
      const row = currentById.get(r.card.id);
      if (!row) continue; // word was forgotten mid-session — nothing to log against
      statements.push({
        sql: `INSERT INTO flashcard_review_log (id, user_id, card_id, session_id, simp, quality, counted, ease_factor_after, interval_days_after, repetitions_after, lapses_after, reviewed_at)
              VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        args: [
          crypto.randomUUID(),
          GUEST_USER_ID,
          r.card.id,
          sessionId,
          r.card.simp,
          r.firstQuality,
          row.ease_factor as number,
          row.interval_days as number,
          row.repetitions as number,
          row.lapses as number,
          finishedAt,
        ],
      });
    }
  } else {
    for (const r of results) {
      statements.push({
        sql: `UPDATE flashcard_cards
              SET ease_factor = ?, interval_days = ?, repetitions = ?, lapses = ?, due_at = ?, last_reviewed_at = ?
              WHERE id = ? AND user_id = ?`,
        args: [
          r.card.easeFactor,
          r.card.intervalDays,
          r.card.repetitions,
          r.card.lapses,
          r.card.dueAt,
          r.card.lastReviewedAt,
          r.card.id,
          GUEST_USER_ID,
        ],
      });
      statements.push({
        sql: `INSERT INTO flashcard_review_log (id, user_id, card_id, session_id, simp, quality, counted, ease_factor_after, interval_days_after, repetitions_after, lapses_after, reviewed_at)
              VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
        args: [
          crypto.randomUUID(),
          GUEST_USER_ID,
          r.card.id,
          sessionId,
          r.card.simp,
          r.firstQuality,
          r.card.easeFactor,
          r.card.intervalDays,
          r.card.repetitions,
          r.card.lapses,
          r.card.lastReviewedAt ?? finishedAt,
        ],
      });
    }
  }

  await db!.batch(statements, "write");
}

// ── Review history (schema + write path only — no UI consumer yet) ──────────

/** Full graded-review timeline for a word, most recent first. Not wired into
 * any screen yet — see ReviewLogEntry for why tier isn't stored per row. */
export async function getWordReviewHistory(simp: string): Promise<ReviewLogEntry[]> {
  if (!(await ready())) return [];
  const trimmed = simp.trim();
  const cardRes = await db!.execute({
    sql: "SELECT id FROM flashcard_cards WHERE user_id = ? AND simp = ?",
    args: [GUEST_USER_ID, trimmed],
  });
  const cardId = (cardRes.rows[0] as Record<string, unknown> | undefined)?.id as string | undefined;
  if (!cardId) return [];

  const result = await db!.execute({
    sql: `SELECT quality, counted, ease_factor_after, interval_days_after, repetitions_after, lapses_after, reviewed_at
          FROM flashcard_review_log WHERE card_id = ? ORDER BY reviewed_at DESC`,
    args: [cardId],
  });
  return result.rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      quality: row.quality as 2 | 5,
      counted: (row.counted as number) === 1,
      easeFactorAfter: row.ease_factor_after as number,
      intervalDaysAfter: row.interval_days_after as number,
      repetitionsAfter: row.repetitions_after as number,
      lapsesAfter: row.lapses_after as number,
      reviewedAt: row.reviewed_at as string,
    };
  });
}
