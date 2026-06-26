"use client";

import { SearchIcon, X } from "lucide-react";
import { WordRow } from "@/components/search/WordRow";
import type { HistoryEntry } from "@/core/types";
import type { WordEntry } from "@/core/types";
import { timeAgo } from "./utils";

interface Props {
  entry: HistoryEntry;
  wordEntry?: WordEntry;
  onSelect: () => void;
  onRemove: () => void;
}

export function HistoryEntryRow({ entry: e, wordEntry, onSelect, onRemove }: Props) {
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
    if (!wordEntry) return null;
    return (
      <li>
        <WordRow entry={wordEntry} meta={meta} onSelect={onSelect} onRemove={onRemove} />
      </li>
    );
  }

  return (
    <li>
      <div className="group flex items-stretch">
        <button
          type="button"
          onClick={onSelect}
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
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 flex items-center px-2.5 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
          aria-label="Xóa"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
