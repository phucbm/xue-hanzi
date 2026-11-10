import { redirect } from "next/navigation";
import { hasSession } from "@/lib/session";

/** Flashcards are the owner's data: without the session cookie (the passphrase login in the History sheet), go home. */
export default async function FlashcardsLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasSession())) redirect("/");
  return <>{children}</>;
}
