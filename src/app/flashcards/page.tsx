import type { Metadata } from "next";
import { AppLayoutWithHistory } from "@/components/layout/AppLayoutWithHistory";
import { getDecks, getSystemMetrics } from "@/app/actions/flashcards";
import { FlashcardDashboard } from "./FlashcardDashboard";
import { DeckList } from "./DeckList";

export const metadata: Metadata = {
  title: "Flashcards — Hiểu Chữ Hán",
  description: "Ôn từ vựng đã lưu bằng phương pháp lặp lại ngắt quãng (spaced repetition)",
};

export default async function FlashcardsPage() {
  const [decks, metrics] = await Promise.all([getDecks(), getSystemMetrics()]);
  return (
    <AppLayoutWithHistory>
      <div className="max-w-4xl mx-auto w-full py-6 flex flex-col gap-6">
        {metrics && <FlashcardDashboard metrics={metrics} />}
        <DeckList initialDecks={decks} />
      </div>
    </AppLayoutWithHistory>
  );
}
