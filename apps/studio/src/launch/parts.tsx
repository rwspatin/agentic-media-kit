import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { safeZoneFor } from "../theme";
import { C, FPS, OVERLAP, mono } from "./theme";

export const useLayout = () => {
  const { width, height } = useVideoConfig();
  const isReel = height / width > 1.5;
  return { W: width, H: height, isReel, z: safeZoneFor(width, height) };
};

// Stills (durationInFrames <= 1) always get the settled state; see shared.tsx.
export const useIsStill = () => useVideoConfig().durationInFrames <= 1;

export const ease = (frame: number, delay = 0, damping = 200) =>
  spring({ frame: frame - delay, fps: FPS, config: { damping } });

// Masked line reveal: the line slides up from behind its own baseline.
export const Reveal: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const still = useIsStill();
  const p = still ? 1 : ease(frame, delay);
  return (
    <div style={{ overflow: "hidden", paddingBottom: "0.08em", ...style }}>
      <div style={{ transform: `translateY(${(1 - p) * 110}%)` }}>{children}</div>
    </div>
  );
};

export const Fade: React.FC<{ delay?: number; y?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0,
  y = 24,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const still = useIsStill();
  const p = still ? 1 : ease(frame, delay);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * y}px)`, ...style }}>{children}</div>;
};

// Scene envelope: consecutive scenes overlap by OVERLAP frames; the outgoing
// one fades out while the incoming one fades in (a cross-dissolve, never a
// dip to an empty frame).
export const SceneFrame: React.FC<{ duration: number; fadeIn?: boolean; fadeOut?: boolean; children: React.ReactNode }> = ({
  duration,
  fadeIn = true,
  fadeOut = true,
  children,
}) => {
  const frame = useCurrentFrame();
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  // Asymmetric on purpose: the outgoing scene clears in 4 frames while the
  // incoming one is already fading in, so text never ghosts over text for
  // long and there is always one mostly-opaque layer on screen.
  const inP = fadeIn ? interpolate(frame, [1, OVERLAP], [0, 1], clamp) : 1;
  const outP = fadeOut ? interpolate(frame, [duration - OVERLAP, duration - OVERLAP + 4], [1, 0], clamp) : 1;
  return (
    <AbsoluteFill style={{ opacity: Math.min(inP, outP), transform: `translateY(${(1 - outP) * -24}px)` }}>
      {children}
    </AbsoluteFill>
  );
};

export const Eyebrow: React.FC<{ children: React.ReactNode; size: number; color?: string }> = ({
  children,
  size,
  color = C.signal,
}) => (
  <div
    style={{
      fontFamily: mono,
      fontWeight: 500,
      fontSize: size,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color,
    }}
  >
    {children}
  </div>
);

const pad = (n: number) => String(n).padStart(2, "0");
export const timecode = (frame: number) => {
  const s = Math.floor(frame / FPS);
  return `00:${pad(Math.floor(s / 60))}:${pad(s % 60)}:${pad(frame % FPS)}`;
};

// Warm ink backdrop: faint contact-sheet grid, vignette, film grain.
export const Darkroom: React.FC = () => {
  const { W, H } = useLayout();
  const step = 90;
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        {Array.from({ length: Math.ceil(W / step) + 1 }, (_, i) => (
          <line key={`v${i}`} x1={i * step} y1={0} x2={i * step} y2={H} stroke={C.line} strokeWidth={1} />
        ))}
        {Array.from({ length: Math.ceil(H / step) + 1 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={i * step} x2={W} y2={i * step} stroke={C.line} strokeWidth={1} />
        ))}
      </svg>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 80% 55% at 50% 42%, transparent 40%, ${C.ink} 100%), radial-gradient(ellipse 60% 35% at 100% 0%, ${C.signal}14, transparent 70%)`,
        }}
      />
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.07 }}>
        <filter id="launch-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#launch-grain)" />
      </svg>
    </AbsoluteFill>
  );
};

// Slate chrome: wordmark, REC dot + running timecode and crop marks.
// Decorative only, so it may sit under IG's UI.
export const Slate: React.FC = () => {
  const frame = useCurrentFrame();
  const still = useIsStill();
  const { W, H, isReel, z } = useLayout();
  const fs = isReel ? 22 : 19;
  const top = isReel ? z.top - 58 : 40;
  const recOn = still || Math.floor(frame / 15) % 2 === 0;
  const mark = 34;
  const inset = isReel ? 36 : 28;
  const corner = (x: number, y: number, sx: number, sy: number) => (
    <path
      key={`${x}-${y}`}
      d={`M ${x} ${y + sy * mark} L ${x} ${y} L ${x + sx * mark} ${y}`}
      stroke={C.dim}
      strokeWidth={2}
      fill="none"
    />
  );
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {corner(inset, inset, 1, 1)}
        {corner(W - inset, inset, -1, 1)}
        {corner(inset, H - inset, 1, -1)}
        {corner(W - inset, H - inset, -1, -1)}
      </svg>
      <div
        style={{
          position: "absolute",
          top,
          left: z.left + 8,
          right: isReel ? z.right : z.right + 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: mono,
          fontSize: fs,
          letterSpacing: "0.12em",
          color: C.muted,
        }}
      >
        <span>
          AGENTIC<span style={{ color: C.signal }}>/</span>MEDIA<span style={{ color: C.signal }}>/</span>KIT
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              width: fs * 0.55,
              height: fs * 0.55,
              borderRadius: 999,
              background: C.signal,
              opacity: recOn ? 1 : 0.2,
              boxShadow: recOn ? `0 0 16px ${C.signal}` : "none",
            }}
          />
          <span style={{ color: C.paper }}>{still ? "REC" : timecode(frame)}</span>
        </span>
      </div>
    </AbsoluteFill>
  );
};

// Warm, minimal phone shell. The screen is sized by the caller.
export const Phone: React.FC<{ w: number; h: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  w,
  h,
  children,
  style,
}) => {
  const bezel = Math.round(w * 0.028);
  return (
    <div
      style={{
        padding: bezel,
        borderRadius: w * 0.13,
        background: "linear-gradient(150deg, #2b2722, #0d0c0a 60%)",
        boxShadow: `0 60px 120px -40px rgba(0,0,0,0.85), 0 0 0 2px #3b352d, 0 0 160px -60px ${C.signal}88`,
        ...style,
      }}
    >
      <div style={{ position: "relative", width: w, height: h, borderRadius: w * 0.11, overflow: "hidden", background: "#000" }}>
        {children}
        <div
          style={{
            position: "absolute",
            top: w * 0.025,
            left: "50%",
            width: w * 0.3,
            height: w * 0.075,
            marginLeft: -(w * 0.15),
            borderRadius: 999,
            background: "#000",
          }}
        />
      </div>
    </div>
  );
};
