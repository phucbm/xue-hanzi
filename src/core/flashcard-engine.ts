/**
 * flashcard-engine.ts — pure domain logic for the flashcard feature.
 *
 * No I/O. Constructed once per request from rows already fetched from Turso
 * (see loadEngine() in src/app/actions/flashcards.ts), then every derived
 * view — deck list, deck contents, dashboard metrics — is a method here.
 * Adding a new metric later means adding a method to this class, not a new
 * query + a new copy of the due-count/grouping logic.
 *
 * See .claude/docs/flashcards.md for the full write-up (SM-2, deck taxonomy,
 * mastery tiers, dashboard metric definitions and their caveats).
 */

import { getEntries } from "chinese-lexicon";
import {
  EXCLUDED_DECK_ID,
  isAutoDeckId,
  LEECH_LAPSE_THRESHOLD,
  MASTERED_INTERVAL_DAYS,
  type DeckFluency,
  type DeckListItem,
  type DeckSessionEntry,
  type FlashcardCard,
  type FlashcardDeck,
  type MasteryTier,
} from "./flashcard-types";

/** Below this many active cards, a deck's fluency color is suppressed: a
 * 1-card deck that happens to be mastered would read as 100% green, which
 * is noise, not signal. */
export const MIN_CARDS_FOR_FLUENCY_COLOR = 3;

/** Rolling window (not calendar day) for the "newly added" badge/list — a
 * card counts as new for a full 24h from its created_at regardless of
 * review state, so studying a deck today doesn't make its just-added words
 * disappear from the badge. */
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface DeckCardLink {
  deckId: string;
  cardId: string;
}

/** One row per completed study session, already shaped for both the
 * deck-list "last score" lookup and (via `sessions` in SystemMetrics) the
 * client-side streak/heatmap computation. */
export interface SessionLogRow {
  id: string;
  deckId: string | null;
  deckLabel: string;
  startedAt: string;
  finishedAt: string;
  totalWords: number;
  passedFirstTry: number;
  failedFirstTry: number;
  totalAttempts: number;
  aheadOfSchedule: boolean;
}

/** Score + timestamp + raw counts of a deck's most recently completed
 * session. totalWords/passedFirstTry ride along so the UI can show the
 * actual sample size next to the score (e.g. "1/1 từ") — a bare "100%" from
 * a 1-word session reads as "the whole deck" otherwise, especially on a
 * deck with hundreds of words. */
interface LastSessionInfo {
  score: number;
  finishedAt: string;
  aheadOfSchedule: boolean;
  totalWords: number;
  passedFirstTry: number;
}

export interface MasteryBreakdown {
  new: number;
  learning: number;
  mastered: number;
}

export interface HskMasteryLevel {
  level: number;
  total: number;
  mastered: number;
}

/** Metrics scoped to a single deck — shown on the study-session start screen
 * so a user can decide whether to study without leaving the page. Same
 * shape of information as SystemMetrics, just filtered to one deck's cards
 * instead of every active card. */
export interface DeckMetrics {
  total: number;
  dueToday: number;
  /** Earliest due_at among not-yet-due cards, or null. Only meaningful when
   * dueToday === 0 — see FlashcardEngine.nextDueAt(). */
  nextDueAt: string | null;
  mastery: MasteryBreakdown;
  leechCount: number;
  fluency: DeckFluency;
  /** Cards created in the last 24h, most recent first — see
   * FlashcardEngine.newCards(). Independent of dueAt/repetitions, so a word
   * studied today still shows here until the 24h window elapses. */
  newCards: FlashcardCard[];
}

export interface SystemMetrics {
  totalActive: number;
  dueToday: number;
  mastery: MasteryBreakdown;
  /** Only HSK levels actually present among the user's saved words. */
  hskMastery: HskMasteryLevel[];
  leechCount: number;
  /** passed_first_try / total_words across every completed session ever.
   * null when no session has been completed yet. */
  retentionAllTime: number | null;
  /** Raw per-session log, for the client to compute streak + the activity
   * heatmap. Kept client-side because "which calendar day" a session falls
   * on depends on the viewer's local timezone — the server can't know that,
   * and this app is used across multiple devices/timezones. */
  sessions: SessionLogRow[];
}

export class FlashcardEngine {
  private readonly active: FlashcardCard[];
  private readonly excludedCards: FlashcardCard[];
  private readonly hskCache = new Map<string, number | undefined>();

  constructor(
    cards: FlashcardCard[],
    private readonly decks: FlashcardDeck[],
    private readonly deckCards: DeckCardLink[],
    /** Must be ordered finished_at DESC — "last score" lookups take the
     * first match per deck as the most recent. */
    private readonly sessions: SessionLogRow[]
  ) {
    this.active = cards.filter((c) => !c.excludedAt);
    this.excludedCards = cards.filter((c) => c.excludedAt);
  }

  static classifyMastery(card: Pick<FlashcardCard, "repetitions" | "intervalDays">): MasteryTier {
    if (card.repetitions === 0) return "new";
    if (card.intervalDays >= MASTERED_INTERVAL_DAYS) return "mastered";
    return "learning";
  }

  /** Auto-detected (3+ real failures) OR manually flagged — both land in the
   * same "Từ khó (leech)" bucket, one place for "needs extra attention". */
  static isLeech(card: Pick<FlashcardCard, "lapses" | "flaggedHardAt">): boolean {
    return card.lapses >= LEECH_LAPSE_THRESHOLD || card.flaggedHardAt != null;
  }

  /** Weighted mastery score for a set of cards (new=0, learning=0.5,
   * mastered=1), bucketed back into a tier for coloring. */
  static fluencyOf(cards: FlashcardCard[]): DeckFluency {
    if (cards.length < MIN_CARDS_FOR_FLUENCY_COLOR) return { ratio: null, tier: null };
    let masteredCount = 0;
    let learningCount = 0;
    for (const c of cards) {
      const tier = FlashcardEngine.classifyMastery(c);
      if (tier === "mastered") masteredCount++;
      else if (tier === "learning") learningCount++;
    }
    const ratio = (masteredCount + learningCount * 0.5) / cards.length;
    const tier: MasteryTier = ratio >= 0.67 ? "mastered" : ratio >= 0.34 ? "learning" : "new";
    return { ratio, tier };
  }

  /** HSK level lookup via chinese-lexicon's algorithmic difficulty tier —
   * NOT a curated official exam word list. See .claude/docs/flashcards.md. */
  private hskLevelOf(simp: string): number | undefined {
    if (this.hskCache.has(simp)) return this.hskCache.get(simp);
    let level: number | undefined;
    try {
      level = getEntries(simp)[0]?.statistics?.hskLevel;
    } catch {
      level = undefined;
    }
    this.hskCache.set(simp, level);
    return level;
  }

  private dueCount(cards: FlashcardCard[], now: string): number {
    return cards.filter((c) => c.dueAt <= now).length;
  }

  /** Earliest `due_at` among cards not yet due — only meaningful when
   * dueCount() is 0 (otherwise "next due" is already "now", conveyed by the
   * due count itself). Null when the deck has no active cards at all. */
  private nextDueAt(cards: FlashcardCard[], now: string): string | null {
    const upcoming = cards.filter((c) => c.dueAt > now).map((c) => c.dueAt);
    if (upcoming.length === 0) return null;
    return upcoming.reduce((min, d) => (d < min ? d : min));
  }

  /** Cards created within the last 24h, most recent first — independent of
   * dueAt/repetitions, so a word studied today doesn't stop counting as
   * "newly added" until the 24h window itself elapses. */
  private newCards(cards: FlashcardCard[], now: string): FlashcardCard[] {
    const cutoff = new Date(new Date(now).getTime() - NEW_WINDOW_MS).toISOString();
    return cards
      .filter((c) => c.createdAt >= cutoff)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private lastSessionMaps(): {
    byLabel: Map<string, LastSessionInfo>;
    byDeckId: Map<string, LastSessionInfo>;
  } {
    const byLabel = new Map<string, LastSessionInfo>();
    const byDeckId = new Map<string, LastSessionInfo>();
    // this.sessions is ordered finished_at DESC (see loadEngine()), so the
    // first match per key is already the most recent one.
    for (const s of this.sessions) {
      const score = s.totalWords > 0 ? s.passedFirstTry / s.totalWords : 0;
      const info: LastSessionInfo = {
        score,
        finishedAt: s.finishedAt,
        aheadOfSchedule: s.aheadOfSchedule,
        totalWords: s.totalWords,
        passedFirstTry: s.passedFirstTry,
      };
      if (s.deckId) {
        if (!byDeckId.has(s.deckId)) byDeckId.set(s.deckId, info);
      } else if (!byLabel.has(s.deckLabel)) {
        byLabel.set(s.deckLabel, info);
      }
    }
    return { byLabel, byDeckId };
  }

  getHskGroups(): Map<number, FlashcardCard[]> {
    const groups = new Map<number, FlashcardCard[]>();
    for (const c of this.active) {
      const hsk = this.hskLevelOf(c.simp);
      if (hsk) {
        if (!groups.has(hsk)) groups.set(hsk, []);
        groups.get(hsk)!.push(c);
      }
    }
    return groups;
  }

  getMonthGroups(): Map<string, FlashcardCard[]> {
    const groups = new Map<string, FlashcardCard[]>();
    for (const c of this.active) {
      const ym = c.createdAt.slice(0, 7); // YYYY-MM
      if (!groups.has(ym)) groups.set(ym, []);
      groups.get(ym)!.push(c);
    }
    return groups;
  }

  getLeechCards(): FlashcardCard[] {
    return this.active.filter((c) => FlashcardEngine.isLeech(c));
  }

  getDecks(): DeckListItem[] {
    const now = new Date().toISOString();
    const { byLabel, byDeckId } = this.lastSessionMaps();
    const items: DeckListItem[] = [];

    const pushAuto = (id: string, title: string, memberCards: FlashcardCard[]) => {
      const last = byLabel.get(id) ?? null;
      items.push({
        id,
        kind: "auto",
        title,
        count: this.dueCount(memberCards, now),
        total: memberCards.length,
        nextDueAt: this.nextDueAt(memberCards, now),
        newLast24h: this.newCards(memberCards, now).length,
        lastScore: last?.score ?? null,
        lastSessionAt: last?.finishedAt ?? null,
        lastSessionTotalWords: last?.totalWords ?? null,
        lastSessionPassed: last?.passedFirstTry ?? null,
        lastSessionAheadOfSchedule: last?.aheadOfSchedule ?? false,
        sessionCount: this.getDeckSessions(id).length,
        fluency: FlashcardEngine.fluencyOf(memberCards),
      });
    };

    pushAuto("all", "Tất cả", this.active);

    const hskGroups = this.getHskGroups();
    for (const level of [...hskGroups.keys()].sort((a, b) => a - b)) {
      pushAuto(`hsk:${level}`, `HSK ${level}`, hskGroups.get(level)!);
    }

    const monthGroups = this.getMonthGroups();
    for (const ym of [...monthGroups.keys()].sort().reverse()) {
      const [y, m] = ym.split("-");
      pushAuto(`month:${ym}`, `Tháng ${Number(m)}/${y}`, monthGroups.get(ym)!);
    }

    pushAuto("leech", "Từ khó (leech)", this.getLeechCards());

    const activeById = new Map(this.active.map((c) => [c.id, c]));
    const membersByDeck = new Map<string, FlashcardCard[]>();
    for (const link of this.deckCards) {
      const card = activeById.get(link.cardId);
      if (!card) continue; // excluded or missing — hide from manual decks too
      if (!membersByDeck.has(link.deckId)) membersByDeck.set(link.deckId, []);
      membersByDeck.get(link.deckId)!.push(card);
    }
    for (const deck of this.decks) {
      const memberCards = membersByDeck.get(deck.id) ?? [];
      const last = byDeckId.get(deck.id) ?? null;
      items.push({
        id: deck.id,
        kind: "manual",
        title: deck.title,
        count: this.dueCount(memberCards, now),
        total: memberCards.length,
        nextDueAt: this.nextDueAt(memberCards, now),
        newLast24h: this.newCards(memberCards, now).length,
        lastScore: last?.score ?? null,
        lastSessionAt: last?.finishedAt ?? null,
        lastSessionTotalWords: last?.totalWords ?? null,
        lastSessionPassed: last?.passedFirstTry ?? null,
        lastSessionAheadOfSchedule: last?.aheadOfSchedule ?? false,
        sessionCount: this.getDeckSessions(deck.id).length,
        fluency: FlashcardEngine.fluencyOf(memberCards),
      });
    }

    items.push({
      id: EXCLUDED_DECK_ID,
      kind: "excluded",
      title: "Đã loại trừ",
      count: this.excludedCards.length,
      total: this.excludedCards.length,
      nextDueAt: null,
      newLast24h: 0,
      lastScore: null,
      lastSessionAt: null,
      lastSessionTotalWords: null,
      lastSessionPassed: null,
      lastSessionAheadOfSchedule: false,
      sessionCount: 0,
      fluency: { ratio: null, tier: null },
    });

    return items;
  }

  getDeckWords(deckId: string): FlashcardCard[] {
    if (deckId === EXCLUDED_DECK_ID) return this.excludedCards;
    if (deckId === "all") return this.active;
    if (deckId === "leech") return this.getLeechCards();
    if (deckId.startsWith("hsk:")) {
      const level = Number(deckId.slice(4));
      return this.getHskGroups().get(level) ?? [];
    }
    if (deckId.startsWith("month:")) {
      const ym = deckId.slice(6);
      return this.getMonthGroups().get(ym) ?? [];
    }
    const memberIds = new Set(
      this.deckCards.filter((l) => l.deckId === deckId).map((l) => l.cardId)
    );
    return this.active.filter((c) => memberIds.has(c.id));
  }

  /** Full session history for one deck, newest first — for the per-deck
   * sessions table (with delete). Matches sessions the same way they were
   * written (see submitSession): manual decks by deck_id, auto decks by
   * deck_label with deck_id NULL. Sourced from `this.sessions` (already
   * ordered finished_at DESC), same data lastSessionMaps() reads — no
   * separate query. */
  getDeckSessions(deckId: string): DeckSessionEntry[] {
    const matches = isAutoDeckId(deckId)
      ? (s: SessionLogRow) => s.deckId === null && s.deckLabel === deckId
      : (s: SessionLogRow) => s.deckId === deckId;
    return this.sessions.filter(matches).map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      totalWords: s.totalWords,
      passedFirstTry: s.passedFirstTry,
      failedFirstTry: s.failedFirstTry,
      totalAttempts: s.totalAttempts,
      aheadOfSchedule: s.aheadOfSchedule,
    }));
  }

  getDeckMetrics(deckId: string): DeckMetrics {
    const now = new Date().toISOString();
    const cards = this.getDeckWords(deckId);
    const mastery: MasteryBreakdown = { new: 0, learning: 0, mastered: 0 };
    for (const c of cards) mastery[FlashcardEngine.classifyMastery(c)]++;
    return {
      total: cards.length,
      dueToday: this.dueCount(cards, now),
      nextDueAt: this.nextDueAt(cards, now),
      mastery,
      leechCount: cards.filter((c) => FlashcardEngine.isLeech(c)).length,
      fluency: FlashcardEngine.fluencyOf(cards),
      newCards: this.newCards(cards, now),
    };
  }

  getSystemMetrics(): SystemMetrics {
    const now = new Date().toISOString();
    const mastery: MasteryBreakdown = { new: 0, learning: 0, mastered: 0 };
    for (const c of this.active) {
      mastery[FlashcardEngine.classifyMastery(c)]++;
    }

    const hskGroups = this.getHskGroups();
    const hskMastery: HskMasteryLevel[] = [...hskGroups.keys()]
      .sort((a, b) => a - b)
      .map((level) => {
        const cards = hskGroups.get(level)!;
        const mastered = cards.filter((c) => FlashcardEngine.classifyMastery(c) === "mastered").length;
        return { level, total: cards.length, mastered };
      });

    const totalSessionWords = this.sessions.reduce((sum, s) => sum + s.totalWords, 0);
    const totalPassed = this.sessions.reduce((sum, s) => sum + s.passedFirstTry, 0);

    return {
      totalActive: this.active.length,
      dueToday: this.dueCount(this.active, now),
      mastery,
      hskMastery,
      leechCount: this.getLeechCards().length,
      retentionAllTime: totalSessionWords > 0 ? totalPassed / totalSessionWords : null,
      sessions: this.sessions,
    };
  }
}
