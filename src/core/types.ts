/**
 * types.ts — Shared TypeScript interfaces for Hiểu Chữ Hán
 * Framework-agnostic. No React/Next.js imports.
 */

// Source enum for tracking where data came from
export enum DictionarySource {
  ChineseLexicon = "chinese-lexicon",
  CVDICT = "cvdict",
  KVietnamese = "kVietnamese",
}

// A single etymology component (e.g. 疒 = meaning, 冬 = sound)
export interface EtymologyComponent {
  char: string;
  type: "meaning" | "sound" | "unknown";
  definition: string;
  pinyin: string;
  /** Sino-Vietnamese reading, enriched from kVietnamese */
  sinoVietnamese?: string;
    /** Full entry for the component character, if found in the dictionary */
    entry?: WordEntry;
}

// Etymology breakdown for a character
export interface Etymology {
  notes: string;
  components: EtymologyComponent[];
}

// Frequency / usage statistics
export interface WordStatistics {
  hskLevel?: number;
  movieWordRank?: number;
  bookWordRank?: number;
}

// Full word/character entry returned to the UI
export interface WordEntry {
  /** Simplified Chinese character or word */
  simp: string;
  /** Traditional Chinese character or word (same as simp if identical) */
  trad: string;
  /** Pinyin with tone marks, e.g. "téng​tòng" */
  pinyin: string;
  /** Pinyin with tone numbers, e.g. "teng2tong4" */
  pinyinTones: string;
  /** Sino-Vietnamese reading from kVietnamese (Unihan) */
  sinoVietnamese: string;
  /** Lookup key when different from simp — set for trad-only entries (e.g. key='殺', simp='杀') */
  key?: string;
  /** Sino-Vietnamese inferred by joining each character's sinoVietnamese (multi-char words only) */
  inferredSinoVietnamese: string;
  /** English definitions — Source: chinese-lexicon */
  definitionsEn: string[];
  /** Vietnamese meaning — Source: CVDICT */
  definitionVi: string;
  /** Etymology breakdown (single characters only) */
  etymology?: Etymology;
  /** Usage statistics */
  statistics: WordStatistics;
  /** Related/compound words */
  relatedWords: Array<{ word: string; trad: string; gloss: string; entry?: WordEntry }>;
}

// Search results array
export type SearchResult = WordEntry[];

/** Returns the canonical lookup key for an entry (key field if set, otherwise simp). */
export function wordKey(entry: WordEntry): string {
  return entry.key ?? entry.simp;
}

// Lightweight summary used for suggestion dropdown and results list
export interface WordSummary {
  simp: string;
  trad: string;
  pinyin: string;
  /** First Vietnamese meaning — Source: CVDICT */
  vi: string;
  /** First English definition — Source: chinese-lexicon */
  en: string;
}

export interface HistoryEntry {
  id: string;
  type: 'search' | 'word';
  label: string;
  timestamp: number;
}
