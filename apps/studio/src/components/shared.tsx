import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { safeZoneFor } from "../theme";

// A <Still> (durationInFrames === 1) renders frame 0, where every spring is
// still 0 and the whole scene would be invisible. Anything animated must go
// through this hook so stills show the settled end state instead.
export const useEnter = (delay = 0, damping = 200) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  if (durationInFrames <= 1) return 1;
  return spring({ frame: frame - delay, fps, config: { damping } });
};

export const Backdrop: React.FC<{ bg: string; accent: string }> = ({ bg, accent }) => (
  <AbsoluteFill style={{ backgroundColor: bg }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 70% 45% at 85% 5%, ${accent}2e, transparent 65%), radial-gradient(ellipse 60% 40% at 0% 100%, ${accent}14, transparent 70%)`,
      }}
    />
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.06 }}>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  </AbsoluteFill>
);

// Debug overlay: toggle `showSafeZones` in props to see where Instagram UI
// will sit on top of the video. Never ship a render with this on.
export const SafeZoneOverlay: React.FC = () => {
  const { width, height } = useVideoConfig();
  const z = safeZoneFor(width, height);
  const band = "rgba(255, 60, 60, 0.28)";
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: z.top, background: band }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: z.bottom, background: band }} />
      <div style={{ position: "absolute", top: z.top, bottom: z.bottom, right: 0, width: z.right, background: band }} />
    </AbsoluteFill>
  );
};
