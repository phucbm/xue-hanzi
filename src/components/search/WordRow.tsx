"use client";

/**
 * WordRow — Generic word list row.
 * Used in SearchBox (search results) and ViewedWordList (history with view count).
 *
 * Layout:
 *   Left:   large Chinese character for quick visual ID
 *   Middle: row 1 = simp + trad (if diff)
 *           row 2 = pinyin · vi/en  [👁 N  if viewCount provided]
 *   Right:  optional X remove button, visible on hover
 */

import { X, Eye } from "lucide-react";
import type { WordEntry } from "@/core/types";

interface WordRowProps {
  entry: WordEntry;
  onSelect: () => void;
  /** When provided, shows 👁 N in row 2 */
  viewCount?: number;
  /** When provided, shows an X button on row hover */
  onRemove?: () => void;
}

export function WordRow({ entry, onSelect, viewCount, onRemove }: WordRowProps) {
  const { simp, trad, pinyin, definitionVi, definitionsEn, key } = entry;
  const showTrad = trad && trad !== simp;
  // Trad-only entries: show trad first since that's the lookup key
  const primary = key ? trad : simp;
  const secondary = key ? simp : (showTrad ? trad : null);
  const definition = definitionVi || definitionsEn[0];

  return (
    <div className="group flex items-stretch">
      {/* Select area */}
      <button
        type="button"
        // Prevent input blur before click fires (search dropdown use)
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSelect}
        className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted transition-colors min-w-0"
      >
        {/* Large character anchor */}
        <span className="hidden font-chinese text-2xl font-medium w-9 shrink-0 text-center leading-none">
          {primary}
        </span>

        {/* Text info */}
        <span className="flex flex-col min-w-0 flex-1">
          {/* Row 1: primary + optional secondary */}
          <span className="flex flex-wrap items-baseline gap-x-1.5 leading-tight">
            <span className="font-chinese font-medium text-sm">{primary}</span>
            {secondary && (
              <span className="font-chinese text-xs text-muted-foreground">
                ({secondary})
              </span>
            )}
          </span>
          {/* Row 2: pinyin · definition · view count */}
          <span className="flex items-center gap-1.5 min-w-0 leading-tight">
            {pinyin && (
              <span className="text-xs text-muted-foreground shrink-0">
                {pinyin}
              </span>
            )}
            {definition && (
              <span className="text-xs truncate flex-1">{definition}</span>
            )}
            {viewCount !== undefined && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0 ml-auto">
                <Eye className="h-3 w-3" />
                {viewCount}
              </span>
            )}
          </span>
        </span>
      </button>

      {/* Action buttons — visible on group hover */}
      {onRemove && (
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {onRemove && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onRemove}
              tabIndex={-1}
              aria-label="Xóa khỏi lịch sử"
              className="flex items-center px-2.5 text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
