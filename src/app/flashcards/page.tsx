import type { Metadata } from "next";
import { AppLayoutWithHistory } from "@/components/layout/AppLayoutWithHistory";
import { getDecks } from "@/app/actions/flashcards";
import { DeckList } from "./DeckList";

export const metadata: Metadata = {
  title: "Flashcards — Hiểu Chữ Hán",
  description: "Ôn từ vựng đã lưu bằng phương pháp lặp lại ngắt quãng (spaced repetition)",
};

export default async function FlashcardsPage() {
  const decks = await getDecks();
  return (
    <AppLayoutWithHistory>
      <DeckList initialDecks={decks} />
    </AppLayoutWithHistory>
  );
}
