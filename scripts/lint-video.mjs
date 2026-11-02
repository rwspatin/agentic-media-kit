#!/usr/bin/env node
// Composition lint for Tour-* props: numeric rules a reviewer would otherwise
// eyeball (shot length, reading speed, narration pace, zoom budget, safe
// zones, font sizes). Node >= 18, no deps. Exit 1 if any rule is an error.
// Rules and rationale: docs/review.md.
//
// Usage:
//   node scripts/lint-video.mjs <props.json> [--composition Tour-Reel|Tour-Feed] [--fps 30] [--json]
//   node scripts/lint-video.mjs --rules        # print the rules table
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- Thresholds (keep docs/review.md in sync) ---------------------------
const MIN_SHOT_FRAMES = 45; // 1.5 s at 30 fps
const CAPTION_WPS_WARN = 2.5; // words per second of beat
const CAPTION_WPS_MAX = 3.0;
const NARRATION_WPS_MAX = 2.7; // words per second of voice
const REEL_MAX_FRAMES = 2700; // 90 s at 30 fps
const ZOOM_MAX = 1.15;
const ZOOMS_PER_SHOTS = 0.5; // highlight budget: 1 zoom per 2 shots (rounded up)
const CAPTION_MAX_CHARS = 90;
const EYEBROW_MAX_CHARS = 24;
const VOICE_LEAD = 6; // frames; keep in sync with ScreenTour.tsx

const RULES = [
  ["min-shot", "error", `every beat lasts >= ${MIN_SHOT_FRAMES} frames (${MIN_SHOT_FRAMES / 30} s at 30 fps)`],
  ["caption-rate", "error", `caption words / beat seconds <= ${CAPTION_WPS_MAX} (warn from ${CAPTION_WPS_WARN})`],
  ["caption-length", "error", `caption <= ${CAPTION_MAX_CHARS} characters`],
  ["eyebrow-length", "error", `eyebrow <= ${EYEBROW_MAX_CHARS} characters`],
  ["narration-rate", "warn", `narration words / voice seconds <= ${NARRATION_WPS_MAX}`],
  ["voice-fit", "error", `VOICE_LEAD (${VOICE_LEAD} frames) + voice duration fits inside its beat`],
  ["voice-needs-narration", "error", "a voice mode has narration on at least one beat"],
  ["narration-unvoiced", "warn", "in a voice mode, every beat with narration has a generated voice (run scripts/audio.mjs)"],
  ["reel-length", "error", `Tour-Reel total <= ${REEL_MAX_FRAMES} frames (90 s at 30 fps)`],
  ["zoom-max", "error", `zoom from/to <= ${ZOOM_MAX}`],
  ["zoom-budget", "warn", `zooms <= ceil(shots x ${ZOOMS_PER_SHOTS}): at most 1 highlight per 2 shots`],
  ["safe-zones", "error", "showSafeZones is false (it's a preview overlay)"],
  ["font-min", "error", "every overlay font size in apps/studio/src/type-scale.json >= minPx (28) at 1080 wide"],
];

const argv = process.argv.slice(2);
if (argv.includes("--rules")) {
  console.log("id                      severity  rule");
  for (const [id, sev, text] of RULES) console.log(`${id.padEnd(22)}  ${sev.padEnd(8)}  ${text}`);
  process.exit(0);
}
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const asJson = argv.includes("--json") && Boolean(argv.splice(argv.indexOf("--json"), 1));
const composition = opt("composition", "Tour-Reel");
const fps = Number(opt("fps", "30"));
const [propsPath] = argv;
if (!propsPath) {
  console.error("usage: node scripts/lint-video.mjs <props.json> [--composition Tour-Reel|Tour-Feed] [--fps 30] [--json] | --rules");
  process.exit(2);
}

const props = JSON.parse(readFileSync(propsPath, "utf8"));
const beats = Array.isArray(props.beats) ? props.beats : [];
const findings = [];
const add = (id, severity, beat, message) => findings.push({ id, severity, beat, message });
const words = (s) => (s ?? "").trim().split(/\s+/).filter(Boolean).length;
const sec = (frames) => frames / fps;
const mode = props.audio?.mode ?? "captions";
const voiceMode = mode.includes("voice");

beats.forEach((b, i) => {
  const n = i + 1;
  const d = b.durationInFrames;
  if (d < MIN_SHOT_FRAMES) add("min-shot", "error", n, `${b.kind} is ${d} frames (${sec(d).toFixed(2)} s); minimum ${MIN_SHOT_FRAMES}`);

  const wps = words(b.caption) / sec(d);
  if (wps > CAPTION_WPS_MAX) add("caption-rate", "error", n, `caption reads at ${wps.toFixed(2)} words/s (> ${CAPTION_WPS_MAX}): shorten it or lengthen the beat`);
  else if (wps >= CAPTION_WPS_WARN) add("caption-rate", "warn", n, `caption reads at ${wps.toFixed(2)} words/s (>= ${CAPTION_WPS_WARN})`);
  if ((b.caption ?? "").length > CAPTION_MAX_CHARS) add("caption-length", "error", n, `caption is ${b.caption.length} chars (> ${CAPTION_MAX_CHARS})`);
  if ((b.eyebrow ?? "").length > EYEBROW_MAX_CHARS) add("eyebrow-length", "error", n, `eyebrow is ${b.eyebrow.length} chars (> ${EYEBROW_MAX_CHARS})`);

  if (b.voice && voiceMode) {
    const nps = words(b.narration) / b.voice.durationSec;
    if (nps > NARRATION_WPS_MAX) add("narration-rate", "warn", n, `narration runs at ${nps.toFixed(2)} words/s (> ${NARRATION_WPS_MAX}): fewer words`);
    const need = VOICE_LEAD / fps + b.voice.durationSec;
    if (need > sec(d)) add("voice-fit", "error", n, `voice needs ${need.toFixed(2)} s (lead + clip) but the beat is ${sec(d).toFixed(2)} s`);
  } else if (voiceMode && b.narration?.trim()) {
    add("narration-unvoiced", "warn", n, "has narration but no generated voice");
  }

  for (const k of ["from", "to"]) {
    if (b.zoom && b.zoom[k] > ZOOM_MAX) add("zoom-max", "error", n, `zoom ${k} is ${b.zoom[k]} (> ${ZOOM_MAX}): pushes past the capture's sharpness`);
  }
});

if (voiceMode && !beats.some((b) => b.narration?.trim())) add("voice-needs-narration", "error", null, `mode "${mode}" has no beat with narration`);

const total = beats.reduce((s, b) => s + b.durationInFrames, 0);
if (composition === "Tour-Reel" && total > REEL_MAX_FRAMES) add("reel-length", "error", null, `total ${total} frames (${sec(total).toFixed(1)} s) > ${REEL_MAX_FRAMES}`);

const shots = beats.filter((b) => b.kind === "shot");
const zooms = shots.filter((b) => b.zoom && b.zoom.to !== b.zoom.from);
const budget = Math.ceil(shots.length * ZOOMS_PER_SHOTS);
if (zooms.length > budget) {
  const last = beats.indexOf(zooms[zooms.length - 1]) + 1;
  add("zoom-budget", "warn", last, `${zooms.length} zooms over ${shots.length} shots (budget ${budget}): keep zooms for the moments that matter`);
}

if (props.showSafeZones) add("safe-zones", "error", null, "showSafeZones is true: turn it off before the final render");

const type = JSON.parse(readFileSync(join(ROOT, "apps/studio/src/type-scale.json"), "utf8"));
for (const group of ["tour", "subtitles"]) {
  for (const [name, px] of Object.entries(type[group] ?? {})) {
    if (px < type.minPx) add("font-min", "error", null, `${group}.${name} is ${px} px at 1080 wide (< ${type.minPx})`);
  }
}

// --- Report -------------------------------------------------------------
const errors = findings.filter((f) => f.severity === "error").length;
const warns = findings.length - errors;
if (asJson) {
  console.log(JSON.stringify({ errors, warnings: warns, findings }, null, 2));
} else {
  for (const f of findings) {
    console.log(`${f.severity.padEnd(5)}  ${f.id.padEnd(22)}  ${f.beat === null ? "  -    " : `beat ${String(f.beat).padEnd(2)}`}  ${f.message}`);
  }
  console.log(`${propsPath}: ${composition} @ ${fps} fps, ${beats.length} beats, ${sec(total).toFixed(1)} s, mode ${mode}: ${errors} error(s), ${warns} warning(s)`);
}
process.exit(errors ? 1 : 0);
