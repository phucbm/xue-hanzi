"use client";

/**
 * AppLayoutWithHistory — AppLayout wired to useHistory(), for routes outside
 * the main SPA (page.tsx) that still need working History + cloud sync in
 * the header, e.g. the /flashcards screens.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { useHistory } from "@/hooks/useHistory";

export function AppLayoutWithHistory({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const {
    history,
    addWordEntry,
    addSearchEntry,
    removeEntry,
    clearHistory,
    passphrase,
    isSynced,
    isSyncing,
    authenticate,
    logout,
  } = useHistory();

  const handleSearchSelect = useCallback(
    (simp: string) => {
      addWordEntry(simp);
      window.location.href = `/word/${encodeURIComponent(simp)}`;
    },
    [addWordEntry]
  );

  // Every route under AppLayoutWithHistory is /flashcards/* (gated by
  // FlashcardsAuthGate), so signing out here always makes the current
  // page invalid — leave it instead of leaving the user stranded on it.
  const handleLogout = useCallback(() => {
    logout();
    router.push("/");
  }, [logout, router]);

  return (
    <AppLayout
      onSearchSelect={handleSearchSelect}
      onSearchQuery={addSearchEntry}
      history={history}
      onHistoryRemove={removeEntry}
      onHistoryClear={clearHistory}
      passphrase={passphrase}
      isSynced={isSynced}
      isSyncing={isSyncing}
      onAuthenticate={authenticate}
      onLogout={handleLogout}
    >
      {children}
    </AppLayout>
  );
}
