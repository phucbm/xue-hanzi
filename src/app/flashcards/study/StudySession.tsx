"use client";

/**
 * StudySession — runs a flashcard review session entirely in memory.
 * Nothing is written to Turso until the queue empties (submitSession is the
 * one atomic write). Closing mid-session loses all progress by design.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppLayoutWithHistory } from "@/components/layout/AppLayoutWithHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { WordTabContent } from "@/components/word/WordTabContent";
import { getWordEntries } from "@/app/actions";
import { getDecks, getDeckMetrics, startSession, submitSession } from "@/app/actions/flashcards";
import { gradeCard, type SrsQuality } from "@/core/srs";
import { daysUntil, isAutoDeckId, type SessionQueueCard, type SessionResult } from "@/core/flashcard-types";
import type { DeckMetrics } from "@/core/flashcard-engine";
import type { WordEntry } from "@/core/types";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

/** "Cần học lại vào ngày mai" / "Cần học lại trong N ngày nữa" — phrased for
 * the start-screen metrics card (contrast DeckList's terser "ngày mai" /
 * "còn N ngày" row caption). Both derive from the same daysUntil() so the
 * day count itself never disagrees between the two screens. */
function formatNextDueMessage(dueAt: string): string {
  const days = daysUntil(dueAt);
  return days === 1 ? "Cần học lại vào ngày mai" : `Cần học lại trong ${days} ngày nữa`;
}

interface StudySessionProps {
  deckId: string;
}

type Phase = "loading" | "start" | "running" | "done";

const REINSERT_MIN_GAP = 3;

function reinsertRandomly<T>(rest: T[], item: T): T[] {
  const gap = Math.min(REINSERT_MIN_GAP, rest.length);
  const pos = rest.length <= gap ? rest.length : gap + Math.floor(Math.random() * (rest.length - gap + 1));
  const next = [...rest];
  next.splice(pos, 0, item);
  return next;
}

export function StudySession({ deckId }: StudySessionProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [deckTitle, setDeckTitle] = useState(deckId);
  const [fullQueue, setFullQueue] = useState<SessionQueueCard[]>([]);
  const [sessionSize, setSessionSize] = useState<number>(0);
  const [aheadOfSchedule, setAheadOfSchedule] = useState(false);
  const [metrics, setMetrics] = useState<DeckMetrics | null>(null);

  const [queue, setQueue] = useState<SessionQueueCard[]>([]);
  const [totalWords, setTotalWords] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<WordEntry | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(false);

  const gradedRef = useRef<Map<string, SessionResult>>(new Map());
  const entryCacheRef = useRef<Map<string, WordEntry | null>>(new Map());
  const startedAtRef = useRef<string>("");
  const submittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [decks, sessionResult, deckMetrics] = await Promise.all([
        getDecks(),
        startSession(deckId),
        getDeckMetrics(deckId),
      ]);
      if (cancelled) return;
      const found = decks.find((d) => d.id === deckId);
      setDeckTitle(found?.title ?? deckId);
      setFullQueue(sessionResult.queue);
      setSessionSize(sessionResult.queue.length);
      setAheadOfSchedule(sessionResult.aheadOfSchedule);
      setMetrics(deckMetrics);
      setPhase("start");
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  function handleStart() {
    const size = Math.max(0, Math.min(sessionSize, fullQueue.length));
    const initial = fullQueue.slice(0, size || fullQueue.length);
    gradedRef.current = new Map();
    entryCacheRef.current = new Map();
    submittedRef.current = false;
    startedAtRef.current = new Date().toISOString();
    setQueue(initial);
    setTotalWords(initial.length);
    setTotalAttempts(0);
    setRevealed(false);
    setCurrentEntry(null);
    setPhase("running");
  }

  const loadCurrentEntry = useCallback(async (simp: string) => {
    if (entryCacheRef.current.has(simp)) {
      setCurrentEntry(entryCacheRef.current.get(simp) ?? null);
      return;
    }
    setLoadingEntry(true);
    try {
      const entries = await getWordEntries(simp);
      const entry = entries[0] ?? null;
      entryCacheRef.current.set(simp, entry);
      setCurrentEntry(entry);
    } finally {
      setLoadingEntry(false);
    }
  }, []);

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    try {
      await submitSession({
        deckId,
        // Auto decks are looked up by their stable descriptor ("hsk:1"), not
        // the display title ("HSK 1") — only manual decks (matched by
        // deckId elsewhere) get the human-readable name here.
        deckLabel: isAutoDeckId(deckId) ? deckId : deckTitle,
        startedAt: startedAtRef.current,
        finishedAt: new Date().toISOString(),
        results: [...gradedRef.current.values()],
        totalAttempts,
        aheadOfSchedule,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
    setPhase("done");
  }, [deckId, deckTitle, totalAttempts, aheadOfSchedule]);

  useEffect(() => {
    if (phase !== "running") return;
    if (queue.length === 0) {
      void submit();
    }
  }, [phase, queue, submit]);

  const current = queue[0];

  function handleAnswer(quality: SrsQuality) {
    if (!current) return;
    setTotalAttempts((n) => n + 1);

    if (!gradedRef.current.has(current.id)) {
      const graded = gradeCard(current, quality);
      gradedRef.current.set(current.id, { card: graded, firstQuality: quality });
    }

    if (quality === 5) {
      setQueue((prev) => prev.slice(1));
      setCurrentEntry(null);
    } else {
      setRevealed(true);
      void loadCurrentEntry(current.simp);
    }
  }

  function handleContinue() {
    if (!current) return;
    setQueue((prev) => reinsertRandomly(prev.slice(1), current));
    setRevealed(false);
    setCurrentEntry(null);
  }

  // Related/etymology words inside the revealed WordTabContent open in a new
  // tab — navigating away mid-session would abandon the in-memory queue.
  function handleExploreWord(exploreSimp: string) {
    window.open(`/word/${encodeURIComponent(exploreSimp)}`, "_blank", "noopener,noreferrer");
  }

  const gradedCount = gradedRef.current.size;

  const practiceModeBadge = aheadOfSchedule && (
    <span className="text-xs px-2 py-0.5 rounded-full bg-mastery-learning/15 text-mastery-learning font-medium shrink-0">
      Chế độ luyện tập — không ảnh hưởng lịch ôn tập
    </span>
  );

  return (
    <AppLayoutWithHistory>
      <div className="max-w-2xl mx-auto w-full py-6 flex flex-col gap-6">
        {phase === "loading" && (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {phase === "start" && (
          <>
            <h1 className="text-xl font-bold">{deckTitle}</h1>

            {metrics && metrics.total > 0 && (
              <Card className="p-4 gap-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {metrics.total} từ · {metrics.dueToday} cần ôn hôm nay
                  </span>
                  {metrics.leechCount > 0 && (
                    <span className="text-xs text-destructive font-medium">{metrics.leechCount} từ khó</span>
                  )}
                </div>
                {metrics.dueToday === 0 && metrics.nextDueAt && (
                  <p className="text-xs text-muted-foreground">{formatNextDueMessage(metrics.nextDueAt)}</p>
                )}
                <div className="flex h-2 w-full rounded-full overflow-hidden gap-0.5 bg-muted">
                  {metrics.mastery.new > 0 && (
                    <div
                      className="h-full bg-muted-foreground"
                      style={{ width: `${(metrics.mastery.new / metrics.total) * 100}%` }}
                    />
                  )}
                  {metrics.mastery.learning > 0 && (
                    <div
                      className="h-full bg-mastery-learning"
                      style={{ width: `${(metrics.mastery.learning / metrics.total) * 100}%` }}
                    />
                  )}
                  {metrics.mastery.mastered > 0 && (
                    <div
                      className="h-full bg-mastery-mastered"
                      style={{ width: `${(metrics.mastery.mastered / metrics.total) * 100}%` }}
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Mới ({metrics.mastery.new})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-mastery-learning" /> Đang học ({metrics.mastery.learning})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-mastery-mastered" /> Thành thạo ({metrics.mastery.mastered})
                  </span>
                </div>
                {metrics.newCards.length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      {metrics.newCards.length} từ mới thêm trong 24 giờ qua
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {metrics.newCards.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleExploreWord(c.simp)}
                          className="font-chinese text-sm px-2 py-1 rounded-md border bg-card hover:bg-accent transition-colors"
                        >
                          {c.simp}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {fullQueue.length === 0 ? (
              <Card className="p-6 flex flex-col items-center gap-3 text-center">
                <p className="text-sm text-muted-foreground">Chưa có từ nào trong bộ thẻ này.</p>
                <Button size="sm" nativeButton={false} render={<Link href="/flashcards" />}>
                  Quay lại
                </Button>
              </Card>
            ) : (
              <Card className="p-6 flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  {aheadOfSchedule ? (
                    <>
                      Không có từ nào đến hạn hôm nay — bạn có thể ôn trước{" "}
                      <span className="font-medium text-foreground">{fullQueue.length}</span> từ trong bộ này. Đây
                      là buổi luyện tập: kết quả sẽ không thay đổi lịch ôn tập của các từ, dù bạn trả lời đúng hết.
                    </>
                  ) : (
                    <>
                      Có <span className="font-medium text-foreground">{fullQueue.length}</span> từ cần ôn.
                    </>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground shrink-0">Số từ trong phiên này</label>
                  <Input
                    type="number"
                    min={1}
                    max={fullQueue.length}
                    value={sessionSize}
                    onChange={(e) => setSessionSize(Number(e.target.value))}
                    className="h-8 w-24"
                  />
                </div>
                <Button onClick={handleStart}>Bắt đầu</Button>
              </Card>
            )}
          </>
        )}

        {phase === "running" && current && (
          <>
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate">{deckTitle}</span>
                {practiceModeBadge}
              </span>
              <span className="shrink-0">
                {gradedCount}/{totalWords}
              </span>
            </div>

            <Card className="p-8 flex flex-col items-center justify-center min-h-[200px]">
              <p className="font-chinese text-5xl font-medium text-center">{current.simp}</p>
            </Card>

            {!revealed ? (
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" size="lg" onClick={() => handleAnswer(2)}>
                  Chưa nhớ?
                </Button>
                <Button size="lg" onClick={() => handleAnswer(5)}>
                  Đã nhớ
                </Button>
              </div>
            ) : (
              <>
                <Button size="lg" onClick={handleContinue}>
                  Tiếp tục
                </Button>

                {loadingEntry && (
                  <div className="flex justify-center text-muted-foreground py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}
                {currentEntry && <WordTabContent entry={currentEntry} onWordClick={handleExploreWord} />}
              </>
            )}
          </>
        )}

        {phase === "done" && (
          <Card className="p-8 flex flex-col items-center gap-4 text-center">
            <h2 className="text-lg font-semibold">Hoàn thành!</h2>
            {practiceModeBadge}
            <p className="text-sm text-muted-foreground">
              {[...gradedRef.current.values()].filter((r) => r.firstQuality === 5).length} / {gradedRef.current.size} từ nhớ ngay lần đầu ·{" "}
              {totalAttempts} lượt trả lời
              {aheadOfSchedule && " (không thay đổi lịch ôn tập của các từ)"}
            </p>
            <Button nativeButton={false} render={<Link href="/flashcards" />}>Quay lại danh sách</Button>
          </Card>
        )}
      </div>
    </AppLayoutWithHistory>
  );
}
