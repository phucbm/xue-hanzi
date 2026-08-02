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
  /** passed_first_try / total_words of the most recent session for this deck, null if none. */
  lastScore: number | null;
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
}
