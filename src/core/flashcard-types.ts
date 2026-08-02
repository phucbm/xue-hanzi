/**
 * flashcard-types.ts — Shared TypeScript interfaces for the flashcard feature.
 * Framework-agnostic. No React/Next.js imports. Kept separate from
 * src/app/actions/flashcards.ts because "use server" files may only export
 * async functions.
 */

import type { SrsState } from "./srs";

export interface FlashcardCard extends SrsState {
  id: string;
  simp: string;
  createdAt: string;
  excludedAt: string | null;
  /** Manual "mark as hard" flag — NULL = not flagged, timestamp = user
   * flagged it. Merged into the leech bucket (FlashcardEngine.isLeech)
   * alongside the auto-detected `lapses >= LEECH_LAPSE_THRESHOLD` case. */
  flaggedHardAt: string | null;
}

export interface FlashcardDeck {
  id: string;
  title: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Auto decks are computed live, never stored as rows. */
export type AutoDeckId = "all" | `hsk:${number}` | `month:${string}` | "leech";

/** Sentinel for the blacklist-management pseudo-deck (not studyable). */
export const EXCLUDED_DECK_ID = "excluded";

export function isAutoDeckId(id: string): boolean {
  return id === "all" || id === "leech" || id.startsWith("hsk:") || id.startsWith("month:");
}

/** Whole days from now until an ISO due_at, rounded up (min 1). Shared by
 * the deck list row and the study-session start screen so "next due"
 * phrasing stays consistent everywhere it's shown. */
export function daysUntil(dueAt: string): number {
  return Math.max(1, Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86400000));
}

/** Anki's "mature card" convention: an SM-2 interval at or past this many
 * days means the word has been durably learned, not just recently reviewed.
 * Tunable — not derived from any external standard. Lives here (not in
 * flashcard-engine.ts) because it's also needed client-side by the
 * dashboard UI, which must never import the engine directly — the engine
 * pulls in chinese-lexicon (Node-only, see CLAUDE.md). */
export const MASTERED_INTERVAL_DAYS = 21;

/** A card that has failed this many times is a "leech" — a recurring
 * problem word — regardless of its current interval/mastery tier. Same
 * client-safety reason as MASTERED_INTERVAL_DAYS above. */
export const LEECH_LAPSE_THRESHOLD = 3;

/**
 * SRS proficiency tier for a single card, shared by the deck-fluency color,
 * the mastery bar, and the HSK mastery bars — one definition, used everywhere:
 *  - "new": never answered (repetitions === 0)
 *  - "learning": answered at least once, interval under the mastered threshold
 *  - "mastered": SM-2 interval has grown past the mastered threshold (Anki's
 *    "mature card" convention — see MASTERED_INTERVAL_DAYS above)
 */
export type MasteryTier = "new" | "learning" | "mastered";

/** A deck's overall fluency, derived from the mastery tiers of its active
 * cards. `null` when the deck has too few cards for the ratio to be
 * meaningful (see FlashcardEngine.MIN_CARDS_FOR_FLUENCY_COLOR). */
export interface DeckFluency {
  /** Weighted 0..1 score (new=0, learning=0.5, mastered=1), or null. */
  ratio: number | null;
  tier: MasteryTier | null;
}

export interface DeckListItem {
  /** Manual deck uuid, an AutoDeckId, or EXCLUDED_DECK_ID. */
  id: string;
  kind: "manual" | "auto" | "excluded";
  title: string;
  /** Due count for studyable decks; excluded-word count for the Excluded pseudo-deck. */
  count: number;
  /** Total active cards in the deck regardless of due status — a deck with
   * total > 0 but count === 0 can still be studied (ahead of schedule), see
   * startSession(). Only total === 0 means truly nothing to study. */
  total: number;
  /** Earliest due_at among cards not yet due, ISO string, or null if the
   * deck has no active cards. Only meaningful/shown when count === 0 — if
   * count > 0 something is already due, so "next due" is effectively now. */
  nextDueAt: string | null;
  /** Count of cards created in the last 24h (rolling window, not calendar
   * day) — shown as a "N mới" badge regardless of due/mastery state, so
   * studying the deck today doesn't make just-added words disappear from
   * the badge until the 24h window itself elapses. */
  newLast24h: number;
  /** passed_first_try / total_words of the most recent session for this deck, null if none. */
  lastScore: number | null;
  /** finished_at of that same most-recent session, null if none. */
  lastSessionAt: string | null;
  /** True if that most-recent session was ahead-of-schedule (practice —
   * didn't advance any card's SM-2 state), so the UI can label it honestly
   * instead of implying the score changed the deck's real schedule. */
  lastSessionAheadOfSchedule: boolean;
  /** Drives the deck row's bg/text tint in the deck list — see DeckFluency. */
  fluency: DeckFluency;
}

export interface SessionQueueCard extends FlashcardCard {
  isNew: boolean;
}

export interface SessionResult {
  /** Post-gradeCard() state to persist — computed client-side, session runs entirely in memory. */
  card: FlashcardCard;
  /** The quality used on this card's first answer this session (grade-once rule) — for pass/fail tally. */
  firstQuality: 2 | 5;
}

/** One row from flashcard_review_log — a single real-world graded review of
 * one word. `counted=false` means it was a practice/ahead-of-schedule review
 * (the *_after fields are just the card's state at that moment, unchanged
 * by this review). No precomputed mastery tier is stored — derive it with
 * `FlashcardEngine.classifyMastery({ repetitions: repetitionsAfter, intervalDays: intervalDaysAfter })`
 * so it always reflects the *current* MASTERED_INTERVAL_DAYS threshold, not
 * whatever it was when the row was written. Not consumed by any UI yet —
 * see getWordReviewHistory() in actions/flashcards.ts. */
export interface ReviewLogEntry {
  quality: 2 | 5;
  counted: boolean;
  easeFactorAfter: number;
  intervalDaysAfter: number;
  repetitionsAfter: number;
  lapsesAfter: number;
  reviewedAt: string;
}

export interface SessionSubmitPayload {
  /** Manual deck uuid or AutoDeckId — identifies where the session was run. */
  deckId: string;
  deckLabel: string;
  startedAt: string;
  finishedAt: string;
  /** One entry per card's first answer only (grade-once rule). */
  results: SessionResult[];
  /** Includes recycled retries after a fail. */
  totalAttempts: number;
  /** From StartSessionResult — true when this session studied cards that
   * weren't actually due yet (nothing in the deck was due, so the deck
   * became fully studyable as practice). Practice sessions are logged (for
   * streak/last-score/history) but never write to flashcard_cards — see
   * submitSession() and .claude/docs/flashcards.md. */
  aheadOfSchedule: boolean;
}
