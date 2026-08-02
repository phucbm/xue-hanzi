"use client";

/**
 * StudySession — runs a flashcard review session entirely in memory.
 * Nothing is written to Turso until the queue empties (submitSession is the
 * one atomic write). Closing mid-session loses all progress by design.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { WordInfoBox } from "@/components/word/WordInfoBox";
import { StrokeBox } from "@/components/word/StrokeBox";
import { getWordEntries } from "@/app/actions";
import { getDecks, startSession, submitSession } from "@/app/actions/flashcards";
import { gradeCard, type SrsQuality } from "@/core/srs";
import type { SessionQueueCard, SessionResult } from "@/core/flashcard-types";
import type { WordEntry } from "@/core/types";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
      const [decks, queueResult] = await Promise.all([getDecks(), startSession(deckId)]);
      if (cancelled) return;
      const found = decks.find((d) => d.id === deckId);
      setDeckTitle(found?.title ?? deckId);
      setFullQueue(queueResult);
      setSessionSize(queueResult.length);
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
        deckLabel: deckTitle,
        startedAt: startedAtRef.current,
        finishedAt: new Date().toISOString(),
        results: [...gradedRef.current.values()],
        totalAttempts,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
    setPhase("done");
  }, [deckId, deckTitle, totalAttempts]);

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

  const gradedCount = gradedRef.current.size;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto w-full py-6 flex flex-col gap-6">
        {phase === "loading" && (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {phase === "start" && (
          <>
            <h1 className="text-xl font-bold">{deckTitle}</h1>
            {fullQueue.length === 0 ? (
              <Card className="p-6 flex flex-col items-center gap-3 text-center">
                <p className="text-sm text-muted-foreground">Không có từ nào cần ôn trong bộ thẻ này.</p>
                <Button size="sm" nativeButton={false} render={<Link href="/flashcards" />}>
                  Quay lại
                </Button>
              </Card>
            ) : (
              <Card className="p-6 flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Có <span className="font-medium text-foreground">{fullQueue.length}</span> từ cần ôn.
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
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{deckTitle}</span>
              <span>
                {gradedCount}/{totalWords}
              </span>
            </div>

            <Card className="p-8 flex flex-col items-center gap-6 min-h-[320px] justify-center">
              <p className="font-chinese text-5xl font-medium text-center">{current.simp}</p>

              {revealed && (
                <div className="w-full flex flex-col gap-4">
                  {loadingEntry && (
                    <div className="flex justify-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                  {currentEntry && (
                    <>
                      <WordInfoBox entry={currentEntry} />
                      {[...currentEntry.simp].length === 1 && /\p{Script=Han}/u.test(currentEntry.simp) && (
                        <StrokeBox simp={currentEntry.simp} trad={currentEntry.trad} defaultTrad={!!currentEntry.key} />
                      )}
                    </>
                  )}
                </div>
              )}
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
              <Button size="lg" onClick={handleContinue}>
                Tiếp tục
              </Button>
            )}
          </>
        )}

        {phase === "done" && (
          <Card className="p-8 flex flex-col items-center gap-4 text-center">
            <h2 className="text-lg font-semibold">Hoàn thành!</h2>
            <p className="text-sm text-muted-foreground">
              {[...gradedRef.current.values()].filter((r) => r.firstQuality === 5).length} / {gradedRef.current.size} từ nhớ ngay lần đầu ·{" "}
              {totalAttempts} lượt trả lời
            </p>
            <Button nativeButton={false} render={<Link href="/flashcards" />}>Quay lại danh sách</Button>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
