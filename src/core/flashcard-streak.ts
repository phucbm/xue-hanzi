/**
 * flashcard-streak.ts — streak + activity-heatmap computation from a raw
 * session log. Pure, no I/O — deliberately NOT server-side: "which calendar
 * day" a session falls on depends on the viewer's local timezone, and this
 * app is used across multiple devices, so day-bucketing must happen in the
 * browser using its own local clock, not the server's.
 */

export interface StreakSessionEntry {
  finishedAt: string;
  totalWords: number;
}

export interface StreakResult {
  /** Consecutive days with >=1 completed session, counting through today if
   * today has none yet — a streak only breaks once a full day passes with
   * zero sessions (the standard "streak" convention, e.g. Duolingo). */
  current: number;
  /** Longest current-style run found anywhere in the supplied session log. */
  longest: number;
}

export interface HeatmapCell {
  /** YYYY-MM-DD, viewer's local calendar day. */
  date: string;
  /** Total words reviewed across all sessions completed that day. */
  count: number;
  /** 0 = no activity, 1..4 = quartile of activity relative to the busiest
   * day in the window (so intensity is always relative, not an absolute
   * word-count guess). */
  level: 0 | 1 | 2 | 3 | 4;
}

function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export function computeStreak(sessions: StreakSessionEntry[]): StreakResult {
  if (sessions.length === 0) return { current: 0, longest: 0 };

  const days = new Set(sessions.map((s) => toLocalDateKey(new Date(s.finishedAt))));
  const sortedAsc = [...days].sort();

  let longest = 0;
  let run = 0;
  let prevKey: string | null = null;
  for (const key of sortedAsc) {
    if (prevKey === null) {
      run = 1;
    } else {
      const diffDays = Math.round(
        (new Date(key).getTime() - new Date(prevKey).getTime()) / 86_400_000
      );
      run = diffDays === 1 ? run + 1 : 1;
    }
    longest = Math.max(longest, run);
    prevKey = key;
  }

  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const yesterdayKey = toLocalDateKey(addDays(now, -1));

  let current = 0;
  if (days.has(todayKey) || days.has(yesterdayKey)) {
    let cursor = days.has(todayKey) ? now : addDays(now, -1);
    while (days.has(toLocalDateKey(cursor))) {
      current++;
      cursor = addDays(cursor, -1);
    }
  }

  return { current, longest };
}

/** Last `weeks` weeks of activity, most recent day last, for a GitHub-style
 * contribution grid. Intensity is relative to the busiest day in the window. */
export function computeHeatmap(sessions: StreakSessionEntry[], weeks = 14): HeatmapCell[] {
  const totalsByDay = new Map<string, number>();
  for (const s of sessions) {
    const key = toLocalDateKey(new Date(s.finishedAt));
    totalsByDay.set(key, (totalsByDay.get(key) ?? 0) + s.totalWords);
  }

  const days = weeks * 7;
  const today = new Date();
  const cells: HeatmapCell[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const key = toLocalDateKey(date);
    cells.push({ date: key, count: totalsByDay.get(key) ?? 0, level: 0 });
  }

  const max = Math.max(0, ...cells.map((c) => c.count));
  if (max > 0) {
    for (const cell of cells) {
      if (cell.count === 0) continue;
      cell.level = Math.min(4, Math.max(1, Math.ceil((cell.count / max) * 4))) as 1 | 2 | 3 | 4;
    }
  }

  return cells;
}
