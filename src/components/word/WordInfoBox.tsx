"use client";

/**
 * WordInfoBox — Primary word information panel.
 * Shows simplified/traditional forms, pinyin, and Sino-Vietnamese reading.
 * Includes CopyShareButton and raw-data DebugDialog.
 * Data source: WordEntry from getWordEntries()
 */


import type {WordEntry} from "@/core/types";

interface WordInfoBoxProps {
  entry: WordEntry;
}

export function WordInfoBox({ entry }: WordInfoBoxProps) {
    const showTrad = entry.trad && entry.trad !== entry.simp;
    const isMultiChar = [...entry.simp].length > 1;
    const displaySino = isMultiChar ? entry.inferredSinoVietnamese : entry.sinoVietnamese;

  return (
    <>
      <div className="info-box relative w-full flex flex-col justify-between rounded-xl bg-muted sm:p-4 p-3">

        {/* Giản thể / Phồn thể */}
          <div className="flex flex-wrap justify-evenly gap-3 mb-5">
              <div className="flex flex-col justify-center items-center">
                  <span className="text-sm text-muted-foreground mb-1 text-center">
                      Giản thể
                  </span>
                  <span className="simp font-chinese text-8xl font-bold leading-none select-all">
                {entry.simp}
              </span>
              </div>
              {showTrad && (
                  <div className="flex flex-col justify-center items-center">
                      <span className="text-sm text-muted-foreground mb-1 text-center">Phồn thể</span>
                      <span
                          className="simp font-chinese text-8xl font-bold leading-none select-all text-green-500">
                {entry.trad}
              </span>
                  </div>
              )}
        </div>

        {/* Bính âm / Hán Việt */}
          <div>
            <p className="text-sm text-muted-foreground mb-1 text-center">
              Bính âm - Hán Việt
            </p>
            <div className="flex items-baseline justify-center gap-3 text-center">
              <span className="text-xl text-muted-foreground">{entry.pinyin}</span>
              {displaySino ? (
                <span className={`text-xl font-medium ${isMultiChar ? "text-primary/60 italic" : "text-primary"}`}>
              {displaySino}
            </span>
              ) : (
                <span className="text-sm text-muted-foreground italic font-chinese">[{entry.simp}]</span>
              )}
            </div>
          </div>
      </div>
    </>
  );
}
