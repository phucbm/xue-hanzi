"use client";

/**
 * StrokeBox — Stroke order animation for a single Chinese character.
 * Silently hides itself if hanzi-writer has no data for the character.
 * Shows a simp/trad toggle switch when the two forms differ.
 */

import {useEffect, useRef, useState} from "react";
import {createStrokeWriter, STROKE_COLORS} from "@/core/stroke";
import {LineSquiggle, RotateCcw} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Switch} from "@/components/ui/switch";
import {Label} from "@/components/ui/label";
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog";

interface StrokeBoxProps {
  simp: string;
  trad: string;
  /** Start with trad form selected (e.g. when the entry is trad-only) */
  defaultTrad?: boolean;
}

function StrokeOrderDialog({strokes, character, open, onOpenChange}: {
  strokes: string[];
  character: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-xl!">
        <DialogHeader>
          <DialogTitle>Thứ tự nét · {character} · {strokes.length} nét</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-3 justify-start">
          {strokes.map((_, k) => (
            <div key={k} className="flex flex-col items-center gap-1">
              <svg
                width={72}
                height={72}
                viewBox="0 0 1024 900"
                className="rounded border border-border bg-muted"
              >
                <g transform="translate(0,900) scale(1,-1)">
                  {strokes.map((d, i) => (
                    <path
                      key={i}
                      d={d}
                      fill={i < k ? STROKE_COLORS.stroke : i === k ? STROKE_COLORS.highlight : STROKE_COLORS.outline}
                    />
                  ))}
                </g>
              </svg>
              <span className="text-[10px] text-muted-foreground">{k + 1}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StrokeBox({ simp, trad, defaultTrad = false }: StrokeBoxProps) {
  const hasDifferentTrad = trad && trad !== simp;
  const [tradAvailable, setTradAvailable] = useState(defaultTrad);
  const [useTrad, setUseTrad] = useState(defaultTrad);
  const character = useTrad ? trad : simp;

  useEffect(() => {
    if (!hasDifferentTrad) return;
    fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${trad}.json`, { method: "HEAD" })
      .then(r => setTradAvailable(r.ok))
      .catch(() => setTradAvailable(false));
  }, [trad, hasDifferentTrad]);

  const writerRef = useRef<ReturnType<typeof createStrokeWriter> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(0);
  const [available, setAvailable] = useState(true);
  const [charData, setCharData] = useState<{ count: number; strokes: string[] } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const gen = ++generationRef.current;
    setCharData(null);
    const timeout = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      el.innerHTML = "";
      setAvailable(true);
      try {
        writerRef.current = createStrokeWriter(el.id, character, {
          onLoadCharDataError: () => {
            if (generationRef.current === gen) setAvailable(false);
          },
          onLoadCharDataSuccess: (data) => {
            if (generationRef.current === gen) {
              setCharData({count: data.strokes.length, strokes: data.strokes});
            }
          },
        });
        writerRef.current.animateCharacter();
      } catch {
        if (generationRef.current === gen) setAvailable(false);
      }
    }, 100);
    return () => clearTimeout(timeout);
  }, [character]);

  return (
    <div className={`stroke-box rounded-xl bg-muted sm:p-4 p-3 flex flex-col justify-between items-center gap-3 relative ${available ? "" : "hidden"}`}>
      <p className="text-sm text-muted-foreground text-center">
        Nét chữ{charData ? ` · ${charData.count} nét` : ""}
      </p>
      <div
        className="main-stroke"
        ref={containerRef}
        id={`stroke-${simp}`}
        style={{ width: 140, height: 140 }}
        aria-label={`Hoạt ảnh nét chữ: ${character}`}
      />

      <div className="flex items-center gap-0.5 flex-wrap">
        {tradAvailable && (
          <div className="flex items-center gap-2 mr-1">
            <Label htmlFor={`stroke-${simp}-toggle`} className="text-xs text-muted-foreground">
              {useTrad ? "Phồn" : "Giản"}
            </Label>
            <Switch
              id={`stroke-${simp}-toggle`}
              checked={useTrad}
              onCheckedChange={setUseTrad}
              size="sm"
            />
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          type="button"
          title="Xem lại"
          onClick={() => writerRef.current?.animateCharacter()}
          className="opacity-60 hover:opacity-100"
        >
          <RotateCcw/>
        </Button>
        {charData && (
          <Button
            variant="ghost"
            size="icon"
            type="button"
            title="Thứ tự nét"
            onClick={() => setDialogOpen(true)}
            className="opacity-60 hover:opacity-100"
          >
            <LineSquiggle/>
          </Button>
        )}
      </div>

      {charData && (
        <StrokeOrderDialog
          strokes={charData.strokes}
          character={character}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}
