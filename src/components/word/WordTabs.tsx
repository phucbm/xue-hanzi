"use client";

/**
 * WordTabs — Tab navigation for compound words.
 * Single entry: renders WordTabContent directly (no tab bar).
 * Multiple entries: tabs[0] = full compound, tabs[1+] = individual chars.
 * Data source: WordEntry[] from getWordEntries()
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WordTabContent } from "@/components/word/WordTabContent";
import { wordKey, type WordEntry } from "@/core/types";

interface WordTabsProps {
  entries: WordEntry[];
  onWordClick: (simp: string) => void;
  activeTab?: string;
  onTabChange?: (value: string) => void;
  recentWords?: string[];
}

export function WordTabs({ entries, onWordClick, activeTab, onTabChange, recentWords }: WordTabsProps) {
  if (entries.length === 0) return null;

  // Deduplicate by lookup key — e.g. 一生一世 may produce two 一 entries from segmentation
  const unique = entries.filter(
    (e, i) => entries.findIndex((x) => wordKey(x) === wordKey(e)) === i
  );

  if (unique.length === 1) {
    return <WordTabContent entry={unique[0]} onWordClick={onWordClick} recentWords={recentWords} />;
  }

  return (
    <Tabs
      value={activeTab ?? wordKey(unique[0])}
      onValueChange={onTabChange}
      className="w-full"
    >
      <div className="sticky top-0 z-20 bg-background border rounded-lg shadow">
        <TabsList className="w-full overflow-x-auto h-auto gap-1 p-1 flex flex-nowrap justify-start">
          {unique.map((entry, i) => (
            <TabsTrigger
              key={`${wordKey(entry)}-${i}`}
              value={wordKey(entry)}
              className="shrink-0 text-xl font-chinese font-medium w-auto"
            >
              {entry.key ? entry.trad : entry.simp}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="relative z-10">
          {unique.map((entry, i) => (
              <TabsContent key={`${wordKey(entry)}-${i}`} value={wordKey(entry)}>
                  <WordTabContent entry={entry} onWordClick={onWordClick} recentWords={recentWords} />
              </TabsContent>
          ))}
      </div>
    </Tabs>
  );
}
