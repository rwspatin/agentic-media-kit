import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import TYPE from "../type-scale.json";
import type { Word } from "./schema";

// Narration words placed on the timeline: the clip starts at `fromFrame`,
// word times are ms from the clip start.
export type SubtitleSegment = {
  fromFrame: number;
  words: Word[];
  // "start" lines the words up with left-aligned copy (title cards).
  align?: "center" | "start";
};

const MAX_WORDS = 3;
const MAX_PAGE_MS = 1200;
const LINGER_MS = 300; // how long the last page stays after its last word

type Page = { words: Word[]; startMs: number; endMs: number };

// A dark contour from a ring of hard shadows plus a soft drop shadow.
// (-webkit-text-stroke paints over the fill in Chrome's HTML text, which
// makes the letters look hollow.)
const outline = (r: number) => {
  const ring = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return `${(Math.cos(a) * r).toFixed(1)}px ${(Math.sin(a) * r).toFixed(1)}px 0 rgba(8, 10, 16, 0.95)`;
  });
  return [...ring, `0 ${r}px ${r * 4}px rgba(0, 0, 0, 0.6)`].join(", ");
};

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
// Plain outlined text, no box: a filled pill reads as a button and hides the
// screen content behind it.
// Positioned by the caller (absolute `bottom`, `left`, `right` in px);
// `maxWidth` keeps the text inside e.g. a phone screen (long words wrap).
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
  let align: SubtitleSegment["align"] = "center";
  let tMs = 0;
  for (const s of segments) {
    const t = ((frame - s.fromFrame) / fps) * 1000;
    const p = toPages(s.words).find((pg) => t >= pg.startMs && t < pg.endMs);
    if (p) {
      page = p;
      align = s.align ?? "center";
      tMs = t;
      break;
    }
  }
  if (!page) return null;

  const pop = interpolate(tMs - page.startMs, [0, 120], [0.92, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Last word that has started (ES2020 target: no findLastIndex).
  const active = page.words.reduce((a, w, i) => (tMs >= w.startMs ? i : a), 0);

  return (
    <div
      style={{
        position: "absolute",
        left,
        right,
        bottom,
        display: "flex",
        justifyContent: align === "start" ? "flex-start" : "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          transform: `scale(${pop})`,
          transformOrigin: align === "start" ? "left center" : "center",
          maxWidth,
          fontSize: TYPE.subtitles.text * unit,
          lineHeight: 1.12,
          fontWeight: 800,
          letterSpacing: -0.5 * unit,
          textAlign: align === "start" ? "left" : "center",
          color: fg,
          textWrap: "balance",
          textShadow: outline(4 * unit),
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
