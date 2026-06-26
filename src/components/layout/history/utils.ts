import type { HistoryEntry } from "@/core/types";

const DAY_NAMES = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const SHORT_DAY = ["CN", "T.Hai", "T.Ba", "T.Tư", "T.Năm", "T.Sáu", "T.Bảy"];

export interface SlotDef {
  key: string;
  label: string;
  chipLabel: string;
}

export interface GroupData extends SlotDef {
  items: HistoryEntry[];
}

function fmtDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

export function buildSlots(now: Date): SlotDef[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dateStr = fmtDate(d);
    if (i === 0) return { key: "0", label: `Hôm nay (${DAY_NAMES[d.getDay()]} - ${dateStr})`, chipLabel: "Hôm nay" };
    if (i === 1) return { key: "1", label: `Hôm qua (${DAY_NAMES[d.getDay()]} - ${dateStr})`, chipLabel: "Hôm qua" };
    return { key: String(i), label: `${DAY_NAMES[d.getDay()]} - ${dateStr}`, chipLabel: `${SHORT_DAY[d.getDay()]} ${dateStr}` };
  });
}

export function computeGroups(entries: HistoryEntry[], slots: SlotDef[], now: Date): {
  recentGroups: GroupData[];
  olderItems: HistoryEntry[];
} {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const buckets = new Map<string, HistoryEntry[]>();
  const olderItems: HistoryEntry[] = [];

  for (const e of entries) {
    const dateStart = new Date(
      new Date(e.timestamp).getFullYear(),
      new Date(e.timestamp).getMonth(),
      new Date(e.timestamp).getDate()
    ).getTime();
    const slot = Math.round((todayStart - dateStart) / 86400000);
    if (slot >= 7) {
      olderItems.push(e);
    } else {
      const key = String(slot);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(e);
    }
  }

  const recentGroups = slots
    .filter((s) => buckets.has(s.key))
    .map((s) => ({ ...s, items: buckets.get(s.key)! }));

  return { recentGroups, olderItems };
}

export function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "vừa xong";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ngày trước`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} tháng trước`;
  return `${Math.floor(mo / 12)} năm trước`;
}

export function findScrollContainer(el: HTMLElement): HTMLElement {
  let cur: HTMLElement | null = el.parentElement;
  while (cur) {
    const { overflowY } = getComputedStyle(cur);
    if (overflowY === "auto" || overflowY === "scroll") return cur;
    if (!cur.parentElement) break;
    cur = cur.parentElement;
  }
  return document.documentElement as HTMLElement;
}

export function scrollToEl(el: HTMLElement, container: HTMLElement, offset: number) {
  const elRect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  container.scrollTo({
    top: container.scrollTop + elRect.top - containerRect.top - offset - 4,
    behavior: "instant",
  });
}
