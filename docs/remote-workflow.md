# Remote workflow: agent on a box, human on a phone

The goal: you message an agent from anywhere ("record the new onboarding and make a Reel"). The agent works on a remote machine, and a few minutes later you watch the result on your phone and post it.

```
 you (phone) ──prompt──▶ agent on remote box
                           │ 1. start/locate the app (dev server or staging URL)
                           │ 2. capture   scripts/capture-flow.sh   (agent-browser, headless)
                           │ 3. validate  look at the PNGs; fix UI; re-capture
                           │ 4. compose   remotion render/still     (apps/studio)
                           │ 5. normalize scripts/webm-to-mp4.sh
                           │ 6. publish   scripts/upload.sh <project> <files>
                           ▼
                 media-viewer on Railway ──link──▶ you (phone): watch, Download, post
```

## Prerequisites on the box

- Node 20+, `ffmpeg`, and `agent-browser` (`agent-browser install --with-deps` on Linux)
- this repo cloned, with `npm install` run
- `MEDIA_VIEWER_URL` and `UPLOAD_TOKEN` in the environment. Never commit them. Use the platform's secret or variable store.

On Railway, the [devbox service](deploy-railway.md#optional-a-remote-agent-devbox) is one way to do this. Any VM, Codespace, or CI runner works the same.

## The loop, concretely

```bash
# 1. App under test: local dev server on the box, or a preview/staging URL
(cd ~/my-app && npm run dev -- --port 3000 &)          # or use https://staging.example.com

# 2. Capture (mobile), writing straight into the studio's public/ folder
scripts/capture-flow.sh http://localhost:3000 apps/studio/public/captures mobile

# 3. Validate: the agent opens captures/*.png (multimodal) and checks the UI.
#    If something is wrong, fix the code and re-run step 2.

# 4. Compose
cd apps/studio
cat > /tmp/tour.json <<'JSON'
{ "brand":"My App","accent":"#7c9cff","bg":"#0b0f1a","fg":"#f4f6fb","device":"phone",
  "outroSub":"myapp.com",
  "beats":[
    {"kind":"intro","eyebrow":"New","caption":"Onboarding, rebuilt.","durationInFrames":60},
    {"kind":"shot","eyebrow":"Step 01","caption":"Sign up in seconds.","durationInFrames":150,
     "media":{"type":"video","src":"captures/flow.mp4","startAtSeconds":1}},
    {"kind":"outro","eyebrow":"Live now","caption":"Try it today.","durationInFrames":60}
  ] }
JSON
npx remotion render Tour-Reel out/tour.mp4 --props=/tmp/tour.json --codec=h264 --pixel-format=yuv420p --audio-codec=aac
npx remotion still Tour-Reel out/cover.png --props=/tmp/tour.json --frame=30

# 5. Look at the cover yourself before publishing, then normalize
../../scripts/webm-to-mp4.sh out/tour.mp4 out/tour-ig.mp4

# 6. Publish
../../scripts/upload.sh my-app out/tour-ig.mp4 out/cover.png
# review: https://<viewer>/p/my-app
```

The agent should reply with the `/p/<project>` link and a one-line summary.

## Tips

- **Reproducibility.** Commit the capture script and the props JSON next to your app (for example `marketing/onboarding.capture.sh` and `onboarding.tour.json`). Then re-shooting after a UI change is a single command.
- **Evidence for PRs.** The same PNGs and MP4 prove a UI change works. Upload them to a `pr-123` project and link it in the PR description.
- **Headless only.** Don't rely on a display. agent-browser is headless by default and Remotion renders with its own headless Chrome.
- **Fonts.** The studio loads Google Fonts at render time, so the box needs outbound HTTPS. For offline boxes, switch to local `@font-face` files in `src/theme.ts`.
- **Cost and time.** A 12 s Reel at full resolution renders in well under a minute on a few vCPUs. Use `--scale=0.5 --frames=0-89` while iterating.
