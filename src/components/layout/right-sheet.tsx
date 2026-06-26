"use client"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { HistoryList } from "@/components/layout/HistoryList"
import type { HistoryEntry } from "@/core/types"

interface RightSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  history: HistoryEntry[]
  onSelect: (label: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  passphrase?: string | null
  isSynced?: boolean
  isSyncing?: boolean
  onAuthenticate?: (pass: string) => Promise<boolean>
  onLogout?: () => void
}

export function RightSheet({
  open,
  onOpenChange,
  history,
  onSelect,
  onRemove,
  onClear,
  passphrase,
  isSynced,
  isSyncing,
  onAuthenticate,
  onLogout,
}: RightSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="data-[side=right]:w-full data-[side=right]:sm:max-w-none data-[side=right]:sm:w-[420px] p-0 flex flex-col gap-0 overflow-hidden">

        <SheetHeader className="px-4 py-3! border-b shrink-0">
          <SheetTitle className="text-sm font-semibold">Lịch sử</SheetTitle>
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
              onClear={onClear}
              passphrase={passphrase}
              isSynced={isSynced}
              isSyncing={isSyncing}
              onAuthenticate={onAuthenticate}
              onLogout={onLogout}
            />
          </div>
        </ScrollArea>

      </SheetContent>
    </Sheet>
  )
}
