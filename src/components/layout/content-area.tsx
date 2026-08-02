"use client"

import Image from "next/image"
import { WordTabs } from "@/components/word/WordTabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { FlashcardTeaser } from "@/components/home/FlashcardTeaser"
import type { WordEntry } from "@/core/types"
import type { SystemMetrics } from "@/core/flashcard-engine"
import {
  IconSearch,
  IconBook2,
  IconBrain,
  IconPencil,
  IconClock,
} from "@tabler/icons-react"

const STARTER_WORDS = ["学习", "汉字", "文化", "朋友", "工作", "时间", "世界", "语言"]

const FEATURES = [
  {
    icon: IconBook2,
    title: "116K từ vựng",
    desc: "CC-CEDICT + CVDICT, tra cứu nghĩa Hán Việt",
  },
  {
    icon: IconBrain,
    title: "AI giải thích",
    desc: "Phân tích ngữ nghĩa, ngữ cảnh sử dụng",
  },
  {
    icon: IconPencil,
    title: "Nhận diện chữ viết tay",
    desc: "Vẽ chữ để tìm kiếm",
  },
]

interface ContentAreaProps {
  entries: WordEntry[]
  activeTab?: string
  onTabChange?: (tab: string) => void
  onWordClick: (simp: string) => void
  loading?: boolean
  recentWords?: string[]
  isSynced?: boolean
  onOpenSearch?: () => void
  onOpenHistory?: () => void
  flashcardMetrics?: SystemMetrics | null
}

export function ContentArea({ entries, activeTab, onTabChange, onWordClick, loading, recentWords, isSynced, onOpenSearch, onOpenHistory, flashcardMetrics }: ContentAreaProps) {
  if (loading && entries.length === 0) {
    return (
      <div className="max-w-3xl mx-auto w-full py-4 flex flex-col gap-4">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-12 rounded-md" />
          <Skeleton className="h-9 w-12 rounded-md" />
        </div>
        <div className="rounded-lg border p-4 flex flex-col gap-3">
          <Skeleton className="h-12 w-24" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-40 w-40 rounded-lg" />
      </div>
    )
  }

  if (entries.length === 0) {
    const hasHistory = recentWords && recentWords.length > 0

    return (
      <div className="content-area-welcome max-w-2xl mx-auto w-full py-12 flex flex-col gap-10">
        {/* Hero */}
        <div className="flex flex-col items-center gap-4 text-center">
          <Image src="/icon.png" alt="Hiểu Chữ Hán" width={64} height={64} className="rounded-2xl shadow-md" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Hiểu Chữ Hán</h1>
            <p className="text-muted-foreground mt-1 text-sm">Từ điển Trung – Hán Việt, tra nghĩa &amp; học chữ</p>
          </div>
          <Button onClick={onOpenSearch} className="gap-2 mt-1">
            <IconSearch size={16} />
            Tìm kiếm
            <kbd className="ml-1 text-xs opacity-60 border rounded px-1 py-0.5 bg-background/20 leading-none">⌘K</kbd>
          </Button>
        </div>

        <FlashcardTeaser metrics={flashcardMetrics ?? null} />

        {/* Recent words (returning users) OR starter suggestions (new users) */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            {hasHistory ? (
              <><IconClock size={13} />Đã xem gần đây</>
            ) : (
              <><IconSearch size={13} />Thử tra cứu</>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {(hasHistory ? recentWords! : STARTER_WORDS).map((word) => (
              <button
                key={word}
                onClick={() => onWordClick(word)}
                className="px-3 py-1.5 rounded-full border text-sm hover:bg-accent hover:border-accent-foreground/20 transition-colors font-medium"
              >
                {word}
              </button>
            ))}
          </div>
        </div>

        {/* Feature list */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border p-4 flex flex-col gap-2">
              <Icon size={20} className="text-muted-foreground" />
              <p className="font-semibold text-sm">{title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Sync CTA for non-synced users */}
        {!isSynced && (
          <div className="rounded-xl border border-dashed p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium">Đồng bộ lịch sử</p>
              <p className="text-xs text-muted-foreground mt-0.5">Dùng passphrase để lưu lịch sử tra cứu lên đám mây</p>
            </div>
            <Button variant="outline" size="sm" onClick={onOpenHistory} className="shrink-0 self-start sm:self-auto">
              Xem lịch sử
            </Button>
          </div>
        )}

        {/* J2TEAM badge */}
        <div className="flex justify-center">
          <a
            href="https://launch.j2team.dev/products/hieu-chu-han?utm_source=badge-launched&utm_medium=badge&utm_campaign=badge-hieu-chu-han"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="https://launch.j2team.dev/badge/hieu-chu-han/light"
              alt="Hiểu Chữ Hán - Launched on J2TEAM Launch"
              width="250"
              height="54"
              loading="lazy"
            />
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto w-full py-4">
      <WordTabs
        entries={entries}
        onWordClick={onWordClick}
        activeTab={activeTab}
        onTabChange={onTabChange}
        recentWords={recentWords}
      />
    </div>
  )
}
