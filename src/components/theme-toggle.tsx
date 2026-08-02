"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

/**
 * Binary light/dark toggle, styled to match the plain footer icon links
 * (GitHub/Discord) rather than a boxed header button. Defaults to the OS
 * preference (via ThemeProvider's `enableSystem`) until the user explicitly
 * picks one, then remembers that choice (next-themes persists to
 * localStorage under "theme").
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid an SSR/client mismatch: the server can't know the OS/stored
  // preference, so render a neutral placeholder until after hydration.
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center gap-1.5 hover:text-foreground transition-colors"
      aria-label={isDark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      title={isDark ? "Giao diện sáng" : "Giao diện tối"}
    >
      {mounted ? (
        isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />
      ) : (
        <Moon className="h-3.5 w-3.5 opacity-0" />
      )}
      <span className="hidden sm:inline">{mounted && isDark ? "Sáng" : "Tối"}</span>
    </button>
  );
}
