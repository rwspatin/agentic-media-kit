# Launch: the kit's own launch video, made with the kit

`Launch-Reel` (1080×1920, 14.7s) is the video used to announce agentic-media-kit, with `Launch-Cover` as its still. `Launch-Feed` (1080×1350) renders the same story in 4:5. They were made with the same pipeline the kit gives your agent, so they double as a worked example:

1. **Capture.** `capture-launch.sh` records the public demo viewer on an iPhone 14 viewport with agent-browser: gallery, tap into the project, the reel playing, scroll to Download.
2. **Compose.** `Launch.tsx` cuts it into four scenes that cross-dissolve into each other: the hook, a terminal rendered in React (`Terminal.tsx`, replaying the real commands fast), the viewer recording inside a phone (three jump cuts, plus a tap ring on Download), and the CTA. `theme.ts` holds the palette, fonts, and scene timeline.
3. **Publish.** The render is normalized with `scripts/webm-to-mp4.sh` and uploaded with `scripts/upload.sh launch ...` to a viewer running with `PUBLIC_READ=true`.

It's recursive on purpose: the footage in the phone is the viewer playing an earlier render of this same reel.

## Look

A "darkroom" slate: warm ink background with a faint contact-sheet grid and grain, bone-white type, and one vermilion signal colour. Headlines are Instrument Serif italic. The terminal, labels, and running timecode are JetBrains Mono, and body copy is Instrument Sans. Every string lives in `Launch.tsx` and `Terminal.tsx`.

## Render

```bash
cd apps/studio
npx remotion render Launch-Reel out/launch/launch-reel.mp4 --codec=h264 --pixel-format=yuv420p --audio-codec=aac --crf=18
npx remotion still  Launch-Cover out/launch/launch-cover.png
../../scripts/webm-to-mp4.sh out/launch/launch-reel.mp4 out/launch/launch-reel-ig.mp4
```

To preview Instagram's UI overlay, pass `"showSafeZones": true` in `--props` along with the other defaults from `Root.tsx`. Turn it off for the final render.

## Footage

`public/launch/viewer.mp4` is committed (about 2 MB of public content) so the compositions render out of the box. To recapture against your own public viewer, upload a first render to the project, then run:

```bash
MEDIA_VIEWER_URL=https://your-viewer.example.com apps/studio/src/launch/capture-launch.sh launch
```

Then re-measure `viewerCuts` (which seconds of the recording to play), `downloadAtFrame`, and `downloadPoint` (where the tap ring lands) in `src/Root.tsx`. Extract frames with `ffmpeg -ss <s> -i public/launch/viewer.mp4 -frames:v 1 f.png` and look at them. Recordings occasionally come out truncated, so check the duration with `ffprobe` and rerun if it's short.
