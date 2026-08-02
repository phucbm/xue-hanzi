"use client";

/**
 * AppLayoutWithHistory — AppLayout wired to useHistory(), for routes outside
 * the main SPA (page.tsx) that still need working History + cloud sync in
 * the header, e.g. the /flashcards screens.
 */

import { useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useHistory } from "@/hooks/useHistory";

export function AppLayoutWithHistory({ children }: { children: React.ReactNode }) {
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
      onLogout={logout}
    >
      {children}
    </AppLayout>
  );
}
