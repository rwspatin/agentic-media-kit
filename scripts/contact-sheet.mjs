#!/usr/bin/env node
// Contact sheet: a grid of frames from a render, each labelled with its beat
// and timestamp, so a reviewer can read a whole video in one image. Node >= 18,
// no npm deps; needs ffmpeg on PATH (labels are drawn in JS, so ffmpeg builds
// without drawtext work too). The idea comes from the teardown skill's
// sheet.mjs (elvarofficial/teardown, MIT).
//
// Usage:
//   node scripts/contact-sheet.mjs <video.mp4> <out.png> [--cols 4] [--width 360]
//       [--at-cuts <props.json> [--fps 30]]   one frame at the middle of every beat
//       [--every <sec>]                       one frame every N seconds (default: 12 frames over the video)
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const cols = Number(opt("cols", "4"));
const tileW = Number(opt("width", "360"));
const propsPath = opt("at-cuts", null);
const every = opt("every", null);
const fps = Number(opt("fps", "30"));
const [video, out] = argv;
if (!video || !out || !existsSync(video)) {
  console.error("usage: node scripts/contact-sheet.mjs <video.mp4> <out.png> [--cols 4] [--width 360] [--every <sec> | --at-cuts <props.json> [--fps 30]]");
  process.exit(2);
}

const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video], { encoding: "utf8" }).trim());

// --- Which frames -------------------------------------------------------
let picks;
if (propsPath) {
  const props = JSON.parse(readFileSync(propsPath, "utf8"));
  let cursor = 0;
  picks = props.beats.map((b, i) => {
    const t = (cursor + b.durationInFrames / 2) / fps;
    cursor += b.durationInFrames;
    return { t, label: `#${i + 1} ${t.toFixed(2)}S` };
  });
} else {
  const step = every ? Number(every) : duration / 12;
  picks = [];
  for (let t = step / 2; t < duration; t += step) picks.push({ t, label: `${t.toFixed(2)}S` });
}
// ffmpeg returns no frame for a seek this close to the end, so keep 50 ms off it.
picks = picks.map((p) => ({ ...p, t: Math.min(Math.max(0, p.t), duration - 0.05) }));

// --- Frames as raw RGB (PPM) ---------------------------------------------
const readPpm = (buf) => {
  // "P6 <w> <h> <max>" + one whitespace byte, then RGB bytes.
  let pos = 0;
  const tokens = [];
  while (tokens.length < 4) {
    while (/\s/.test(String.fromCharCode(buf[pos]))) pos++;
    let tok = "";
    while (!/\s/.test(String.fromCharCode(buf[pos]))) tok += String.fromCharCode(buf[pos++]);
    tokens.push(tok);
  }
  return { w: Number(tokens[1]), h: Number(tokens[2]), data: buf.subarray(pos + 1) };
};
const frames = picks.map(({ t }) =>
  readPpm(
    execFileSync("ffmpeg", ["-v", "error", "-ss", t.toFixed(3), "-i", video, "-frames:v", "1", "-vf", `scale=${tileW}:-2`, "-f", "image2pipe", "-vcodec", "ppm", "-"], {
      maxBuffer: 1 << 28,
    }),
  ),
);

// --- A 5x7 bitmap font for the labels ------------------------------------
const GLYPHS = {
  0: "01110 10001 10011 10101 11001 10001 01110",
  1: "00100 01100 00100 00100 00100 00100 01110",
  2: "01110 10001 00001 00010 00100 01000 11111",
  3: "11110 00001 00001 01110 00001 00001 11110",
  4: "00010 00110 01010 10010 11111 00010 00010",
  5: "11111 10000 11110 00001 00001 10001 01110",
  6: "00110 01000 10000 11110 10001 10001 01110",
  7: "11111 00001 00010 00100 01000 01000 01000",
  8: "01110 10001 10001 01110 10001 10001 01110",
  9: "01110 10001 10001 01111 00001 00010 01100",
  ".": "00000 00000 00000 00000 00000 01100 01100",
  "#": "01010 01010 11111 01010 11111 01010 01010",
  S: "01111 10000 10000 01110 00001 00001 11110",
  " ": "00000 00000 00000 00000 00000 00000 00000",
};
const drawLabel = (img, text, s) => {
  const pad = 2 * s;
  const boxW = text.length * 6 * s + pad * 2 - s;
  const boxH = 7 * s + pad * 2;
  const x0 = 6;
  const y0 = 6;
  for (let y = y0; y < Math.min(img.h, y0 + boxH); y++) {
    for (let x = x0; x < Math.min(img.w, x0 + boxW); x++) {
      const i = (y * img.w + x) * 3;
      for (let c = 0; c < 3; c++) img.data[i + c] = Math.round(img.data[i + c] * 0.3);
    }
  }
  [...text].forEach((ch, k) => {
    const rows = (GLYPHS[ch] ?? GLYPHS[" "]).split(" ");
    rows.forEach((row, ry) =>
      [...row].forEach((bit, rx) => {
        if (bit !== "1") return;
        for (let dy = 0; dy < s; dy++) {
          for (let dx = 0; dx < s; dx++) {
            const x = x0 + pad + (k * 6 + rx) * s + dx;
            const y = y0 + pad + ry * s + dy;
            if (x < img.w && y < img.h) img.data.fill(255, (y * img.w + x) * 3, (y * img.w + x) * 3 + 3);
          }
        }
      }),
    );
  });
};
const scale = Math.max(2, Math.round(tileW / 160));
frames.forEach((f, i) => drawLabel(f, picks[i].label, scale));

// --- Tile -----------------------------------------------------------------
const GAP = 6;
const tw = frames[0].w;
const th = frames[0].h;
const rows = Math.ceil(frames.length / cols);
const W = cols * tw + (cols + 1) * GAP;
const H = rows * th + (rows + 1) * GAP;
const sheet = Buffer.alloc(W * H * 3, 0x33);
frames.forEach((f, i) => {
  const ox = GAP + (i % cols) * (tw + GAP);
  const oy = GAP + Math.floor(i / cols) * (th + GAP);
  for (let y = 0; y < Math.min(th, f.h); y++) {
    f.data.copy(sheet, ((oy + y) * W + ox) * 3, y * f.w * 3, y * f.w * 3 + Math.min(tw, f.w) * 3);
  }
});
const dir = mkdtempSync(join(tmpdir(), "contact-sheet-"));
const ppm = join(dir, "sheet.ppm");
writeFileSync(ppm, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), sheet]));
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", ppm, out]);
rmSync(dir, { recursive: true, force: true });
console.log(`${out}: ${frames.length} frames (${cols}x${rows}, ${tw}x${th} each) from ${video}`);
