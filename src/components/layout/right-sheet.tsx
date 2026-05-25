"use client"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { HistoryList } from "@/components/layout/HistoryList"
import type { HistoryEntry } from "@/core/types"

interface RightSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  history: HistoryEntry[]
  onSelect: (label: string) => void
  onRemove: (id: string) => void
  onClear: () => void
}

export function RightSheet({
  open,
  onOpenChange,
  history,
  onSelect,
  onRemove,
  onClear,
}: RightSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 p-0 flex flex-col gap-0 overflow-hidden">

        <SheetHeader className="px-4 py-3! border-b shrink-0 flex-row items-center justify-between">
          <SheetTitle className="text-sm font-semibold">Lịch sử</SheetTitle>
          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground px-2"
              onClick={onClear}
            >
              Xóa tất cả
            </Button>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3">
            <HistoryList
              history={history}
              onSelect={(label) => {
                onSelect(label)
                onOpenChange(false)
              }}
              onRemove={onRemove}
            />
          </div>
        </ScrollArea>

      </SheetContent>
    </Sheet>
  )
}
