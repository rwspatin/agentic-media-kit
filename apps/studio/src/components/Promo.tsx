import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { safeZoneFor, sans, serif } from "../theme";
import { Backdrop, SafeZoneOverlay, useEnter } from "./shared";

// The schema drives both the Studio props editor AND `--props='{...}'` on the
// CLI, so every render can be data-driven without touching code.
export const promoSchema = z.object({
  brand: z.string(),
  eyebrow: z.string(),
  headline: z.string(),
  subheadline: z.string(),
  cta: z.string(),
  accent: z.string(), // hex, e.g. "#7c9cff"
  bg: z.string(),
  fg: z.string(),
  showSafeZones: z.boolean().optional(),
});

export type PromoProps = z.infer<typeof promoSchema>;

// Aspect-aware typographic promo: the same props render a 9:16 Reel/Story,
// a 4:5 feed post, a 1:1 square or a still cover. Type scales with the
// canvas width; text stays inside the Instagram safe zone.
export const Promo: React.FC<PromoProps> = ({
  brand,
  eyebrow,
  headline,
  subheadline,
  cta,
  accent,
  bg,
  fg,
  showSafeZones,
}) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const zone = safeZoneFor(width, height);
  const isVertical = height / width > 1.5;
  const unit = width / 1080;

  const e0 = useEnter(0);
  const e1 = useEnter(8);
  const e2 = useEnter(18);
  const e3 = useEnter(30);

  // Only real videos fade out; a Still must stay fully opaque.
  const fadeOut =
    durationInFrames > 30
      ? interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const rise = (p: number, px = 40) => `translateY(${interpolate(p, [0, 1], [px * unit, 0])}px)`;

  return (
    <AbsoluteFill style={{ fontFamily: sans, color: fg, opacity: fadeOut }}>
      <Backdrop bg={bg} accent={accent} />
      <AbsoluteFill
        style={{
          paddingTop: zone.top,
          paddingBottom: zone.bottom,
          paddingLeft: zone.left + 8 * unit,
          paddingRight: zone.right,
          justifyContent: isVertical ? "center" : "space-between",
        }}
      >
        <div
          style={{
            fontSize: 26 * unit,
            letterSpacing: 6 * unit,
            textTransform: "uppercase",
            fontWeight: 600,
            color: accent,
            opacity: e0,
            marginBottom: isVertical ? 56 * unit : 0,
          }}
        >
          {brand}
        </div>

        <div>
          <div
            style={{
              fontSize: 30 * unit,
              fontWeight: 500,
              color: `${fg}b3`,
              marginBottom: 20 * unit,
              opacity: e1,
              transform: rise(e1, 20),
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              fontFamily: serif,
              fontSize: (isVertical ? 112 : 96) * unit,
              lineHeight: 1.04,
              fontWeight: 600,
              letterSpacing: -2 * unit,
              opacity: e1,
              transform: rise(e1),
              textWrap: "balance",
            }}
          >
            {headline}
          </div>
          <div
            style={{
              fontSize: 38 * unit,
              lineHeight: 1.35,
              color: `${fg}c4`,
              marginTop: 32 * unit,
              maxWidth: 820 * unit,
              opacity: e2,
              transform: rise(e2, 24),
              textWrap: "pretty",
            }}
          >
            {subheadline}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20 * unit,
            marginTop: isVertical ? 72 * unit : 0,
            opacity: e3,
            transform: rise(e3, 16),
          }}
        >
          <div
            style={{
              background: accent,
              color: bg,
              fontWeight: 700,
              fontSize: 32 * unit,
              padding: `${22 * unit}px ${38 * unit}px`,
              borderRadius: 999,
            }}
          >
            {cta}
          </div>
          <div style={{ height: 3 * unit, width: interpolate(e3, [0, 1], [0, 120]) * unit, background: `${fg}55` }} />
        </div>
      </AbsoluteFill>
      {showSafeZones && <SafeZoneOverlay />}
    </AbsoluteFill>
  );
};
