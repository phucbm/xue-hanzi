"use client";

import { useState, useEffect, useRef } from "react";
import { Cloud, CloudOff, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getWordDetail } from "@/core/client-dictionary";
import type { HistoryEntry } from "@/core/types";
import type { WordEntry } from "@/core/types";
import { toast } from "sonner";
import { HistoryGroupList } from "./history/HistoryGroupList";

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
  const [activeTab, setActiveTab] = useState("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const words = history.filter((e) => e.type === "word");
  const searches = history.filter((e) => e.type === "search");
  const activeEntries = activeTab === "word" ? words : activeTab === "search" ? searches : history;

  useEffect(() => {
    const wordEntries = history.filter((e) => e.type === "word");
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

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
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
      </Tabs>

      {/* key={activeTab} forces remount on tab change — fresh refs and scroll spy */}
      <HistoryGroupList
        key={activeTab}
        entries={activeEntries}
        entryMap={entryMap}
        onSelect={onSelect}
        onRemove={onRemove}
      />

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
