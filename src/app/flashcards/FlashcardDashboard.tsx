"use client";

/**
 * FlashcardDashboard — hero stats and leech banner (always visible), plus
 * mastery bar / HSK mastery / activity heatmap (collapsed behind a single
 * toggle by default — detail, not action items), rendered above the deck
 * list on /flashcards.
 *
 * Streak + heatmap are computed client-side (see core/flashcard-streak.ts)
 * because day-bucketing depends on the viewer's local timezone; everything
 * else comes straight from getSystemMetrics() (core/flashcard-engine.ts).
 *
 * Every metric here ships a visible caption explaining exactly how it's
 * computed and any caveats — see .claude/docs/flashcards.md for the same
 * definitions written out in full.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Flame, TrendingUp, Clock3, AlertTriangle, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeStreak, computeHeatmap, type HeatmapCell } from "@/core/flashcard-streak";
import { MASTERED_INTERVAL_DAYS, LEECH_LAPSE_THRESHOLD, NEW_CARDS_PER_SESSION } from "@/core/flashcard-types";
import type { SystemMetrics } from "@/core/flashcard-engine";

interface FlashcardDashboardProps {
  metrics: SystemMetrics;
}

const HEAT_CLASSES: Record<number, string> = {
  0: "bg-muted",
  1: "bg-heat-1",
  2: "bg-heat-2",
  3: "bg-heat-3",
  4: "bg-heat-4",
};

const HEATMAP_WEEKS = 14;

function formatPercent(ratio: number | null): string {
  if (ratio === null) return "—";
  return `${Math.round(ratio * 100)}%`;
}

function chunkIntoWeeks(cells: HeatmapCell[]): HeatmapCell[][] {
  const weeks: HeatmapCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function FlashcardDashboard({ metrics }: FlashcardDashboardProps) {
  // Mastery bar / HSK bars / activity heatmap are collapsed by default —
  // they're detail, not action items, unlike the hero stats and leech
  // banner above them which stay visible unconditionally. Not persisted
  // (resets to collapsed each page load) since nothing was asked beyond
  // "collapsed by default, one button to show".
  const [showStats, setShowStats] = useState(false);
  const streak = useMemo(() => computeStreak(metrics.sessions), [metrics.sessions]);
  const heatmap = useMemo(() => computeHeatmap(metrics.sessions, HEATMAP_WEEKS), [metrics.sessions]);
  const weeksGrid = useMemo(() => chunkIntoWeeks(heatmap), [heatmap]);
  // Heatmap's last cell is always today (see computeHeatmap) — reuse it
  // instead of re-bucketing sessions, so "today" never disagrees with the
  // heatmap's own today cell. Counts practice sessions too, same as the
  // heatmap/streak: practice is real study time and should show as activity.
  const learnedToday = heatmap.at(-1)?.count ?? 0;

  if (metrics.totalActive === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Chưa có từ nào được theo dõi — xem một từ bất kỳ để bắt đầu.
      </Card>
    );
  }

  const masteryTotal = metrics.mastery.new + metrics.mastery.learning + metrics.mastery.mastered;
  const pct = (n: number) => (masteryTotal > 0 ? (n / masteryTotal) * 100 : 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Hero stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            Từ cần ôn hôm nay
          </div>
          <p className="text-3xl font-semibold">{metrics.mastery.new}</p>
          <p className="text-xs text-muted-foreground">
            từ mới chưa từng học, trên {metrics.totalActive} từ đang theo dõi. Học ngay được {metrics.dueToday} từ
            (mỗi phiên tối đa {NEW_CARDS_PER_SESSION} từ mới — từ cần ôn lại luôn được tính đủ, không bị giới hạn).
          </p>
        </Card>

        <Card className="p-4 gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" />
            Đã học hôm nay
          </div>
          <p className="text-3xl font-semibold">{learnedToday}</p>
          <p className="text-xs text-muted-foreground">
            Lượt ôn (kể cả buổi luyện tập) tính theo ngày ở múi giờ của bạn.
          </p>
        </Card>

        <Card className="p-4 gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Flame className="h-3.5 w-3.5" />
            Chuỗi ngày học
          </div>
          <p className="text-3xl font-semibold">{streak.current}</p>
          <p className="text-xs text-muted-foreground">
            Kỷ lục: {streak.longest} ngày. Chuỗi chỉ mất khi qua hết một ngày mà không ôn từ nào.
          </p>
        </Card>

        <Card className="p-4 gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            Tỷ lệ nhớ
          </div>
          <p className="text-3xl font-semibold">{formatPercent(metrics.retentionAllTime)}</p>
          <p className="text-xs text-muted-foreground">
            % từ nhớ đúng ngay lần trả lời đầu tiên, tính trên mọi phiên học đã hoàn thành từ trước tới nay.
          </p>
        </Card>
      </div>

      {/* Leech banner — actionable alert, stays visible regardless of the toggle below */}
      {metrics.leechCount > 0 && (
        <Card className="p-4 flex items-center justify-between gap-3 ring-destructive/30 bg-destructive/5">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{metrics.leechCount} từ đang gây khó khăn</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Đã trả lời sai từ {LEECH_LAPSE_THRESHOLD} lần trở lên (&quot;leech&quot;), bất kể khoảng lặp lại
                hiện tại. Ôn lại nhóm này để giảm bớt số từ khó.
              </p>
            </div>
          </div>
          <Button size="sm" className="shrink-0" nativeButton={false} render={<Link href="/flashcards/study?deck=leech" />}>
            Ôn ngay
          </Button>
        </Card>
      )}

      <Button
        variant="outline"
        size="sm"
        className="self-start gap-1.5 text-muted-foreground"
        onClick={() => setShowStats((v) => !v)}
      >
        {showStats ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {showStats ? "Ẩn bớt thống kê" : "Xem thêm thống kê"}
      </Button>

      {showStats && (
        <>
          {/* Mastery bar */}
          <Card className="p-4 gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Mức độ thành thạo</p>
              <p className="text-xs text-muted-foreground">{masteryTotal} từ</p>
            </div>
            <div className="flex h-3 w-full rounded-full overflow-hidden gap-0.5 bg-muted">
              {pct(metrics.mastery.new) > 0 && (
                <div className="h-full bg-muted-foreground" style={{ width: `${pct(metrics.mastery.new)}%` }} />
              )}
              {pct(metrics.mastery.learning) > 0 && (
                <div className="h-full bg-mastery-learning" style={{ width: `${pct(metrics.mastery.learning)}%` }} />
              )}
              {pct(metrics.mastery.mastered) > 0 && (
                <div className="h-full bg-mastery-mastered" style={{ width: `${pct(metrics.mastery.mastered)}%` }} />
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Mới ({metrics.mastery.new})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-mastery-learning" /> Đang học ({metrics.mastery.learning})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-mastery-mastered" /> Thành thạo ({metrics.mastery.mastered})
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Thành thạo = khoảng lặp lại (SM-2 interval) đã đạt {MASTERED_INTERVAL_DAYS} ngày trở lên. Đang học = đã
              trả lời ít nhất 1 lần nhưng chưa đạt mốc đó. Mới = chưa từng được ôn.
            </p>
          </Card>

          {/* HSK mastery */}
          {metrics.hskMastery.length > 0 && (
            <Card className="p-4 gap-3">
              <p className="text-sm font-medium">Thành thạo theo cấp độ HSK</p>
              <div className="flex flex-col gap-2">
                {metrics.hskMastery.map((h) => {
                  const levelPct = h.total > 0 ? (h.mastered / h.total) * 100 : 0;
                  return (
                    <div key={h.level} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-14 shrink-0">HSK {h.level}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-mastery-mastered" style={{ width: `${levelPct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-24 shrink-0 text-right">
                        {h.mastered}/{h.total} ({Math.round(levelPct)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Cấp độ HSK lấy từ độ khó thuật toán trong từ điển (chinese-lexicon), không phải danh sách từ vựng thi
                HSK chính thức. Tỷ lệ chỉ tính trên những từ bạn đã lưu ở cấp đó, không phải toàn bộ từ vựng cấp đó.
              </p>
            </Card>
          )}

          {/* Activity heatmap */}
          <Card className="p-4 gap-3">
            <p className="text-sm font-medium">Hoạt động ôn tập ({HEATMAP_WEEKS} tuần gần nhất)</p>
            <div className="flex gap-[3px] overflow-x-auto pb-1">
              {weeksGrid.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((cell) => (
                    <div
                      key={cell.date}
                      title={`${cell.date}: ${cell.count} từ ôn tập`}
                      className={cn("h-3 w-3 rounded-sm", HEAT_CLASSES[cell.level])}
                    />
                  ))}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Màu đậm hơn = số từ ôn trong ngày đó nhiều hơn, so với ngày nhiều nhất trong {HEATMAP_WEEKS} tuần này
              (không phải một mốc cố định). Ngày được tính theo giờ địa phương của thiết bị bạn đang dùng — nếu bạn
              học trên nhiều thiết bị/múi giờ khác nhau, mỗi thiết bị có thể nhóm ngày hơi khác nhau gần ranh giới nửa đêm.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
