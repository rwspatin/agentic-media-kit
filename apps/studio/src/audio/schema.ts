import { z } from "zod";

// Audio modes, from silent to fully narrated. The beat headlines (eyebrow +
// caption) always render; "captions" in a voice mode adds a word-synced
// subtitle track of the narration on top of them. See docs/audio.md.
export const audioModeSchema = z.enum([
  "captions",
  "voice",
  "voice+captions",
  "music+captions",
  "music+voice",
  "music+voice+captions",
]);

export type AudioMode = z.infer<typeof audioModeSchema>;

// One spoken word, in ms from the start of its voice clip.
export const wordSchema = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
});

export type Word = z.infer<typeof wordSchema>;

// A beat's voiceover clip, written by scripts/audio.mjs. `src` is relative
// to public/ (e.g. "audio/demo/beat-1.wav").
export const beatVoiceSchema = z.object({
  src: z.string(),
  durationSec: z.number().positive(),
  words: z.array(wordSchema),
});

export type BeatVoice = z.infer<typeof beatVoiceSchema>;

export const musicSchema = z.object({
  src: z.string(), // relative to public/
  volume: z.number().min(0).max(1).optional(), // default MUSIC_VOLUME
  duckTo: z.number().min(0).max(1).optional(), // multiplier while voice speaks, default DUCK_TO
});

export const audioSchema = z.object({
  mode: audioModeSchema,
  music: musicSchema.optional(),
  voiceVolume: z.number().min(0).optional(), // default 1
});

export type AudioConfig = z.infer<typeof audioSchema>;
export type MusicConfig = z.infer<typeof musicSchema>;

export const MUSIC_VOLUME = 0.18;
export const DUCK_TO = 0.35;

export const flagsFor = (mode: AudioMode) => ({
  voice: mode.includes("voice"),
  music: mode.startsWith("music"),
  // Plain "captions" means the beat headlines only: no narration to subtitle.
  subtitles: mode.includes("voice") && mode.endsWith("+captions"),
});
