"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, ChevronRight, Ban, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createDeck, getDecks } from "@/app/actions/flashcards";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/components/layout/history/utils";
import { daysUntil, type DeckListItem, type MasteryTier } from "@/core/flashcard-types";

interface DeckListProps {
  initialDecks: DeckListItem[];
}

function formatScore(score: number | null): string | null {
  if (score === null) return null;
  return `${Math.round(score * 100)}%`;
}

/** "còn N ngày" / "ngày mai" for a future due_at — only ever called when
 * count === 0, so the date is guaranteed to be in the future. */
function formatNextDue(dueAt: string): string {
  const days = daysUntil(dueAt);
  return days === 1 ? "ngày mai" : `còn ${days} ngày`;
}

/** Same 3 tiers/colors as the dashboard's mastery bar — kept in sync so a
 * deck's row tint always means the same thing as the mastery-bar legend. */
const FLUENCY_BG: Record<MasteryTier, string> = {
  new: "bg-muted-foreground/5",
  learning: "bg-mastery-learning/8",
  mastered: "bg-mastery-mastered/8",
};
const FLUENCY_DOT: Record<MasteryTier, string> = {
  new: "bg-muted-foreground",
  learning: "bg-mastery-learning",
  mastered: "bg-mastery-mastered",
};

function DeckRow({ deck, manage }: { deck: DeckListItem; manage?: boolean }) {
  const score = formatScore(deck.lastScore);
  const { tier, ratio } = deck.fluency;
  const fluencyPct = tier ? Math.round((ratio ?? 0) * 100) : null;

  return (
    <div className={cn("flex items-center justify-between gap-3 px-4 py-3", tier && FLUENCY_BG[tier])}>
      <div className="min-w-0 flex items-center gap-2.5">
        {tier && <span className={cn("h-2 w-2 rounded-full shrink-0", FLUENCY_DOT[tier])} />}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate flex items-center gap-1.5">
            <span className="truncate">{deck.title}</span>
            {deck.newLast24h > 0 && (
              <span className="inline-flex items-center gap-0.5 shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                <Sparkles className="h-2.5 w-2.5" />
                {deck.newLast24h} từ mới
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {deck.total} từ
            {deck.count > 0
              ? ` · ${deck.count} cần ôn`
              : deck.nextDueAt && ` · ${formatNextDue(deck.nextDueAt)}`}
            {fluencyPct !== null && fluencyPct > 0 && ` · Thành thạo ${fluencyPct}%`}
          </p>
          {score && deck.lastSessionAt && (
            <p className="text-xs text-muted-foreground">
              Lần trước: {deck.lastSessionPassed}/{deck.lastSessionTotalWords} từ đúng ({score}) ·{" "}
              {timeAgo(new Date(deck.lastSessionAt).getTime())} · {deck.sessionCount} phiên học
              {deck.lastSessionAheadOfSchedule && " · luyện tập"}
            </p>
          )}
        </div>
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
          disabled={deck.total === 0}
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Flashcards</h1>
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          Bộ thẻ mới
        </Button>
      </div>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground -mt-2">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Mới
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-mastery-learning" /> Đang học
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-mastery-mastered" /> Thành thạo
        </span>
        <span>— màu thể hiện mức độ thành thạo trung bình của bộ thẻ (ẩn nếu bộ có dưới 3 từ)</span>
      </p>

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
