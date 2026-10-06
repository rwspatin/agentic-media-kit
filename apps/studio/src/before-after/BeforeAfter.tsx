import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import { z } from "zod";
import { sans, serif } from "../theme";

// Before/after of a web page: intro → both versions scrolled in sync, section
// by section, with a caption per section → the same on a phone → an optional
// checklist of what changed → outro.
//
// Assets come from scripts/capture-before-after.sh: full-page captures split
// into <= 3000px JPG tiles plus a meta.json with each section's top offset.
// The visual language stays editorial on purpose (1px rules, corners <= 4px,
// no glow/shadow/blur, no gradient text) so it never competes with the pages.

const shotSchema = z.object({
  width: z.number(), // tile width in image px
  total: z.number(), // full capture height in image px
  anchors: z.array(z.number()), // section tops in image px, document order
  tiles: z.number().int(),
  tile: z.number().int(), // tile height in image px (last tile may be shorter)
});
export type Shot = z.infer<typeof shotSchema>;

const titleSchema = {
  eyebrow: z.string(),
  title: z.string(),
  titleAccent: z.string().optional(), // second line, italic in the accent color
  sub: z.string(),
};

export const beforeAfterSchema = z.object({
  accent: z.string(), // hex
  bg: z.string(),
  fg: z.string(),
  // Folder under public/ written by scripts/capture-before-after.sh.
  capturesDir: z.string(),
  beforeLabel: z.string(),
  afterLabel: z.string(),
  intro: z.object({ ...titleSchema, durationInFrames: z.number().int().positive().optional() }),
  desktop: z.object({
    // `section` indexes meta.json anchors (0 = first section). Both pages
    // arrive at that section when the beat starts and dwell for its duration.
    beats: z
      .array(
        z.object({
          section: z.number().int().nonnegative(),
          caption: z.string(),
          durationInFrames: z.number().int().positive(),
        }),
      )
      .min(1),
  }),
  // Skipped when absent or when there are no mobile captures.
  mobile: z
    .object({
      ...titleSchema,
      beats: z.array(z.object({ section: z.number().int().nonnegative(), durationInFrames: z.number().int().positive() })).min(1),
    })
    .optional(),
  checklist: z
    .object({
      title: z.string(),
      label: z.string(),
      flagLabel: z.string(), // stamp shown on flagged items, e.g. "fixed"
      items: z.array(z.object({ text: z.string(), flagged: z.boolean() })).min(1),
      summary: z.string(),
    })
    .optional(),
  outro: z.object({
    title: z.string(),
    titleAccent: z.string().optional(),
    left: z.string(),
    right: z.string(),
    durationInFrames: z.number().int().positive().optional(),
  }),
  // Filled in by calculateMetadata from `${capturesDir}/meta.json`. Leave unset.
  meta: z.record(z.string(), shotSchema).optional(),
});

export type BeforeAfterProps = z.infer<typeof beforeAfterSchema>;

const INTRO_LEN = 105;
const OUTRO_LEN = 120;
const FADE_OUT = 10;
const checklistLen = (n: number) => 120 + n * 7 + 110; // stamps land, summary reads

const hasMobile = (p: BeforeAfterProps) => Boolean(p.mobile && p.meta?.["before-mobile"] && p.meta?.["after-mobile"]);

const scenesFor = (p: BeforeAfterProps) => {
  const sum = (beats: { durationInFrames: number }[]) => beats.reduce((s, b) => s + b.durationInFrames, 0);
  return {
    intro: p.intro.durationInFrames ?? INTRO_LEN,
    desktop: sum(p.desktop.beats),
    mobile: hasMobile(p) && p.mobile ? sum(p.mobile.beats) : 0,
    checklist: p.checklist ? checklistLen(p.checklist.items.length) : 0,
    outro: p.outro.durationInFrames ?? OUTRO_LEN,
  };
};

// meta.json is fetched (not imported) so any capturesDir works via --props.
export const calculateBeforeAfterMetadata: CalculateMetadataFunction<BeforeAfterProps> = async ({ props }) => {
  let meta = props.meta;
  if (!meta) {
    const dir = props.capturesDir.replace(/^\/+|\/+$/g, "");
    const res = await fetch(staticFile(`${dir}/meta.json`));
    if (!res.ok) {
      throw new Error(
        `BeforeAfter: public/${dir}/meta.json not found (HTTP ${res.status}). ` +
          `Capture both versions first: scripts/capture-before-after.sh <before-url> <after-url> apps/studio/public/${dir}`,
      );
    }
    meta = (await res.json()) as Record<string, Shot>;
  }
  for (const key of ["before-desktop", "after-desktop"]) {
    if (!meta[key]) throw new Error(`BeforeAfter: "${key}" missing from ${props.capturesDir}/meta.json. Re-run the capture with "desktop" or "both".`);
  }
  const withMeta = { ...props, meta };
  const s = scenesFor(withMeta);
  return {
    durationInFrames: s.intro + s.desktop + s.mobile + s.checklist + s.outro,
    props: withMeta,
  };
};

/* ---------- palette + motion helpers ---------- */

const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const ease = Easing.bezier(0.16, 1, 0.3, 1);

// "#abc" | "#aabbcc" + alpha 0-1 -> "#aabbccAA"
const alpha = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  return `#${full}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
};

type Palette = { bg: string; fg: string; accent: string; muted: string; border: string };
const paletteFor = (p: BeforeAfterProps): Palette => ({
  bg: p.bg,
  fg: p.fg,
  accent: p.accent,
  muted: alpha(p.fg, 0.62),
  border: alpha(p.fg, 0.18),
});

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const fadeUp = (frame: number, start: number, dist = 24): React.CSSProperties => ({
  opacity: interpolate(frame, [start, start + 18], [0, 1], clamp),
  transform: `translateY(${interpolate(frame, [start, start + 24], [dist, 0], { ...clamp, easing: ease })}px)`,
});

// Layout units: sizes below are authored for 1920 wide (landscape) or 1080
// wide (portrait) and scaled with the canvas.
const useLayout = () => {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const u = width / (portrait ? 1080 : 1920);
  return { width, height, portrait, u };
};

/* ---------- page panel: tiled full-page capture, scrolled to y ---------- */

type Plan = { at: number; section: number }[];

// Scroll offset in image px: dwell on each section top, glide into the next
// one over the last frames before its beat starts.
const scrollFor = (shot: Shot, frame: number, plan: Plan, viewport: number) => {
  const max = Math.max(0, shot.total - viewport);
  const yOf = (s: number) => (s === 0 ? 0 : Math.min(max, shot.anchors[Math.min(s, shot.anchors.length - 1)] ?? 0));
  for (let i = 0; i < plan.length - 1; i++) {
    const a = plan[i];
    const b = plan[i + 1];
    if (frame <= b.at) {
      const glide = Math.min(22, b.at - a.at);
      return interpolate(frame, [b.at - glide, b.at], [yOf(a.section), yOf(b.section)], {
        ...clamp,
        easing: Easing.inOut(Easing.cubic),
      });
    }
  }
  return yOf(plan[plan.length - 1].section);
};

const planFor = (beats: { section: number; durationInFrames: number }[]): Plan => {
  let at = 0;
  const plan = beats.map((b) => {
    const step = { at, section: b.section };
    at += b.durationInFrames;
    return step;
  });
  plan.push({ at, section: beats[beats.length - 1].section });
  return plan;
};

const Page: React.FC<{
  dir: string;
  name: string;
  shot: Shot;
  width: number;
  height: number;
  y: number;
  c: Palette;
}> = ({ dir, name, shot, width, height, y, c }) => {
  const scale = width / shot.width;
  // Only mount tiles that intersect the visible window (+1 tile of margin).
  const first = Math.max(0, Math.floor(y / shot.tile) - 1);
  const last = Math.min(shot.tiles - 1, Math.floor((y + height / scale) / shot.tile) + 1);
  const tiles = [];
  for (let i = first; i <= last; i++) tiles.push(i);
  return (
    <div
      style={{
        width,
        height,
        overflow: "hidden",
        position: "relative",
        border: `1px solid ${c.border}`,
        borderRadius: 4,
        background: c.bg,
      }}
    >
      {tiles.map((i) => (
        <Img
          key={i}
          src={staticFile(`${dir}/${name}-${i}.jpg`)}
          style={{
            position: "absolute",
            left: 0,
            top: (i * shot.tile - y) * scale,
            width,
            display: "block",
          }}
        />
      ))}
    </div>
  );
};

const Label: React.FC<{ children: React.ReactNode; c: Palette; accent?: boolean; size?: number }> = ({
  children,
  c,
  accent,
  size = 22,
}) => (
  <div
    style={{
      fontFamily: MONO,
      fontSize: size,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: accent ? c.accent : c.muted,
    }}
  >
    {children}
  </div>
);

const Title: React.FC<{ title: string; titleAccent?: string; size: number; c: Palette; style?: React.CSSProperties }> = ({
  title,
  titleAccent,
  size,
  c,
  style,
}) => (
  <div
    style={{
      fontFamily: serif,
      fontWeight: 500,
      fontSize: size,
      lineHeight: 1.04,
      letterSpacing: "-0.03em",
      color: c.fg,
      textWrap: "balance",
      ...style,
    }}
  >
    {title}
    {titleAccent ? (
      <>
        <br />
        <span style={{ fontStyle: "italic", color: c.accent }}>{titleAccent}</span>
      </>
    ) : null}
  </div>
);

// Each scene fades out over its last frames so cuts read as one piece.
const SceneFade: React.FC<{ len: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ len, children, style }) => {
  const f = useCurrentFrame();
  const fadeOut = interpolate(f, [len - FADE_OUT, len], [1, 0], clamp);
  return <AbsoluteFill style={{ ...style, opacity: fadeOut * Number(style?.opacity ?? 1) }}>{children}</AbsoluteFill>;
};

/* ---------- 1 · Intro ---------- */

const Intro: React.FC<{ p: BeforeAfterProps; c: Palette; len: number }> = ({ p, c, len }) => {
  const f = useCurrentFrame();
  const { portrait, u } = useLayout();
  const pad = (portrait ? 80 : 160) * u;
  return (
    <SceneFade len={len} style={{ padding: `0 ${pad}px`, justifyContent: "center" }}>
      <div style={fadeUp(f, 0)}>
        <Label c={c} accent size={22 * u}>
          {p.intro.eyebrow}
        </Label>
      </div>
      <Title
        title={p.intro.title}
        titleAccent={p.intro.titleAccent}
        size={(portrait ? 96 : 104) * u}
        c={c}
        style={{ ...fadeUp(f, 8, 36), marginTop: 36 * u }}
      />
      <div style={{ ...fadeUp(f, 26), height: 1, background: c.border, marginTop: 64 * u }} />
      <div style={{ ...fadeUp(f, 32), fontFamily: sans, fontSize: 34 * u, lineHeight: 1.4, color: c.muted, marginTop: 28 * u }}>
        {p.intro.sub}
      </div>
    </SceneFade>
  );
};

/* ---------- 2 · Desktop, scrolled in sync ---------- */

const Desktop: React.FC<{ p: BeforeAfterProps; c: Palette; len: number }> = ({ p, c, len }) => {
  const f = useCurrentFrame();
  const { width, height, portrait, u } = useLayout();
  const meta = p.meta!;
  const before = meta["before-desktop"];
  const after = meta["after-desktop"];
  const beats = p.desktop.beats;
  const plan = planFor(beats);

  const side = 48 * u;
  const top = (portrait ? 48 : 56) * u;
  const labelH = 40 * u;
  const captionH = (portrait ? 230 : 196) * u;
  const gap = (portrait ? 28 : 48) * u;
  // Landscape: panels side by side. Portrait: stacked.
  const panelW = portrait ? width - 2 * side : (width - 2 * side - gap) / 2;
  const panelH = portrait
    ? (height - top - captionH - 2 * labelH - gap - 24 * u) / 2
    : height - top - labelH - captionH - 32 * u;

  const yB = scrollFor(before, f, plan, panelH / (panelW / before.width));
  const yA = scrollFor(after, f, plan, panelH / (panelW / after.width));
  const idx = plan.reduce((last, s, i) => (i < beats.length && f >= s.at - 10 ? i : last), 0);
  const caption = beats[idx].caption;
  const captionStart = plan[idx].at - 10;

  const panel = (v: "before" | "after") => (
    <div key={v}>
      <div style={{ height: labelH }}>
        <Label c={c} accent={v === "after"} size={22 * u}>
          {v === "before" ? p.beforeLabel : p.afterLabel}
        </Label>
      </div>
      <Page
        dir={p.capturesDir}
        name={`${v}-desktop`}
        shot={v === "before" ? before : after}
        width={panelW}
        height={panelH}
        y={v === "before" ? yB : yA}
        c={c}
      />
    </div>
  );

  return (
    <SceneFade len={len} style={{ padding: `${top}px ${side}px 0`, ...fadeUp(f, 0, 0) }}>
      <div style={{ display: "flex", flexDirection: portrait ? "column" : "row", gap }}>
        {panel("before")}
        {panel("after")}
      </div>
      <div
        style={{
          position: "absolute",
          left: side,
          right: side,
          bottom: 0,
          height: captionH,
          borderTop: `1px solid ${c.border}`,
          display: "flex",
          alignItems: "center",
          padding: `0 ${18 * u}px`,
        }}
      >
        {caption ? (
          <div
            key={idx}
            style={{
              ...fadeUp(f, captionStart, 12),
              fontFamily: serif,
              fontWeight: 500,
              fontSize: (portrait ? 46 : 50) * u,
              lineHeight: 1.18,
              color: c.fg,
              letterSpacing: "-0.02em",
              textWrap: "balance",
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
    </SceneFade>
  );
};

/* ---------- 3 · Phone ---------- */

const Mobile: React.FC<{ p: BeforeAfterProps; c: Palette; len: number }> = ({ p, c, len }) => {
  const f = useCurrentFrame();
  const { width, height, portrait, u } = useLayout();
  const m = p.mobile!;
  const meta = p.meta!;
  const before = meta["before-mobile"];
  const after = meta["after-mobile"];
  const plan = planFor(m.beats);
  const labelH = 40 * u;

  // Phone-shaped panels: 390 CSS px wide pages at a readable size.
  const gap = (portrait ? 40 : 56) * u;
  const panelW = portrait ? (width - 2 * 48 * u - gap) / 2 : 420 * u;
  const panelH = portrait ? height - 470 * u - labelH - 56 * u : height - 2 * 90 * u - labelH;

  const yB = scrollFor(before, f, plan, panelH / (panelW / before.width));
  const yA = scrollFor(after, f, plan, panelH / (panelW / after.width));

  const text = (
    <div style={{ flex: portrait ? undefined : 1, height: portrait ? 470 * u : undefined, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={fadeUp(f, 0)}>
        <Label c={c} size={22 * u}>
          {m.eyebrow}
        </Label>
      </div>
      <Title title={m.title} titleAccent={m.titleAccent} size={(portrait ? 76 : 92) * u} c={c} style={{ ...fadeUp(f, 6, 30), marginTop: 24 * u }} />
      <div
        style={{
          ...fadeUp(f, 14),
          fontFamily: sans,
          fontSize: (portrait ? 30 : 32) * u,
          lineHeight: 1.5,
          color: c.muted,
          marginTop: 28 * u,
          maxWidth: 620 * u,
          textWrap: "pretty",
        }}
      >
        {m.sub}
      </div>
    </div>
  );

  const phone = (v: "before" | "after") => (
    <div key={v} style={fadeUp(f, v === "before" ? 4 : 10, 30)}>
      <div style={{ height: labelH }}>
        <Label c={c} accent={v === "after"} size={22 * u}>
          {v === "before" ? p.beforeLabel : p.afterLabel}
        </Label>
      </div>
      <Page
        dir={p.capturesDir}
        name={`${v}-mobile`}
        shot={v === "before" ? before : after}
        width={panelW}
        height={panelH}
        y={v === "before" ? yB : yA}
        c={c}
      />
    </div>
  );

  return portrait ? (
    <SceneFade len={len} style={{ padding: `0 ${48 * u}px` }}>
      {text}
      <div style={{ display: "flex", gap }}>
        {phone("before")}
        {phone("after")}
      </div>
    </SceneFade>
  ) : (
    <SceneFade len={len} style={{ flexDirection: "row", alignItems: "center", padding: `0 ${120 * u}px`, gap: 80 * u }}>
      {text}
      <div style={{ display: "flex", gap }}>
        {phone("before")}
        {phone("after")}
      </div>
    </SceneFade>
  );
};

/* ---------- 4 · Checklist ---------- */

const Checklist: React.FC<{ p: BeforeAfterProps; c: Palette; len: number }> = ({ p, c, len }) => {
  const f = useCurrentFrame();
  const { portrait, u } = useLayout();
  const list = p.checklist!;
  const items = list.items;
  const cols = portrait ? 1 : 2;
  const rows = Math.ceil(items.length / cols);
  const lastStamp = 70 + (items.length - 1) * 7;
  return (
    <SceneFade len={len} style={{ padding: portrait ? `${96 * u}px ${56 * u}px` : `${90 * u}px ${140 * u}px`, justifyContent: "center" }}>
      <div
        style={{
          display: "flex",
          flexDirection: portrait ? "column" : "row",
          justifyContent: "space-between",
          alignItems: portrait ? "flex-start" : "baseline",
          gap: 16 * u,
          ...fadeUp(f, 0),
        }}
      >
        <div style={{ fontFamily: serif, fontWeight: 500, fontSize: (portrait ? 72 : 80) * u, letterSpacing: "-0.03em", color: c.fg }}>
          {list.title}
        </div>
        <Label c={c} size={22 * u}>
          {list.label}
        </Label>
      </div>
      <div
        style={{
          marginTop: 40 * u,
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          borderTop: `1px solid ${c.border}`,
          borderLeft: `1px solid ${c.border}`,
        }}
      >
        {items.map((item, i) => {
          // Fill column by column so numbering reads top to bottom.
          const row = i % rows;
          const col = Math.floor(i / rows);
          const start = 10 + row * 5 + col * 3;
          const mark = 70 + i * 7;
          return (
            <div
              key={i}
              style={{
                gridColumn: col + 1,
                gridRow: row + 1,
                borderRight: `1px solid ${c.border}`,
                borderBottom: `1px solid ${c.border}`,
                padding: `${(portrait ? 20 : 22) * u}px ${28 * u}px`,
                display: "flex",
                alignItems: "center",
                gap: 24 * u,
                ...fadeUp(f, start, 10),
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 22 * u, color: c.muted, width: 40 * u, flexShrink: 0 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ fontFamily: sans, fontSize: (portrait ? 30 : 30) * u, lineHeight: 1.3, color: c.fg, flex: 1 }}>{item.text}</span>
              {item.flagged ? (
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 19 * u,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: c.accent,
                    border: `1px solid ${c.accent}`,
                    borderRadius: 2,
                    padding: `${6 * u}px ${12 * u}px`,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    opacity: interpolate(f, [mark, mark + 8], [0, 1], clamp),
                  }}
                >
                  {list.flagLabel}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div
        style={{
          ...fadeUp(f, lastStamp + 24),
          fontFamily: serif,
          fontWeight: 500,
          fontSize: (portrait ? 46 : 52) * u,
          lineHeight: 1.15,
          color: c.fg,
          marginTop: 48 * u,
          letterSpacing: "-0.02em",
          textWrap: "balance",
        }}
      >
        {list.summary}
      </div>
    </SceneFade>
  );
};

/* ---------- 5 · Outro ---------- */

const Outro: React.FC<{ p: BeforeAfterProps; c: Palette; len: number }> = ({ p, c, len }) => {
  const f = useCurrentFrame();
  const { portrait, u } = useLayout();
  const fadeOut = interpolate(f, [len - 15, len], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ padding: `0 ${(portrait ? 80 : 160) * u}px`, justifyContent: "center", opacity: fadeOut }}>
      <Title title={p.outro.title} titleAccent={p.outro.titleAccent} size={(portrait ? 100 : 120) * u} c={c} style={fadeUp(f, 0, 30)} />
      <div style={{ ...fadeUp(f, 12), height: 1, background: c.border, marginTop: 56 * u }} />
      <div
        style={{
          ...fadeUp(f, 18),
          display: "flex",
          flexDirection: portrait ? "column" : "row",
          gap: 16 * u,
          justifyContent: "space-between",
          marginTop: 28 * u,
        }}
      >
        <Label c={c} size={22 * u}>
          {p.outro.left}
        </Label>
        <Label c={c} accent size={22 * u}>
          {p.outro.right}
        </Label>
      </div>
    </AbsoluteFill>
  );
};

/* ---------- composition ---------- */

export const BeforeAfter: React.FC<BeforeAfterProps> = (p) => {
  const c = paletteFor(p);
  if (!p.meta) {
    // calculateMetadata always fills this; only reachable if it was bypassed.
    return <AbsoluteFill style={{ background: c.bg }} />;
  }
  const s = scenesFor(p);
  let at = 0;
  const seq = (len: number, el: React.ReactNode) => {
    if (len <= 0) return null;
    const from = at;
    at += len;
    return (
      <Sequence from={from} durationInFrames={len}>
        {el}
      </Sequence>
    );
  };
  return (
    <AbsoluteFill style={{ background: c.bg, color: c.fg, fontFamily: sans }}>
      {seq(s.intro, <Intro p={p} c={c} len={s.intro} />)}
      {seq(s.desktop, <Desktop p={p} c={c} len={s.desktop} />)}
      {seq(s.mobile, <Mobile p={p} c={c} len={s.mobile} />)}
      {seq(s.checklist, <Checklist p={p} c={c} len={s.checklist} />)}
      {seq(s.outro, <Outro p={p} c={c} len={s.outro} />)}
    </AbsoluteFill>
  );
};
