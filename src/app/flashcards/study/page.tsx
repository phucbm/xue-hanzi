import type { Metadata } from "next";
import { StudySession } from "./StudySession";

export const metadata: Metadata = { title: "Học flashcards — Hiểu Chữ Hán" };

interface Props {
  searchParams: Promise<{ deck?: string }>;
}

export default async function StudyPage({ searchParams }: Props) {
  const { deck } = await searchParams;
  return <StudySession deckId={deck ?? "all"} />;
}
