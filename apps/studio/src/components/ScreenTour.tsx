import React from "react";
import {
  AbsoluteFill,
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
import { safeZoneFor, sans, serif } from "../theme";
import { DemoScreen } from "./DemoScreen";
import { BROWSER_BAR, DeviceFrame, PHONE_BEZEL } from "./DeviceFrame";
import { Backdrop, SafeZoneOverlay, useEnter } from "./shared";

// What fills the device screen for a beat:
//  - image: a screenshot in public/ (e.g. captured with `agent-browser screenshot`)
//  - video: a screen recording in public/ (MP4 preferred; WebM works too)
//  - demo:  the generated placeholder UI (no assets needed)
const mediaSchema = z.object({
  type: z.enum(["image", "video", "demo"]),
  src: z.string().optional(), // path relative to public/, for image|video
  demoVariant: z.enum(["dashboard", "list", "success"]).optional(),
  // For videos: skip the first N seconds of the recording (e.g. page load).
  startAtSeconds: z.number().optional(),
  // CSS object-position. "top center" suits full-page screenshots.
  position: z.string().optional(),
});

// Optional slow push-in: zoom from `from` to `to` around focus point (x, y),
// both 0-1 fractions of the screen. Draws the eye to the feature being shown.
const zoomSchema = z.object({
  x: z.number(),
  y: z.number(),
  from: z.number(),
  to: z.number(),
});

const beatSchema = z.object({
  kind: z.enum(["intro", "shot", "outro"]),
  eyebrow: z.string(),
  caption: z.string(),
  durationInFrames: z.number().int().positive(),
  media: mediaSchema.optional(),
  zoom: zoomSchema.optional(),
});

export const screenTourSchema = z.object({
  brand: z.string(),
  accent: z.string(),
  bg: z.string(),
  fg: z.string(),
  device: z.enum(["phone", "browser", "none"]),
  url: z.string().optional(), // shown in the browser address bar
  outroSub: z.string(),
  beats: z.array(beatSchema).min(1),
  showSafeZones: z.boolean().optional(),
});

export type ScreenTourProps = z.infer<typeof screenTourSchema>;
type Beat = ScreenTourProps["beats"][number];

// Duration is derived from the beats, so adding/removing a beat via --props
// never leaves the composition too short or padded with black.
export const calculateTourMetadata: CalculateMetadataFunction<ScreenTourProps> = ({ props }) => ({
  durationInFrames: props.beats.reduce((sum, b) => sum + b.durationInFrames, 0),
});

const CROSSFADE = 12;
const CAPTION_H_RATIO = 0.12;

const withRanges = (beats: Beat[]) => {
  let cursor = 0;
  return beats.map((beat, index) => {
    const r = { beat, index, start: cursor, end: cursor + beat.durationInFrames };
    cursor += beat.durationInFrames;
    return r;
  });
};

const ScreenContent: React.FC<{
  beat: Beat;
  accent: string;
  screenWidth: number;
  screenHeight: number;
  layout: "mobile" | "desktop";
}> = ({ beat, accent, screenWidth, screenHeight, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const media = beat.media ?? { type: "demo" as const };
  const zoom = beat.zoom;
  const scale = zoom
    ? interpolate(frame, [0, Math.max(1, beat.durationInFrames - 20)], [zoom.from, zoom.to], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: (t) => t * t * (3 - 2 * t),
      })
    : 1;
  const fill: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: media.position ?? "top center",
  };

  let content: React.ReactNode;
  if (media.type === "image" && media.src) {
    content = <Img src={staticFile(media.src)} style={fill} />;
  } else if (media.type === "video" && media.src) {
    content = (
      <OffthreadVideo
        src={staticFile(media.src)}
        muted
        trimBefore={Math.round((media.startAtSeconds ?? 0) * fps)}
        style={fill}
      />
    );
  } else {
    content = (
      <DemoScreen
        variant={media.demoVariant ?? "dashboard"}
        accent={accent}
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        layout={layout}
      />
    );
  }

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale})`,
        transformOrigin: zoom ? `${zoom.x * 100}% ${zoom.y * 100}%` : "center",
      }}
    >
      {content}
    </AbsoluteFill>
  );
};

const Caption: React.FC<{
  eyebrow: string;
  caption: string;
  accent: string;
  fg: string;
  duration: number;
  step: number;
  totalSteps: number;
  unit: number;
}> = ({ eyebrow, caption, accent, fg, duration, step, totalSteps, unit }) => {
  const frame = useCurrentFrame();
  // Captions hard-cut per beat (own fade, no overlap): two captions
  // crossfading into each other read as illegible double-exposed text.
  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [duration - 10, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ opacity: Math.min(fadeIn, fadeOut), transform: `translateY(${interpolate(fadeIn, [0, 1], [18, 0]) * unit}px)` }}>
      <div style={{ display: "flex", gap: 8 * unit, marginBottom: 20 * unit }}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            style={{
              width: 56 * unit,
              height: 4 * unit,
              borderRadius: 2,
              background: i <= step ? accent : `${fg}2e`,
            }}
          />
        ))}
      </div>
      <div
        style={{
          fontSize: 22 * unit,
          letterSpacing: 3 * unit,
          textTransform: "uppercase",
          color: accent,
          fontWeight: 600,
          marginBottom: 10 * unit,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          fontFamily: serif,
          fontSize: 50 * unit,
          lineHeight: 1.12,
          fontWeight: 500,
          letterSpacing: -0.5 * unit,
          textWrap: "balance",
        }}
      >
        {caption}
      </div>
    </div>
  );
};

const TitleCard: React.FC<{
  brand: string;
  eyebrow: string;
  caption: string;
  sub?: string;
  accent: string;
  fg: string;
  unit: number;
}> = ({ brand, eyebrow, caption, sub, accent, fg, unit }) => {
  const e = useEnter(0);
  const e2 = useEnter(10);
  return (
    <div>
      <div
        style={{
          fontSize: 24 * unit,
          letterSpacing: 5 * unit,
          textTransform: "uppercase",
          color: accent,
          fontWeight: 600,
          marginBottom: 28 * unit,
          opacity: e,
        }}
      >
        {brand} · {eyebrow}
      </div>
      <div
        style={{
          fontFamily: serif,
          fontSize: 88 * unit,
          lineHeight: 1.05,
          fontWeight: 600,
          letterSpacing: -1.5 * unit,
          opacity: e,
          transform: `translateY(${interpolate(e, [0, 1], [30, 0]) * unit}px)`,
          textWrap: "balance",
        }}
      >
        {caption}
      </div>
      {sub && <div style={{ fontSize: 30 * unit, color: `${fg}99`, marginTop: 30 * unit, opacity: e2 }}>{sub}</div>}
      <div style={{ width: interpolate(e2, [0, 1], [0, 96]) * unit, height: 4 * unit, background: accent, marginTop: 36 * unit, borderRadius: 2 }} />
    </div>
  );
};

export const ScreenTour: React.FC<ScreenTourProps> = ({
  brand,
  accent,
  bg,
  fg,
  device,
  url,
  outroSub,
  beats,
  showSafeZones,
}) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const zone = safeZoneFor(width, height);
  const unit = width / 1080;
  const ranges = withRanges(beats);
  const shots = ranges.filter((r) => r.beat.kind === "shot");
  const totalSteps = Math.max(1, shots.length);

  // --- Geometry: device sits between the top safe inset and the caption block.
  const captionH = Math.round(height * CAPTION_H_RATIO);
  const gap = Math.round(40 * unit);
  const areaTop = zone.top;
  const areaH = height - zone.top - zone.bottom - captionH - gap;
  const areaW = width - zone.left - zone.right;
  let screenW: number;
  let screenH: number;
  if (device === "phone") {
    screenH = areaH - PHONE_BEZEL * 2;
    screenW = Math.min(Math.round(screenH * (9 / 19.5)), areaW - PHONE_BEZEL * 2);
  } else if (device === "browser") {
    screenW = Math.round(width - 2 * zone.left);
    screenH = Math.min(Math.round(screenW * 0.62), areaH - BROWSER_BAR);
  } else {
    screenW = areaW;
    screenH = areaH;
  }
  const layout = device === "browser" ? "desktop" : "mobile";

  // Device is present from the first shot to the last shot.
  const firstShot = shots[0];
  const lastShot = shots[shots.length - 1];
  const deviceIn = firstShot
    ? interpolate(frame, [firstShot.start, firstShot.start + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;
  const deviceOut = lastShot
    ? interpolate(frame, [lastShot.end - CROSSFADE, lastShot.end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;
  const deviceOpacity = Math.min(deviceIn, deviceOut);

  const fadeOut =
    durationInFrames > 30
      ? interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 1;

  return (
    <AbsoluteFill style={{ fontFamily: sans, color: fg, opacity: fadeOut }}>
      <Backdrop bg={bg} accent={accent} />

      {/* Device + screen content (crossfades between shots). */}
      {deviceOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            top: areaTop,
            left: 0,
            right: 0,
            height: areaH,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            paddingRight: device === "phone" ? zone.right - zone.left : 0,
            opacity: deviceOpacity,
            transform: `translateY(${interpolate(deviceIn, [0, 1], [40, 0]) * unit}px)`,
          }}
        >
          <DeviceFrame device={device} accent={accent} screenWidth={screenW} screenHeight={screenH} url={url}>
            {shots.map(({ beat, start, end, index }, i) => {
              const from = i === 0 ? start : start - CROSSFADE;
              if (frame < from || frame >= end) return null;
              const fadeIn = i === 0 ? 1 : interpolate(frame, [start - CROSSFADE, start], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return (
                <Sequence key={index} from={from} durationInFrames={end - from} layout="none">
                  <AbsoluteFill style={{ opacity: fadeIn }}>
                    <ScreenContent beat={beat} accent={accent} screenWidth={screenW} screenHeight={screenH} layout={layout} />
                  </AbsoluteFill>
                </Sequence>
              );
            })}
          </DeviceFrame>
        </div>
      )}

      {/* Text layer. */}
      {ranges.map(({ beat, start, end, index }) => {
        if (frame < start || frame >= end) return null;
        const isShot = beat.kind === "shot";
        return (
          <Sequence key={index} from={start} durationInFrames={end - start} layout="none">
            <div
              style={{
                position: "absolute",
                left: zone.left,
                right: zone.right,
                ...(isShot
                  ? { bottom: zone.bottom, height: captionH, display: "flex", flexDirection: "column", justifyContent: "flex-end" }
                  : { top: zone.top, bottom: zone.bottom, display: "flex", flexDirection: "column", justifyContent: "center" }),
              }}
            >
              {isShot ? (
                <Caption
                  eyebrow={beat.eyebrow}
                  caption={beat.caption}
                  accent={accent}
                  fg={fg}
                  duration={beat.durationInFrames}
                  step={shots.findIndex((s) => s.index === index)}
                  totalSteps={totalSteps}
                  unit={unit}
                />
              ) : (
                <TitleCard
                  brand={brand}
                  eyebrow={beat.eyebrow}
                  caption={beat.caption}
                  sub={beat.kind === "outro" ? outroSub : undefined}
                  accent={accent}
                  fg={fg}
                  unit={unit}
                />
              )}
            </div>
          </Sequence>
        );
      })}

      {showSafeZones && <SafeZoneOverlay />}
    </AbsoluteFill>
  );
};
