"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, ChevronRight, Ban } from "lucide-react";
import { toast } from "sonner";
import { createDeck, getDecks } from "@/app/actions/flashcards";
import type { DeckListItem } from "@/core/flashcard-types";

interface DeckListProps {
  initialDecks: DeckListItem[];
}

function formatScore(score: number | null): string | null {
  if (score === null) return null;
  return `${Math.round(score * 100)}%`;
}

function DeckRow({ deck, manage }: { deck: DeckListItem; manage?: boolean }) {
  const score = formatScore(deck.lastScore);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{deck.title}</p>
        <p className="text-xs text-muted-foreground">
          {deck.count} từ cần ôn{score ? ` · Lần trước: ${score}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {manage && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" nativeButton={false} render={<Link href={`/flashcards/deck/${deck.id}`} />}>
            Quản lý
          </Button>
        )}
        <Button
          size="sm"
          className="h-7 px-2.5 text-xs"
          disabled={deck.count === 0}
          nativeButton={false} render={<Link href={`/flashcards/study?deck=${deck.id}`} />}
        >
          Học
        </Button>
      </div>
    </div>
  );
}

export function DeckList({ initialDecks }: DeckListProps) {
  const [decks, setDecks] = useState(initialDecks);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");

  async function refresh() {
    setDecks(await getDecks());
  }

  async function handleCreate() {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await createDeck(trimmed);
      setTitle("");
      setCreating(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const auto = decks.filter((d) => d.kind === "auto");
  const manual = decks.filter((d) => d.kind === "manual");
  const excluded = decks.find((d) => d.kind === "excluded");

  return (
    <div className="max-w-2xl mx-auto w-full py-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Flashcards</h1>
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          Bộ thẻ mới
        </Button>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">Tự động</p>
        <Card className="gap-0 p-0 divide-y divide-border">
          {auto.map((deck) => (
            <DeckRow key={deck.id} deck={deck} />
          ))}
        </Card>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">Bộ thẻ của tôi</p>
        {manual.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1">Chưa có bộ thẻ nào.</p>
        ) : (
          <Card className="gap-0 p-0 divide-y divide-border">
            {manual.map((deck) => (
              <DeckRow key={deck.id} deck={deck} manage />
            ))}
          </Card>
        )}
      </div>

      {excluded && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">Quản lý</p>
          <Card className="gap-0 p-0">
            <Link
              href="/flashcards/excluded"
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted transition-colors rounded-xl"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Ban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="text-sm font-medium truncate">{excluded.title}</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                {excluded.count} từ
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          </Card>
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bộ thẻ mới</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Tên bộ thẻ..."
          />
          <DialogFooter>
            <Button onClick={handleCreate}>Tạo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
