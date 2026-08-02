"use client";

/**
 * FlashcardsAuthGate — client-side check guarding every /flashcards route.
 * Flashcards are single-guest server data (no real per-user auth exists —
 * see root CLAUDE.md), so this isn't a security boundary, just a UX gate:
 * without a passphrase saved (see src/lib/passphrase.ts, set via the
 * History sheet's login form), redirect home instead of rendering the
 * dashboard/study screens.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getPassphrase } from "@/lib/passphrase";

export function FlashcardsAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (getPassphrase()) {
      setAllowed(true);
      return;
    }
    toast.error("Đăng nhập bằng passphrase (ở mục Lịch sử) để dùng Flashcards");
    router.replace("/");
  }, [router]);

  if (!allowed) return null;
  return <>{children}</>;
}
