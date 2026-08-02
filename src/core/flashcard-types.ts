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

export interface DeckListItem {
  /** Manual deck uuid, an AutoDeckId, or EXCLUDED_DECK_ID. */
  id: string;
  kind: "manual" | "auto" | "excluded";
  title: string;
  /** Due count for studyable decks; excluded-word count for the Excluded pseudo-deck. */
  count: number;
  /** passed_first_try / total_words of the most recent session for this deck, null if none. */
  lastScore: number | null;
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
