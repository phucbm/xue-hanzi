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
  LEECH_LAPSE_THRESHOLD,
  MASTERED_INTERVAL_DAYS,
  type DeckFluency,
  type DeckListItem,
  type FlashcardCard,
  type FlashcardDeck,
  type MasteryTier,
} from "./flashcard-types";

/** Below this many active cards, a deck's fluency color is suppressed: a
 * 1-card deck that happens to be mastered would read as 100% green, which
 * is noise, not signal. */
export const MIN_CARDS_FOR_FLUENCY_COLOR = 3;

export interface DeckCardLink {
  deckId: string;
  cardId: string;
}

/** One row per completed study session, already shaped for both the
 * deck-list "last score" lookup and (via `sessions` in SystemMetrics) the
 * client-side streak/heatmap computation. */
export interface SessionLogRow {
  deckId: string | null;
  deckLabel: string;
  finishedAt: string;
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

  static isLeech(card: Pick<FlashcardCard, "lapses">): boolean {
    return card.lapses >= LEECH_LAPSE_THRESHOLD;
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

  private lastScoreMaps(): { byLabel: Map<string, number>; byDeckId: Map<string, number> } {
    const byLabel = new Map<string, number>();
    const byDeckId = new Map<string, number>();
    for (const s of this.sessions) {
      const score = s.totalWords > 0 ? s.passedFirstTry / s.totalWords : 0;
      if (s.deckId) {
        if (!byDeckId.has(s.deckId)) byDeckId.set(s.deckId, score);
      } else if (!byLabel.has(s.deckLabel)) {
        byLabel.set(s.deckLabel, score);
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
    const { byLabel, byDeckId } = this.lastScoreMaps();
    const items: DeckListItem[] = [];

    const pushAuto = (id: string, title: string, memberCards: FlashcardCard[]) => {
      items.push({
        id,
        kind: "auto",
        title,
        count: this.dueCount(memberCards, now),
        lastScore: byLabel.get(id) ?? null,
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
      items.push({
        id: deck.id,
        kind: "manual",
        title: deck.title,
        count: this.dueCount(memberCards, now),
        lastScore: byDeckId.get(deck.id) ?? null,
        fluency: FlashcardEngine.fluencyOf(memberCards),
      });
    }

    items.push({
      id: EXCLUDED_DECK_ID,
      kind: "excluded",
      title: "Đã loại trừ",
      count: this.excludedCards.length,
      lastScore: null,
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
