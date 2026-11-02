import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Word } from "./schema";

// Narration words placed on the timeline: the clip starts at `fromFrame`,
// word times are ms from the clip start.
export type SubtitleSegment = {
  fromFrame: number;
  words: Word[];
};

const MAX_WORDS = 3;
const MAX_PAGE_MS = 1200;
const LINGER_MS = 300; // how long the last page stays after its last word

type Page = { words: Word[]; startMs: number; endMs: number };

// TikTok-style pages: at most 3 words / ~1.2 s, and a page never runs past
// the end of a sentence or clause.
export const toPages = (words: Word[]): Page[] => {
  const pages: Page[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (current.length) pages.push({ words: current, startMs: current[0].startMs, endMs: current[current.length - 1].endMs });
    current = [];
  };
  for (const w of words) {
    if (current.length && (current.length >= MAX_WORDS || w.endMs - current[0].startMs > MAX_PAGE_MS)) flush();
    current.push(w);
    if (/[.,!?;:…]$/.test(w.text)) flush();
  }
  flush();
  // Each page holds until the next one starts, so the track doesn't flicker.
  return pages.map((p, i) => ({ ...p, endMs: i + 1 < pages.length ? pages[i + 1].startMs : p.endMs + LINGER_MS }));
};

// Word-synced subtitles of the voiceover, the active word in `accent`.
// Positioned by the caller (absolute `bottom`, `left`, `right` in px);
// `maxWidth` keeps the pill inside e.g. a phone screen (long words wrap).
// Renders nothing in stills: there's no narration in a single frame.
export const Subtitles: React.FC<{
  segments: SubtitleSegment[];
  accent: string;
  fg: string;
  unit: number;
  bottom: number;
  left: number;
  right: number;
  maxWidth?: number;
}> = ({ segments, accent, fg, unit, bottom, left, right, maxWidth }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  if (durationInFrames <= 1) return null;

  let page: Page | undefined;
  let tMs = 0;
  for (const s of segments) {
    const t = ((frame - s.fromFrame) / fps) * 1000;
    const p = toPages(s.words).find((pg) => t >= pg.startMs && t < pg.endMs);
    if (p) {
      page = p;
      tMs = t;
      break;
    }
  }
  if (!page) return null;

  const pop = interpolate(tMs - page.startMs, [0, 120], [0.92, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Last word that has started (ES2020 target: no findLastIndex).
  const active = page.words.reduce((a, w, i) => (tMs >= w.startMs ? i : a), 0);

  return (
    <div style={{ position: "absolute", left, right, bottom, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div
        style={{
          transform: `scale(${pop})`,
          maxWidth,
          boxSizing: "border-box",
          background: "rgba(8, 10, 16, 0.72)",
          borderRadius: 18 * unit,
          padding: `${14 * unit}px ${28 * unit}px`,
          fontSize: 64 * unit,
          lineHeight: 1.15,
          fontWeight: 800,
          letterSpacing: -0.5 * unit,
          textAlign: "center",
          color: fg,
          textWrap: "balance",
        }}
      >
        {page.words.map((w, i) => (
          <span key={i} style={{ color: i === active ? accent : fg }}>
            {i > 0 ? " " : ""}
            {w.text}
          </span>
        ))}
      </div>
    </div>
  );
};
