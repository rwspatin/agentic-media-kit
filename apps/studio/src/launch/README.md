# Launch: the kit's own launch video, made with the kit

`Launch-Reel` (1080×1920), `Launch-Feed` (1080×1350) and `Launch-Cover` (still) are the pieces used to announce agentic-media-kit. They were made with the same pipeline the kit gives your agent, so they double as a worked example:

1. **Capture.** `capture-launch.sh` records the public demo viewer on an iPhone 14 viewport with agent-browser (gallery, tap, playback, Download) and takes a full-page mobile screenshot of the GitHub repo.
2. **Compose.** `Launch.tsx` cuts it into five scenes: hook, a terminal rendered in React (`Terminal.tsx`, replaying the real commands), the viewer recording inside a phone, the repo, and the CTA. `theme.ts` holds the palette, fonts and scene timeline.
3. **Publish.** Renders are normalized with `scripts/webm-to-mp4.sh` and uploaded with `scripts/upload.sh launch ...` to a viewer running with `PUBLIC_READ=true`.

## Look

A "darkroom" slate: warm ink background with a faint contact-sheet grid and grain, bone-white type, one vermilion signal colour. Instrument Serif italic for headlines, JetBrains Mono for the terminal, labels and the running timecode, Instrument Sans for body copy. Captions are in Brazilian Portuguese; edit the strings in `Launch.tsx` to translate.

## Render

```bash
cd apps/studio
npx remotion render Launch-Reel out/launch/launch-reel.mp4 --codec=h264 --pixel-format=yuv420p --audio-codec=aac --crf=18
npx remotion render Launch-Feed out/launch/launch-feed.mp4 --codec=h264 --pixel-format=yuv420p --audio-codec=aac --crf=18
npx remotion still  Launch-Cover out/launch/launch-cover.png
../../scripts/webm-to-mp4.sh out/launch/launch-reel.mp4 out/launch/launch-reel-ig.mp4
../../scripts/webm-to-mp4.sh out/launch/launch-feed.mp4 out/launch/launch-feed-ig.mp4
```

Preview Instagram's UI overlay with `--props='{"showSafeZones":true, ...}'` (pass the other defaults from `Root.tsx` too) and turn it off for the final render.

## Footage

`public/launch/viewer.mp4` and `public/launch/repo.jpg` are committed (about 2.5 MB, public content only) so the compositions render out of the box. To recapture against your own public viewer:

```bash
MEDIA_VIEWER_URL=https://your-viewer.example.com apps/studio/src/launch/capture-launch.sh launch
```

Then re-measure `viewerCuts` (which seconds of the recording to play), `downloadAtFrame` and `downloadPoint` (where the tap ring lands) in `src/Root.tsx`. Extract frames with `ffmpeg -ss <s> -i public/launch/viewer.mp4 -frames:v 1 f.png` and look at them.
