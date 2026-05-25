"use client";

import { useState, useEffect } from "react";
import { SearchIcon } from "lucide-react";
import { WordRow } from "@/components/search/WordRow";
import { getWordDetail } from "@/core/client-dictionary";
import type { HistoryEntry } from "@/core/types";
import type { WordEntry } from "@/core/types";

interface HistoryListProps {
  history: HistoryEntry[];
  onSelect: (label: string) => void;
  onRemove: (id: string) => void;
}

export function HistoryList({ history, onSelect, onRemove }: HistoryListProps) {
  const [entryMap, setEntryMap] = useState<Map<string, WordEntry>>(new Map());

  const wordEntries = history.filter((e) => e.type === "word");

  useEffect(() => {
    if (wordEntries.length === 0) return;
    Promise.all(
      wordEntries.map((e) =>
        getWordDetail(e.label).then((entry) => ({ label: e.label, entry }))
      )
    ).then((results) => {
      setEntryMap(
        new Map(
          results
            .filter((r): r is { label: string; entry: WordEntry } => r.entry !== null)
            .map((r) => [r.label, r.entry])
        )
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  if (history.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center px-4 py-8">
        Chưa có lịch sử nào.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border overflow-hidden">
      {history.map((e) => {
        if (e.type === "word") {
          const entry = entryMap.get(e.label);
          if (!entry) return null;
          return (
            <li key={e.id}>
              <WordRow
                entry={entry}
                onSelect={() => onSelect(e.label)}
                onRemove={() => onRemove(e.id)}
              />
            </li>
          );
        }

        // search entry
        return (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onSelect(e.label)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left group"
            >
              <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm truncate">{e.label}</span>
              <button
                type="button"
                onClick={(ev) => { ev.stopPropagation(); onRemove(e.id); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity text-xs px-1"
                aria-label="Xóa"
              >
                ✕
              </button>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
