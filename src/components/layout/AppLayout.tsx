"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SearchIcon, History } from "lucide-react";
import { SearchDialog } from "@/components/search/search-dialog";
import { RightSheet } from "@/components/layout/right-sheet";
import type { HistoryEntry } from "@/core/types";
import pkg from "../../../package.json";

const GITHUB_URL = "https://github.com/phucbm/hieu-chu-han";
const DISCORD_URL = "https://discord.gg/Wnckq2KE";
const AUTHOR_URL = "https://github.com/phucbm";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.298 24 12c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.082.114 18.106.132 18.122a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
    </svg>
  );
}

interface AppLayoutProps {
  onHome?: () => void;
  onSearchSelect?: (simp: string) => void;
  onSearchQuery?: (query: string) => void;
  history?: HistoryEntry[];
  onHistoryRemove?: (id: string) => void;
  onHistoryClear?: () => void;
  passphrase?: string | null;
  isSynced?: boolean;
  isSyncing?: boolean;
  onAuthenticate?: (pass: string) => Promise<boolean>;
  onLogout?: () => void;
  children: React.ReactNode | ((props: { openSearch: () => void; openHistory: () => void }) => React.ReactNode);
}

export function AppLayout({
  onHome,
  onSearchSelect,
  onSearchQuery,
  history = [],
  onHistoryRemove,
  onHistoryClear,
  passphrase,
  isSynced,
  isSyncing,
  onAuthenticate,
  onLogout,
  children,
}: AppLayoutProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setHistoryOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const recentWordLabels = history
    .filter((e) => e.type === "word")
    .slice(0, 5)
    .map((e) => e.label);

  function handleSearchSelect(simp: string) {
    setSearchOpen(false);
    if (onSearchSelect) {
      onSearchSelect(simp);
    } else {
      window.location.href = `/?word=${encodeURIComponent(simp)}`;
    }
  }

  const logoContent = (
    <>
      <Image
        src="/icon.png"
        alt="Hiểu Chữ Hán"
        width={28}
        height={28}
        className="rounded-md size-7"
      />
      <span className="font-semibold text-sm hidden sm:block">Hiểu Chữ Hán</span>
      <span className="text-xs text-muted-foreground hidden sm:block">v{pkg.version}</span>
    </>
  );

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 backdrop-blur px-4">
        {onHome ? (
          <button
            type="button"
            onClick={onHome}
            className="flex items-center gap-2 shrink-0 mr-2 hover:opacity-80 transition-opacity"
          >
            {logoContent}
          </button>
        ) : (
          <Link href="/" className="flex items-center gap-2 shrink-0 mr-2 hover:opacity-80 transition-opacity">
            {logoContent}
          </Link>
        )}

        <div className="flex-1" />

        {/* Search — label on desktop, icon-only on mobile */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-muted-foreground font-normal hidden sm:flex"
          onClick={() => setSearchOpen(true)}
        >
          <SearchIcon className="h-3.5 w-3.5" />
          <span>Tìm kiếm</span>
          <kbd className="ml-1 text-xs border rounded px-1 py-0.5 bg-muted leading-none">⌘K</kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 sm:hidden"
          onClick={() => setSearchOpen(true)}
          aria-label="Tìm kiếm"
        >
          <SearchIcon className="h-4 w-4" />
        </Button>

        {/* History — label + kbd on desktop, icon-only on mobile */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-muted-foreground font-normal hidden sm:flex"
          onClick={() => setHistoryOpen(true)}
          aria-label="Lịch sử"
        >
          <History className="h-3.5 w-3.5" />
          <span>Lịch sử</span>
          <kbd className="ml-1 text-xs border rounded px-1 py-0.5 bg-muted leading-none">⌘/</kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 sm:hidden"
          onClick={() => setHistoryOpen(true)}
          aria-label="Lịch sử"
        >
          <History className="h-4 w-4" />
        </Button>
      </header>

      <main className="flex-1">
        <div className="max-w-4xl mx-auto p-4">
          {typeof children === "function" ? children({ openSearch: () => setSearchOpen(true), openHistory: () => setHistoryOpen(true) }) : children}
        </div>
      </main>

      {/* Footer — consistent on all screen sizes */}
      <footer className="border-t mt-auto">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 py-3 text-sm text-muted-foreground">
          <span>
            Made by{" "}
            <a
              href={AUTHOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              phucbm
            </a>
          </span>
          <div className="flex items-center gap-3">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              aria-label="GitHub"
            >
              <GithubIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              aria-label="Discord"
            >
              <DiscordIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Discord</span>
            </a>
          </div>
        </div>
      </footer>

      <SearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={handleSearchSelect}
        recentWordLabels={recentWordLabels}
        onSearchQuery={onSearchQuery}
      />

      <RightSheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        history={history}
        onSelect={handleSearchSelect}
        onRemove={onHistoryRemove ?? (() => {})}
        onClear={onHistoryClear ?? (() => {})}
        passphrase={passphrase}
        isSynced={isSynced}
        isSyncing={isSyncing}
        onAuthenticate={onAuthenticate}
        onLogout={onLogout}
      />
    </div>
  );
}
