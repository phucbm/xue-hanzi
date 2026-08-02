"use client";

import { useCallback, useEffect, useState, useTransition, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ContentArea } from "@/components/layout/content-area";
import { getWordEntries } from "@/app/actions";
import { upsertFlashcardOnView } from "@/app/actions/flashcards";
import { useHistory } from "@/hooks/useHistory";
import { wordKey, type WordEntry } from "@/core/types";

interface WordDetailPageProps {
  simp: string;
}

export function WordDetailPage({ simp }: WordDetailPageProps) {
  const [entries, setEntries] = useState<WordEntry[]>([]);
  const [activeTab, setActiveTab] = useState<string | undefined>();
  const [, startTransition] = useTransition();

  const { history, addWordEntry, addSearchEntry, removeEntry, clearHistory } = useHistory();

  useEffect(() => {
    startTransition(async () => {
      const result = await getWordEntries(simp);
      setEntries(result);
      if (result[0]) setActiveTab(wordKey(result[0]));
    });
  }, [simp]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasTrackedRef = useRef(false);
  useEffect(() => {
    if (hasTrackedRef.current || entries.length === 0) return;
    hasTrackedRef.current = true;
    addWordEntry(wordKey(entries[0]));
    void upsertFlashcardOnView(wordKey(entries[0]));
  }, [entries, addWordEntry]);

  const openWord = useCallback((newSimp: string) => {
    window.location.href = `/word/${encodeURIComponent(newSimp)}`;
  }, []);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
  }, []);

  return (
    <AppLayout
      history={history}
      onSearchQuery={addSearchEntry}
      onHistoryRemove={removeEntry}
      onHistoryClear={clearHistory}
    >
      <ContentArea
        entries={entries}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onWordClick={openWord}
      />
    </AppLayout>
  );
}
