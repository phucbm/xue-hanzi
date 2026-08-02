"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayoutWithHistory } from "@/components/layout/AppLayoutWithHistory";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { getWordEntries } from "@/app/actions";
import { restoreWord } from "@/app/actions/flashcards";
import type { FlashcardCard } from "@/core/flashcard-types";
import type { WordEntry } from "@/core/types";

interface ExcludedListProps {
  initialCards: FlashcardCard[];
}

export function ExcludedList({ initialCards }: ExcludedListProps) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [entries, setEntries] = useState<Map<string, WordEntry>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pairs = await Promise.all(
        cards.map(async (c) => {
          const found = await getWordEntries(c.simp);
          return [c.simp, found[0]] as const;
        })
      );
      if (cancelled) return;
      setEntries(new Map(pairs.filter((p): p is [string, WordEntry] => !!p[1])));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.map((c) => c.simp).join(",")]);

  async function handleRestore(simp: string, cardId: string) {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    try {
      await restoreWord(simp);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <AppLayoutWithHistory>
      <div className="max-w-2xl mx-auto w-full py-6 flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold">Đã loại trừ</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Những từ này sẽ không xuất hiện trong bất kỳ bộ thẻ nào cho đến khi được khôi phục.
          </p>
        </div>

        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có từ nào bị loại trừ.</p>
        ) : (
          <div className="rounded-xl ring-1 ring-foreground/10 divide-y divide-border overflow-hidden">
            {cards.map((card) => {
              const entry = entries.get(card.simp);
              return (
                <div key={card.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => router.push(`/word/${encodeURIComponent(card.simp)}`)}
                    className="flex flex-col items-start min-w-0 flex-1 text-left"
                  >
                    <span className="font-chinese font-medium text-sm">{entry?.simp ?? card.simp}</span>
                    {entry && (
                      <span className="flex items-center gap-1.5 min-w-0 text-xs text-muted-foreground">
                        {entry.pinyin && <span className="shrink-0">{entry.pinyin}</span>}
                        {(entry.definitionVi || entry.definitionsEn[0]) && (
                          <span className="truncate">{entry.definitionVi || entry.definitionsEn[0]}</span>
                        )}
                      </span>
                    )}
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs shrink-0"
                    onClick={() => handleRestore(card.simp, card.id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Khôi phục
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayoutWithHistory>
  );
}
