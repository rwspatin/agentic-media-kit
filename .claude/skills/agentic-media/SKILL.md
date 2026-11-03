---
name: agentic-media
description: Capture a running web app (screenshots or screen recording via agent-browser or T3 Code preview), compose Instagram-ready videos and stills with Remotion (Reel/Story 9:16, feed 4:5, square, cover), and publish them to a password-gated media-viewer so a human can review and download from a phone. Use for "record the flow", "screenshot the UI on mobile", "validate the UI visually", "make a reel/promo video/story/post of this feature", "product tour video", "render a cover image", "upload the video so I can see it on my phone", or any capture → compose → publish request. Requires the agentic-media-kit repo.
---

# agentic-media: capture → compose → publish

Drives the [agentic-media-kit](https://github.com/rwspatin/agentic-media-kit) pipeline. All paths below are relative to the kit root, `$KIT` (the clone of that repo). If the user's project *is* the kit, `$KIT` is the repo root.

## 0. Decide the scope

Ask only if it's truly ambiguous. Otherwise infer:

| Request | Steps |
|---|---|
| "check / validate the UI", "screenshot it" | 1 (+ look at the images) |
| "make a reel / promo / post" with no app to capture | 2 (Promo-* or Tour with demo media) → 3 |
| "with voiceover / music / subtitles", "narrated tutorial" | … → 2 → 2a → 2b → 3 |
| "record the flow and make a reel", "product tour" | 1 → 2 → 2b → 3 |
| "before/after video", "show the redesign" | 1 (`capture-before-after.sh`) → 2 (`BeforeAfter-*`) → 3 |
| "upload this file" | 3 |

Gather: target URL, mobile or desktop, brand (name, accent/bg/fg hex, copy), placement (Reel 9:16, feed 4:5, square), and the viewer project slug (default: the product name, slugified).

## 1. Capture

Check the tool first: `agent-browser skills get core --full` is the authoritative flag reference, so don't guess flags.

```bash
# Quick evidence
agent-browser open <url>
agent-browser set device "iPhone 14"          # or: set viewport 1440 900 2
agent-browser wait --load networkidle
agent-browser screenshot "$KIT/apps/studio/public/shots/01.png"

# Scripted flow → WebM + MP4 + screenshots (edit the flow section for the real app)
"$KIT/scripts/capture-flow.sh" <url> "$KIT/apps/studio/public/captures" mobile
```

- **Before/after of a page:** `"$KIT/scripts/capture-before-after.sh" <before-url> <after-url> "$KIT/apps/studio/public/before-after/<name>" both` writes JPG tiles plus `meta.json` with section anchors. Use `CAPTURE_CSS=<file.css>` to un-stick headers or hide banners, and `SECTION_SELECTOR` if sections aren't `main > section`. See `docs/before-after.md`.
- Log in **before** `record start`. Use semantic locators (`find role button click --name ...`) in scripts, not `@eN` refs.
- In **T3 Code**, you can use `preview_open` → `preview_resize {mode:"preset",preset:"iphone-12-pro"}` → `preview_recording_start` → drive the flow → `preview_recording_stop` (returns a file path), then `scripts/webm-to-mp4.sh <path> <kit>/apps/studio/public/captures/flow.mp4`. See `docs/t3-code.md`.
- **Validate:** open the PNGs with your image tool and describe what you see. If the UI is broken, say so (and fix it if that's in scope) before making marketing out of it.

## 2. Compose (Remotion, `apps/studio`)

Write props to a JSON file. Don't edit component code for copy or brand changes.

```json
{
  "brand": "Acme", "accent": "#7c9cff", "bg": "#0b0f1a", "fg": "#f4f6fb",
  "device": "phone", "outroSub": "acme.com",
  "beats": [
    {"kind": "intro", "eyebrow": "New", "caption": "Onboarding, rebuilt.", "durationInFrames": 60},
    {"kind": "shot", "eyebrow": "Step 01", "caption": "Sign up in seconds.", "durationInFrames": 150,
     "media": {"type": "video", "src": "captures/flow.mp4", "startAtSeconds": 1},
     "zoom": {"x": 0.5, "y": 0.4, "from": 1, "to": 1.08}},
    {"kind": "shot", "eyebrow": "Step 02", "caption": "Everything in one place.", "durationInFrames": 90,
     "media": {"type": "image", "src": "captures/01-landing.png"}},
    {"kind": "outro", "eyebrow": "Live now", "caption": "Try it today.", "durationInFrames": 60}
  ]
}
```

```bash
cd "$KIT/apps/studio"
npx remotion render Tour-Reel out/preview.mp4 --props=./tour.json --scale=0.5 --frames=0-89   # fast check
npx remotion render Tour-Reel out/tour.mp4 --props=./tour.json --codec=h264 --pixel-format=yuv420p --audio-codec=aac
npx remotion still  Tour-Reel out/cover.png --props=./tour.json --frame=30
```

| Composition | Size | Use |
|---|---|---|
| `Tour-Reel` / `Tour-Feed` | 1080×1920 / 1080×1350 | Captures in a phone or browser mockup with step captions. Duration = sum of beats. Optional `audio` (voice, music, subtitles): step 2a. |
| `Promo-Reel` / `Promo-Feed` / `Promo-Square` | 9:16 / 4:5 / 1:1 | Typographic promo. Props: `brand, eyebrow, headline, subheadline, cta, accent, bg, fg` |
| `Reel-Cover` / `Promo-Still` / `Square-Still` | stills | Cover and feed images, using the same Promo props |
| `BeforeAfter-Landscape` / `BeforeAfter-Feed` | 1920×1080 / 1080×1350 | Two versions of a page scrolled in sync with captions, then phone, checklist and outro. Props: `capturesDir`, `intro`, `desktop.beats[{section, caption, durationInFrames}]`, optional `mobile`/`checklist`, `outro`. Duration = sum of scenes. |

Rules:
- `device: "phone"` for mobile captures, `"browser"` for desktop. `media.type: "demo"` (variants `dashboard | list | success`) when there's nothing to capture.
- Keep Reels ≤ 90 s at 30 fps. Keep text inside the safe zone: preview with `"showSafeZones": true`, then **remove it**.
- **Look at the result.** Open the cover PNG, and extract a mid-video frame with `ffmpeg -ss 5 -i out/tour.mp4 -frames:v 1 out/check.png` and open it too. A blank or cropped frame means it's not done.
- New visual design (not just new copy)? Design it deliberately. Load the project's frontend or design skill if one exists, and don't ship the neutral defaults as a brand.

## 2a. Audio (Tour-* only; skip for silent drafts)

1. **Propose a mode** to the human with a one-line reason: tutorial/onboarding → `music+voice+captions`; ad/launch → `music+captions`; testimonial/story → `voice+captions`. `--mode auto --goal "<goal>" --placement <p>` prints a deterministic pick + reason. Table and rationale: `docs/audio.md`.
2. **Voice modes: write `narration` per beat** in the props. Short: ~2.5 words/sec, at most the beat length, one idea, not the headline read aloud. Match the audience's language.
3. **Run the script**, then render the command it prints:
   ```bash
   cd "$KIT"
   node scripts/audio.mjs ./tour.json ./tour-voiced.json --name <slug> --mode <mode|auto> --goal "<goal>" \
     --tts gemini                        # --tts say for an offline draft; elevenlabs for exact word sync
   ```
   The music defaults to a procedural score (mood from the goal; `--mood calm|tech|upbeat|warm`, `--bpm`) and the beats are snapped to its tempo so cuts land on the beat.
4. **Verify**: `ffprobe` shows an audio stream; `ffmpeg -i out.mp4 -af ebur128 -f null -` reports loudness; `node scripts/check-beats.mjs <render> <timeline.json>` (path printed by the script) passes; open a frame mid-narration and confirm the subtitles are drawn and readable. Report the provider/model used and anything that fell back (quota, `synth` instead of `procedural`/`lyria`).

Needs `GEMINI_API_KEY` (or `ELEVENLABS_API_KEY` + voice id) for real voices. Never publish `say` voices or CC-BY-NC model output commercially.

## 2b. Clean-context review (before publishing)

```bash
cd "$KIT"
node scripts/lint-video.mjs ./tour.json --composition Tour-Reel          # fix every error
node scripts/contact-sheet.mjs apps/studio/out/tour.mp4 /tmp/tour-sheet.png --at-cuts ./tour.json
```

Then spawn a **fresh subagent with an explicit model tier** (e.g. a Sonnet-tier agent; never inherit the default). Give it only the contact sheet path, the props JSON path, the rules (`node scripts/lint-video.mjs --rules` + the lint output) and the goal in one sentence: not this conversation. Tell it subtitles over the device screen are intentional. It returns PASS/FAIL with concrete issues per beat. On FAIL, fix, re-render, and review again with a new subagent. Prompt and checklist: `docs/review.md`.

## 3. Publish (media-viewer)

```bash
cd "$KIT"
scripts/webm-to-mp4.sh apps/studio/out/tour.mp4 apps/studio/out/tour-ig.mp4   # Instagram-safe H.264/yuv420p/AAC/faststart
scripts/upload.sh <project-slug> apps/studio/out/tour-ig.mp4 apps/studio/out/cover.png
```

- Needs `MEDIA_VIEWER_URL` and `UPLOAD_TOKEN` in the env. If they're missing, stop and ask the user. Never guess, and never print the token.
- `upload.sh` exits non-zero and prints the HTTP status and body on failure (401 = wrong token, 5xx = bucket or env issue on the server).
- No viewer deployed yet? Point the user to `docs/deploy-railway.md`.

## 4. Report

Reply with:
- the review link `$MEDIA_VIEWER_URL/p/<project-slug>`, since the user is likely on a phone
- what was captured (URL, viewport) and what you validated or noticed in the UI
- the output specs (composition, duration, resolution), for example from `ffprobe -v error -show_entries stream=codec_name,width,height,pix_fmt -show_entries format=duration -of compact <file>`
- anything not verified

## Install this skill

```bash
# symlink (tracks updates when you git pull the kit)
mkdir -p ~/.claude/skills && ln -s "$(pwd)/.claude/skills/agentic-media" ~/.claude/skills/agentic-media
# or copy
cp -R .claude/skills/agentic-media ~/.claude/skills/
```

Inside the kit repo itself, Claude Code picks it up automatically from `.claude/skills/`.
