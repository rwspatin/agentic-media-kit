# public/

Put capture assets here and reference them by path relative to this folder
(Remotion's `staticFile()`), e.g. `{"type":"image","src":"shots/01-home.png"}`.

Suggested layout (all gitignored except this README):

- `shots/`    — PNG/JPG screenshots from `agent-browser screenshot`
- `captures/` — screen recordings (convert WebM → MP4 with `scripts/webm-to-mp4.sh`)

`launch/` holds the (public) footage for the `Launch-*` example compositions;
see `src/launch/README.md` to recapture it. No client screenshots ship with this template; the default tour renders a
generated placeholder UI (`src/components/DemoScreen.tsx`).
