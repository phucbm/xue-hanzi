"use client";

import {useCallback, useEffect, useRef, useState, useTransition} from "react";
import {AppLayout} from "@/components/layout/AppLayout";
import {ContentArea} from "@/components/layout/content-area";
import {getWordEntries} from "@/app/actions";
import {useViewedWords} from "@/hooks/useViewedWords";
import {type WordEntry, wordKey} from "@/core/types";

export default function HomePage() {
  const [entries, setEntries]   = useState<WordEntry[]>([]);
  const [activeTab, setActiveTab] = useState<string | undefined>();
  const [isWordLoading, startDetailTransition] = useTransition();

  // TODO: remove addViewedWord here once homepage panel no longer increments view count
  const { addViewedWord } = useViewedWords();

  const openWord = useCallback(
    (simp: string, preferredTab?: string) => {
      if (!simp.trim()) return;
      startDetailTransition(async () => {
        const result = await getWordEntries(simp);
        setEntries(result);
        if (result[0]) {
          const key = preferredTab ?? wordKey(result[0]);
          setActiveTab(key);
          addViewedWord(wordKey(result[0]));
          const url =
            key === wordKey(result[0])
              ? `?word=${encodeURIComponent(simp)}`
              : `?word=${encodeURIComponent(simp)}&active=${encodeURIComponent(key)}`;
          window.history.replaceState(null, "", url);
        }
      });
    },
    [addViewedWord],
  );

  const openWordRef = useRef(openWord);
  openWordRef.current = openWord;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const word   = params.get("word");
    const active = params.get("active") ?? undefined;
    if (word) openWordRef.current(word, active);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    <AppLayout onHome={handleHome} onSearchSelect={openWord}>
      <ContentArea
        entries={entries}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onWordClick={openWord}
        loading={isWordLoading}
      />
    </AppLayout>
  );
}
