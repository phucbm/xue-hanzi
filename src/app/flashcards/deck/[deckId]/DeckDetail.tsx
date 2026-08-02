"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppLayoutWithHistory } from "@/components/layout/AppLayoutWithHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WordRow } from "@/components/search/WordRow";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Check, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { getWordEntries } from "@/app/actions";
import { deleteDeck, removeWordFromDeck, renameDeck } from "@/app/actions/flashcards";
import type { FlashcardCard, FlashcardDeck } from "@/core/flashcard-types";
import type { WordEntry } from "@/core/types";

interface DeckDetailProps {
  deck: FlashcardDeck;
  initialCards: FlashcardCard[];
}

export function DeckDetail({ deck, initialCards }: DeckDetailProps) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [entries, setEntries] = useState<Map<string, WordEntry>>(new Map());
  const [deckTitle, setDeckTitle] = useState(deck.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(deck.title);

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

  async function handleRename() {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await renameDeck(deck.id, trimmed);
      setDeckTitle(trimmed);
      setEditingTitle(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete() {
    try {
      await deleteDeck(deck.id);
      router.push("/flashcards");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRemoveWord(cardId: string) {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    try {
      await removeWordFromDeck(deck.id, cardId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <AppLayoutWithHistory>
      <div className="max-w-2xl mx-auto w-full py-6 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          {editingTitle ? (
            <div className="flex items-center gap-1.5 flex-1">
              <Input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="h-8 text-lg font-bold"
              />
              <Button size="icon-sm" variant="ghost" onClick={handleRename} aria-label="Lưu">
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => setEditingTitle(false)} aria-label="Hủy">
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <h1 className="text-xl font-bold flex items-center gap-2 min-w-0">
              <span className="truncate">{deckTitle}</span>
              <button
                type="button"
                onClick={() => {
                  setTitle(deckTitle);
                  setEditingTitle(true);
                }}
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Đổi tên bộ thẻ"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </h1>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" nativeButton={false} render={<Link href={`/flashcards/study?deck=${deck.id}`} />}>
              Học
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Xóa bộ thẻ"
              >
                <Trash2 className="h-4 w-4" />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Xóa bộ thẻ &quot;{deckTitle}&quot;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Các từ trong bộ thẻ vẫn giữ nguyên trạng thái ôn tập, chỉ xóa bộ thẻ này.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Hủy</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Xóa</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có từ nào trong bộ thẻ này.</p>
        ) : (
          <div className="rounded-xl ring-1 ring-foreground/10 divide-y divide-border overflow-hidden">
            {cards.map((card) => {
              const entry = entries.get(card.simp);
              if (!entry) return null;
              return (
                <WordRow
                  key={card.id}
                  entry={entry}
                  onSelect={() => router.push(`/word/${encodeURIComponent(card.simp)}`)}
                  onRemove={() => handleRemoveWord(card.id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </AppLayoutWithHistory>
  );
}
