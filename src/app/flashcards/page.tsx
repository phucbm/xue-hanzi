import type { Metadata } from "next";
import { AppLayout } from "@/components/layout/AppLayout";
import { getDecks } from "@/app/actions/flashcards";
import { DeckList } from "./DeckList";

export const metadata: Metadata = {
  title: "Flashcards — Hiểu Chữ Hán",
  description: "Ôn từ vựng đã lưu bằng phương pháp lặp lại ngắt quãng (spaced repetition)",
};

export default async function FlashcardsPage() {
  const decks = await getDecks();
  return (
    <AppLayout>
      <DeckList initialDecks={decks} />
    </AppLayout>
  );
}
