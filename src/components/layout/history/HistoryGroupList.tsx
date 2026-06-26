"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import type { HistoryEntry } from "@/core/types";
import type { WordEntry } from "@/core/types";
import { buildSlots, computeGroups, findScrollContainer, scrollToEl } from "./utils";
import { HistoryEntryRow } from "./HistoryEntryRow";

interface Props {
  entries: HistoryEntry[];
  entryMap: Map<string, WordEntry>;
  onSelect: (label: string) => void;
  onRemove: (id: string) => void;
}

// Mounted fresh per tab via key={activeTab} in parent — no cross-tab ref leakage
export function HistoryGroupList({ entries, entryMap, onSelect, onRemove }: Props) {
  const [showOlder, setShowOlder] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const groupEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const olderRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const chipEls = useRef<Map<string, HTMLButtonElement>>(new Map());
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  const now = useMemo(() => new Date(), []);
  const slots = useMemo(() => buildSlots(now), [now]);
  const { recentGroups, olderItems } = useMemo(
    () => computeGroups(entries, slots, now),
    [entries, slots, now]
  );

  const chips = useMemo(() => [
    ...recentGroups.map((g) => ({ key: g.key, label: g.chipLabel, count: g.items.length })),
    ...(olderItems.length > 0 ? [{ key: "older", label: "Cũ hơn", count: olderItems.length }] : []),
  ], [recentGroups, olderItems]);

  // Set up scroll spy once on mount (component remounts on tab change via key prop)
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const sc = findScrollContainer(content);
    scrollContainerRef.current = sc;

    function onScroll() {
      const chipsH = chipsRef.current?.offsetHeight ?? 0;
      const containerRect = sc.getBoundingClientRect();
      const threshold = containerRect.top + chipsH + 8;

      let active: string | null = null;
      for (const [key, el] of groupEls.current) {
        if (el.getBoundingClientRect().top <= threshold) active = key;
      }
      if (olderRef.current && olderRef.current.getBoundingClientRect().top <= threshold) {
        active = "older";
      }
      setActiveGroup(active);
    }

    sc.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => sc.removeEventListener("scroll", onScroll);
  }, []);

  // Re-run spy when older section expands (new DOM element enters)
  useEffect(() => {
    const sc = scrollContainerRef.current;
    if (!sc) return;
    const chipsH = chipsRef.current?.offsetHeight ?? 0;
    const containerRect = sc.getBoundingClientRect();
    const threshold = containerRect.top + chipsH + 8;

    let active: string | null = null;
    for (const [key, el] of groupEls.current) {
      if (el.getBoundingClientRect().top <= threshold) active = key;
    }
    if (olderRef.current && olderRef.current.getBoundingClientRect().top <= threshold) {
      active = "older";
    }
    setActiveGroup(active);
  }, [showOlder]);

  // Scroll active chip into view
  useEffect(() => {
    if (!activeGroup) return;
    chipEls.current.get(activeGroup)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeGroup]);

  function jumpToGroup(key: string) {
    const sc = scrollContainerRef.current;
    if (!sc) return;
    const chipsH = chipsRef.current?.offsetHeight ?? 0;

    if (key === "older") {
      if (!showOlder) {
        setShowOlder(true);
        setTimeout(() => {
          if (olderRef.current) scrollToEl(olderRef.current, sc, chipsH);
        }, 50);
      } else if (olderRef.current) {
        scrollToEl(olderRef.current, sc, chipsH);
      }
      return;
    }

    const el = groupEls.current.get(key);
    if (el) scrollToEl(el, sc, chipsH);
  }

  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-8">
        Không có mục nào.
      </p>
    );
  }

  return (
    <div>
      {/* Sticky chip strip — only show when more than one group */}
      {chips.length > 1 && (
        <div
          ref={chipsRef}
          className="sticky top-0 z-10 -mx-3 px-3 py-2 flex gap-1.5 overflow-x-auto no-scrollbar backdrop-blur-sm border-b mb-3"
        >
          {chips.map((c) => (
            <button
              key={c.key}
              ref={(el) => {
                if (el) chipEls.current.set(c.key, el);
                else chipEls.current.delete(c.key);
              }}
              type="button"
              onClick={() => jumpToGroup(c.key)}
              className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                activeGroup === c.key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-foreground/40"
              }`}
            >
              {c.label}
              <span className="ml-1 opacity-60">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      <div ref={contentRef} className="flex flex-col gap-3">
        {recentGroups.map((g) => (
          <div
            key={g.key}
            ref={(el) => {
              if (el) groupEls.current.set(g.key, el);
              else groupEls.current.delete(g.key);
            }}
          >
            <div className="px-1 py-1.5 mb-1 flex items-baseline gap-1.5">
              <span className="text-xs font-semibold text-foreground">{g.label}</span>
              <span className="text-xs text-muted-foreground">· {g.items.length} mục</span>
            </div>
            <ul className="divide-y divide-border rounded-lg border overflow-hidden">
              {g.items.map((e) => (
                <HistoryEntryRow
                  key={e.id}
                  entry={e}
                  wordEntry={e.type === "word" ? entryMap.get(e.label) : undefined}
                  onSelect={() => onSelect(e.label)}
                  onRemove={() => onRemove(e.id)}
                />
              ))}
            </ul>
          </div>
        ))}

        {olderItems.length > 0 && (
          <div ref={olderRef}>
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
                {olderItems.map((e) => (
                  <HistoryEntryRow
                    key={e.id}
                    entry={e}
                    wordEntry={e.type === "word" ? entryMap.get(e.label) : undefined}
                    onSelect={() => onSelect(e.label)}
                    onRemove={() => onRemove(e.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
