# Audio: voiceover, music, and word-synced subtitles

`Tour-Reel` and `Tour-Feed` are silent by default. Add an `audio` prop and they get a voiceover per beat, a music bed that ducks under the voice, and TikTok-style subtitles of the narration. `scripts/audio.mjs` generates the assets and writes a props file that is ready to render.

```bash
# from the repo root
node scripts/audio.mjs apps/studio/examples/tour-audio.json /tmp/tour-voiced.json \
  --name demo --mode auto --goal "onboarding tutorial" --tts gemini --music synth
cd apps/studio && npx remotion render Tour-Reel out/demo.mp4 --props=/tmp/tour-voiced.json \
  --codec=h264 --pixel-format=yuv420p --audio-codec=aac
```

## Modes

| `audio.mode` | Voice | Music | Word-synced subtitles |
|---|---|---|---|
| `captions` (no `audio` prop) | – | – | – |
| `voice` | yes | – | – |
| `voice+captions` | yes | – | yes |
| `music+captions` | – | yes | – |
| `music+voice` | yes | yes | – |
| `music+voice+captions` | yes | yes | yes |

The beat headlines (eyebrow + caption) always render. In the voice modes, "captions" adds a subtitle track of the narration over the lower part of the device. In the non-voice modes, the beat headlines *are* the captions.

## Which mode

Most feed video autoplays **muted**, so burned-in text is always on. Sound is a bonus for people who tap.

| Goal / placement | Mode | Why |
|---|---|---|
| Tutorial, how-to, onboarding, walkthrough, demo | `music+voice+captions` | A voice explains better than headlines; subtitles carry it while muted. |
| Ad, promo, teaser, launch | `music+captions` | Short and punchy. The headlines do the talking; music for sound-on viewers. |
| Testimonial, founder story, behind the scenes | `voice+captions` | The voice is the content. Music would fight it. |
| Accessibility first | `voice+captions` | Narration plus word-level subtitles. |
| LinkedIn / landscape / feed, nothing else known | `music+captions` | Muted autoplay in a scrolling feed. |
| Internal review, no publishing | `voice` | Fastest to make; nobody needs subtitles. |

`--mode auto --goal "<text>" --placement reel|feed|landscape|story` applies this table deterministically (Portuguese and English keywords) and prints the mode and the reason. With no match it picks `music+voice+captions` when beats have `narration`, otherwise `music+captions`. Agents should still **propose** the mode to the human; `auto` is a starting point.

## Writing narration

Add `"narration"` to each beat that should speak:

- About **2.5 words per second**. A 90-frame (3 s) beat fits 6–8 words.
- One idea per beat; don't read the headline out loud word for word.
- The script lengthens a beat when its voice doesn't fit: `durationInFrames = max(original, ceil((6/fps + voice + 0.45 s) * fps))`. The voice starts 6 frames (`VOICE_LEAD`) after its beat cuts in.
- A voice mode without any `narration` fails with a message telling you to write it.

## The script

```
node scripts/audio.mjs <in-props.json> <out-props.json> --name <slug>
    --mode <one of the 6 modes | auto> [--goal "<free text>"] [--placement reel|feed|landscape|story]
    [--tts gemini|elevenlabs|say] [--voice <name>] [--style "<delivery direction>"] [--fps 30]
    [--music synth|lyria|elevenlabs|<path to audio file>] [--music-prompt "<text>"]
```

- Assets go to `apps/studio/public/audio/<slug>/` (gitignored). Props reference them relative to `public/` (`audio/<slug>/beat-1.wav`).
- Every voice clip is trimmed of leading/trailing silence, two-pass loudness-normalized to **-16 LUFS / -1.5 dBTP**, and written as 48 kHz mono WAV.
- Clips are cached by `sha1(provider|model|voice|style|text)` in `manifest.json`. Edit one beat and re-run: only that beat is regenerated.
- Needs Node ≥ 18 and `ffmpeg`/`ffprobe` on `PATH`. No npm dependencies.

## Providers

### Voice (`--tts`)

| Provider | Env | Word timing | Notes |
|---|---|---|---|
| `gemini` (default) | `GEMINI_API_KEY`, optional `GEMINI_TTS_MODEL` | estimated | Tries `gemini-3.8-flash-tts`, `gemini-3.1-flash-tts-preview`, `gemini-2.5-flash-preview-tts` in order on 429/5xx, 3 tries each. Voice: `--voice Kore` (default) or any prebuilt voice. `--style "Say warmly"` is sent as `[Say warmly] text` to 3.x models and `Say warmly: text` to 2.5 (the 3.x models read the colon form aloud). Free-tier keys hit daily quota quickly; one run may mix models. |
| `elevenlabs` | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` (or `--voice <id>`), optional `ELEVENLABS_TTS_MODEL` (default `eleven_multilingual_v2`) | **exact** | Uses `/with-timestamps`; character alignment is grouped into words. |
| `say` | none (macOS) | estimated | Offline drafts. Picks `Luciana` for Portuguese-looking text, else `Samantha`. Not for publishing. |

**Estimated** timing spreads the clip across the words by length, with a small constant per word and a pause after punctuation. It's close enough for 3-word pages, but the highlight can drift by a word on long clauses. For exact sync use `elevenlabs` (a future step could align any clip with whisper.cpp).

### Music (`--music`)

| Source | Env | Notes |
|---|---|---|
| `synth` (default) | none | Offline ambient pad generated with ffmpeg: two detuned chords (Am9 ↔ Fmaj9) breathing every 8 s, slow tremolo, lowpass, echo, fades. -18 LUFS. License-free because you generated it. |
| `lyria` | `GEMINI_API_KEY` with billing, optional `LYRIA_MODEL` (default `lyria-3.5`) | Free-tier keys get quota 0. The response format is unverified; on any error the script warns and falls back to `synth`. |
| `elevenlabs` | `ELEVENLABS_API_KEY` | `POST /v1/music`. Falls back to `synth` on error. |
| a file path | none | Copied into the asset dir and looped if shorter than the video. Make sure you have the rights. |

`--music-prompt` overrides the default prompt (instrumental, no vocals, minimal tech bed, unobtrusive under a voiceover, N seconds).

The `audio.music` prop is `{ src, volume: 0.18, duckTo: 0.35 }`. In the composition, the bed fades in over 15 frames, fades out over the last 30, and ramps (8 frames) down to `volume × duckTo` whenever a voice clip plays.

## Licensing

- **Gemini TTS**: governed by the Gemini API terms for your account (free and paid tiers differ). Read them before publishing commercial work.
- **ElevenLabs**: exact timestamps; commercial use of voice and music needs a **paid plan**. Their music is cleared for commercial use on paid plans.
- **Lyria**: needs a billed Gemini API key.
- **Never** use non-commercial (CC-BY-NC) models, such as the F5-TTS pt-BR checkpoints, for commercial work. Fine for experiments, not for ads.
- The `synth` bed is generated locally from sine waves: no license attached.
- macOS `say` voices are for drafts; don't publish them.

## Loudness

| Stage | Target |
|---|---|
| Voice clips (`audio.mjs`) | -16 LUFS integrated, -1.5 dBTP |
| Music bed (`synth`) | -18 LUFS, then played at 0.18 and ducked to 0.35× under voice |
| Final upload (`scripts/webm-to-mp4.sh`) | -14 LUFS, -1 dBTP (Reels, TikTok, Shorts normalize to about this) |

`webm-to-mp4.sh` only normalizes audible tracks. Silent tracks, which every Remotion render has, are left alone.

Measure with `ffmpeg -i out/x.mp4 -af ebur128=peak=true -f null -` and read the summary.

## Cost

- `say` and `synth`: free and offline.
- Gemini TTS: billed per token on paid tiers (see Google's pricing page); the free tier has small daily limits. The cache means re-runs only pay for changed beats.
- ElevenLabs: billed per character (voice) and per generation (music), depending on plan.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `mode "... voice ..." needs a voiceover` | Add `narration` to the beats, or pick `music+captions`. |
| `HTTP 429 ... quota` on Gemini | Free-tier quota. Wait, use a billed key, or `--tts say` for a draft. The script already falls through the model list. |
| `HTTP 503 ... high demand` | Transient; the retries usually get through. Set `GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts` to pin a calmer model. |
| The voice reads the style direction aloud | Use a model-appropriate form (see the Gemini row above) or drop `--style`. |
| Subtitles drift from the voice | Estimated timing. Shorten the narration, add punctuation at pauses, or use `--tts elevenlabs`. |
| Subtitles don't show in a `remotion still` of a single-frame `<Still>` | By design: stills have no narration. Use `remotion still Tour-Reel --frame=N` on the video composition. |
| Music too loud or quiet | Edit `audio.music.volume` / `duckTo` in the output props; no need to regenerate. |
| Render is silent | Check `audio.mode` and that `public/audio/<slug>/` exists on the render machine; it's gitignored. |
