"use client";

import { useState, useEffect, useCallback } from "react";
import type { HistoryEntry } from "@/core/types";

const STORAGE_KEY = "hch_history";
const OLD_KEY = "hch_viewed_words";
const MAX = 100;

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readStorage(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

function writeStorage(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota errors
  }
}

function migrate(existing: HistoryEntry[]): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(OLD_KEY);
    if (!raw) return existing;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const old = JSON.parse(raw) as any[];
    if (!Array.isArray(old) || old.length === 0) return existing;
    const converted: HistoryEntry[] = old
      .filter((w) => typeof w.simp === "string")
      .map((w) => ({
        id: genId(),
        type: "word" as const,
        label: w.simp as string,
        timestamp: w.lastViewedAt ? new Date(w.lastViewedAt).getTime() : Date.now(),
      }))
      .sort((a, b) => a.timestamp - b.timestamp); // oldest first, will be merged before front
    const merged = [...converted, ...existing];
    // dedup: keep newest of same type+label
    const seen = new Map<string, HistoryEntry>();
    for (const e of merged) {
      const key = `${e.type}:${e.label}`;
      const prev = seen.get(key);
      if (!prev || e.timestamp > prev.timestamp) seen.set(key, e);
    }
    const result = Array.from(seen.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX);
    writeStorage(result);
    localStorage.removeItem(OLD_KEY);
    return result;
  } catch {
    return existing;
  }
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    const stored = readStorage();
    const migrated = stored.length === 0 ? migrate(stored) : stored;
    setHistory(migrated);
  }, []);

  const addEntry = useCallback((type: HistoryEntry["type"], label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setHistory((prev) => {
      const filtered = prev.filter((e) => !(e.type === type && e.label === trimmed));
      const next: HistoryEntry[] = [
        { id: genId(), type, label: trimmed, timestamp: Date.now() },
        ...filtered,
      ].slice(0, MAX);
      writeStorage(next);
      return next;
    });
  }, []);

  const addSearchEntry = useCallback(
    (query: string) => addEntry("search", query),
    [addEntry]
  );

  const addWordEntry = useCallback(
    (simp: string) => addEntry("word", simp),
    [addEntry]
  );

  const removeEntry = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      writeStorage(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setHistory([]);
  }, []);

  return { history, addSearchEntry, addWordEntry, removeEntry, clearHistory };
}
