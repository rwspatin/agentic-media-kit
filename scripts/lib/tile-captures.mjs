#!/usr/bin/env node
// Split full-page captures into <= 3000px JPG tiles and write meta.json for
// the BeforeAfter composition. Called by scripts/capture-before-after.sh.
//
// Usage: node tile-captures.mjs <raw-dir> <out-dir> [mobile-width]
//   <raw-dir> holds <ver>-<viewport>.png + <ver>-<viewport>.json
//   ({ cssWidth, cssHeight, anchors }) pairs.
//
// No dependencies: image work is done by ffmpeg (already a kit prerequisite).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [rawDir, outDir, mobileWidthArg] = process.argv.slice(2);
if (!rawDir || !outDir) {
  console.error("usage: tile-captures.mjs <raw-dir> <out-dir> [mobile-width]");
  process.exit(1);
}
const TILE = 3000; // Chrome refuses textures taller than this in some GPUs/configs
const MOBILE_WIDTH = Number(mobileWidthArg || 780);
const JPG_QUALITY = "3"; // ffmpeg -q:v scale (2 best .. 31 worst); 3 ~ quality 90

const probe = (file) => {
  const [w, h] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file])
    .toString()
    .trim()
    .split(",")
    .map(Number);
  return { w, h };
};

// agent-browser prints the eval result as JSON; tolerate any surrounding noise.
const readMeasure = (file) => {
  const text = readFileSync(file, "utf8");
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
};

const metaPath = join(outDir, "meta.json");
const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};

const names = readdirSync(rawDir)
  .filter((f) => f.endsWith(".png"))
  .map((f) => f.slice(0, -4))
  .sort();

for (const name of names) {
  const png = join(rawDir, `${name}.png`);
  const measure = readMeasure(join(rawDir, `${name}.json`));
  const src = probe(png);
  const width = name.endsWith("-mobile") ? Math.min(MOBILE_WIDTH, src.w) : src.w;
  const total = Math.round((src.h * width) / src.w);
  const ratio = width / measure.cssWidth; // CSS px -> image px
  const tiles = Math.ceil(total / TILE);

  for (const f of readdirSync(outDir)) {
    if (new RegExp(`^${name}-\\d+\\.jpg$`).test(f)) rmSync(join(outDir, f));
  }
  for (let i = 0; i < tiles; i++) {
    const h = Math.min(TILE, total - i * TILE);
    execFileSync("ffmpeg", [
      "-v", "error", "-y", "-i", png,
      "-vf", `scale=${width}:${total}:flags=lanczos,crop=${width}:${h}:0:${i * TILE}`,
      "-frames:v", "1", "-update", "1", "-q:v", JPG_QUALITY,
      join(outDir, `${name}-${i}.jpg`),
    ]);
  }

  meta[name] = {
    width,
    total,
    anchors: measure.anchors.map((y) => Math.round(y * ratio)).filter((y) => y < total),
    tiles,
    tile: TILE,
  };
  console.log(`  ${name}: ${width}x${total}, ${tiles} tile(s), ${meta[name].anchors.length} section(s)`);
}

writeFileSync(metaPath, JSON.stringify(meta, null, 1) + "\n");
console.log(`  wrote ${metaPath}`);
