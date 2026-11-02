# Audio: voiceover, music, and word-synced subtitles

`Tour-Reel` and `Tour-Feed` are silent by default. Add an `audio` prop and they get a voiceover per beat, a music bed that ducks under the voice, and TikTok-style subtitles of the narration. `scripts/audio.mjs` generates the assets and writes a props file that is ready to render. By default the music is a **procedural score** generated for the video, and every cut is snapped to its beat.

```bash
# from the repo root
node scripts/audio.mjs apps/studio/examples/tour-audio.json /tmp/tour-voiced.json \
  --name demo --mode auto --goal "onboarding tutorial" --tts gemini
cd apps/studio && npx remotion render Tour-Reel out/demo.mp4 --props=/tmp/tour-voiced.json \
  --codec=h264 --pixel-format=yuv420p --audio-codec=aac
cd ../.. && node scripts/check-beats.mjs apps/studio/out/demo.mp4 apps/studio/public/audio/demo/timeline.json
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
- The script lengthens a beat when its voice doesn't fit: `durationInFrames = max(original, ceil((6/fps + voice + 0.45 s) * fps))`. The voice starts 6 frames (`VOICE_LEAD`) after its beat cuts in. With the procedural score, beats are then snapped up to whole musical beats (see [Beat-synced cuts](#beat-synced-cuts)).
- A voice mode without any `narration` fails with a message telling you to write it.

## The script

```
node scripts/audio.mjs <in-props.json> <out-props.json> --name <slug>
    --mode <one of the 6 modes | auto> [--goal "<free text>"] [--placement reel|feed|landscape|story]
    [--tts gemini|elevenlabs|say] [--voice <name>] [--style "<delivery direction>"] [--fps 30]
    [--music procedural|synth|lyria|elevenlabs|<path to audio file>] [--music-prompt "<text>"]
    [--mood calm|tech|upbeat|warm] [--bpm <n>] [--key <tonic>] [--no-beat-sync] [--no-lint]
```

- Assets go to `apps/studio/public/audio/<slug>/` (gitignored). Props reference them relative to `public/` (`audio/<slug>/beat-1.wav`).
- Every voice clip is trimmed of leading/trailing silence, two-pass loudness-normalized to **-16 LUFS / -1.5 dBTP**, and written as 48 kHz mono WAV.
- Clips are cached by `sha1(provider|model|voice|style|text)` in `manifest.json`. Edit one beat and re-run: only that beat is regenerated.
- The procedural score is cached by its timeline in `manifest.json` too: same beats, same score, no re-render.
- At the end the output props are linted (`scripts/lint-video.mjs`, non-fatal; `--no-lint` skips it). See [review.md](review.md).
- Needs Node ≥ 18 and `ffmpeg`/`ffprobe` on `PATH`; the procedural score also needs `python3` (stdlib only). No npm or pip dependencies.

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
| `procedural` (default) | none (`python3`) | A score written for this video by `scripts/score/make_score.py`: chords, bass, soft drums, a motif, an accent on every cut, a resolving ending. -14 LUFS. See [Procedural score](#procedural-score). Falls back to `synth` without `python3`. |
| `synth` | none | Offline ambient pad generated with ffmpeg: two detuned chords (Am9 ↔ Fmaj9) breathing every 8 s, slow tremolo, lowpass, echo, fades. -18 LUFS. |
| `lyria` | `GEMINI_API_KEY` with billing, optional `LYRIA_MODEL` (default `lyria-3.5`) | Free-tier keys get quota 0. The response format is unverified; on any error the script warns and falls back to `synth`. |
| `elevenlabs` | `ELEVENLABS_API_KEY` | `POST /v1/music`. Falls back to `synth` on error. |
| a file path | none | Copied into the asset dir and looped if shorter than the video. Make sure you have the rights. |

`--music-prompt` overrides the default prompt (instrumental, no vocals, minimal tech bed, unobtrusive under a voiceover, N seconds).

The `audio.music` prop is `{ src, volume: 0.18, duckTo: 0.35 }` (`volume: 0.12` for the procedural score, which is mastered 4 dB hotter than the synth bed). In the composition, the bed fades in over 15 frames, fades out over the last 30, and ramps (8 frames) down to `volume × duckTo` whenever a voice clip plays.

## Procedural score

`scripts/score/make_score.py` writes a 48 kHz stereo WAV from a timeline that `audio.mjs` saves next to the assets (`public/audio/<slug>/timeline.json`):

```json
{ "mood": "calm", "bpm": 84, "key": "F", "durationSec": 16.43, "cuts": [2.867, 7.133, 11.433, 14.3],
  "voice": [{ "startSec": 0.2, "endSec": 2.106 }] }
```

- **Bed**: an e-piano chord per bar (the bar grid starts at t = 0), bass, soft drums from bar 2, a motif every other bar (it rests while a voice speaks; the bed itself is never ducked here, the composition does that), an optional 8th-note pulse.
- **Cuts**: a soft hit lands exactly on every cut, with a short riser into it.
- **Ends**: a gentle fade-in; the dominant on the second-to-last bar, then the tonic rung out from the last bar line, so the music resolves instead of stopping mid-bar.
- **Master**: -14 LUFS integrated, true peak ≤ -1.5 dBTP (BS.1770 meter in `loudness.py`).
- Pure Python 3 stdlib: no numpy, nothing to compile. About 5 s for a 15 s video, 25 s for 90 s.

Run it on its own with `python3 scripts/score/make_score.py --timeline t.json --out music.wav [--mood tech] [--bpm 100] [--key A]`.

### Moods

| Mood | bpm | Default key | Sound | `audio.mjs` picks it for goals like |
|---|---|---|---|---|
| `calm` | 84 | F | e-piano, brushed kit, chime accents | onboarding, walkthrough, tour; also the default |
| `tech` | 100 | A minor | soft keys under an 8th-note blip pulse, blip motif | tutorial, how-to, demo, feature |
| `upbeat` | 118 | D | brighter drums, off-beat chord stabs | ad, promo, launch, teaser, campaign |
| `warm` | 92 | E♭ | lo-fi: low-passed jazz chords, swing, vinyl crackle | testimonial, story, founder, behind the scenes |

`--mood`, `--bpm` and `--key` override the pick. Each mood is a chord progression, a cadence chord and instrument settings in `scripts/score/moods.json`; add one there and it's available everywhere.

### Beat-synced cuts

With the procedural score, `audio.mjs` snaps each beat's `durationInFrames` **up** to a whole number of musical beats. Cut times are kept in beats and rounded to frames once, `frame = round(beatsSoFar × fps × 60 / bpm)`, so rounding never drifts (each cut is within half a frame, ≤ 17 ms at 30 fps, of the grid). Beats only get longer, by less than one musical beat each. The cut times go into the timeline, so the accents land on the cuts. `--no-beat-sync` keeps the original lengths (the accents still follow the cuts, off the grid).

### Checking it

```bash
node scripts/check-beats.mjs apps/studio/out/demo.mp4 apps/studio/public/audio/demo/timeline.json
```

It decodes the audio with ffmpeg, high-passes it, finds onsets (energy rises of ≥ 6 dB in 8 ms windows) and prints, per cut, the offset to the beat grid and to the nearest onset. Exit 1 if any cut is more than 40 ms from an onset (`--tolerance` to change). It works on the raw render, the `-ig.mp4`, or the score WAV.

Remotion's MP4s decode with 2048 samples (42.7 ms) of AAC encoder priming in front and no edit list, so in a raw render the audio trails the picture. `scripts/webm-to-mp4.sh` trims it from Remotion renders before publishing (`AAC_PRIMING_SAMPLES=0` disables), and `check-beats.mjs` skips it when measuring a raw render, so both report the same offsets.

## Licensing

- **Gemini TTS**: governed by the Gemini API terms for your account (free and paid tiers differ). Read them before publishing commercial work.
- **ElevenLabs**: exact timestamps; commercial use of voice and music needs a **paid plan**. Their music is cleared for commercial use on paid plans.
- **Lyria**: needs a billed Gemini API key.
- **Never** use non-commercial (CC-BY-NC) models, such as the F5-TTS pt-BR checkpoints, for commercial work. Fine for experiments, not for ads.
- The `procedural` score and the `synth` bed are generated on your machine from code: no samples, no license attached to the audio. The score engine in `scripts/score/` is adapted from [elvarofficial/teardown](https://github.com/elvarofficial/teardown), itself built on [whaleyxbt/claude-motion](https://github.com/whaleyxbt/claude-motion) (MIT, © 2026 elvarofficial and whaleyxbt; `scripts/score/LICENSE-teardown`).
- macOS `say` voices are for drafts; don't publish them.

## Loudness

| Stage | Target |
|---|---|
| Voice clips (`audio.mjs`) | -16 LUFS integrated, -1.5 dBTP |
| Procedural score | -14 LUFS, ≤ -1.5 dBTP, then played at 0.12 (≈ -32 LUFS in the mix) and ducked to 0.35× under voice |
| Music bed (`synth`) | -18 LUFS, then played at 0.18 (≈ -33 LUFS) and ducked to 0.35× under voice |
| Final upload (`scripts/webm-to-mp4.sh`) | -14 LUFS, -1 dBTP (Reels, TikTok, Shorts normalize to about this) |

`webm-to-mp4.sh` only normalizes audible tracks. Silent tracks, which every Remotion render has, are left alone.

Measure with `ffmpeg -i out/x.mp4 -af ebur128=peak=true -f null -` and read the summary.

## Cost

- `say`, `procedural` and `synth`: free and offline.
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
| `check-beats` fails by about +43 ms on every cut | The file still has Remotion's AAC priming: run `scripts/webm-to-mp4.sh` on the raw render, or don't override `AAC_PRIMING_SAMPLES`. |
| `check-beats` fails on a few cuts | The voice may mask the accent there; check the score WAV alone (`check-beats.mjs public/audio/<slug>/music.wav ...`). If that passes, the render is fine. |
| `warning: --music procedural needs python3` | Install Python 3 (any 3.8+); it uses only the standard library. |
| Music too loud or quiet | Edit `audio.music.volume` / `duckTo` in the output props; no need to regenerate. |
| Render is silent | Check `audio.mode` and that `public/audio/<slug>/` exists on the render machine; it's gitignored. |
