#!/usr/bin/env node
// Generate the audio for a Tour-* (or any beats-driven) render (voiceover per beat, a music bed)
// and write a ready-to-render props file. Node >= 18, no npm deps; needs
// ffmpeg + ffprobe on PATH. See docs/audio.md.
//
// Usage:
//   node scripts/audio.mjs <in-props.json> <out-props.json> --name <slug>
//       --mode <captions|voice|voice+captions|music+captions|music+voice|music+voice+captions|auto>
//       [--goal "<free text>"] [--placement reel|feed|landscape|story]
//       [--tts gemini|elevenlabs|say] [--voice <name>] [--style "<delivery direction>"] [--fps 30]
//       [--music procedural|synth|lyria|elevenlabs|<path to audio file>] [--music-prompt "<text>"]
//       [--mood calm|tech|upbeat|warm] [--bpm <n>] [--key <tonic>] [--no-beat-sync] [--no-lint]
//       [--voice-rate <0.5-2>]   speed the voice up/down (pitch kept; default 1)
//       [--composition <id>]   for the printed render command and the lint (default Tour-Reel/Tour-Feed by placement)
//
// Any composition whose props have `beats[]` with `durationInFrames` and an
// optional `narration` works (Tour-*, Release-*). Beats without narration
// keep their length (e.g. a clip of fixed duration); beat sync only ever
// lengthens them.
//
// --music procedural (default) renders a score with scripts/score/make_score.py
// (python3, stdlib only) and snaps every beat's length up to whole musical
// beats so cuts land on the beat (--no-beat-sync to keep the lengths). The
// timeline it scores from is written to <asset dir>/timeline.json; check the
// render with scripts/check-beats.mjs. At the end the output props are linted
// (scripts/lint-video.mjs, non-fatal).
//
// Assets land in apps/studio/public/audio/<slug>/ (gitignored). Voice clips
// are cached by sha1(provider|model|voice|style|text) in manifest.json, so
// re-running after editing one beat only regenerates that beat.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "apps/studio/public");
const MODES = ["captions", "voice", "voice+captions", "music+captions", "music+voice", "music+voice+captions"];
const VOICE_LEAD = 6; // frames; keep in sync with ScreenTour.tsx
const VOICE_TAIL = 0.45; // seconds of air after the voice before the next beat
const MUSIC_VOLUME_SCORE = 0.12; // linear; the synth bed and files use 0.18 (schema default)
const GEMINI_TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];

const log = (...a) => console.error(...a);
const die = (msg) => {
  log(`audio.mjs: ${msg}`);
  process.exit(1);
};

// --- Args ---------------------------------------------------------------
const FLAGS = ["no-beat-sync", "no-lint"]; // boolean options, no value
const parseArgs = (argv) => {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (FLAGS.includes(key)) {
        opts[key] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) die(`missing value for --${key}`);
      opts[key] = next;
      i++;
    } else pos.push(a);
  }
  return { pos, opts };
};

const { pos, opts } = parseArgs(process.argv.slice(2));
const [inPath, outPath] = pos;
if (!inPath || !outPath || !opts.name || !opts.mode) {
  die("usage: node scripts/audio.mjs <in-props.json> <out-props.json> --name <slug> --mode <mode|auto> [options]");
}
const slug = opts.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
const fps = Number(opts.fps ?? 30);
const tts = opts.tts ?? "gemini";
let musicSource = opts.music ?? "procedural";
const placement = opts.placement ?? "reel";
const voiceRate = Number(opts["voice-rate"] ?? 1);
if (!["gemini", "elevenlabs", "say"].includes(tts)) die(`unknown --tts ${tts}`);
if (!(voiceRate >= 0.5 && voiceRate <= 2)) die(`--voice-rate ${opts["voice-rate"]}: expected 0.5-2`);
if (!["reel", "feed", "landscape", "story"].includes(placement)) die(`unknown --placement ${placement}`);

for (const bin of ["ffmpeg", "ffprobe"]) {
  try {
    execFileSync(bin, ["-version"], { stdio: "ignore" });
  } catch {
    die(`${bin} not found (brew install ffmpeg / apt-get install ffmpeg)`);
  }
}

const props = JSON.parse(readFileSync(inPath, "utf8"));
if (!Array.isArray(props.beats) || props.beats.length === 0) die(`${inPath} has no beats`);
const hasNarration = props.beats.some((b) => b.narration?.trim());

// --- Mode ---------------------------------------------------------------
// Deterministic, so the same goal always gets the same mode. PT + EN keywords.
const RULES = [
  [/tutorial|how[- ]?to|explain|explica|onboarding|walkthrough|passo a passo|\btour\b|\bdemo\b/i, "music+voice+captions", "tutorials and walkthroughs need a voice to explain, music to carry it, and subtitles for muted autoplay"],
  [/\bads?\b|an[uú]ncio|promo|teaser|launch|lan[cç]amento|hype|campanha|campaign/i, "music+captions", "ads and launches play muted in feeds: music for sound-on viewers, burned-in text does the talking"],
  [/testimonial|depoimento|founder|fundador|\bstory\b|hist[oó]ria|bastidores|behind the scenes/i, "voice+captions", "a personal story lives on the voice; subtitles keep it readable when muted"],
  [/accessib|acess[ií]vel|acessibilidade/i, "voice+captions", "accessibility: spoken narration plus word-synced subtitles"],
];

const pickMode = () => {
  const goal = opts.goal ?? "";
  for (const [re, mode, why] of RULES) {
    const m = goal.match(re);
    if (m) return { mode, reason: `goal matches "${m[0]}": ${why}` };
  }
  if (["landscape", "feed"].includes(placement)) {
    return { mode: "music+captions", reason: `placement "${placement}" autoplays muted and has no goal keyword: music + burned-in text` };
  }
  return hasNarration
    ? { mode: "music+voice+captions", reason: "no keyword matched; beats have narration, so use it with music and subtitles" }
    : { mode: "music+captions", reason: "no keyword matched and no beat has narration: music + the beat headlines" };
};

let mode = opts.mode;
if (mode === "auto") {
  const pick = pickMode();
  mode = pick.mode;
  log(`mode: ${mode} (auto)`);
  log(`reason: ${pick.reason}`);
} else if (!MODES.includes(mode)) {
  die(`unknown --mode ${mode} (one of: ${MODES.join(", ")}, auto)`);
} else {
  log(`mode: ${mode}`);
}
const wantVoice = mode.includes("voice");
const wantMusic = mode.startsWith("music");
if (wantVoice && !hasNarration) {
  die(`mode "${mode}" needs a voiceover, but no beat has "narration". Write a short "narration" string per beat (~2.5 words/sec, no longer than the beat) in ${inPath}, then re-run.`);
}

// --- Score mood (procedural music) ---------------------------------------
const SCORE_DIR = join(ROOT, "scripts/score");
const MOODS = Object.fromEntries(Object.entries(JSON.parse(readFileSync(join(SCORE_DIR, "moods.json"), "utf8"))).filter(([k]) => !k.startsWith("_")));
const MOOD_RULES = [
  [/\bads?\b|an[uú]ncio|promo|teaser|launch|lan[cç]amento|hype|campanha|campaign/i, "upbeat"],
  [/tutorial|how[- ]?to|explain|explica|passo a passo|\bdemo\b|feature/i, "tech"],
  [/onboarding|walkthrough|\btour\b|welcome|boas[- ]vindas/i, "calm"],
  [/testimonial|depoimento|founder|fundador|\bstory\b|hist[oó]ria|bastidores|behind the scenes/i, "warm"],
];
const pickMood = () => {
  if (opts.mood) return { mood: opts.mood, reason: "--mood" };
  const goal = opts.goal ?? "";
  for (const [re, mood] of MOOD_RULES) {
    const m = goal.match(re);
    if (m) return { mood, reason: `goal matches "${m[0]}"` };
  }
  return { mood: "calm", reason: "default" };
};

let score = null; // { mood, bpm, key } when the procedural score is used
if (wantMusic && musicSource === "procedural") {
  const python = spawnSync("python3", ["--version"], { encoding: "utf8" });
  if (python.status !== 0) {
    log("warning: --music procedural needs python3 (stdlib only), which wasn't found; falling back to the synth bed");
    musicSource = "synth";
  } else {
    const { mood, reason } = pickMood();
    if (!MOODS[mood]) die(`unknown --mood ${mood} (one of: ${Object.keys(MOODS).join(", ")})`);
    const bpm = Number(opts.bpm ?? MOODS[mood].bpm);
    if (!(bpm >= 40 && bpm <= 200)) die(`--bpm ${opts.bpm}: expected 40-200`);
    score = { mood, bpm, key: opts.key ?? MOODS[mood].key };
    log(`score: ${mood} (${reason}), ${bpm} bpm in ${score.key}`);
  }
}

const assetDir = join(PUBLIC, "audio", slug);
mkdirSync(assetDir, { recursive: true });
const manifestPath = join(assetDir, "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { beats: {} };
const rel = (file) => `audio/${slug}/${basename(file)}`;
const tmp = (name) => join(assetDir, `.tmp-${name}`);

// --- ffmpeg helpers -----------------------------------------------------
const ffmpeg = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
const durationOf = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());

// Two-pass loudnorm: single-pass is inaccurate on short clips. Pass 1
// measures (JSON on stderr), pass 2 applies a linear gain to hit the target.
const loudnorm = (input, output, preFilter, target, extra = []) => {
  const spec = `I=${target.I}:TP=${target.TP}:LRA=${target.LRA}`;
  const chain = preFilter ? `${preFilter},` : "";
  const pass1 = spawnSync("ffmpeg", ["-hide_banner", "-i", input, "-af", `${chain}loudnorm=${spec}:print_format=json`, "-f", "null", "-"], { encoding: "utf8" });
  let m = null;
  try {
    const err = pass1.stderr;
    m = JSON.parse(err.slice(err.lastIndexOf("{"), err.lastIndexOf("}") + 1));
  } catch {}
  const measured =
    m && Number.isFinite(Number(m.input_i))
      ? `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
      : "";
  ffmpeg(["-i", input, "-af", `${chain}loudnorm=${spec}${measured}`, "-ar", "48000", ...extra, output]);
};

const VOICE_LOUDNESS = { I: -16, TP: -1.5, LRA: 11 };
const TRIM_SILENCE = [
  "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05",
  "areverse",
  "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08",
  "areverse",
].join(",");

// --- Word timings -------------------------------------------------------
// Providers without timestamps: spread the clip across the words by length
// (+ a constant per word, + a pause after punctuation). Roughly in sync;
// exact sync needs elevenlabs (or a future whisper.cpp alignment step).
const estimateWords = (text, durationSec) => {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const weights = tokens.map((t) => t.length + 2 + (/[.,!?;:…]$/.test(t) ? 3 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return tokens.map((t, i) => {
    const len = (weights[i] / total) * durationSec * 1000;
    const w = { text: t, startMs: Math.round(cursor), endMs: Math.round(cursor + len) };
    cursor += len;
    return w;
  });
};

// ElevenLabs alignment is per character: group into words on whitespace.
const wordsFromAlignment = (a) => {
  const words = [];
  let cur = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
      return;
    }
    const s = a.character_start_times_seconds[i] * 1000;
    const e = a.character_end_times_seconds[i] * 1000;
    if (!cur) cur = { text: ch, startMs: s, endMs: e };
    else {
      cur.text += ch;
      cur.endMs = e;
    }
  });
  if (cur) words.push(cur);
  return words.map((w) => ({ ...w, startMs: Math.round(w.startMs), endMs: Math.round(w.endMs) }));
};

// --- TTS providers ------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const looksPortuguese = (t) => /[ãõçâêôáéíóú]|\b(você|não|para|com|uma|seu|sua|que|de|em)\b/i.test(t);

const fetchJson = async (url, init, label) => {
  const res = await fetch(url, init);
  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`${label}: HTTP ${res.status} ${body.replace(/\s+/g, " ").slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(body);
};

const withRetry = async (fn, label, tries = 3) => {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const retryable = !e.status || e.status === 429 || e.status >= 500;
      if (!retryable || i >= tries) throw e;
      log(`  ${e.message.replace(/\s+/g, " ").slice(0, 160)}; retry ${i}/${tries - 1}`);
      await sleep(1000 * 2 ** (i - 1));
    }
  }
};

const ttsGemini = async (text, rawBase) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) die("--tts gemini needs GEMINI_API_KEY (or use --tts say for an offline draft)");
  const models = process.env.GEMINI_TTS_MODEL ? [process.env.GEMINI_TTS_MODEL] : GEMINI_TTS_MODELS;
  // Style prompt: 2.5 models follow "Say warmly: <text>", but the 3.x TTS
  // models read that prefix aloud; they take an inline "[direction] <text>"
  // tag instead (systemInstruction is rejected).
  const prompt = (model) => (!opts.style ? text : /gemini-2\./.test(model) ? `${opts.style}: ${text}` : `[${opts.style}] ${text}`);
  const bodyFor = (model) => ({
    contents: [{ parts: [{ text: prompt(model) }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice || "Kore" } } },
    },
  });
  let lastErr;
  for (const model of models) {
    const body = bodyFor(model);
    try {
      const json = await withRetry(
        () =>
          fetchJson(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
            model,
          ),
        model,
      );
      const data = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
      if (!data) throw new Error(`${model}: response has no audio part`);
      const rate = Number(/rate=(\d+)/.exec(data.mimeType)?.[1] ?? 24000);
      const pcm = `${rawBase}.pcm`;
      writeFileSync(pcm, Buffer.from(data.data, "base64"));
      const wav = `${rawBase}.wav`;
      ffmpeg(["-f", "s16le", "-ar", String(rate), "-ac", "1", "-i", pcm, wav]);
      rmSync(pcm);
      return { file: wav, words: null, model };
    } catch (e) {
      lastErr = e;
      if (e.status && e.status !== 429 && e.status < 500 && e.status !== 404) throw e;
      log(`  ${model} failed, trying the next model`);
    }
  }
  throw lastErr;
};

const ttsElevenLabs = async (text, rawBase) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) die("--tts elevenlabs needs ELEVENLABS_API_KEY");
  const voiceId = opts.voice || process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) die("--tts elevenlabs needs a voice id: --voice <id> or ELEVENLABS_VOICE_ID");
  const model = process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2";
  const json = await withRetry(
    () =>
      fetchJson(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
        { method: "POST", headers: { "content-type": "application/json", "xi-api-key": key }, body: JSON.stringify({ text, model_id: model }) },
        "elevenlabs tts",
      ),
    "elevenlabs tts",
  );
  const file = `${rawBase}.mp3`;
  writeFileSync(file, Buffer.from(json.audio_base64, "base64"));
  return { file, words: json.alignment ? wordsFromAlignment(json.alignment) : null, model };
};

const ttsSay = async (text, rawBase) => {
  if (process.platform !== "darwin") die("--tts say is macOS only (use gemini or elevenlabs)");
  const voice = opts.voice || (looksPortuguese(text) ? "Luciana" : "Samantha");
  const file = `${rawBase}.aiff`;
  execFileSync("say", ["-v", voice, "-o", file, text]);
  return { file, words: null, model: `say:${voice}` };
};

const TTS = { gemini: ttsGemini, elevenlabs: ttsElevenLabs, say: ttsSay };
const ttsModelKey = () =>
  tts === "gemini" ? process.env.GEMINI_TTS_MODEL || "auto" : tts === "elevenlabs" ? process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2" : "say";

const voiceBeat = async (beat, index) => {
  const text = beat.narration.trim();
  const hash = createHash("sha1").update([tts, ttsModelKey(), opts.voice ?? "", opts.style ?? "", text].join("|")).digest("hex");
  const out = join(assetDir, `beat-${index + 1}.wav`);
  const cached = manifest.beats[index];
  if (cached?.hash === hash && existsSync(out)) {
    log(`  beat ${index + 1}: cached`);
    return { src: rel(out), durationSec: cached.durationSec, words: cached.words };
  }
  log(`  beat ${index + 1}: ${tts} "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"`);
  const raw = await TTS[tts](text, tmp(`beat-${index + 1}`));
  let words = raw.words;
  if (words?.length) {
    // Exact timestamps: trim the leading silence by hand so they stay valid.
    const lead = Math.max(0, words[0].startMs / 1000 - 0.05);
    const tail = "areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse";
    loudnorm(raw.file, out, `atrim=start=${lead.toFixed(3)},asetpts=PTS-STARTPTS,${tail}`, VOICE_LOUDNESS, ["-ac", "1"]);
    words = words.map((w) => ({ ...w, startMs: Math.max(0, w.startMs - lead * 1000), endMs: Math.max(0, w.endMs - lead * 1000) }));
  } else {
    loudnorm(raw.file, out, TRIM_SILENCE, VOICE_LOUDNESS, ["-ac", "1"]);
  }
  rmSync(raw.file, { force: true });
  const durationSec = Math.round(durationOf(out) * 1000) / 1000;
  if (!words?.length) words = estimateWords(text, durationSec);
  manifest.beats[index] = { hash, model: raw.model, durationSec, words };
  return { src: rel(out), durationSec, words };
};

// --voice-rate: a time-stretched copy of the cached clip (ffmpeg atempo keeps
// the pitch), so changing the rate never calls the TTS again. Word times
// scale with it.
const withRate = (voice, index) => {
  if (voiceRate === 1) return voice;
  const src = join(PUBLIC, voice.src);
  const out = join(assetDir, `beat-${index + 1}-x${voiceRate}.wav`);
  ffmpeg(["-i", src, "-af", `atempo=${voiceRate}`, "-ar", "48000", "-ac", "1", out]);
  const durationSec = Math.round(durationOf(out) * 1000) / 1000;
  const words = voice.words.map((w) => ({ ...w, startMs: Math.round(w.startMs / voiceRate), endMs: Math.round(w.endMs / voiceRate) }));
  return { src: rel(out), durationSec, words };
};

// --- Music --------------------------------------------------------------
const MUSIC_LOUDNESS = { I: -18, TP: -2, LRA: 11 };

// A soft ambient pad, offline and license-free: two detuned chords (Am9 and
// Fmaj9) breathing into each other every 8 s, slow tremolo, lowpass, echo.
const musicSynth = (seconds) => {
  const voicing = (freqs, detune) => freqs.map((f, i) => `${(0.9 / (i + 1.5)).toFixed(3)}*sin(2*PI*${(f * detune).toFixed(3)}*t)`).join("+");
  const am9 = [110, 164.81, 196, 261.63, 246.94];
  const fmaj9 = [87.31, 130.81, 164.81, 220, 196];
  const pad = (detune) =>
    `((0.5+0.5*cos(2*PI*t/16))*(${voicing(am9, detune)})+(0.5-0.5*cos(2*PI*t/16))*(${voicing(fmaj9, detune)}))*(0.75+0.25*sin(2*PI*0.13*t))*0.12`;
  const expr = `${pad(1)}|${pad(1.004)}`; // L | R, slightly detuned for width
  const out = join(assetDir, "music.wav");
  const raw = tmp("music.wav");
  const fadeOut = Math.max(0, seconds - 3).toFixed(2);
  ffmpeg([
    "-f", "lavfi", "-i", `aevalsrc=${expr}:s=48000:d=${seconds.toFixed(2)}`,
    "-af", `lowpass=f=1600,aecho=0.8:0.6:420|730:0.22|0.14,afade=t=in:d=2,afade=t=out:st=${fadeOut}:d=3`,
    raw,
  ]);
  loudnorm(raw, out, "", MUSIC_LOUDNESS, ["-ac", "2"]);
  rmSync(raw, { force: true });
  return out;
};

const defaultMusicPrompt = (seconds) =>
  opts["music-prompt"] ||
  `Instrumental only, no vocals. Minimal modern tech product background bed, warm soft synths, steady gentle pulse, unobtrusive under a voiceover. About ${Math.round(seconds)} seconds.`;

const extFor = (mime = "") =>
  /mpeg|mp3/.test(mime) ? ".mp3" : /wav/.test(mime) ? ".wav" : /ogg/.test(mime) ? ".ogg" : /aac|mp4|m4a/.test(mime) ? ".m4a" : /L16|pcm/.test(mime) ? ".pcm" : ".bin";

const musicLyria = async (seconds) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const model = process.env.LYRIA_MODEL || "lyria-3.5";
  // Response shape unverified (free-tier keys get quota 0): take the first inlineData part.
  const json = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: defaultMusicPrompt(seconds) }] }], generationConfig: { responseModalities: ["AUDIO"] } }),
    },
    model,
  );
  const data = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!data) throw new Error(`${model}: response has no audio part`);
  const ext = extFor(data.mimeType);
  const raw = tmp(`lyria${ext}`);
  writeFileSync(raw, Buffer.from(data.data, "base64"));
  const out = join(assetDir, "music.wav");
  const input = ext === ".pcm" ? ["-f", "s16le", "-ar", /rate=(\d+)/.exec(data.mimeType)?.[1] ?? "48000", "-ac", "2", "-i", raw] : ["-i", raw];
  ffmpeg([...input, "-ar", "48000", out]);
  rmSync(raw, { force: true });
  return out;
};

const musicElevenLabs = async (seconds) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY not set");
  const res = await fetch("https://api.elevenlabs.io/v1/music", {
    method: "POST",
    headers: { "content-type": "application/json", "xi-api-key": key },
    body: JSON.stringify({ prompt: defaultMusicPrompt(seconds), music_length_ms: Math.round(seconds * 1000) }),
  });
  if (!res.ok) throw new Error(`elevenlabs music: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const out = join(assetDir, "music.mp3");
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  return out;
};

// Procedural score: scripts/score/make_score.py renders a mastered WAV
// (-14 LUFS, <= -1 dBTP) from the timeline. Cached by the timeline and the
// score sources, so re-running with unchanged beats is instant.
const musicProcedural = (timeline) => {
  const timelinePath = join(assetDir, "timeline.json");
  writeFileSync(timelinePath, JSON.stringify(timeline, null, 2) + "\n");
  const out = join(assetDir, "music.wav");
  const h = createHash("sha1").update(JSON.stringify(timeline));
  for (const f of ["make_score.py", "moods.json", "synth.py", "dsp.py", "mix.py", "loudness.py"]) h.update(readFileSync(join(SCORE_DIR, f)));
  const hash = h.digest("hex");
  if (manifest.music?.hash === hash && existsSync(out)) {
    log("  cached");
    return out;
  }
  const r = spawnSync("python3", [join(SCORE_DIR, "make_score.py"), "--timeline", timelinePath, "--out", out], { encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || "make_score.py failed").trim().split("\n").slice(-3).join(" "));
  log(`  ${r.stdout.trim()}`);
  manifest.music = { hash, mood: timeline.mood, bpm: timeline.bpm };
  return out;
};

const makeMusic = async (seconds, timeline) => {
  if (musicSource === "procedural") {
    try {
      return musicProcedural(timeline);
    } catch (e) {
      log(`warning: --music procedural failed (${e.message.slice(0, 300)}); falling back to the synth bed`);
      return musicSynth(seconds);
    }
  }
  if (musicSource === "synth") return musicSynth(seconds);
  if (musicSource === "lyria" || musicSource === "elevenlabs") {
    try {
      return await (musicSource === "lyria" ? musicLyria : musicElevenLabs)(seconds);
    } catch (e) {
      log(`warning: --music ${musicSource} failed (${e.message.slice(0, 200)}); falling back to the synth bed`);
      return musicSynth(seconds);
    }
  }
  if (!existsSync(musicSource)) die(`--music: not procedural|synth|lyria|elevenlabs and no such file: ${musicSource}`);
  const out = join(assetDir, `music${extname(musicSource) || ".mp3"}`);
  copyFileSync(musicSource, out);
  return out;
};

// --- Main ---------------------------------------------------------------
const beats = props.beats.map((b) => ({ ...b }));
if (wantVoice) {
  log(`voice (${tts}${voiceRate === 1 ? "" : `, rate ${voiceRate}`}):`);
  for (const [i, beat] of beats.entries()) {
    if (!beat.narration?.trim()) continue;
    beat.voice = withRate(await voiceBeat(beat, i), i);
    const need = Math.ceil((VOICE_LEAD / fps + beat.voice.durationSec + VOICE_TAIL) * fps);
    beat.durationInFrames = Math.max(beat.durationInFrames, need);
  }
}

// Beat sync: snap each beat UP to a whole number of musical beats. Cut times
// are kept in beats and rounded to frames once (frame = round(beats * fps *
// 60 / bpm)), so rounding never accumulates into drift.
const rawFrames = beats.map((b) => b.durationInFrames);
const beatSync = Boolean(score) && !opts["no-beat-sync"];
if (beatSync) {
  const framesPerBeat = (fps * 60) / score.bpm;
  let beatsSoFar = 0;
  let prevCut = 0;
  for (const b of beats) {
    beatsSoFar += Math.max(1, Math.ceil(b.durationInFrames / framesPerBeat - 1e-9));
    const cut = Math.round(beatsSoFar * framesPerBeat);
    b.durationInFrames = cut - prevCut;
    prevCut = cut;
  }
}

const totalFrames = beats.reduce((s, b) => s + b.durationInFrames, 0);
const totalSec = totalFrames / fps;
const audio = { mode };
if (wantMusic) {
  log(`music (${musicSource}): ${totalSec.toFixed(1)} s`);
  let timeline;
  if (score) {
    const cuts = [];
    const voice = [];
    let cursor = 0;
    for (const b of beats) {
      if (wantVoice && b.voice) {
        const startSec = (cursor + VOICE_LEAD) / fps;
        voice.push({ startSec: +startSec.toFixed(3), endSec: +(startSec + b.voice.durationSec).toFixed(3) });
      }
      cursor += b.durationInFrames;
      if (cursor < totalFrames) cuts.push(+(cursor / fps).toFixed(4));
    }
    timeline = { ...score, fps, durationSec: +totalSec.toFixed(4), beatSync, cuts, voice };
  }
  const file = await makeMusic(totalSec, timeline);
  // A mastered score (-14 LUFS) is ~4 dB louder than the synth bed (-18), so
  // it plays a little lower to keep the same balance under the voice.
  audio.music = { src: rel(file), volume: musicSource === "procedural" ? MUSIC_VOLUME_SCORE : 0.18, duckTo: 0.35 };
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

writeFileSync(outPath, JSON.stringify({ ...props, beats, audio }, null, 2) + "\n");

// Summary + the exact render command.
log("");
log(`beat  kind    voice s  frames${beatSync ? "  (before sync)" : ""}`);
beats.forEach((b, i) => {
  const v = b.voice && wantVoice ? b.voice.durationSec.toFixed(2).padStart(7) : "      –";
  const was = beatSync ? `  (${rawFrames[i]})` : "";
  log(`${String(i + 1).padStart(4)}  ${b.kind.padEnd(6)}  ${v}  ${String(b.durationInFrames).padStart(6)}${was}`);
});
log(`total ${totalFrames} frames = ${totalSec.toFixed(1)} s @ ${fps} fps${beatSync ? `, cuts on the beat at ${score.bpm} bpm` : ""}`);
const comp = opts.composition ?? (["feed", "landscape"].includes(placement) ? "Tour-Feed" : "Tour-Reel");
log("");
log("render:");
log(`  cd apps/studio && npx remotion render ${comp} out/${slug}.mp4 --props=${resolve(outPath)} --codec=h264 --pixel-format=yuv420p --audio-codec=aac`);
if (score && musicSource === "procedural") {
  log("check the cuts against the music after rendering:");
  log(`  node scripts/check-beats.mjs apps/studio/out/${slug}.mp4 ${join(assetDir, "timeline.json")}`);
}

if (!opts["no-lint"]) {
  log("");
  log("lint:");
  spawnSync(process.execPath, [join(ROOT, "scripts/lint-video.mjs"), resolve(outPath), "--composition", comp, "--fps", String(fps)], {
    stdio: ["ignore", 2, 2],
  });
}
console.log(resolve(outPath));
