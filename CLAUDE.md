# CLAUDE.md: agent operating guide

This repo gives you three capabilities. Use them in order, and skip the ones you don't need:

1. **Capture**: screenshot or record a running site (`agent-browser`, `scripts/capture-flow.sh`)
2. **Compose**: render Reels, feed posts, and stills with Remotion (`apps/studio`)
3. **Publish**: upload to the password-gated viewer so a human can review from a phone (`scripts/upload.sh` → `apps/media-viewer`)

The full pipeline as a skill: `.claude/skills/agentic-media/SKILL.md`.

## Layout

| Path | Purpose |
|---|---|
| `apps/media-viewer/server.js` | The whole viewer: routes, HTML templates, S3 client, and auth, in one file. Keep it that way, with no client JS and no DB. |
| `apps/studio/src/Root.tsx` | Composition registry and default props |
| `apps/studio/src/components/` | `Promo` (typographic), `ScreenTour` (device mockup + captions), `DemoScreen` (generated placeholder UI), `DeviceFrame`, `shared` |
| `apps/studio/src/audio/` | Audio modes for any composition: `schema` (zod + `flagsFor(mode)`), `AudioLayer` (voice clips + ducked music bed), `Subtitles` (word-synced). Wired into `ScreenTour` via the optional `audio` prop. See `docs/audio.md`. |
| `apps/studio/examples/` | Example props files (`tour-audio.json`: a narrated tour on demo media). |
| `apps/studio/src/before-after/` | `BeforeAfter`: two versions of a page scrolled in sync with captions, a phone scene, a checklist, and an outro. Assets come from `scripts/capture-before-after.sh`. Demo pages live in `apps/studio/before-after-demo/`. |
| `apps/studio/src/launch/` | The kit's launch video (terminal scene in React, real captures, jump cuts, cross-dissolves). Copy it as a starting point. |
| `apps/studio/src/theme.ts` | Fonts, brand defaults, Instagram safe zones |
| `apps/studio/src/type-scale.json` | Overlay font sizes (px at 1080 wide) shared by `ScreenTour`, `Subtitles` and the lint's `font-min` rule (>= 28 px). |
| `apps/studio/public/` | Capture and audio assets (`captures/`, `shots/`, `audio/`), gitignored. `launch/` is the exception: small public footage for the launch example. |
| `scripts/` | `capture-flow.sh`, `capture-before-after.sh` (+ `lib/tile-captures.mjs`), `audio.mjs` (voiceover + music + props for audio modes), `webm-to-mp4.sh`, `upload.sh`, and the review tools `lint-video.mjs`, `contact-sheet.mjs`, `check-beats.mjs` (`docs/review.md`) |
| `scripts/score/` | Procedural music score, Python 3 stdlib only: `make_score.py` (entry), `moods.json` (calm, tech, upbeat, warm), engine adapted from elvarofficial/teardown (MIT, `LICENSE-teardown`). |
| `docs/` | Detailed guides. Read the relevant one before improvising. |

## Commands

```bash
# Capture (verify flags with: agent-browser skills get core --full)
scripts/capture-flow.sh <url> apps/studio/public/captures mobile|desktop
agent-browser open <url> && agent-browser set device "iPhone 14" && agent-browser screenshot out.png
scripts/capture-before-after.sh <before-url> <after-url> apps/studio/public/before-after/<name> both

# Compose (from apps/studio)
npx tsc --noEmit
npx remotion still Reel-Cover out/cover.png
npx remotion render Tour-Reel out/tour.mp4 --props=./tour.json --codec=h264 --pixel-format=yuv420p --audio-codec=aac
npx remotion render Tour-Reel out/preview.mp4 --scale=0.5 --frames=0-89     # quick iteration

# Audio (from repo root): voice per beat + music bed → ready-to-render props
node scripts/audio.mjs apps/studio/examples/tour-audio.json /tmp/tour-voiced.json --name demo --mode auto --goal "onboarding tutorial" --tts gemini
node scripts/audio.mjs ... --tts say                   # offline draft, no keys; procedural score + beat-synced cuts by default
node scripts/audio.mjs ... --mood upbeat --bpm 120     # pick the score; --music synth|lyria|elevenlabs|<file> for other beds

# Review (from repo root): lint props, contact sheet, cuts on the beat
node scripts/lint-video.mjs /tmp/tour-voiced.json --composition Tour-Reel
node scripts/contact-sheet.mjs apps/studio/out/tour.mp4 /tmp/sheet.png --at-cuts /tmp/tour-voiced.json
node scripts/check-beats.mjs apps/studio/out/tour.mp4 apps/studio/public/audio/<slug>/timeline.json

# Normalize + publish (from repo root; needs MEDIA_VIEWER_URL + UPLOAD_TOKEN)
scripts/webm-to-mp4.sh apps/studio/out/tour.mp4 apps/studio/out/tour-ig.mp4
scripts/upload.sh <project-slug> apps/studio/out/tour-ig.mp4 apps/studio/out/cover.png

# Viewer locally (from repo root)
cp apps/media-viewer/.env.example apps/media-viewer/.env   # fill in; COOKIE_SECURE=false for http
npm run viewer
```

Compositions: `Promo-Reel`, `Promo-Feed`, `Promo-Square` (video), `Promo-Still`, `Reel-Cover`, `Square-Still` (stills), `Tour-Reel`, `Tour-Feed` (screen tour; duration is computed from `beats`), `BeforeAfter-Landscape`, `BeforeAfter-Feed` (before/after of a page; duration and `meta.json` come from `calculateMetadata`, see `docs/before-after.md`), and `Launch-Reel`, `Launch-Feed`, `Launch-Cover` (the kit's own launch video, a worked example of the whole pipeline: `src/launch/README.md`).

## Gotchas (read these)

- **Stills render frame 0.** Springs are 0 there, so anything animated with a raw `spring()` is invisible in a `<Still>`. Use `useEnter()` from `components/shared.tsx`, which returns 1 for stills. Only fade out when `durationInFrames > 30`.
- **Always look at the output.** A render can "succeed" and still be blank or broken. Open the PNG (or a frame extracted with `ffmpeg -ss 5 -i x.mp4 -frames:v 1 f.png`) with your image-reading tool before you report done.
- **Match device to capture.** Use `device: "phone"` with mobile captures and `"browser"` with desktop captures. Media uses `object-fit: cover` (default position `top center`).
- **Capture at 2x/3x DPR** (`set device` or `set viewport W H 2`) so zooms stay sharp.
- **agent-browser refs (`@eN`) go stale** after any page change. In scripts, prefer `find role|text|label ... click|fill`.
- **Recording starts a fresh context** (cookies and localStorage are kept). Log in before `record start` so auth screens stay out of the video.
- **Remotion outputs `yuvj420p`.** Run `scripts/webm-to-mp4.sh` on renders before publishing to Instagram.
- **Safe zones.** Keep text out of the Instagram UI overlay (`safeZoneFor()` in `theme.ts`). Preview it with `"showSafeZones": true` and **turn it off** before the final render.
- **Fonts load from Google Fonts at render time**, which needs outbound HTTPS.
- **Audio assets are gitignored** (`public/audio/<slug>/`). A props file with `audio` fails to render on a machine that hasn't run `scripts/audio.mjs`. Gemini TTS word timings are estimated; use ElevenLabs for exact subtitle sync.
- **Remotion MP4s carry 43 ms of AAC priming** (2048 samples, no edit list), so raw-render audio trails the picture. `webm-to-mp4.sh` trims it; always publish its output.
- **Uploads are buffered in memory** by the viewer (`MAX_UPLOAD_MB`, default 1024).
- **`PUBLIC_READ=true`** makes browsing (`/`, `/p/:project`, media URLs) public; uploads still need the cookie or bearer token. Everything in that bucket is then world-readable, so never publish private captures to a public viewer.
- **Project slugs** are lowercased and sanitized to `[a-z0-9-]`. Files at the bucket root appear under `UNSORTED_PROJECT` (default `unsorted`).

## Rules

- **Never commit secrets.** No `.env`, no real viewer URLs, tokens, passwords, or bucket credentials in files, commits, or PR text. Read them from env vars.
- **Never commit capture outputs** (`out/`, `*.mp4`, `*.webm`, `public/captures/`). They are gitignored for a reason and may contain private data.
- Don't ship the default demo copy or colors as real marketing. Set brand props (`brand`, `accent`, `bg`, `fg`, copy) per product.
- Report back to the human with the viewer link (`$MEDIA_VIEWER_URL/p/<project>`), not local file paths. They're probably on a phone.
- Remotion is under its own license (free for individuals and small teams; companies need a company license). Don't claim otherwise.
