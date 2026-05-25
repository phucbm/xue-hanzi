"use client";

/**
 * ViewedWordList — shared list of recently viewed words.
 * Used by RecentViewedPanel (desktop) and HistoryBottomSheet (mobile).
 *
 * Display data (trad, pinyin, definition) is not stored in the DB — it is
 * looked up from the in-memory client dictionary after mount.
 */

import { useState, useEffect } from "react";
import { WordRow } from "@/components/search/WordRow";
import { getWordDetail } from "@/core/client-dictionary";
import type { ViewedWord } from "@/hooks/useViewedWords";
import type { WordEntry } from "@/core/types";

interface ViewedWordListProps {
  viewedWords: ViewedWord[];
  onSelect: (simp: string) => void;
  onRemove: (simp: string) => void;
}

export function ViewedWordList({
  viewedWords,
  onSelect,
  onRemove,
}: ViewedWordListProps) {
  const [entryMap, setEntryMap] = useState<Map<string, WordEntry>>(new Map());

  // Look up display data from the client dictionary for each simp
  useEffect(() => {
    if (viewedWords.length === 0) return;
    Promise.all(
      viewedWords.map((w) =>
        getWordDetail(w.simp).then((entry) => ({ simp: w.simp, entry }))
      )
    ).then((results) => {
      setEntryMap(
        new Map(
          results
            .filter((r): r is { simp: string; entry: WordEntry } => r.entry !== null)
            .map((r) => [r.simp, r.entry])
        )
      );
    });
  }, [viewedWords]);

  if (viewedWords.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center px-4 py-8">
        Chưa có từ nào được xem.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border overflow-hidden">
      {viewedWords.map((w) => {
        const entry = entryMap.get(w.simp);
        if (!entry) return null;
        return (
          <li key={w.simp}>
            <WordRow
              entry={entry}
              viewCount={w.viewCount}
              onSelect={() => onSelect(w.simp)}
              onRemove={() => onRemove(w.simp)}
            />
          </li>
        );
      })}
    </ul>
  );
}
