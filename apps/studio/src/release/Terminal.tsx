import React from "react";
import { interpolate } from "remotion";
import { C, mono } from "../launch/theme";

// The launch terminal (src/launch/Terminal.tsx), generalised: the script is a
// prop, so one component replays any sequence of kit commands. `t` is a local
// time in the script's own frames; callers scale it to their beat (see
// `scriptTime` in Release.tsx) so the replay always fits the scene.
export type TermLine =
  | { kind: "cmd"; text: string; at: number; step?: number }
  | { kind: "out"; text: string; at: number; ok?: boolean; accent?: boolean }
  | { kind: "progress"; label: string; at: number; until: number; total: number; suffix: string };

const CHARS_PER_FRAME = 3.6;
const typeEnd = (l: Extract<TermLine, { kind: "cmd" }>) => l.at + Math.ceil(l.text.length / CHARS_PER_FRAME);

export const activeStepOf = (script: TermLine[], t: number) =>
  script.reduce((step, l) => (l.kind === "cmd" && l.step !== undefined && t >= l.at ? l.step : step), -1);

export const ReleaseTerminal: React.FC<{
  script: TermLine[];
  t: number;
  width: number;
  fontSize: number;
  title?: string;
  idlePrompt?: boolean; // show an empty prompt once the script is done
}> = ({ script, t, width, fontSize, title = "~/agentic-media-kit — zsh", idlePrompt = true }) => {
  const lh = Math.round(fontSize * 1.55);
  const visible = script.filter((l) => t >= l.at);
  const last = visible[visible.length - 1];
  const typing = last?.kind === "cmd" && t < typeEnd(last);
  const cursorOn = Math.floor(t / 14) % 2 === 0 || typing;

  const cursor = (
    <span
      style={{
        display: "inline-block",
        width: fontSize * 0.6,
        height: fontSize * 1.1,
        marginLeft: 2,
        verticalAlign: "text-bottom",
        background: C.signal,
        opacity: cursorOn ? 1 : 0,
      }}
    />
  );

  return (
    <div
      style={{
        width,
        borderRadius: 22,
        background: `linear-gradient(180deg, ${C.ink2}, #11100d)`,
        border: `1px solid ${C.line}`,
        boxShadow: `0 50px 100px -40px rgba(0,0,0,0.9), inset 0 1px 0 rgba(239,232,218,0.05)`,
        overflow: "hidden",
        fontFamily: mono,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: `${fontSize * 0.7}px ${fontSize}px`,
          borderBottom: `1px solid ${C.line}`,
          color: C.muted,
          fontSize: fontSize * 0.78,
          letterSpacing: "0.04em",
        }}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 13, height: 13, borderRadius: 999, border: `2px solid ${C.dim}` }} />
        ))}
        <span style={{ marginLeft: 14 }}>{title}</span>
      </div>
      <div style={{ padding: `${fontSize * 0.9}px ${fontSize}px ${fontSize * 1.1}px`, fontSize, lineHeight: `${lh}px` }}>
        {visible.map((l, i) => {
          const isLast = i === visible.length - 1;
          if (l.kind === "cmd") {
            const n = Math.min(l.text.length, Math.floor((t - l.at) * CHARS_PER_FRAME));
            return (
              <div key={i} style={{ color: C.paper, marginTop: i === 0 ? 0 : lh * 0.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                <span style={{ color: C.signal, fontWeight: 700 }}>$ </span>
                {l.text.slice(0, n)}
                {isLast && cursor}
              </div>
            );
          }
          if (l.kind === "progress") {
            const p = interpolate(t, [l.at, l.until], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const cells = 12;
            const filled = Math.round(p * cells);
            return (
              <div key={i} style={{ color: C.muted, paddingLeft: fontSize * 1.2 }}>
                <span style={{ color: C.signal }}>{"█".repeat(filled)}</span>
                <span style={{ color: C.line }}>{"█".repeat(cells - filled)}</span>
                <span style={{ color: C.paper }}> {Math.round(p * 100)}%</span>
                <span>
                  {" "}
                  {l.label} {Math.round(p * l.total)}/{l.total} {l.suffix}
                </span>
              </div>
            );
          }
          return (
            <div key={i} style={{ color: l.accent ? C.signal : l.ok ? C.paper : C.muted, paddingLeft: fontSize * 1.2 }}>
              {l.ok ? <span style={{ color: C.signal }}>✓ </span> : <span style={{ color: C.dim }}>▸ </span>}
              {l.text}
            </div>
          );
        })}
        {idlePrompt && last && !typing && last.kind !== "cmd" && t > script[script.length - 1].at + 8 && (
          <div style={{ marginTop: lh * 0.45, color: C.paper }}>
            <span style={{ color: C.signal, fontWeight: 700 }}>$ </span>
            {cursor}
          </div>
        )}
      </div>
    </div>
  );
};
