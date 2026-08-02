"use client";

/**
 * AddToFlashcardsButton — a single "Flashcard actions" dropdown, reused on
 * WordTabContent's action row, inside the study-session reveal (via
 * WordTabContent), and next to each search result. Every word is already
 * auto-added to flashcards on view (see upsertFlashcardOnView), so this
 * menu's jobs are all about managing that state:
 *  - file the word into a MANUAL deck (auto decks like HSK/month/leech are
 *    derived, never assignable)
 *  - flag/unflag the word as manually "hard" (merged into the leech bucket)
 *  - exclude/restore (soft blacklist — hides everywhere, keeps SRS state)
 *  - forget entirely (destructive — erases SRS state + all view/search
 *    history for this word, confirmed via AlertDialog first)
 */

import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Layers, Check, Plus, Flame, Ban, RotateCcw, Trash2 } from "lucide-react";
import {
  addWordToDeck,
  createDeck,
  excludeWord,
  flagWordHard,
  forgetWord,
  removeWordFromDeck,
  restoreWord,
  unflagWordHard,
  getManualDecks,
  getWordFlashcardStatus,
} from "@/app/actions/flashcards";
import type { FlashcardDeck } from "@/core/flashcard-types";

interface AddToFlashcardsButtonProps {
  simp: string;
  /** Called after forgetWord succeeds — e.g. to remove the row from a list
   * the caller is rendering (search results, deck detail). */
  onForgotten?: () => void;
}

export function AddToFlashcardsButton({ simp, onForgotten }: AddToFlashcardsButtonProps) {
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [cardId, setCardId] = useState<string | null>(null);
  const [deckIds, setDeckIds] = useState<string[]>([]);
  const [excluded, setExcluded] = useState(false);
  const [flaggedHard, setFlaggedHard] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [confirmForgetOpen, setConfirmForgetOpen] = useState(false);

  function refresh() {
    getManualDecks().then(setDecks);
    getWordFlashcardStatus(simp).then((s) => {
      setCardId(s.cardId);
      setDeckIds(s.deckIds);
      setExcluded(s.excluded);
      setFlaggedHard(s.flaggedHard);
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

  async function handleToggleHard() {
    if (flaggedHard) {
      setFlaggedHard(false);
      await unflagWordHard(simp);
    } else {
      setFlaggedHard(true);
      await flagWordHard(simp);
    }
    refresh();
  }

  async function handleForget() {
    setConfirmForgetOpen(false);
    await forgetWord(simp);
    onForgotten?.();
    refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Tùy chọn Flashcard"
          aria-label="Tùy chọn Flashcard"
        >
          <Layers className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
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

          <DropdownMenuSeparator />

          <DropdownMenuItem closeOnClick={false} onClick={handleToggleHard} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Flame className="h-3.5 w-3.5" />
              Đánh dấu khó
            </span>
            {flaggedHard && <Check className="h-3.5 w-3.5 shrink-0" />}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleToggleExclude} className="gap-2">
            {excluded ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
            {excluded ? "Khôi phục vào Flashcards" : "Loại khỏi Flashcards"}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmForgetOpen(true)} className="gap-2">
            <Trash2 className="h-3.5 w-3.5" />
            Quên từ này...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmForgetOpen} onOpenChange={setConfirmForgetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quên từ &quot;{simp}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Xóa toàn bộ tiến trình học (SM-2) và mọi lượt xem/tìm kiếm từ này trong lịch sử — như thể bạn
              chưa từng tra từ này. Không thể hoàn tác. Nếu bạn xem lại từ này sau, nó sẽ bắt đầu như một thẻ mới.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleForget}>Quên vĩnh viễn</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
