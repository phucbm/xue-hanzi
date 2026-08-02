"use server";

import { db, initSchema } from "@/lib/turso";
import { GUEST_USER_ID } from "@/lib/aiConstants";
import { getEntries } from "chinese-lexicon";
import {
  EXCLUDED_DECK_ID,
  isAutoDeckId,
  type DeckListItem,
  type FlashcardCard,
  type FlashcardDeck,
  type SessionQueueCard,
  type SessionSubmitPayload,
} from "@/core/flashcard-types";

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

function hskLevelOf(simp: string): number | undefined {
  try {
    return getEntries(simp)[0]?.statistics?.hskLevel;
  } catch {
    return undefined;
  }
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
  deckIds: string[];
}

export async function getWordFlashcardStatus(simp: string): Promise<WordFlashcardStatus> {
  if (!(await ready())) return { cardId: null, excluded: false, deckIds: [] };
  const trimmed = simp.trim();
  const cardRes = await db!.execute({
    sql: "SELECT id, excluded_at FROM flashcard_cards WHERE user_id = ? AND simp = ?",
    args: [GUEST_USER_ID, trimmed],
  });
  const row = cardRes.rows[0] as Record<string, unknown> | undefined;
  if (!row) return { cardId: null, excluded: false, deckIds: [] };

  const cardId = row.id as string;
  const deckRes = await db!.execute({
    sql: "SELECT deck_id FROM flashcard_deck_cards WHERE card_id = ?",
    args: [cardId],
  });
  return {
    cardId,
    excluded: row.excluded_at != null,
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

// ── Deck list (due counts + last scores) ─────────────────────────────────────

export async function getDecks(): Promise<DeckListItem[]> {
  if (!(await ready())) return [];
  const now = new Date().toISOString();

  const [cardsRes, decksRes, sessionsRes] = await Promise.all([
    db!.execute({
      sql: "SELECT id, simp, due_at, lapses, created_at, excluded_at FROM flashcard_cards WHERE user_id = ?",
      args: [GUEST_USER_ID],
    }),
    db!.execute({
      sql: "SELECT * FROM flashcard_decks WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC",
      args: [GUEST_USER_ID],
    }),
    db!.execute({
      sql: "SELECT deck_id, deck_label, passed_first_try, total_words, finished_at FROM flashcard_sessions WHERE user_id = ? ORDER BY finished_at DESC",
      args: [GUEST_USER_ID],
    }),
  ]);

  interface Row {
    id: string;
    simp: string;
    dueAt: string;
    lapses: number;
    createdAt: string;
    excludedAt: string | null;
  }
  const cards: Row[] = cardsRes.rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      simp: row.simp as string,
      dueAt: row.due_at as string,
      lapses: row.lapses as number,
      createdAt: row.created_at as string,
      excludedAt: (row.excluded_at as string | null) ?? null,
    };
  });
  const active = cards.filter((c) => !c.excludedAt);
  const excludedCount = cards.length - active.length;

  const lastScoreByLabel = new Map<string, number>();
  const lastScoreByDeckId = new Map<string, number>();
  for (const r of sessionsRes.rows) {
    const row = r as Record<string, unknown>;
    const totalWords = row.total_words as number;
    const score = totalWords > 0 ? (row.passed_first_try as number) / totalWords : 0;
    const deckId = row.deck_id as string | null;
    const label = row.deck_label as string;
    if (deckId) {
      if (!lastScoreByDeckId.has(deckId)) lastScoreByDeckId.set(deckId, score);
    } else if (!lastScoreByLabel.has(label)) {
      lastScoreByLabel.set(label, score);
    }
  }

  const dueCount = (list: Row[]) => list.filter((c) => c.dueAt <= now).length;

  const items: DeckListItem[] = [];

  items.push({ id: "all", kind: "auto", title: "Tất cả", count: dueCount(active), lastScore: lastScoreByLabel.get("all") ?? null });

  const hskGroups = new Map<number, Row[]>();
  for (const c of active) {
    const hsk = hskLevelOf(c.simp);
    if (hsk) {
      if (!hskGroups.has(hsk)) hskGroups.set(hsk, []);
      hskGroups.get(hsk)!.push(c);
    }
  }
  for (const level of [...hskGroups.keys()].sort((a, b) => a - b)) {
    const id = `hsk:${level}`;
    items.push({ id, kind: "auto", title: `HSK ${level}`, count: dueCount(hskGroups.get(level)!), lastScore: lastScoreByLabel.get(id) ?? null });
  }

  const monthGroups = new Map<string, Row[]>();
  for (const c of active) {
    const ym = c.createdAt.slice(0, 7);
    if (!monthGroups.has(ym)) monthGroups.set(ym, []);
    monthGroups.get(ym)!.push(c);
  }
  for (const ym of [...monthGroups.keys()].sort().reverse()) {
    const id = `month:${ym}`;
    const [y, m] = ym.split("-");
    items.push({ id, kind: "auto", title: `Tháng ${Number(m)}/${y}`, count: dueCount(monthGroups.get(ym)!), lastScore: lastScoreByLabel.get(id) ?? null });
  }

  const leech = active.filter((c) => c.lapses >= 3);
  items.push({ id: "leech", kind: "auto", title: "Từ khó (leech)", count: dueCount(leech), lastScore: lastScoreByLabel.get("leech") ?? null });

  if (decksRes.rows.length > 0) {
    const deckIds = decksRes.rows.map((r) => (r as Record<string, unknown>).id as string);
    const memberRes = await db!.execute({
      sql: `SELECT deck_id, card_id FROM flashcard_deck_cards WHERE deck_id IN (${deckIds.map(() => "?").join(",")})`,
      args: deckIds,
    });
    const activeById = new Map(active.map((c) => [c.id, c]));
    const membersByDeck = new Map<string, Row[]>();
    for (const r of memberRes.rows) {
      const row = r as Record<string, unknown>;
      const deckId = row.deck_id as string;
      const cardId = row.card_id as string;
      const card = activeById.get(cardId);
      if (!card) continue; // excluded or missing — hide from manual decks too
      if (!membersByDeck.has(deckId)) membersByDeck.set(deckId, []);
      membersByDeck.get(deckId)!.push(card);
    }
    for (const r of decksRes.rows) {
      const row = r as Record<string, unknown>;
      const deckId = row.id as string;
      const memberCards = membersByDeck.get(deckId) ?? [];
      items.push({
        id: deckId,
        kind: "manual",
        title: row.title as string,
        count: dueCount(memberCards),
        lastScore: lastScoreByDeckId.get(deckId) ?? null,
      });
    }
  }

  items.push({ id: EXCLUDED_DECK_ID, kind: "excluded", title: "Đã loại trừ", count: excludedCount, lastScore: null });

  return items;
}

// ── Deck detail / manage-words view ──────────────────────────────────────────

export async function getDeckWords(deckId: string): Promise<FlashcardCard[]> {
  if (!(await ready())) return [];
  const cardsRes = await db!.execute({
    sql: "SELECT * FROM flashcard_cards WHERE user_id = ?",
    args: [GUEST_USER_ID],
  });
  const all = cardsRes.rows.map((r) => toCard(r as Record<string, unknown>));

  if (deckId === EXCLUDED_DECK_ID) {
    return all.filter((c) => c.excludedAt);
  }

  const active = all.filter((c) => !c.excludedAt);

  if (deckId === "all") return active;
  if (deckId === "leech") return active.filter((c) => c.lapses >= 3);
  if (deckId.startsWith("hsk:")) {
    const level = Number(deckId.slice(4));
    return active.filter((c) => hskLevelOf(c.simp) === level);
  }
  if (deckId.startsWith("month:")) {
    const ym = deckId.slice(6);
    return active.filter((c) => c.createdAt.slice(0, 7) === ym);
  }

  // Manual deck
  const memberRes = await db!.execute({
    sql: "SELECT card_id FROM flashcard_deck_cards WHERE deck_id = ?",
    args: [deckId],
  });
  const memberIds = new Set(memberRes.rows.map((r) => (r as Record<string, unknown>).card_id as string));
  return active.filter((c) => memberIds.has(c.id));
}

// ── Study session ─────────────────────────────────────────────────────────────

export async function startSession(deckId: string, limit?: number): Promise<SessionQueueCard[]> {
  if (!(await ready())) return [];
  const words = await getDeckWords(deckId);
  const now = new Date().toISOString();
  const due = words.filter((c) => c.dueAt <= now);
  const shuffled = shuffle(due);
  const limited = limit && limit > 0 ? shuffled.slice(0, limit) : shuffled;
  return limited.map((c) => ({ ...c, isNew: c.repetitions === 0 }));
}

/** The one atomic write for a completed session: upserts every touched card's
 * graded SM-2 state (computed client-side via core/srs.ts) plus one session
 * row, in a single db.batch() call. Nothing is written if the app closes
 * mid-session — this is only ever called on session completion. */
export async function submitSession(payload: SessionSubmitPayload): Promise<void> {
  if (!(await ready())) return;
  const { deckId, deckLabel, startedAt, finishedAt, results, totalAttempts } = payload;
  if (results.length === 0) return;

  const isManual = !isAutoDeckId(deckId) && deckId !== EXCLUDED_DECK_ID;
  const passedFirstTry = results.filter((r) => r.firstQuality === 5).length;
  const failedFirstTry = results.length - passedFirstTry;

  const statements = results.map((r) => ({
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
  }));

  statements.push({
    sql: `INSERT INTO flashcard_sessions (id, user_id, deck_id, deck_label, started_at, finished_at, total_words, passed_first_try, failed_first_try, total_attempts)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      crypto.randomUUID(),
      GUEST_USER_ID,
      isManual ? deckId : null,
      deckLabel,
      startedAt,
      finishedAt,
      results.length,
      passedFirstTry,
      failedFirstTry,
      totalAttempts,
    ],
  });

  await db!.batch(statements, "write");
}
