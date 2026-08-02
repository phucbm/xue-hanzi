/**
 * srs.ts — Pure SM-2 spaced-repetition algorithm. No I/O, no framework imports.
 * Binary grading only: q=5 ("Got it"), q=2 ("What is this?").
 */

export interface SrsState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: string;
  lastReviewedAt: string | null;
}

export type SrsQuality = 2 | 5;

/** New-card defaults: immediately due. */
export function newSrsState(now: Date = new Date()): SrsState {
  return {
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    dueAt: now.toISOString(),
    lastReviewedAt: null,
  };
}

/** Standard textbook SM-2 update — unmodified, no custom tuning. */
export function gradeCard<T extends SrsState>(card: T, q: SrsQuality, now: Date = new Date()): T {
  let intervalDays: number;
  let repetitions: number;
  let lapses = card.lapses;

  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
    lapses += 1;
  } else {
    if (card.repetitions === 0) intervalDays = 1;
    else if (card.repetitions === 1) intervalDays = 6;
    else intervalDays = Math.round(card.intervalDays * card.easeFactor);
    repetitions = card.repetitions + 1;
  }

  const easeFactor = Math.max(1.3, card.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  const dueAt = new Date(now);
  dueAt.setDate(dueAt.getDate() + intervalDays);

  return {
    ...card,
    easeFactor,
    intervalDays,
    repetitions,
    lapses,
    dueAt: dueAt.toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}
