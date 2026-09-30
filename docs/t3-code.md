# Using T3 Code as the capture path

[T3 Code](https://github.com/pingdotgg/t3code) runs coding agents with a built-in, collaborative browser preview that the human watches live. Its MCP tools can stand in for agent-browser. This is useful when you're already in a T3 thread and want the human to see the capture as it happens.

## Tools (as exposed to the agent)

| Tool | Use |
|---|---|
| `preview_open` | Open a preview tab (`url` accepts `localhost:5173`-style hosts). `open: false` runs it in the background. |
| `preview_resize` | `{mode: "preset", preset: "iphone-12-pro"}` (also `iphone-14-pro-max`, `pixel-7`, `ipad-air`, ...), or `{mode: "freeform", width, height}`. This changes layout breakpoints, **not** the user agent. |
| `preview_navigate`, `preview_click`, `preview_type`, `preview_press`, `preview_scroll`, `preview_wait_for` | Drive the flow. |
| `preview_snapshot` | Read the page structure to find targets. |
| `preview_set_appearance` | Switch to light or dark mode. |
| `preview_recording_start` / `preview_recording_stop` | Record the tab. `stop` transfers the compressed recording (up to 50 MiB) to a file in the agent's environment and **returns its path**. |
| `device_open` / `device_screenshot` | iOS Simulator / Android emulator: capture native app screens as PNG. |

Tool names and arguments can change between T3 Code releases. Check the tool list your agent actually sees.

## Flow

1. `preview_open` → `url: "localhost:3000"`
2. `preview_resize` → `{mode: "preset", preset: "iphone-12-pro", orientation: "portrait"}`
3. `preview_recording_start`
4. Drive the flow with `preview_click` / `preview_type` / `preview_wait_for`
5. `preview_recording_stop` → returns e.g. `/path/to/evidence/recording.webm`
6. Hand off to this kit:

```bash
mkdir -p apps/studio/public/captures
scripts/webm-to-mp4.sh /path/to/evidence/recording.webm apps/studio/public/captures/flow.mp4
cd apps/studio && npx remotion render Tour-Reel out/tour.mp4 --props=./tour.json
cd ../.. && scripts/upload.sh my-app apps/studio/out/tour.mp4
```

Run `ffprobe` on the returned file before assuming its container or codec. `webm-to-mp4.sh` accepts any input ffmpeg can read.

## When to use which

| | agent-browser | T3 Code preview |
|---|---|---|
| Human watches live | no (headless) | yes |
| Runs on a headless remote box / CI | yes | needs the T3 app |
| True mobile emulation (UA, touch, DPR) | `set device` | viewport size only |
| Native iOS/Android screens | no | `device_open` + `device_screenshot` |
| Scriptable as a shell file | yes | agent tool calls |

A good split is to explore and validate interactively in T3's preview, then commit the final flow as a `capture-flow.sh` script. The capture then becomes reproducible on any machine.
