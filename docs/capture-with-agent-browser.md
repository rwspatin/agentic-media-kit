# Capture with agent-browser

[agent-browser](https://github.com/vercel-labs/agent-browser) is a headless-Chrome CLI built for agents: compact accessibility snapshots with `@eN` refs, screenshots and WebM recording, no Playwright dependency. It's the default capture path in this kit.

> Always check the authoritative, version-matched reference before scripting:
> `agent-browser skills get core --full` and `agent-browser record --help`.
> Commands below were verified against agent-browser 0.33.

## Install

```bash
npm i -g agent-browser && agent-browser install      # downloads a bundled Chrome
agent-browser install --with-deps                    # Linux: also installs system libs
agent-browser doctor --offline --quick               # sanity check
```

## Screenshots

```bash
agent-browser open http://localhost:3000
agent-browser wait --load networkidle
agent-browser screenshot shots/home.png              # viewport
agent-browser screenshot --full shots/home-full.png  # full scroll height
agent-browser screenshot --annotate shots/map.png    # numbered labels keyed to @refs (great for UI review)
agent-browser close
```

### Viewports

```bash
agent-browser set device "iPhone 14"      # mobile: viewport + DPR + touch + UA
agent-browser set viewport 390 844 3      # or explicit CSS size + device pixel ratio
agent-browser set viewport 1440 900 2     # desktop, 2x for crisp stills
agent-browser set media dark              # emulate prefers-color-scheme
agent-browser set media light reduced-motion
```

Set the viewport **after** `open` and **before** capturing. A 2x or 3x DPR gives screenshots that stay sharp when Remotion zooms into them.

## Record a scripted flow (WebM)

```bash
agent-browser open http://localhost:3000
agent-browser set device "iPhone 14"
agent-browser snapshot -i                         # plan the flow; refs change every snapshot
agent-browser record start captures/flow.webm     # fresh context, keeps cookies/localStorage
agent-browser wait --load networkidle
agent-browser find role button click --name "Get started"
agent-browser wait --url "**/signup"
agent-browser find label "Email" fill "demo@example.com"
agent-browser press Enter
agent-browser wait --text "Welcome"
agent-browser record stop
agent-browser close
```

- `record start <path> [url]` records from the current page if no URL is given. `record restart <path>` stops the current take and starts a new one.
- In scripts, use **semantic locators** (`find role|text|label|placeholder|testid ...`) instead of `@eN` refs. Refs are regenerated on every snapshot.
- Leave about 1 second of stillness at the start and end (`wait 1000`). You can trim it later with `startAtSeconds` in the tour props.
- Log in *before* `record start`. The recording context keeps cookies, so auth screens stay out of the video. For secrets, use `agent-browser auth save` / `auth login` instead of typing passwords on the command line.

`scripts/capture-flow.sh <url> [out-dir] [mobile|desktop]` is a ready-made template of this flow. It captures screenshots, the WebM, and the converted MP4.

## WebM to MP4

Remotion can read WebM, but Instagram and most phones want H.264 MP4. Convert with:

```bash
scripts/webm-to-mp4.sh captures/flow.webm            # -> captures/flow.mp4
```

The script runs this:

```bash
ffmpeg -i in.webm \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2:out_range=tv,fps=30,format=yuv420p" \
  -c:v libx264 -profile:v high -preset slow -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ar 48000 -ac 2 -movflags +faststart out.mp4
```

If the input has no audio track, it adds a silent AAC track, because some upload paths reject video-only files.

## Using captures in the studio

Put files under `apps/studio/public/` (for example `public/captures/flow.mp4` and `public/shots/home.png`) and reference them in the tour props by their path relative to `public/`:

```json
{"media": {"type": "video", "src": "captures/flow.mp4", "startAtSeconds": 1}}
{"media": {"type": "image", "src": "shots/home.png", "position": "top center"}}
```

Match device to capture: use `"device": "phone"` with mobile captures and `"device": "browser"` with desktop ones. Otherwise the capture gets cropped by `object-fit: cover`.
