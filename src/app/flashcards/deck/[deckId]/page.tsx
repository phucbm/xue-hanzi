import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDeck, getDeckWords } from "@/app/actions/flashcards";
import { DeckDetail } from "./DeckDetail";

interface Props {
  params: Promise<{ deckId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { deckId } = await params;
  const deck = await getDeck(deckId);
  return { title: `${deck?.title ?? "Bộ thẻ"} — Hiểu Chữ Hán` };
}

export default async function DeckDetailPage({ params }: Props) {
  const { deckId } = await params;
  const deck = await getDeck(deckId);
  if (!deck) notFound();
  const cards = await getDeckWords(deckId);
  return <DeckDetail deck={deck} initialCards={cards} />;
}
