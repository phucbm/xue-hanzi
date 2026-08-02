import { FlashcardsAuthGate } from "./FlashcardsAuthGate";

export default function FlashcardsLayout({ children }: { children: React.ReactNode }) {
  return <FlashcardsAuthGate>{children}</FlashcardsAuthGate>;
}
