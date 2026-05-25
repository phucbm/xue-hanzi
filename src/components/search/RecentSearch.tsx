"use client"

interface RecentSearchProps {
  labels: string[]
  onSelect: (label: string) => void
}

export function RecentSearch({ labels, onSelect }: RecentSearchProps) {
  if (labels.length === 0) return null

  return (
    <div className="px-4 py-3">
      <p className="text-xs text-muted-foreground mb-2">Đã xem gần đây</p>
      <div className="flex flex-wrap gap-1.5">
        {labels.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(label)}
            className="font-chinese text-sm rounded-md border px-2.5 py-1 hover:bg-muted transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
