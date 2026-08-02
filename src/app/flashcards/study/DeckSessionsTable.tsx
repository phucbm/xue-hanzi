"use client";

/**
 * DeckSessionsTable — per-deck session history + delete, shown at the end
 * of the study-session start screen. Lets a user spot and remove a stray
 * session (e.g. a quick 1-word test click) that's skewing the deck list's
 * "last score" — see .claude/docs/flashcards.md, "Real vs. practice
 * reviews", for why deleting a session cannot revert the SM-2 state it
 * already wrote.
 */

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSession, getDeckSessions } from "@/app/actions/flashcards";
import { timeAgo } from "@/components/layout/history/utils";
import type { DeckSessionEntry } from "@/core/flashcard-types";

interface DeckSessionsTableProps {
  deckId: string;
}

export function DeckSessionsTable({ deckId }: DeckSessionsTableProps) {
  const [sessions, setSessions] = useState<DeckSessionEntry[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDeckSessions(deckId).then((rows) => {
      if (!cancelled) setSessions(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  async function handleDelete(id: string) {
    setConfirmId(null);
    const prev = sessions;
    setSessions((rows) => rows?.filter((r) => r.id !== id) ?? null);
    try {
      await deleteSession(id);
    } catch (e) {
      setSessions(prev ?? null);
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (sessions === null) {
    return (
      <div className="flex justify-center text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (sessions.length === 0) return null;

  return (
    <Card className="p-4 gap-3">
      <p className="text-sm font-medium">Lịch sử phiên học ({sessions.length})</p>
      <div className="flex flex-col divide-y divide-border -mx-4 -mb-1">
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <div className="min-w-0">
              <p>
                {s.passedFirstTry}/{s.totalWords} từ đúng
                {s.aheadOfSchedule && <span className="text-xs text-muted-foreground"> · luyện tập</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {timeAgo(new Date(s.finishedAt).getTime())} · {s.totalAttempts} lượt trả lời
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="Xóa phiên học"
              onClick={() => setConfirmId(s.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog open={confirmId !== null} onOpenChange={(open) => !open && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa phiên học này?</AlertDialogTitle>
            <AlertDialogDescription>
              Chỉ xóa khỏi lịch sử — không hoàn tác hạn ôn tập hay độ thành thạo mà phiên này đã ghi nhận cho
              các từ. Phiên này cũng sẽ biến mất khỏi biểu đồ hoạt động và chuỗi ngày học ở trang tổng quan, vì
              cả hai đều tính từ cùng dữ liệu phiên học này.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmId && handleDelete(confirmId)}>Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
