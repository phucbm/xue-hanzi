"use client"

/**
 * SearchDialog — two-panel search: text input (left) + handwriting pad (right).
 *
 * Search flow:
 *   - User types in the input → nothing happens automatically
 *   - User clicks Search or presses Enter → searchWords() fires → results appear
 *   - User clicks a result → word opens, dialog closes
 *
 * Handwriting flow:
 *   - User draws a character → candidates appear below the pad
 *   - User clicks a candidate → character is APPENDED to the text input (no auto-search)
 *   - Canvas stays as-is; user can draw the next character or click Clear manually
 *
 * Multi-character input (e.g. 中 + 文 drawn separately, then searched):
 *   - searchWords("中文") returns entries; if "中文" has no combined entry,
 *     segmentWord() splits into ["中文","中","文"] → WordTabs shows one tab per char
 *
 * Layout:
 *   - Desktop (≥lg): Dialog, two panels always side-by-side, fixed h-[85vh]
 *   - Mobile (<lg): Sheet side="bottom", mode toggle switches panels, fixed h-[85vh]
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { PenLineIcon, SearchIcon, XIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { searchWords } from "@/app/actions"
import { HanziInput } from "@/components/hanzi/HanziInput"
import { RecentSearch } from "@/components/search/RecentSearch"
import { AddToFlashcardsButton } from "@/components/word/AddToFlashcardsButton"
import type { WordEntry } from "@/core/types"

type SearchMode = "text" | "draw"

interface SearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (simp: string) => void
  recentWordLabels?: string[]
  onSearchQuery?: (query: string) => void
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return isDesktop
}

export function SearchDialog({ open, onOpenChange, onSelect, recentWordLabels = [], onSearchQuery }: SearchDialogProps) {
  const isDesktop = useIsDesktop()

  const [mode, setMode]       = useState<SearchMode>("text")
  const [query, setQuery]     = useState("")
  const [results, setResults] = useState<WordEntry[]>([])
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        onOpenChange(true)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onOpenChange])

  // Auto-focus input when dialog opens in text mode
  useEffect(() => {
    if (open && mode === "text") {
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open, mode])

  const handleSelect = useCallback((simp: string) => {
    onSelect(simp)
    onOpenChange(false)
  }, [onSelect, onOpenChange])

  const runSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) return
    const found = await searchWords(q)
    if (found.length === 0 && /[一-鿿㐀-䶿]/.test(q)) {
      // No combined-word match but query is CJK — open directly so segmentWord
      // splits it into per-character tabs (e.g. 资员 → 资 + 员)
      handleSelect(q)
      return
    }
    onSearchQuery?.(q)
    setResults(found)
    setSearched(true)
  }, [query, handleSelect, onSearchQuery])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") runSearch()
  }, [runSearch])

  const handleCandidateClick = useCallback((hanzi: string) => {
    setQuery((prev) => prev + hanzi)
    setSearched(false)
    inputRef.current?.focus()
  }, [])

  const body = (
    <>
      {/* Mode toggle — visible on mobile only */}
      <div className="flex lg:hidden border-b px-3 py-2 gap-1 shrink-0">
        {(["text", "draw"] as SearchMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              mode === m
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "text" ? <SearchIcon className="size-3" /> : <PenLineIcon className="size-3" />}
            {m === "text" ? "Gõ tìm kiếm" : "Viết tay"}
          </button>
        ))}
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left 60%: text search */}
        <div className={cn(
          "flex flex-col min-w-0 min-h-0 border-r flex-[3]",
          mode === "draw" && "hidden lg:flex"
        )}>
          <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
            <div className="relative flex-1 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  const v = e.target.value
                  setQuery(v)
                  setSearched(false)
                  if (!v) setResults([])
                }}
                onKeyDown={handleKeyDown}
                placeholder="Nhập chữ Hán, pinyin, Hán Việt..."
                className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground py-1 pr-7 font-chinese"
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label="Xóa"
                onClick={() => { setQuery(""); setResults([]); setSearched(false); inputRef.current?.focus() }}
                className={`absolute right-0 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-opacity ${query ? "opacity-60 hover:opacity-100 cursor-pointer" : "opacity-20 pointer-events-none"}`}
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
            <Button size="sm" onClick={runSearch} disabled={!query.trim()}>
              <SearchIcon className="size-3.5" />
              Tìm
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!searched && results.length === 0 && (
              <RecentSearch labels={recentWordLabels} onSelect={handleSelect} />
            )}
            {searched && results.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Không tìm thấy kết quả.
              </p>
            ) : (
              <ul>
                {results.map((r, i) => (
                  <li key={`${r.simp}-${i}`} className="flex items-center gap-1 pr-2">
                    <button
                      onClick={() => handleSelect(r.simp)}
                      className="flex-1 min-w-0 flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left rounded-md"
                    >
                      <span className="font-chinese text-2xl w-10 text-center leading-none shrink-0">
                        {r.simp}
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className="text-sm font-medium">
                          {r.sinoVietnamese || r.simp}
                          {r.trad && r.trad !== r.simp && (
                            <span className="ml-2 text-xs text-muted-foreground font-chinese">
                              ({r.trad})
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {r.pinyin}{r.definitionVi && ` · ${r.definitionVi}`}
                        </span>
                      </span>
                    </button>
                    <AddToFlashcardsButton simp={r.simp} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right 40%: handwriting */}
        <div className={cn(
          "flex flex-col gap-3 p-4 overflow-y-auto flex-[2]",
          mode === "text" ? "hidden lg:flex" : "flex flex-1"
        )}>
          <p className="text-xs text-muted-foreground uppercase tracking-widest shrink-0">
            Viết tay
          </p>

          <HanziInput
            proxyUrl="/api/handwriting"
            onSelect={handleCandidateClick}
            width={280}
            height={280}
          />
        </div>

      </div>
    </>
  )

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-[900px]! h-[85vh]! p-0! gap-0! flex flex-col overflow-hidden"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Tìm kiếm</DialogTitle>
          <DialogDescription className="sr-only">
            Tìm chữ Hán theo ký tự, pinyin hoặc Hán Việt
          </DialogDescription>
          {body}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85vh]! p-0! gap-0! flex flex-col overflow-hidden rounded-t-xl"
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">Tìm kiếm</SheetTitle>
        <SheetDescription className="sr-only">
          Tìm chữ Hán theo ký tự, pinyin hoặc Hán Việt
        </SheetDescription>
        {body}
      </SheetContent>
    </Sheet>
  )
}
