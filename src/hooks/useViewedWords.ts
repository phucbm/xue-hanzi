"use client";

import { useState, useEffect, useCallback } from "react";

export interface ViewedWord {
  id?: string;
  simp: string;
  viewCount: number;
  firstViewedAt: string;
  lastViewedAt: string;
}

const STORAGE_KEY = "hch_viewed_words";

function readLocalStorage(): ViewedWord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (JSON.parse(raw) as any[]).map((w) => ({
      simp: w.simp as string,
      // Migrate from old shape that had viewedAt: string[]
      viewCount: (w.viewCount as number | undefined) ?? (w.viewedAt as string[] | undefined)?.length ?? 1,
      firstViewedAt: w.firstViewedAt as string,
      lastViewedAt: w.lastViewedAt as string,
    }));
  } catch {
    return [];
  }
}

function writeLocalStorage(words: ViewedWord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  } catch {
    // Ignore quota errors
  }
}

export function useViewedWords() {
  const [viewedWords, setViewedWords] = useState<ViewedWord[]>([]);

  useEffect(() => {
    setViewedWords(readLocalStorage());
  }, []);

  const addViewedWord = useCallback((simp: string) => {
    setViewedWords((prev) => {
      const now = new Date().toISOString();
      const existing = prev.find((w) => w.simp === simp);
      const next: ViewedWord[] = existing
        ? [
            {
              ...existing,
              viewCount: existing.viewCount + 1,
              lastViewedAt: now,
            },
            ...prev.filter((w) => w.simp !== simp),
          ]
        : [
            { simp, viewCount: 1, firstViewedAt: now, lastViewedAt: now },
            ...prev,
          ];
      writeLocalStorage(next);
      return next;
    });
  }, []);

  const removeViewedWord = useCallback((simp: string) => {
    setViewedWords((prev) => {
      const next = prev.filter((w) => w.simp !== simp);
      writeLocalStorage(next);
      return next;
    });
  }, []);

  const clearViewedWords = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setViewedWords([]);
  }, []);

  return { viewedWords, addViewedWord, removeViewedWord, clearViewedWords };
}
