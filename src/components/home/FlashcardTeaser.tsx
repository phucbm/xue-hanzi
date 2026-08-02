"use client";

/**
 * FlashcardTeaser — compact due-count/streak summary shown on the homepage
 * welcome screen, linking into /flashcards. Renders nothing until there's
 * at least one flashcard (no cards yet = nothing to promote).
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Flame, Layers } from "lucide-react";
import { computeStreak } from "@/core/flashcard-streak";
import type { SystemMetrics } from "@/core/flashcard-engine";

interface FlashcardTeaserProps {
  metrics: SystemMetrics | null;
}

export function FlashcardTeaser({ metrics }: FlashcardTeaserProps) {
  if (!metrics || metrics.totalActive === 0) return null;

  const streak = computeStreak(metrics.sessions);

  return (
    <div className="rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5 text-sm">
          <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-semibold">{metrics.dueToday}</span> từ cần ôn hôm nay
        </span>
        {streak.current > 0 && (
          <span className="flex items-center gap-1.5 text-sm">
            <Flame className="h-4 w-4 text-muted-foreground shrink-0" />
            Chuỗi <span className="font-semibold">{streak.current}</span> ngày
          </span>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 self-start sm:self-auto"
        nativeButton={false}
        render={<Link href="/flashcards" />}
      >
        Xem Flashcards
      </Button>
    </div>
  );
}
