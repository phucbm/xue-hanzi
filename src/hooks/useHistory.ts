"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { HistoryEntry } from "@/core/types";

const STORAGE_KEY = "hch_history";
const OLD_KEY = "hch_viewed_words";
const PASSPHRASE_KEY = "hch_passphrase";
const MAX = 100;
const CLOUD_MAX = 500;

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readStorage(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (JSON.parse(raw) as any[]).map((e) => ({
      ...e,
      viewCount: typeof e.viewCount === "number" ? e.viewCount : 1,
    })) as HistoryEntry[];
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
        viewCount: (w.viewCount as number | undefined) ?? 1,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
    const merged = [...converted, ...existing];
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

function authHeader(pass: string): HeadersInit {
  return { Authorization: `Bearer ${pass}` };
}

function mergeWithCloud(local: HistoryEntry[], cloud: HistoryEntry[]): HistoryEntry[] {
  const merged = new Map<string, HistoryEntry>();
  for (const e of local) merged.set(e.id, e);
  for (const e of cloud) {
    const existing = merged.get(e.id);
    if (!existing || e.viewCount >= existing.viewCount) merged.set(e.id, e);
  }
  // dedupe by type:label — keep highest viewCount, then latest timestamp
  const byLabel = new Map<string, HistoryEntry>();
  for (const e of merged.values()) {
    const key = `${e.type}:${e.label}`;
    const prev = byLabel.get(key);
    if (
      !prev ||
      e.viewCount > prev.viewCount ||
      (e.viewCount === prev.viewCount && e.timestamp > prev.timestamp)
    ) {
      byLabel.set(key, e);
    }
  }
  return Array.from(byLabel.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, CLOUD_MAX);
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [isSynced, setIsSynced] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // ref so fire-and-forget callbacks always see latest passphrase
  const passphraseRef = useRef<string | null>(null);
  useEffect(() => {
    passphraseRef.current = passphrase;
  }, [passphrase]);

  const syncFromCloud = useCallback(async (pass: string, localEntries?: HistoryEntry[]) => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/history", { headers: authHeader(pass) });
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem(PASSPHRASE_KEY);
          setPassphrase(null);
          passphraseRef.current = null;
        }
        return;
      }
      const cloud: HistoryEntry[] = await res.json();
      const local = localEntries ?? readStorage();
      const result = mergeWithCloud(local, cloud);
      writeStorage(result);
      setHistory(result);
      setIsSynced(true);
    } catch {
      // network error — stay offline
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    const stored = readStorage();
    const migrated = stored.length === 0 ? migrate(stored) : stored;
    setHistory(migrated);
    const savedPass = localStorage.getItem(PASSPHRASE_KEY);
    if (savedPass) {
      setPassphrase(savedPass);
      passphraseRef.current = savedPass;
      syncFromCloud(savedPass, migrated);
    }
  }, [syncFromCloud]);

  const addEntry = useCallback(
    (type: HistoryEntry["type"], label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      setHistory((prev) => {
        const existing = prev.find((e) => e.type === type && e.label === trimmed);
        const filtered = prev.filter((e) => !(e.type === type && e.label === trimmed));
        const entry: HistoryEntry = {
          id: existing?.id ?? genId(),
          type,
          label: trimmed,
          timestamp: Date.now(),
          viewCount: (existing?.viewCount ?? 0) + 1,
        };
        const next = [entry, ...filtered].slice(0, MAX);
        writeStorage(next);
        const pass = passphraseRef.current;
        if (pass) {
          fetch(`/api/history/${entry.id}`, {
            method: "PUT",
            headers: { ...authHeader(pass), "Content-Type": "application/json" },
            body: JSON.stringify(entry),
          }).catch(() => {});
        }
        return next;
      });
    },
    []
  );

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
      const pass = passphraseRef.current;
      if (pass) {
        fetch(`/api/history/${id}`, {
          method: "DELETE",
          headers: authHeader(pass),
        }).catch(() => {});
      }
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    const pass = passphraseRef.current;
    if (pass) {
      fetch("/api/history", {
        method: "DELETE",
        headers: authHeader(pass),
      }).catch(() => {});
    }
    setHistory([]);
  }, []);

  const authenticate = useCallback(
    async (pass: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/history/verify", {
          method: "POST",
          headers: authHeader(pass),
        });
        if (!res.ok) return false;
        localStorage.setItem(PASSPHRASE_KEY, pass);
        setPassphrase(pass);
        passphraseRef.current = pass;
        await syncFromCloud(pass);
        return true;
      } catch {
        return false;
      }
    },
    [syncFromCloud]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(PASSPHRASE_KEY);
    setPassphrase(null);
    passphraseRef.current = null;
    setIsSynced(false);
  }, []);

  return {
    history,
    addSearchEntry,
    addWordEntry,
    removeEntry,
    clearHistory,
    passphrase,
    isSynced,
    isSyncing,
    authenticate,
    logout,
  };
}
