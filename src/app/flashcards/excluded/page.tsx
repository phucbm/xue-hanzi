import type { Metadata } from "next";
import { getDeckWords } from "@/app/actions/flashcards";
import { EXCLUDED_DECK_ID } from "@/core/flashcard-types";
import { ExcludedList } from "./ExcludedList";

export const metadata: Metadata = { title: "Đã loại trừ — Hiểu Chữ Hán" };

export default async function ExcludedPage() {
  const cards = await getDeckWords(EXCLUDED_DECK_ID);
  return <ExcludedList initialCards={cards} />;
}
