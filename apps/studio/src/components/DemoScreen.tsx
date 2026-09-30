import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { sans } from "../theme";

// A generated, brand-neutral fake app UI so the template renders something
// meaningful before you drop in real screenshots or recordings. It is drawn
// entirely in React (no image assets), at a fixed logical width, then scaled
// to whatever screen size the device frame gives it.

type Variant = "dashboard" | "list" | "success";

const INK = "#0f1424";
const MUTED = "#6b7390";
const LINE = "#e6e9f2";
const SURFACE = "#ffffff";
const CANVAS = "#f5f7fb";

const useGrow = (delay: number) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  if (durationInFrames <= 1) return 1;
  return spring({ frame: frame - delay, fps, config: { damping: 18, mass: 0.6 } });
};

const Bar: React.FC<{ h: number; i: number; accent: string }> = ({ h, i, accent }) => {
  const g = useGrow(6 + i * 3);
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "flex-end", height: "100%" }}>
      <div
        style={{
          width: "100%",
          height: `${h * g}%`,
          borderRadius: 6,
          background: i === 7 ? accent : `${accent}40`,
        }}
      />
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; delta: string; accent: string }> = ({ label, value, delta, accent }) => (
  <div style={{ flex: 1, background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 14, padding: 16 }}>
    <div style={{ fontSize: 13, color: MUTED, fontWeight: 500 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 700, color: INK, marginTop: 6, letterSpacing: -0.5 }}>{value}</div>
    <div style={{ fontSize: 12, color: accent, fontWeight: 600, marginTop: 4 }}>{delta}</div>
  </div>
);

const Dashboard: React.FC<{ accent: string; wide: boolean }> = ({ accent, wide }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={{ fontSize: 24, fontWeight: 700, color: INK, letterSpacing: -0.4 }}>Overview</div>
    <div style={{ display: "flex", gap: 12 }}>
      <Stat label="Active users" value="12.4k" delta="+18% this week" accent={accent} />
      <Stat label="Conversion" value="4.9%" delta="+0.6 pts" accent={accent} />
      {wide && <Stat label="Revenue" value="$38.2k" delta="+11%" accent={accent} />}
    </div>
    <div style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 13, color: MUTED, fontWeight: 500, marginBottom: 12 }}>Weekly signups</div>
      <div style={{ display: "flex", gap: 8, height: wide ? 220 : 180 }}>
        {[38, 52, 45, 60, 58, 72, 66, 92].map((h, i) => (
          <Bar key={i} h={h} i={i} accent={accent} />
        ))}
      </div>
    </div>
  </div>
);

const ROWS = [
  { title: "Onboarding flow", meta: "Updated 2m ago", tag: "Live" },
  { title: "Pricing page A/B", meta: "Updated 1h ago", tag: "Review" },
  { title: "Checkout redesign", meta: "Updated today", tag: "Draft" },
  { title: "Mobile nav", meta: "Updated yesterday", tag: "Live" },
  { title: "Empty states", meta: "Updated Mon", tag: "Draft" },
];

const Row: React.FC<{ i: number; accent: string; title: string; meta: string; tag: string }> = ({ i, accent, title, meta, tag }) => {
  const g = useGrow(4 + i * 5);
  const highlighted = i === 1;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: 14,
        borderRadius: 14,
        background: SURFACE,
        border: `1px solid ${highlighted ? accent : LINE}`,
        boxShadow: highlighted ? `0 8px 24px -10px ${accent}88` : undefined,
        opacity: g,
        transform: `translateX(${interpolate(g, [0, 1], [30, 0])}px)`,
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${accent}${highlighted ? "" : "30"}` }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: INK }}>{title}</div>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{meta}</div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: highlighted ? accent : MUTED, border: `1px solid ${LINE}`, borderRadius: 999, padding: "4px 10px" }}>
        {tag}
      </div>
    </div>
  );
};

const List: React.FC<{ accent: string }> = ({ accent }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ fontSize: 24, fontWeight: 700, color: INK, letterSpacing: -0.4, marginBottom: 6 }}>Projects</div>
    {ROWS.map((r, i) => (
      <Row key={r.title} i={i} accent={accent} {...r} />
    ))}
  </div>
);

const Success: React.FC<{ accent: string }> = ({ accent }) => {
  const g = useGrow(4);
  const check = useGrow(14);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 80, gap: 18 }}>
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: 999,
          background: `${accent}22`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${g})`,
        }}
      >
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke={accent}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="24"
            strokeDashoffset={24 * (1 - check)}
          />
        </svg>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: INK, letterSpacing: -0.5 }}>You're all set</div>
      <div style={{ fontSize: 16, color: MUTED, maxWidth: 280, lineHeight: 1.45 }}>
        Your changes are live. We'll notify your team.
      </div>
      <div style={{ marginTop: 10, background: accent, color: "white", fontWeight: 600, fontSize: 16, padding: "14px 28px", borderRadius: 12 }}>
        Go to dashboard
      </div>
    </div>
  );
};

export const DemoScreen: React.FC<{
  variant: Variant;
  accent: string;
  screenWidth: number;
  screenHeight: number;
  layout: "mobile" | "desktop";
}> = ({ variant, accent, screenWidth, screenHeight, layout }) => {
  const logicalW = layout === "mobile" ? 390 : 1100;
  const scale = screenWidth / logicalW;
  const logicalH = screenHeight / scale;
  const wide = layout === "desktop";
  return (
    <div
      style={{
        // Absolutely positioned so a flex parent can't shrink the logical
        // canvas before it is scaled up to the screen size.
        position: "absolute",
        top: 0,
        left: 0,
        width: logicalW,
        height: logicalH,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        background: CANVAS,
        fontFamily: sans,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: wide ? 56 : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          // Mobile leaves room for the status bar / notch.
          padding: wide ? "0 28px" : "52px 20px 14px",
          background: SURFACE,
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: accent }} />
          <div style={{ fontWeight: 700, fontSize: 16, color: INK }}>Acme</div>
        </div>
        <div style={{ width: 30, height: 30, borderRadius: 999, background: LINE }} />
      </div>
      <div style={{ padding: wide ? 28 : 20 }}>
        {variant === "dashboard" && <Dashboard accent={accent} wide={wide} />}
        {variant === "list" && <List accent={accent} />}
        {variant === "success" && <Success accent={accent} />}
      </div>
    </div>
  );
};
