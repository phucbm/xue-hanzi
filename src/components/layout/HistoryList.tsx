"use client";

import { useState, useEffect, useRef } from "react";
import { SearchIcon, X, Cloud, CloudOff, Loader2, LogOut, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WordRow } from "@/components/search/WordRow";
import { getWordDetail } from "@/core/client-dictionary";
import type { HistoryEntry } from "@/core/types";
import type { WordEntry } from "@/core/types";
import { toast } from "sonner";

const DAY_NAMES = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

function fmtDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function getDaySlot(timestamp: number, now: Date): number {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = todayStart - new Date(new Date(timestamp).getFullYear(), new Date(timestamp).getMonth(), new Date(timestamp).getDate()).getTime();
  return Math.round(diff / 86400000); // 0=today, 1=yesterday, 2-6=older recent, 7+=old
}

function buildSlots(now: Date): { label: string; slot: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dayName = DAY_NAMES[d.getDay()];
    const dateStr = fmtDate(d);
    if (i === 0) return { label: `Hôm nay (${dayName} - ${dateStr})`, slot: 0 };
    if (i === 1) return { label: `Hôm qua (${dayName} - ${dateStr})`, slot: 1 };
    return { label: `${dayName} - ${dateStr}`, slot: i };
  });
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "vừa xong";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ngày trước`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} tháng trước`;
  return `${Math.floor(mo / 12)} năm trước`;
}

interface HistoryListProps {
  history: HistoryEntry[];
  onSelect: (label: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  passphrase?: string | null;
  isSynced?: boolean;
  isSyncing?: boolean;
  onAuthenticate?: (pass: string) => Promise<boolean>;
  onLogout?: () => void;
}

export function HistoryList({
  history,
  onSelect,
  onRemove,
  onClear,
  passphrase,
  isSynced,
  isSyncing,
  onAuthenticate,
  onLogout,
}: HistoryListProps) {
  const [entryMap, setEntryMap] = useState<Map<string, WordEntry>>(new Map());
  const [inputValue, setInputValue] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const wordEntries = history.filter((e) => e.type === "word");

  useEffect(() => {
    if (wordEntries.length === 0) return;
    Promise.all(
      wordEntries.map((e) =>
        getWordDetail(e.label).then((entry) => ({ label: e.label, entry }))
      )
    ).then((results) => {
      setEntryMap(
        new Map(
          results
            .filter((r): r is { label: string; entry: WordEntry } => r.entry !== null)
            .map((r) => [r.label, r.entry])
        )
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim() || !onAuthenticate) return;
    setIsAuthenticating(true);
    try {
      const ok = await onAuthenticate(inputValue.trim());
      if (ok) {
        setInputValue("");
        toast.success("Đã đồng bộ lịch sử từ cloud");
      } else {
        toast.error("Sai passphrase");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAuthenticating(false);
    }
  }

  const syncFooter = (
    <div className="mt-3 pt-3 border-t">
      {passphrase ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span className="flex items-center gap-1.5">
            {isSyncing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : isSynced ? (
              <Cloud className="size-3 text-green-500" />
            ) : (
              <CloudOff className="size-3" />
            )}
            {isSyncing ? "Đang đồng bộ..." : isSynced ? "Đã đồng bộ cloud" : "Chưa đồng bộ"}
          </span>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              title="Đăng xuất"
            >
              <LogOut className="size-3" />
              <span>Đăng xuất</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <form onSubmit={handleAuth} className="flex gap-2 px-1">
            <Input
              ref={inputRef}
              type="password"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Passphrase để sync cloud..."
              className="h-7 text-base flex-1"
              disabled={isAuthenticating}
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="h-7 text-xs shrink-0"
              disabled={isAuthenticating || !inputValue.trim()}
            >
              {isAuthenticating ? <Loader2 className="size-3 animate-spin" /> : "Sync"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground px-1 mt-1.5">
            Sync không public. Liên hệ qua Discord để được cấp quyền.
          </p>
        </>
      )}
    </div>
  );

  if (history.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground text-center px-4 py-8">
          Chưa có lịch sử nào.
        </p>
        {syncFooter}
      </div>
    );
  }

  function renderEntry(e: HistoryEntry) {
    const meta = (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
        <span>{timeAgo(e.timestamp)}</span>
        {e.viewCount > 1 && (
          <>
            <span>·</span>
            <span>{e.viewCount} lần</span>
          </>
        )}
      </span>
    );

    if (e.type === "word") {
      const entry = entryMap.get(e.label);
      if (!entry) return null;
      return (
        <li key={e.id}>
          <WordRow
            entry={entry}
            meta={meta}
            onSelect={() => onSelect(e.label)}
            onRemove={() => onRemove(e.id)}
          />
        </li>
      );
    }

    return (
      <li key={e.id}>
        <div className="group flex items-stretch">
          <button
            type="button"
            onClick={() => onSelect(e.label)}
            className="flex-1 flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left min-w-0"
          >
            <SearchIcon className="size-4 shrink-0 text-muted-foreground mt-0.5" />
            <span className="flex-1 flex flex-col min-w-0">
              <span className="text-sm truncate">{e.label}</span>
              {meta}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onRemove(e.id)}
            className="opacity-0 group-hover:opacity-100 flex items-center px-2.5 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
            aria-label="Xóa"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </li>
    );
  }

  function renderGrouped(entries: HistoryEntry[]) {
    if (entries.length === 0) {
      return (
        <p className="text-xs text-muted-foreground text-center py-8">
          Không có mục nào.
        </p>
      );
    }

    const now = new Date();
    const slots = buildSlots(now);

    // bucket by slot index
    const buckets = new Map<number, HistoryEntry[]>();
    const olderItems: HistoryEntry[] = [];
    for (const e of entries) {
      const slot = getDaySlot(e.timestamp, now);
      if (slot >= 7) {
        olderItems.push(e);
      } else {
        if (!buckets.has(slot)) buckets.set(slot, []);
        buckets.get(slot)!.push(e);
      }
    }

    const recentGroups = slots
      .map(({ label, slot }) => ({ label, items: buckets.get(slot) ?? [] }))
      .filter(({ items }) => items.length > 0);

    return (
      <div className="flex flex-col gap-1">
        {recentGroups.map(({ label, items }) => (
          <div key={label}>
            <div className="sticky top-0 z-10 backdrop-blur-sm px-3 py-1.5 -mx-3 mb-1 flex items-baseline gap-1.5">
              <span className="text-xs font-semibold text-foreground">{label}</span>
              <span className="text-xs text-muted-foreground">· {items.length} mục</span>
            </div>
            <ul className="divide-y divide-border rounded-lg border overflow-hidden">
              {items.map((e) => renderEntry(e))}
            </ul>
          </div>
        ))}

        {olderItems.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowOlder((v) => !v)}
              className="w-full flex items-center justify-between px-1 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Cũ hơn · {olderItems.length} mục</span>
              <ChevronDown className={`size-3.5 transition-transform ${showOlder ? "rotate-180" : ""}`} />
            </button>
            {showOlder && (
              <ul className="divide-y divide-border rounded-lg border overflow-hidden">
                {olderItems.map((e) => renderEntry(e))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  const words = history.filter((e) => e.type === "word");
  const searches = history.filter((e) => e.type === "search");

  return (
    <div className="flex flex-col gap-3">
      <Tabs defaultValue="all">
        <TabsList className="w-full">
          <TabsTrigger value="all" className="flex-1 text-xs">
            Tất cả
            <span className="ml-1 text-muted-foreground">({history.length})</span>
          </TabsTrigger>
          <TabsTrigger value="word" className="flex-1 text-xs">
            Từ
            <span className="ml-1 text-muted-foreground">({words.length})</span>
          </TabsTrigger>
          <TabsTrigger value="search" className="flex-1 text-xs">
            Tìm kiếm
            <span className="ml-1 text-muted-foreground">({searches.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-3">
          {renderGrouped(history)}
        </TabsContent>
        <TabsContent value="word" className="mt-3">
          {renderGrouped(words)}
        </TabsContent>
        <TabsContent value="search" className="mt-3">
          {renderGrouped(searches)}
        </TabsContent>
      </Tabs>

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-xs text-muted-foreground hover:text-destructive"
        onClick={onClear}
      >
        Xóa tất cả lịch sử
      </Button>

      {syncFooter}
    </div>
  );
}
