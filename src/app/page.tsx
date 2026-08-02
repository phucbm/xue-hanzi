"use client";

import {useCallback, useEffect, useRef, useState, useTransition} from "react";
import {AppLayout} from "@/components/layout/AppLayout";
import {ContentArea} from "@/components/layout/content-area";
import {getWordEntries} from "@/app/actions";
import {upsertFlashcardOnView, getSystemMetrics} from "@/app/actions/flashcards";
import {useHistory} from "@/hooks/useHistory";
import {type WordEntry, wordKey} from "@/core/types";
import type {SystemMetrics} from "@/core/flashcard-engine";

export default function HomePage() {
  const [entries, setEntries]   = useState<WordEntry[]>([]);
  const [activeTab, setActiveTab] = useState<string | undefined>();
  const [isWordLoading, startDetailTransition] = useTransition();
  const [flashcardMetrics, setFlashcardMetrics] = useState<SystemMetrics | null>(null);

  const {
    history,
    addWordEntry,
    addSearchEntry,
    removeEntry,
    clearHistory,
    passphrase,
    isSynced,
    isSyncing,
    authenticate,
    logout,
  } = useHistory();

  useEffect(() => {
    if (!passphrase) {
      setFlashcardMetrics(null);
      return;
    }
    getSystemMetrics().then(setFlashcardMetrics);
  }, [passphrase]);

  const lastOpenedTabRef = useRef<string | null>(null);

  const openWord = useCallback(
    (simp: string, preferredTab?: string) => {
      if (!simp.trim()) return;
      startDetailTransition(async () => {
        const result = await getWordEntries(simp);
        setEntries(result);
        if (result[0]) {
          const key = preferredTab ?? wordKey(result[0]);
          lastOpenedTabRef.current = key;
          setActiveTab(key);
          addWordEntry(wordKey(result[0]));
          void upsertFlashcardOnView(wordKey(result[0]));
          const url =
            key === wordKey(result[0])
              ? `?word=${encodeURIComponent(simp)}`
              : `?word=${encodeURIComponent(simp)}&active=${encodeURIComponent(key)}`;
          window.history.replaceState(null, "", url);
        }
      });
    },
    [addWordEntry],
  );

  const openWordRef = useRef(openWord);
  openWordRef.current = openWord;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const word   = params.get("word");
    const active = params.get("active") ?? undefined;
    if (word) openWordRef.current(word, active);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save viewed tab on tab switch (not on initial open — that's handled in openWord)
  useEffect(() => {
    if (!activeTab) return;
    if (activeTab === lastOpenedTabRef.current) {
      lastOpenedTabRef.current = null;
      return;
    }
    addWordEntry(activeTab);
    void upsertFlashcardOnView(activeTab);
  }, [activeTab, addWordEntry]);

  const handleHome = useCallback(() => {
    setEntries([]);
    setActiveTab(undefined);
    window.history.replaceState(null, "", "/");
  }, []);

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      const params = new URLSearchParams(window.location.search);
      const defaultKey = entries[0] ? wordKey(entries[0]) : null;
      if (tab === defaultKey) params.delete("active");
      else params.set("active", tab);
      window.history.replaceState(null, "", `?${params.toString()}`);
    },
    [entries],
  );

  return (
    <AppLayout
      onHome={handleHome}
      onSearchSelect={openWord}
      onSearchQuery={addSearchEntry}
      history={history}
      onHistoryRemove={removeEntry}
      onHistoryClear={clearHistory}
      passphrase={passphrase}
      isSynced={isSynced}
      isSyncing={isSyncing}
      onAuthenticate={authenticate}
      onLogout={logout}
    >
      {({ openSearch, openHistory }) => (
        <ContentArea
          entries={entries}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onWordClick={openWord}
          loading={isWordLoading}
          recentWords={history
            .filter((e) => e.type === "word")
            .slice(0, 16)
            .map((e) => e.label)}
          isSynced={isSynced}
          onOpenSearch={openSearch}
          onOpenHistory={openHistory}
          flashcardMetrics={flashcardMetrics}
        />
      )}
    </AppLayout>
  );
}
