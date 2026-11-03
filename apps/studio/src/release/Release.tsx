import React from "react";
import {
  AbsoluteFill,
  Freeze,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import { z } from "zod";
import { AudioLayer, type MusicGap, type VoiceSegment } from "../audio/AudioLayer";
import { audioModeSchema, audioSchema, beatVoiceSchema, flagsFor, type AudioMode } from "../audio/schema";
import { Subtitles } from "../audio/Subtitles";
import { VOICE_LEAD } from "../components/ScreenTour";
import { SafeZoneOverlay } from "../components/shared";
import { sans } from "../theme";
import { AUTHOR, AUTHOR_ROLE, C, OVERLAP, REPO, body, display, mono } from "../launch/theme";
import { Darkroom, Eyebrow, Fade, Phone, Reveal, SceneFrame, Slate, ease, useIsStill, useLayout } from "../launch/parts";
import { ReleaseTerminal, activeStepOf, type TermLine } from "./Terminal";

// "Now with sound": the release video for the kit's audio modes, made with the
// kit. Same darkroom look as src/launch, but beat-driven like Tour-*: the
// scenes come from `beats[]`, so scripts/audio.mjs can voice it, snap the cuts
// to the score and lint it. Every scene times itself as a fraction of its
// beat, because durations change after voicing and beat sync.
export const RELEASE_KINDS = ["hook", "terminal", "sound", "demo", "review", "viewer", "cta"] as const;

const releaseBeatSchema = z.object({
  kind: z.enum(RELEASE_KINDS),
  durationInFrames: z.number().int().positive(),
  narration: z.string().optional(),
  voice: beatVoiceSchema.optional(),
  // Silence the music bed for this beat (implied for kind "demo", which plays
  // a clip with its own soundtrack).
  muteMusic: z.boolean().optional(),
});

export const releaseSchema = z.object({
  beats: z.array(releaseBeatSchema).min(1),
  demoSrc: z.string(), // a real render, with its own audio, relative to public/
  demoFrames: z.number().int().positive(), // its length; the last frame holds if the beat runs longer
  demoVolume: z.number().min(0).optional(), // default 0.85
  sheetSrc: z.string(), // a contact sheet image, relative to public/
  viewerSrc: z.string(),
  viewerCuts: z.array(z.object({ from: z.number(), to: z.number() })).min(1),
  downloadAtFrame: z.number(),
  downloadPoint: z.object({ x: z.number(), y: z.number() }),
  showSafeZones: z.boolean().optional(),
  audio: audioSchema.optional(),
});
export type ReleaseProps = z.infer<typeof releaseSchema>;
type Beat = ReleaseProps["beats"][number];

export const calculateReleaseMetadata: CalculateMetadataFunction<ReleaseProps> = ({ props }) => ({
  durationInFrames: props.beats.reduce((sum, b) => sum + b.durationInFrames, 0),
});

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Accent: React.FC<{ children: React.ReactNode }> = ({ children }) => <span style={{ color: C.signal }}>{children}</span>;

// Content stays above this line, so the word subtitles own the lower band.
const SUB_LIFT = 16;
const useBands = () => {
  const l = useLayout();
  const subBottom = l.z.bottom + SUB_LIFT;
  return { ...l, subBottom, contentBottom: l.H - subBottom - (l.isReel ? 150 : 170) };
};

const Headline: React.FC<{ size: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ size, children, style }) => (
  <div style={{ fontFamily: display, fontStyle: "italic", fontSize: size, lineHeight: 1, color: C.paper, letterSpacing: "-0.02em", ...style }}>
    {children}
  </div>
);

// ------------------------------------------------------------- step rail
const STEPS = ["Capture", "Compose", "Sound", "Review", "Publish"];

const StepRail: React.FC<{ active: number; size: number }> = ({ active, size }) => (
  <div style={{ display: "flex", gap: size * 1.1, fontFamily: mono, fontSize: size, letterSpacing: "0.1em", textTransform: "uppercase" }}>
    {STEPS.map((s, i) => (
      <span key={s} style={{ color: i === active ? C.paper : i < active ? C.muted : C.dim, display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={{ color: i <= active ? C.signal : C.dim }}>0{i + 1}</span>
        {s}
      </span>
    ))}
  </div>
);

// ---------------------------------------------------------------- 1. hook
const Hook: React.FC<{ d: number }> = ({ d }) => {
  const frame = useCurrentFrame();
  const still = useIsStill();
  const { isReel, z, W, contentBottom } = useBands();
  const rule = still ? 1 : interpolate(frame, [d * 0.15, d * 0.6], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
  return (
    <AbsoluteFill style={{ padding: `${z.top}px ${z.right}px 0 ${z.left + 8}px`, height: contentBottom, justifyContent: "center" }}>
      {/* Negative delays: the hook is already on screen at frame 0, the poster
          frame feeds show before playback. */}
      <Fade delay={-20} y={0}>
        <Eyebrow size={isReel ? 26 : 24}>● Rec — now with sound</Eyebrow>
      </Fade>
      <Headline size={isReel ? 116 : 124} style={{ marginTop: 34, lineHeight: 1.02 }}>
        <Reveal delay={-20}>Ship the feature.</Reveal>
        <Reveal delay={-12}>
          <Accent>Post the video.</Accent>
        </Reveal>
      </Headline>
      <div style={{ marginTop: 40, width: (W - z.left - z.right) * 0.42 * rule, height: 3, background: C.signal }} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ 2. terminal
// Scripts are written in their own frames; `scriptTime` maps a span of the
// beat onto them, so the replay always fits however long the beat runs.
const scriptTime = (frame: number, d: number, from: number, to: number, length: number) =>
  interpolate(frame, [d * from, d * to], [0, length], { extrapolateLeft: "clamp" });

const TERMINAL_LENGTH = 100;
const TERMINAL_SCRIPT: TermLine[] = [
  { kind: "cmd", text: "scripts/capture-flow.sh https://app.example.com captures mobile", at: 2, step: 0 },
  { kind: "out", text: "captures/flow.mp4 · 1170×2532 · h264", at: 24, ok: true },
  { kind: "cmd", text: "npx remotion render Tour-Reel out/tour.mp4 --props=tour.json", at: 32, step: 1 },
  { kind: "progress", label: "Rendered", at: 52, until: 78, total: 471, suffix: "· 30fps" },
  { kind: "out", text: "out/tour.mp4 · 1080×1920 · 15.7 s", at: 82, ok: true },
];

const TerminalScene: React.FC<{ d: number }> = ({ d }) => {
  const frame = useCurrentFrame();
  const { isReel, z, W } = useBands();
  const t = scriptTime(frame, d, 0, 0.85, TERMINAL_LENGTH);
  const width = W - z.left - 8 - z.right;
  return (
    <AbsoluteFill style={{ paddingLeft: z.left + 8, paddingTop: z.top + 40 }}>
      <StepRail active={Math.max(0, activeStepOf(TERMINAL_SCRIPT, t))} size={isReel ? 22 : 22} />
      <Headline size={isReel ? 108 : 100} style={{ marginTop: 30 }}>
        <Reveal delay={-6}>It records the app.</Reveal>
        <Reveal delay={d * 0.25}>
          It <Accent>cuts the video.</Accent>
        </Reveal>
      </Headline>
      <div style={{ marginTop: isReel ? 64 : 44 }}>
        <ReleaseTerminal script={TERMINAL_SCRIPT} t={t} width={width} fontSize={24} />
      </div>
    </AbsoluteFill>
  );
};

// --------------------------------------------------------------- 3. sound
const MODES = audioModeSchema.options;
const CHOSEN: AudioMode = "music+voice+captions";

// Tiny glyphs for what a mode carries: voice (speech bars), music (a note),
// subtitles (a caption box).
const Glyph: React.FC<{ kind: "voice" | "music" | "subtitles"; on: boolean; size: number; color: string }> = ({ kind, on, size, color }) => {
  const c = on ? color : C.dim;
  const o = on ? 1 : 0.45;
  if (kind === "voice") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ opacity: o }}>
        {[4, 9, 14, 19].map((x, i) => {
          const h = [8, 16, 12, 6][i];
          return <rect key={x} x={x - 1.5} y={12 - h / 2} width={3} height={h} rx={1.5} fill={c} />;
        })}
      </svg>
    );
  }
  if (kind === "music") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ opacity: o }}>
        <path d="M9 18V5l11-2v13" stroke={c} strokeWidth={2.2} fill="none" strokeLinejoin="round" />
        <circle cx={6.5} cy={18} r={3} fill={c} />
        <circle cx={17.5} cy={16} r={3} fill={c} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ opacity: o }}>
      <rect x={2} y={5} width={20} height={14} rx={3} stroke={c} strokeWidth={2.2} fill="none" />
      <rect x={6} y={13} width={7} height={2.4} rx={1} fill={c} />
      <rect x={14.5} y={13} width={4} height={2.4} rx={1} fill={c} />
    </svg>
  );
};

// The six audio modes, 3 × 2. `lit` (0-1) lights up the chosen card;
// `enter(i)` (0-1) staggers the cards in.
const ModeGrid: React.FC<{ width: number; lit: number; enter: (i: number) => number; label: number }> = ({ width, lit, enter, label }) => {
  const gap = 14;
  const cardW = (width - gap * 2) / 3;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap, width }}>
      {MODES.map((m, i) => {
        const f = flagsFor(m);
        const chosen = m === CHOSEN;
        const l = chosen ? lit : 0;
        const e = enter(i);
        // Non-chosen cards dim a little once the pick is made.
        const dimmed = 1 - lit * 0.45 * (chosen ? 0 : 1);
        return (
          <div
            key={m}
            style={{
              width: cardW,
              boxSizing: "border-box",
              padding: `${label * 0.8}px ${label * 0.7}px`,
              borderRadius: 14,
              border: `2px solid ${l > 0.5 ? C.signal : C.line}`,
              background: l > 0 ? `rgba(255, 77, 28, ${0.14 * l})` : C.ink2,
              boxShadow: l > 0 ? `0 0 ${50 * l}px -10px ${C.signal}` : "none",
              opacity: e * dimmed,
              transform: `translateY(${(1 - e) * 18}px) scale(${1 + 0.03 * l})`,
            }}
          >
            <div style={{ display: "flex", gap: label * 0.55 }}>
              <Glyph kind="voice" on={f.voice} size={label * 1.25} color={l > 0.5 ? C.signal : C.paper} />
              <Glyph kind="music" on={f.music} size={label * 1.25} color={l > 0.5 ? C.signal : C.paper} />
              <Glyph kind="subtitles" on={f.subtitles} size={label * 1.25} color={l > 0.5 ? C.signal : C.paper} />
            </div>
            <div style={{ fontFamily: mono, fontWeight: 500, fontSize: label, color: l > 0.5 ? C.signal : C.paper, marginTop: label * 0.7, whiteSpace: "nowrap" }}>
              {m}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const SOUND_LENGTH = 50;
const SOUND_SCRIPT: TermLine[] = [
  { kind: "cmd", text: 'node scripts/audio.mjs release.json out.json --mode auto --goal "launch demo"', at: 0 },
  { kind: "out", text: "mode: music+voice+captions (auto)", at: 26, accent: true },
  { kind: "out", text: "score: tech, 100 bpm in A · cuts snapped to the beat", at: 34 },
];

// Deterministic waveform: two slow sines and a fast one, mirrored bars.
const waveAt = (i: number) => {
  const v = Math.abs(Math.sin(i * 0.37) * 0.5 + Math.sin(i * 0.11 + 1.3) * 0.35 + Math.sin(i * 1.7) * 0.15);
  return 0.12 + 0.88 * Math.min(1, v);
};

const BeatStrip: React.FC<{ width: number; height: number; frame: number; d: number }> = ({ width, height, frame, d }) => {
  const still = useIsStill();
  const beatsN = 12;
  const beatW = width / beatsN;
  const bars = 96;
  const barW = width / bars;
  // Cut markers start off the grid (in beats) and spring onto their beat line.
  const cuts = [
    { beat: 3, off: 0.42, at: 0.56 },
    { beat: 6, off: -0.36, at: 0.63 },
    { beat: 10, off: 0.3, at: 0.7 },
  ];
  const playhead = still ? 0.62 : interpolate(frame, [d * 0.45, d], [0, 1], clamp);
  const allSnapped = still || frame >= d * 0.76;
  return (
    <div style={{ width }}>
      <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
        <rect x={0} y={0} width={width} height={height} rx={12} fill={C.ink2} stroke={C.line} strokeWidth={1.5} />
        {Array.from({ length: beatsN - 1 }, (_, i) => (
          <line key={i} x1={(i + 1) * beatW} y1={8} x2={(i + 1) * beatW} y2={height - 8} stroke={(i + 1) % 4 === 0 ? C.dim : C.line} strokeWidth={(i + 1) % 4 === 0 ? 2 : 1.5} strokeDasharray="4 6" />
        ))}
        {Array.from({ length: bars }, (_, i) => {
          const h = waveAt(i) * (height - 36);
          const played = (i + 0.5) / bars <= playhead;
          return <rect key={i} x={i * barW + barW * 0.2} y={(height - h) / 2} width={barW * 0.6} height={h} rx={barW * 0.3} fill={played ? C.paper : C.muted} opacity={played ? 0.75 : 0.35} />;
        })}
        {cuts.map((c, i) => {
          const p = still ? 1 : ease(frame, d * c.at, 14);
          const x = (c.beat + c.off * (1 - p)) * beatW;
          const snapped = still || frame >= d * c.at + 8;
          return (
            <g key={i}>
              <line x1={x} y1={-10} x2={x} y2={height + 10} stroke={snapped ? C.signal : C.paper} strokeWidth={4} />
              <path d={`M ${x - 9} ${-18} L ${x + 9} ${-18} L ${x} ${-6} Z`} fill={snapped ? C.signal : C.paper} />
            </g>
          );
        })}
        <line x1={playhead * width} y1={0} x2={playhead * width} y2={height} stroke={C.paper} strokeWidth={2} opacity={0.6} />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontFamily: mono, fontSize: 22, letterSpacing: "0.08em", color: C.muted }}>
        <span>
          <span style={{ color: C.signal }}>│</span> cut <span style={{ color: C.dim, marginLeft: 18 }}>┆</span> beat
        </span>
        <span style={{ color: allSnapped ? C.paper : C.muted }}>
          {allSnapped && <span style={{ color: C.signal }}>✓ </span>}cuts on the beat ±15 ms
        </span>
      </div>
    </div>
  );
};

const SoundScene: React.FC<{ d: number }> = ({ d }) => {
  const frame = useCurrentFrame();
  const { isReel, z, W } = useBands();
  const width = W - z.left - 8 - z.right;
  const t = scriptTime(frame, d, 0.1, 0.36, SOUND_LENGTH * 0.8);
  const litAt = d * 0.4;
  const lit = interpolate(frame, [litAt, litAt + 6], [0, 1], clamp);
  const stripIn = ease(frame, d * 0.44);
  return (
    <AbsoluteFill style={{ paddingLeft: z.left + 8, paddingTop: z.top + 40 }}>
      <StepRail active={2} size={22} />
      <Headline size={isReel ? 104 : 92} style={{ marginTop: 26 }}>
        <Reveal delay={-6}>
          Now it has <Accent>sound.</Accent>
        </Reveal>
      </Headline>
      <div style={{ marginTop: isReel ? 50 : 30 }}>
        <ModeGrid width={width} lit={lit} enter={(i) => ease(frame, 2 + i * 2.5)} label={isReel ? 20 : 22} />
      </div>
      <div style={{ marginTop: isReel ? 36 : 24 }}>
        <ReleaseTerminal script={SOUND_SCRIPT} t={t} width={width} fontSize={isReel ? 20 : 21} idlePrompt={false} />
      </div>
      <div style={{ marginTop: isReel ? 64 : 40, opacity: stripIn, transform: `translateY(${(1 - stripIn) * 20}px)` }}>
        <BeatStrip width={width} height={isReel ? 150 : 120} frame={frame} d={d} />
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 4. demo
// A real render (voice + score + subtitles) in a phone, with its own audio.
const DemoScene: React.FC<{ d: number; src: string; clipFrames: number; volume: number }> = ({ d, src, clipFrames, volume }) => {
  const frame = useCurrentFrame();
  const { isReel, z, W, H } = useBands();
  const rise = interpolate(frame, [0, Math.min(22, d * 0.15)], [60, 0], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
  const fill: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };
  const chipSize = isReel ? 24 : 22;
  const chip = (
    <Fade delay={6} y={10}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 12,
          padding: `${chipSize * 0.55}px ${chipSize * 0.9}px`,
          borderRadius: 999,
          border: `1.5px solid ${C.line}`,
          background: C.ink2,
          fontFamily: mono,
          fontSize: chipSize,
          letterSpacing: "0.04em",
          color: C.paper,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ width: chipSize * 0.5, height: chipSize * 0.5, borderRadius: 999, background: C.signal }} />
        Real render · voice + score + subtitles
      </div>
    </Fade>
  );
  const copy = (
    <div>
      <Eyebrow size={isReel ? 24 : 22}>Output · untouched</Eyebrow>
      <Headline size={isReel ? 104 : 96} style={{ marginTop: 22 }}>
        <Reveal delay={-4}>Sound</Reveal>
        <Reveal delay={2}>
          <Accent>on.</Accent>
        </Reveal>
      </Headline>
    </div>
  );

  // The clip is 9:16; the screen matches it so nothing is cropped.
  const screenW = isReel ? 520 : 500;
  const screenH = Math.round((screenW * 16) / 9);
  const phone = (
    <Phone w={screenW} h={screenH} style={{ transform: `translateY(${rise}px)` }}>
      <Sequence durationInFrames={clipFrames} layout="none">
        <OffthreadVideo src={staticFile(src)} volume={volume} style={fill} />
      </Sequence>
      {/* Beat longer than the clip (snapped up to the beat): hold the last frame. */}
      <Sequence from={clipFrames} layout="none">
        <Freeze frame={clipFrames - 1}>
          <OffthreadVideo src={staticFile(src)} muted style={fill} />
        </Freeze>
      </Sequence>
    </Phone>
  );
  const outerW = screenW + 2 * Math.round(screenW * 0.028);
  const outerH = screenH + 2 * Math.round(screenW * 0.028);

  if (isReel) {
    const top = z.top + 300;
    return (
      <AbsoluteFill>
        <div style={{ position: "absolute", left: z.left + 8, top: z.top + 30, display: "flex", alignItems: "flex-end", gap: 40 }}>{copy}</div>
        <div style={{ position: "absolute", top, left: (W - outerW) / 2 - (z.right - z.left) / 2 }}>{phone}</div>
        <div style={{ position: "absolute", top: top + outerH + 30, left: 0, right: z.right - z.left, display: "flex", justifyContent: "center" }}>{chip}</div>
      </AbsoluteFill>
    );
  }
  const top = (H - outerH) / 2 - 30;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: z.left + 8, top: z.top + 60 }}>{copy}</div>
      <div style={{ position: "absolute", top, right: z.right }}>{phone}</div>
      <div style={{ position: "absolute", top: top + outerH + 28, right: z.right, width: outerW, display: "flex", justifyContent: "center" }}>{chip}</div>
    </AbsoluteFill>
  );
};

// -------------------------------------------------------------- 5. review
const CHECKS = [
  { label: "lint-video", value: "0 errors" },
  { label: "check-beats", value: "4/4 cuts on the beat" },
  { label: "reviewer", value: "PASS", strong: true },
];

const ReviewScene: React.FC<{ d: number; sheetSrc: string }> = ({ d, sheetSrc }) => {
  const frame = useCurrentFrame();
  const { isReel, z, W } = useBands();
  const slide = ease(frame, 2, 22);
  const imgW = isReel ? 760 : 680;
  const fs = isReel ? 24 : 24;
  return (
    <AbsoluteFill style={{ paddingLeft: z.left + 8, paddingTop: z.top + 40 }}>
      <StepRail active={3} size={22} />
      <Headline size={isReel ? 104 : 92} style={{ marginTop: 26 }}>
        <Reveal delay={-6}>A fresh agent</Reveal>
        <Reveal delay={d * 0.12}>
          <Accent>reviews every frame.</Accent>
        </Reveal>
      </Headline>
      <div style={{ position: "relative", marginTop: isReel ? 56 : 36, height: (imgW * 1298) / 1400 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: imgW,
            transform: `translateX(${(1 - slide) * W * 0.6}px) rotate(${-2.2 + slide * 1}deg)`,
            transformOrigin: "left top",
            opacity: slide,
          }}
        >
          <Img
            src={staticFile(sheetSrc)}
            style={{ width: imgW, display: "block", borderRadius: 10, border: `2px solid ${C.line}`, boxShadow: "0 40px 90px -30px rgba(0,0,0,0.9)" }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            right: z.right,
            bottom: isReel ? -10 : 10,
            padding: `${fs * 0.9}px ${fs * 1.1}px`,
            borderRadius: 16,
            background: "rgba(14, 13, 11, 0.94)",
            border: `1.5px solid ${C.line}`,
            boxShadow: "0 30px 80px -20px rgba(0,0,0,0.95)",
            fontFamily: mono,
            fontSize: fs,
            lineHeight: 1.7,
            whiteSpace: "pre",
          }}
        >
          {CHECKS.map((c, i) => {
            const at = d * (0.3 + i * 0.14);
            const on = frame >= at;
            const p = ease(frame, at, 30);
            return (
              <div key={c.label} style={{ color: on ? C.paper : C.dim }}>
                <span style={{ color: on ? C.signal : C.dim, display: "inline-block", width: fs * 1.3, transform: `scale(${on ? 0.6 + 0.4 * p : 1})` }}>
                  {on ? "✓" : "·"}
                </span>
                {c.label.padEnd(13)}
                <span style={{ color: on ? (c.strong ? C.signal : C.paper) : C.dim, fontWeight: c.strong ? 700 : 400 }}>{on ? c.value : "…"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// -------------------------------------------------------------- 6. viewer
// The launch's viewer scene (src/launch/Launch.tsx), re-laid out so the
// lower band stays free for the subtitles. Footage timings (cuts, tap) are in
// seconds/frames of the recording, so they stay absolute; the last cut runs
// to the end of the beat.
const TapRing: React.FC<{ at: number; x: number; y: number; w: number; h: number }> = ({ at, x, y, w, h }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const pulse = ((frame - at) % 24) / 24;
  const size = w * 0.3;
  return (
    <div style={{ position: "absolute", left: x * w - size / 2, top: y * h - size / 2, width: size, height: size }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 999, border: `4px solid ${C.signal}`, transform: `scale(${0.5 + pulse * 0.7})`, opacity: 1 - pulse }} />
      <div style={{ position: "absolute", inset: size * 0.32, borderRadius: 999, background: `${C.signal}55`, border: `3px solid ${C.signal}` }} />
    </div>
  );
};

const VIEWER_COPY_W = 420;

const ViewerScene: React.FC<{
  src: string;
  cuts: { from: number; to: number }[];
  downloadAt: number;
  point: { x: number; y: number };
}> = ({ src, cuts, downloadAt, point }) => {
  const frame = useCurrentFrame();
  const { isReel, z, W, H } = useBands();
  const switchAt = downloadAt - 24;
  const second = frame >= switchAt;
  const screenW = isReel ? 360 : 470;
  const screenH = Math.round(screenW * (844 / 390));
  const rise = interpolate(frame, [0, 22], [70, 0], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });

  const copy = (
    <div>
      <Eyebrow size={isReel ? 24 : 22}>05 Publish · media-viewer</Eyebrow>
      <Headline size={isReel ? 104 : 84} style={{ marginTop: 26 }}>
        {!second ? (
          <>
            <Reveal delay={0}>On your</Reveal>
            <Reveal delay={4}>phone.</Reveal>
          </>
        ) : (
          <Sequence from={switchAt} layout="none">
            <Reveal delay={0}>
              <Accent>Download.</Accent>
            </Reveal>
            <Reveal delay={4}>Post.</Reveal>
          </Sequence>
        )}
      </Headline>
      {!isReel && (
        <Fade delay={second ? switchAt + 6 : 8} style={{ marginTop: 26, maxWidth: 380 }}>
          <div style={{ fontFamily: body, fontSize: 30, lineHeight: 1.35, color: C.muted }}>
            {second ? "A real Download button, ready to post." : "One link. No login to watch."}
          </div>
        </Fade>
      )}
    </div>
  );

  const phone = (
    <Phone w={screenW} h={screenH} style={{ transform: `translateY(${rise}px)` }}>
      {cuts.map((c, i) => {
        const from = cuts.slice(0, i).reduce((sum, p) => sum + Math.round((p.to - p.from) * 30), 0);
        return (
          <Sequence key={i} from={from} durationInFrames={i === cuts.length - 1 ? undefined : Math.round((c.to - c.from) * 30)} layout="none">
            <OffthreadVideo
              src={staticFile(src)}
              muted
              trimBefore={Math.round(c.from * 30)}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }}
            />
          </Sequence>
        );
      })}
      <TapRing at={downloadAt} x={point.x} y={point.y} w={screenW} h={screenH} />
    </Phone>
  );

  if (isReel) {
    return (
      <AbsoluteFill>
        <div style={{ position: "absolute", left: z.left + 8, top: z.top + 40, right: z.right }}>{copy}</div>
        <div style={{ position: "absolute", top: z.top + 340, left: (W - screenW) / 2 - 16 }}>{phone}</div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: z.left + 8, top: z.top + 60, width: VIEWER_COPY_W }}>{copy}</div>
      <div style={{ position: "absolute", top: (H - screenH) / 2 - 10, right: z.right - 10 }}>{phone}</div>
    </AbsoluteFill>
  );
};

// ----------------------------------------------------------------- 7. CTA
const CtaScene: React.FC = () => {
  const { isReel, z, contentBottom } = useBands();
  const [host, user, repo] = REPO.split("/");
  return (
    <AbsoluteFill style={{ padding: `${z.top}px ${z.right}px 0 ${z.left + 8}px`, height: contentBottom, justifyContent: "center" }}>
      <Eyebrow size={isReel ? 26 : 24}>Open source · MIT</Eyebrow>
      <div style={{ fontFamily: mono, fontWeight: 700, fontSize: isReel ? 78 : 76, lineHeight: 1.08, color: C.paper, marginTop: 30, letterSpacing: "-0.03em" }}>
        <Reveal delay={-4}>
          <span style={{ color: C.muted, fontWeight: 400 }}>{host}/</span>
        </Reveal>
        <Reveal delay={0}>{user}/</Reveal>
        <Reveal delay={4}>
          <span style={{ color: C.signal }}>{repo}</span>
        </Reveal>
      </div>
      <Fade delay={10} style={{ marginTop: 40 }}>
        <Headline size={isReel ? 54 : 50} style={{ lineHeight: 1.1 }}>
          Voiceover, score and subtitles. Made by your agent.
        </Headline>
      </Fade>
      <Fade delay={16} style={{ marginTop: 50, display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ width: 56, height: 3, background: C.signal }} />
        <div>
          <div style={{ fontFamily: body, fontWeight: 600, fontSize: isReel ? 34 : 30, color: C.paper }}>{AUTHOR}</div>
          <div style={{ fontFamily: mono, fontSize: isReel ? 22 : 20, color: C.muted, marginTop: 6, letterSpacing: "0.02em" }}>{AUTHOR_ROLE}</div>
        </div>
      </Fade>
    </AbsoluteFill>
  );
};

// --------------------------------------------------------------- the video
const withRanges = (beats: Beat[]) => {
  let cursor = 0;
  return beats.map((beat, index) => {
    const r = { beat, index, start: cursor, end: cursor + beat.durationInFrames };
    cursor += beat.durationInFrames;
    return r;
  });
};

export const Release: React.FC<ReleaseProps> = (props) => {
  const { beats, showSafeZones, audio } = props;
  const { fps, width, height } = useVideoConfig();
  const { z } = useLayout();
  const unit = width / 1080;
  const isReel = height / width > 1.5;
  const ranges = withRanges(beats);

  const scene = (b: Beat): React.ReactNode => {
    const d = b.durationInFrames;
    switch (b.kind) {
      case "hook":
        return <Hook d={d} />;
      case "terminal":
        return <TerminalScene d={d} />;
      case "sound":
        return <SoundScene d={d} />;
      case "demo":
        return <DemoScene d={d} src={props.demoSrc} clipFrames={props.demoFrames} volume={props.demoVolume ?? 0.85} />;
      case "review":
        return <ReviewScene d={d} sheetSrc={props.sheetSrc} />;
      case "viewer":
        return <ViewerScene src={props.viewerSrc} cuts={props.viewerCuts} downloadAt={props.downloadAtFrame} point={props.downloadPoint} />;
      case "cta":
        return <CtaScene />;
    }
  };

  // --- Audio: same wiring as ScreenTour (voice VOICE_LEAD frames into its beat).
  const flags = audio ? flagsFor(audio.mode) : { voice: false, music: false, subtitles: false };
  const voiced = flags.voice ? ranges.filter((r) => r.beat.voice) : [];
  const voiceSegments: VoiceSegment[] = voiced.map(({ beat, start, end }) => ({
    fromFrame: start + VOICE_LEAD,
    src: beat.voice!.src,
    durationInFrames: Math.max(1, Math.min(Math.ceil(beat.voice!.durationSec * fps), end - start - VOICE_LEAD)),
  }));
  const musicGaps: MusicGap[] = ranges
    .filter((r) => r.beat.kind === "demo" || r.beat.muteMusic)
    .map(({ start, end }) => ({ fromFrame: start, durationInFrames: end - start }));

  // Subtitles sit in the lower band, left-aligned with the copy. In the feed
  // viewer scene they stay in the copy column, clear of the phone.
  const subLeft = z.left + 8;
  const subRight = (b: Beat) => (b.kind === "viewer" && !isReel ? width - subLeft - VIEWER_COPY_W : z.right);

  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      <Darkroom />
      {ranges.map(({ beat, index, start, end }) => {
        const last = index === ranges.length - 1;
        const duration = end - start + (last ? 0 : OVERLAP);
        return (
          <Sequence key={index} from={start} durationInFrames={duration} name={beat.kind}>
            <SceneFrame duration={duration} fadeIn={index !== 0} fadeOut={!last}>
              {scene(beat)}
            </SceneFrame>
          </Sequence>
        );
      })}
      <Slate />
      {flags.subtitles && (
        <div style={{ fontFamily: sans }}>
          {voiced.map(({ beat, start, index }) => (
            <Subtitles
              key={index}
              segments={[{ fromFrame: start + VOICE_LEAD, words: beat.voice!.words, align: "start" }]}
              accent={C.signal}
              fg={C.paper}
              unit={unit}
              bottom={z.bottom + SUB_LIFT}
              left={subLeft}
              right={subRight(beat)}
              maxWidth={width - subLeft - subRight(beat)}
            />
          ))}
        </div>
      )}
      {audio && (flags.voice || flags.music) && (
        <AudioLayer voice={voiceSegments} music={flags.music ? audio.music : undefined} voiceVolume={audio.voiceVolume} musicGaps={musicGaps} />
      )}
      {showSafeZones && <SafeZoneOverlay />}
    </AbsoluteFill>
  );
};

// -------------------------------------------------------------- the cover
// 4:5 poster for the X post: the hook and the six modes, the chosen one lit.
export const ReleaseCover: React.FC<Pick<ReleaseProps, "showSafeZones">> = ({ showSafeZones }) => {
  const { W, z } = useLayout();
  const left = z.left + 8;
  const width = W - left - z.right;
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      <Darkroom />
      <Slate />
      <div style={{ position: "absolute", left, right: z.right, top: z.top + 50 }}>
        <Eyebrow size={24}>● New — now with sound</Eyebrow>
        <Headline size={124} style={{ marginTop: 30, lineHeight: 1.02 }}>
          Ship the feature.
          <br />
          <Accent>Post the video.</Accent>
        </Headline>
        <div style={{ fontFamily: body, fontSize: 32, lineHeight: 1.35, color: C.muted, marginTop: 34, maxWidth: width * 0.9 }}>
          Your agent adds the <span style={{ color: C.paper }}>voiceover</span>, a <span style={{ color: C.paper }}>score written for the cut</span>, and{" "}
          <span style={{ color: C.paper }}>synced subtitles</span>.
        </div>
        <div style={{ marginTop: 50 }}>
          <ModeGrid width={width} lit={1} enter={() => 1} label={22} />
        </div>
      </div>
      <div style={{ position: "absolute", left, bottom: z.bottom + 10, fontFamily: mono, fontWeight: 700, fontSize: 36, color: C.paper, letterSpacing: "-0.02em" }}>
        <span style={{ color: C.muted, fontWeight: 400 }}>github.com/rwspatin/</span>
        <span style={{ color: C.signal }}>agentic-media-kit</span>
      </div>
      {showSafeZones && <SafeZoneOverlay />}
    </AbsoluteFill>
  );
};
