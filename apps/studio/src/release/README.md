# Release: "now with sound", made with the kit

`Release-Feed` (1080×1350, the X post) and `Release-Reel` (1080×1920) announce the audio modes, with `Release-Cover` (1080×1350) as the poster. Same darkroom look as [`src/launch`](../launch/README.md), but driven by `beats[]` like `Tour-*`, so the audio pipeline runs on it unchanged:

1. **Hook**: "Ship the feature. / Post the video."
2. **Terminal**: the React terminal replays a capture and a render; the step rail is now Capture · Compose · Sound · Review · Publish.
3. **Sound**: the six audio modes as cards; `audio.mjs --mode auto` resolves and the chosen card lights up; cut markers snap onto a beat grid.
4. **Demo**: a real render (`public/launch/tour-demo.mp4`, a 5.9 s slice of a narrated `Tour-Reel` with the tech score) plays in a phone with its own audio. No narration, and the release's music drops out (`musicGaps` in `AudioLayer`, derived from `kind: "demo"` or `muteMusic: true`).
5. **Review**: a contact sheet (`public/launch/release-sheet.jpg`) with the lint / beat check / reviewer verdicts ticking in.
6. **Viewer**: the launch's viewer recording (gallery, reel, Download).
7. **CTA**: repo, licence, author.

Every scene times its animation as a fraction of its beat, because durations change after voicing and beat sync. Footage timings (viewer cuts, tap ring) stay in footage frames. Word subtitles sit in the lower band, left-aligned with the copy and outside the phone; scenes keep that band clear.

## Make it

```bash
# from the repo root: voice (Gemini), procedural score, beat-synced cuts, lint
node scripts/audio.mjs apps/studio/examples/release.json /tmp/release-voiced.json --name release \
  --mode music+voice+captions --tts gemini --voice Kore \
  --style "Warm, confident, unhurried product-launch delivery" --mood tech \
  --voice-rate 1.2 --composition Release-Feed

cd apps/studio
npx remotion render Release-Feed out/release-feed.mp4 --props=/tmp/release-voiced.json --codec=h264 --pixel-format=yuv420p --audio-codec=aac --crf=18
npx remotion render Release-Reel out/release-reel.mp4 --props=/tmp/release-voiced.json --codec=h264 --pixel-format=yuv420p --audio-codec=aac --crf=18
npx remotion still  Release-Cover out/release-cover.png
../../scripts/webm-to-mp4.sh out/release-feed.mp4 out/release-feed-ig.mp4
../../scripts/webm-to-mp4.sh out/release-reel.mp4 out/release-reel-ig.mp4

# review (repo root)
node scripts/contact-sheet.mjs apps/studio/out/release-feed-ig.mp4 /tmp/release-sheet.png --at-cuts /tmp/release-voiced.json
node scripts/check-beats.mjs apps/studio/out/release-feed-ig.mp4 apps/studio/public/audio/release/timeline.json
```

The defaults in `Root.tsx` are `examples/release.json` without `audio`, so the compositions render silent out of the box. `check-beats` reports the two cuts around the demo scene as off the beat: the release's music is muted there and the clip carries another track's music, so there is no accent to find. Checking `public/audio/release/music.wav` on its own passes.
