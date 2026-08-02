"use client";

/**
 * AddToFlashcardsButton — lives in WordTabContent's action row.
 * Every word is already auto-added to flashcards on view (see
 * upsertFlashcardOnView, wired from page.tsx). This component's jobs:
 *  - file the word into a MANUAL deck (dropdown lists manual decks only —
 *    auto decks like HSK/month/leech are derived, never assignable)
 *  - toggle the exclude/blacklist state ("Remove from Flashcards")
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Layers, Check, Plus, Ban, RotateCcw } from "lucide-react";
import {
  addWordToDeck,
  createDeck,
  excludeWord,
  removeWordFromDeck,
  restoreWord,
  getManualDecks,
  getWordFlashcardStatus,
} from "@/app/actions/flashcards";
import type { FlashcardDeck } from "@/core/flashcard-types";

interface AddToFlashcardsButtonProps {
  simp: string;
}

export function AddToFlashcardsButton({ simp }: AddToFlashcardsButtonProps) {
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [cardId, setCardId] = useState<string | null>(null);
  const [deckIds, setDeckIds] = useState<string[]>([]);
  const [excluded, setExcluded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  function refresh() {
    getManualDecks().then(setDecks);
    getWordFlashcardStatus(simp).then((s) => {
      setCardId(s.cardId);
      setDeckIds(s.deckIds);
      setExcluded(s.excluded);
    });
  }

  useEffect(() => {
    refresh();
    setCreating(false);
    setNewTitle("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simp]);

  async function handleToggleDeck(deckId: string, isMember: boolean) {
    if (isMember) {
      if (!cardId) return;
      setDeckIds((prev) => prev.filter((id) => id !== deckId));
      await removeWordFromDeck(deckId, cardId);
    } else {
      setDeckIds((prev) => [...prev, deckId]);
      setExcluded(false);
      await addWordToDeck(deckId, simp);
    }
    refresh();
  }

  async function handleCreateDeck() {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    const deck = await createDeck(trimmed);
    if (deck) {
      await addWordToDeck(deck.id, simp);
    }
    setCreating(false);
    setNewTitle("");
    refresh();
  }

  async function handleToggleExclude() {
    if (excluded) {
      setExcluded(false);
      await restoreWord(simp);
    } else {
      setExcluded(true);
      await excludeWord(simp);
    }
    refresh();
  }

  return (
    <div className="flex items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Thêm vào bộ thẻ ghi nhớ"
          aria-label="Thêm vào bộ thẻ ghi nhớ"
        >
          <Layers className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Thêm vào bộ thẻ</DropdownMenuLabel>
            {decks.length === 0 && !creating && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Chưa có bộ thẻ nào</div>
            )}
            {decks.map((deck) => {
              const isMember = deckIds.includes(deck.id);
              return (
                <DropdownMenuItem
                  key={deck.id}
                  closeOnClick={false}
                  onClick={() => handleToggleDeck(deck.id, isMember)}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate">{deck.title}</span>
                  {isMember && <Check className="h-3.5 w-3.5 shrink-0" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {creating ? (
            <div className="flex items-center gap-1 px-1 py-1">
              <Input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  // Stop Base UI Menu's composite typeahead from intercepting keystrokes.
                  e.stopPropagation();
                  if (e.key === "Enter") handleCreateDeck();
                  if (e.key === "Escape") setCreating(false);
                }}
                onKeyUp={(e) => e.stopPropagation()}
                placeholder="Tên bộ thẻ..."
                className="h-7 text-xs"
              />
              <Button size="sm" className="h-7 px-2 text-xs shrink-0" onClick={handleCreateDeck}>
                Tạo
              </Button>
            </div>
          ) : (
            <DropdownMenuItem closeOnClick={false} onClick={() => setCreating(true)} className="gap-2">
              <Plus className="h-3.5 w-3.5" />
              Tạo bộ thẻ mới
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleToggleExclude}
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        title={excluded ? "Khôi phục vào Flashcards" : "Loại khỏi Flashcards"}
        aria-label={excluded ? "Khôi phục vào Flashcards" : "Loại khỏi Flashcards"}
      >
        {excluded ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
