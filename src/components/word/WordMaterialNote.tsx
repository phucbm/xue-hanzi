"use client";

/**
 * WordMaterialNote — "Đã gặp ở: Kỹ năng đọc 1 · B07": the owner's course lessons that hold this word, from the study
 * repo's word index (material_words, see .claude/docs/database.md). Owner only: for a visitor, getWordMaterial returns
 * nothing and this renders nothing.
 */

import { useEffect, useState } from "react";
import { getWordMaterial, type WordMaterial } from "@/app/actions/flashcards";

export function WordMaterialNote({ simp }: { simp: string }) {
  const [items, setItems] = useState<WordMaterial[]>([]);

  useEffect(() => {
    let live = true;
    setItems([]);
    getWordMaterial(simp)
      .then((r) => live && setItems(r))
      .catch(() => {}); // a study-data hint, never worth an error toast on a word page
    return () => {
      live = false;
    };
  }, [simp]);

  if (!items.length) return null;
  return (
    <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
      <span>Đã gặp ở:</span>
      {items.map((m) => (
        <span
          key={`${m.course}/${m.lesson}`}
          className="rounded-md border px-1.5 py-0.5 text-foreground/80"
          title={[m.lessonTitle, m.inVocabulary ? "từ mới của bài" : null, m.sentence].filter(Boolean).join(" — ")}
        >
          {m.courseName} · {m.lesson}
          {!m.inVocabulary && <span className="text-muted-foreground"> (trong câu)</span>}
        </span>
      ))}
    </p>
  );
}
