#!/usr/bin/env node
// Check that the cuts land on the music: detect onsets in the audio of a
// render (or a WAV) and report each cut's offset to the nearest onset and to
// the theoretical beat grid. Exits 1 if any |onset offset| > 40 ms or a cut
// has no onset near it. Node >= 18, no npm deps; needs ffmpeg on PATH.
// The idea comes from the teardown skill's wave.mjs (elvarofficial/teardown, MIT).
//
// Usage:
//   node scripts/check-beats.mjs <video.mp4|music.wav> <timeline.json> [--tolerance 40]
//
// timeline.json is the one scripts/audio.mjs writes next to the music
// (apps/studio/public/audio/<slug>/timeline.json): { bpm, durationSec, cuts: [sec...] }.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const ti = argv.indexOf("--tolerance");
const TOLERANCE_MS = ti === -1 ? 40 : Number(argv.splice(ti, 2)[1]);
const [input, timelinePath] = argv;
if (!input || !timelinePath || !existsSync(input) || !existsSync(timelinePath)) {
  console.error("usage: node scripts/check-beats.mjs <video.mp4|music.wav> <timeline.json> [--tolerance 40]");
  process.exit(2);
}
const tl = JSON.parse(readFileSync(timelinePath, "utf8"));
if (!tl.bpm || !Array.isArray(tl.cuts)) {
  console.error(`${timelinePath}: needs "bpm" and "cuts" (written by scripts/audio.mjs with --music procedural)`);
  process.exit(2);
}

// --- Decode to mono float PCM -------------------------------------------
const SR = 24000;
const raw = execFileSync("ffmpeg", ["-v", "error", "-i", input, "-vn", "-ac", "1", "-af", "highpass=f=1800,highpass=f=1800", "-ar", String(SR), "-f", "f32le", "-"], {
  maxBuffer: 1 << 30,
});
// A raw Remotion MP4 decodes with 2048 samples (48 kHz) of AAC priming in
// front (see scripts/webm-to-mp4.sh, which trims it for publishing). Skip it
// here too so a raw render and its -ig.mp4 measure the same.
let comment = "";
try {
  comment = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format_tags=comment", "-of", "csv=p=0", input], { encoding: "utf8" });
} catch {}
const priming = /^Made with Remotion [\d.]+\s*$/.test(comment) && /\.(mp4|mov|m4v)$/i.test(input) ? Number(process.env.AAC_PRIMING_SAMPLES ?? 2048) : 0;
const skip = Math.round((priming * SR) / 48000);
const pcm = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4)).subarray(skip);
if (priming) console.log(`note: raw Remotion render, skipping ${priming} samples of AAC priming (${((priming / 48000) * 1000).toFixed(1)} ms)`);
if (pcm.length === 0) {
  console.error(`${input}: no audio stream`);
  process.exit(2);
}

// --- Onset detection ----------------------------------------------------
// Log energy in short windows (N samples, hop H). The onset function is the
// rise from the window just before (no overlap): an attack at time T peaks
// it when the current window starts at T. Onsets are local maxima of that
// rise within +-PEAK_WIN, at least MIN_RISE_DB high.
const N = 192; // 8 ms
const H = 24; // 1 ms
const D = N / H; // compare with the adjacent, non-overlapping window
const MIN_RISE_DB = 6;
const PEAK_WIN = 30; // frames (~30 ms) either side
const frames = Math.floor((pcm.length - N) / H);
// Prefix sum of squares for O(1) windows.
const cs = new Float64Array(pcm.length + 1);
for (let i = 0; i < pcm.length; i++) cs[i + 1] = cs[i] + pcm[i] * pcm[i];
const L = new Float64Array(frames);
for (let f = 0; f < frames; f++) L[f] = 10 * Math.log10((cs[f * H + N] - cs[f * H]) / N + 1e-10);
const odf = new Float64Array(frames);
for (let f = D; f < frames; f++) odf[f] = L[f] > -60 ? Math.max(0, L[f] - L[f - D]) : 0;
const onsets = [];
for (let f = D; f < frames; f++) {
  if (odf[f] < MIN_RISE_DB) continue;
  let peak = true;
  for (let j = Math.max(0, f - PEAK_WIN); j <= Math.min(frames - 1, f + PEAK_WIN) && peak; j++) {
    if (odf[j] > odf[f] || (odf[j] === odf[f] && j < f)) peak = false;
  }
  if (peak) onsets.push((f * H) / SR);
}

// --- Report -------------------------------------------------------------
const beatSec = 60 / tl.bpm;
const nearest = (t) => onsets.reduce((b, o) => (Math.abs(o - t) < Math.abs(b - t) ? o : b), Infinity);
const ms = (x) => `${x >= 0 ? "+" : ""}${Math.round(x * 1000)}`.padStart(5);
const rows = tl.cuts.map((c, i) => {
  const beatIdx = Math.round(c / beatSec);
  const grid = c - beatIdx * beatSec;
  const o = nearest(c);
  const off = Number.isFinite(o) && Math.abs(o - c) <= beatSec / 2 ? o - c : null;
  const ok = off !== null && Math.abs(off) * 1000 <= TOLERANCE_MS;
  return { i, c, beatIdx, grid, off, ok };
});

console.log(`${input}: ${onsets.length} onsets, ${tl.bpm} bpm (beat ${(beatSec * 1000).toFixed(0)} ms), ${tl.cuts.length} cuts, tolerance ±${TOLERANCE_MS} ms`);
console.log("cut   time s   beat#  grid ms  onset ms  ");
for (const r of rows) {
  console.log(
    `${String(r.i + 1).padStart(3)}  ${r.c.toFixed(3).padStart(7)}  ${String(r.beatIdx).padStart(5)}  ${ms(r.grid)}    ${r.off === null ? "   none" : ms(r.off) + "  "}  ${r.ok ? "ok" : "FAIL"}`,
  );
}
const bad = rows.filter((r) => !r.ok);
if (bad.length) {
  console.log(`FAIL: ${bad.length}/${rows.length} cuts off the beat (> ${TOLERANCE_MS} ms or no onset within half a beat)`);
  process.exit(1);
}
console.log(`ok: all ${rows.length} cuts within ${TOLERANCE_MS} ms of a musical onset`);
