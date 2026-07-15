/**
 * stroke.ts — Stroke animation wrapper for Hiểu Chữ Hán
 * Framework-agnostic. No React/Next.js imports.
 *
 * Wraps hanzi-writer library for reuse outside React context
 * (e.g. Zalo Mini App, vanilla JS).
 */

import HanziWriter from "hanzi-writer";

export const STROKE_COLORS = {
  stroke: "#374151",   // completed stroke
  outline: "#9ca3af", // future stroke
  highlight: "#3b82f6", // current / radical
} as const;

/** Default stroke animation configuration */
export const STROKE_CONFIG = {
  width: 140,
  height: 140,
  padding: 5,
  showOutline: true,
  strokeColor: STROKE_COLORS.stroke,
  outlineColor: STROKE_COLORS.outline,
  drawingColor: STROKE_COLORS.highlight,
  delayBetweenStrokes: 300,
  strokeAnimationSpeed: 1,
  radicalColor: STROKE_COLORS.highlight,
} as const;

export type StrokeConfig = Partial<typeof STROKE_CONFIG> & {
  onLoadCharDataError?: () => void;
  onLoadCharDataSuccess?: (data: { strokes: string[] }) => void;
};

/**
 * Create a HanziWriter instance attached to a DOM element by ID.
 * Call .animateCharacter() to start animation.
 *
 * @param elementId - The DOM element ID to render into
 * @param character - The simplified Chinese character to draw
 * @param config    - Optional overrides for stroke config
 */
export function createStrokeWriter(
  elementId: string,
  character: string,
  config: StrokeConfig = {}
): HanziWriter {
  return HanziWriter.create(elementId, character, {
    ...STROKE_CONFIG,
    ...config,
  });
}
