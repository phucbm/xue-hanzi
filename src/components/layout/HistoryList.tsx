"use client";

import { useState, useEffect } from "react";
import { SearchIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WordRow } from "@/components/search/WordRow";
import { getWordDetail } from "@/core/client-dictionary";
import type { HistoryEntry } from "@/core/types";
import type { WordEntry } from "@/core/types";

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "vừa xong";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ngày trước`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} tháng trước`;
  return `${Math.floor(mo / 12)} năm trước`;
}

interface HistoryListProps {
  history: HistoryEntry[];
  onSelect: (label: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function HistoryList({ history, onSelect, onRemove, onClear }: HistoryListProps) {
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
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-border rounded-lg border overflow-hidden">
        {history.map((e) => {
          const meta = (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <span>{timeAgo(e.timestamp)}</span>
              {e.viewCount > 1 && (
                <>
                  <span>·</span>
                  <span>{e.viewCount} lần</span>
                </>
              )}
            </span>
          );

          if (e.type === "word") {
            const entry = entryMap.get(e.label);
            if (!entry) return null;
            return (
              <li key={e.id}>
                <WordRow
                  entry={entry}
                  meta={meta}
                  onSelect={() => onSelect(e.label)}
                  onRemove={() => onRemove(e.id)}
                />
              </li>
            );
          }

          // search entry
          return (
            <li key={e.id}>
              <div className="group flex items-stretch">
                <button
                  type="button"
                  onClick={() => onSelect(e.label)}
                  className="flex-1 flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left min-w-0"
                >
                  <SearchIcon className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                  <span className="flex-1 flex flex-col min-w-0">
                    <span className="text-sm truncate">{e.label}</span>
                    {meta}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(e.id)}
                  className="opacity-0 group-hover:opacity-100 flex items-center px-2.5 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                  aria-label="Xóa"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-xs text-muted-foreground hover:text-destructive"
        onClick={onClear}
      >
        Xóa tất cả lịch sử
      </Button>
    </div>
  );
}
