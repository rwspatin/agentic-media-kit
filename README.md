# agentic-media-kit

**Let your coding agent show its work.** It opens your running app, records the flow, cuts it into an Instagram-ready Reel, and puts the result on a private page you can open from your phone. You never touch the machine it runs on.

Works with Claude Code, Codex, T3 Code, or any agent that can run a shell. [Português](README.pt-BR.md)

```
 ┌──────────────┐      ┌──────────────────┐      ┌──────────────────────┐
 │   CAPTURE    │      │     COMPOSE      │      │       PUBLISH        │
 │ agent-browser│ ───▶ │  Remotion studio │ ───▶ │  media-viewer (S3)   │ ───▶  your phone
 │ screenshots  │      │  Reel / Feed /   │      │  password-gated page │       review, download,
 │ + WebM video │      │  Story / Still   │      │  bearer-token upload │       post
 └──────────────┘      └──────────────────┘      └──────────────────────┘
   scripts/              apps/studio               apps/media-viewer
   capture-flow.sh                                 scripts/upload.sh
```

## Why

Agents write UI all day, but you still have to *see* the result. And if you ship a feature, it usually deserves a post. This kit covers both with one loop:

1. **Validate UI.** The agent screenshots or records the real, running site on a mobile or desktop viewport, which is better evidence than "it compiles".
2. **Produce promo media.** The same captures go into a brand-neutral Remotion template: a device mockup with captions, a Reel, a feed post, a cover still.
3. **Review remotely.** The agent uploads the output to a small web app on Railway. You open it on your phone, watch it, and tap **Download** to post it.

Everything is scriptable and has no GUI dependencies, so it runs on a remote devbox the same way it runs on your laptop.

## What's inside

| Path | What it is |
|---|---|
| [`apps/media-viewer`](apps/media-viewer) | A single-file Express app with no client JS. It lists projects (bucket prefixes) and plays videos and images from presigned URLs. Download buttons force a real file save. Humans log in with a password cookie; agents upload with `Authorization: Bearer`. It has `/healthz` and ships with a Dockerfile and `railway.json`. |
| [`apps/studio`](apps/studio) | A Remotion 4 template with zod-typed props. Compositions: `Promo-Reel` (1080×1920), `Promo-Feed` (1080×1350), `Promo-Square` (1080×1080), `Promo-Still`, `Reel-Cover`, `Square-Still`, and `Tour-Reel` / `Tour-Feed`. The tour frames screenshots or screen recordings in a phone or browser mockup with step captions. A generated demo UI means everything renders with zero assets. |
| [`scripts/`](scripts) | `capture-flow.sh` records a scripted flow with agent-browser. `webm-to-mp4.sh` turns any video into an Instagram-safe MP4. `upload.sh` publishes to the viewer. |
| [`.claude/skills/agentic-media`](.claude/skills/agentic-media/SKILL.md) | A Claude Code skill that runs the whole pipeline. |
| [`docs/`](docs) | Capture, T3 Code, Instagram specs, Railway deploy, remote workflow. |
| [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) | The operating guide agents read first. |

## Quickstart

Prerequisites: Node 20+, `ffmpeg`, and [agent-browser](https://github.com/vercel-labs/agent-browser) (`npm i -g agent-browser && agent-browser install`).

```bash
git clone https://github.com/rwspatin/agentic-media-kit && cd agentic-media-kit
npm install                                   # installs both workspaces

# 1. Compose: renders out of the box with a generated demo UI
cd apps/studio
npx remotion still Reel-Cover out/cover.png
npx remotion render Tour-Reel out/tour.mp4 --codec=h264 --pixel-format=yuv420p --audio-codec=aac
npm run studio                                # visual editor + props panel

# 2. Capture your own app (from the repo root), then use it in the tour
cd ../..
scripts/capture-flow.sh http://localhost:3000 apps/studio/public/captures mobile
cd apps/studio && npx remotion render Tour-Reel out/my-tour.mp4 --props='{
  "brand":"My App","accent":"#7c9cff","bg":"#0b0f1a","fg":"#f4f6fb",
  "device":"phone","outroSub":"myapp.com",
  "beats":[
    {"kind":"intro","eyebrow":"New","caption":"Onboarding, rebuilt.","durationInFrames":60},
    {"kind":"shot","eyebrow":"Step 01","caption":"Sign up in seconds.","durationInFrames":150,
     "media":{"type":"video","src":"captures/flow.mp4","startAtSeconds":1}},
    {"kind":"shot","eyebrow":"Step 02","caption":"Land where it matters.","durationInFrames":90,
     "media":{"type":"image","src":"captures/01-landing.png"}}
  ]}'

# 3. Publish (after deploying the viewer, see below)
cd ../..
export MEDIA_VIEWER_URL=https://your-viewer.example.com UPLOAD_TOKEN=...
scripts/webm-to-mp4.sh apps/studio/out/my-tour.mp4 apps/studio/out/my-tour-ig.mp4
scripts/upload.sh my-app apps/studio/out/my-tour-ig.mp4 apps/studio/out/cover.png
# -> review: https://your-viewer.example.com/p/my-app
```

Run the viewer locally with `cp apps/media-viewer/.env.example apps/media-viewer/.env`. Fill in the values, set `COOKIE_SECURE=false`, then run `npm run viewer`.

## Deploy on Railway

The viewer needs a Railway service plus a Railway bucket. The short version:

```bash
railway init --name media-viewer                     # new project
railway add --service media-viewer                   # empty service
railway bucket create media --json                   # S3-compatible bucket
railway bucket credentials --bucket media --json     # -> name, endpoint, keys
railway variable set --service media-viewer --skip-deploys \
  AUTH_PASSWORD='pick-a-strong-one' SESSION_SECRET="$(openssl rand -hex 32)" \
  UPLOAD_TOKEN="$(openssl rand -hex 32)" BUCKET_REGION=auto \
  BUCKET_NAME=... BUCKET_ENDPOINT=... BUCKET_ACCESS_KEY_ID=... BUCKET_SECRET_ACCESS_KEY=...
railway up apps/media-viewer --path-as-root --service media-viewer   # uses its Dockerfile + railway.json
railway domain --service media-viewer                # public https URL
```

The full walkthrough is in [docs/deploy-railway.md](docs/deploy-railway.md). It covers wiring the bucket credentials, health checks, and an optional always-on **agent devbox** service that runs the whole pipeline remotely.

## Guides

- [Capture with agent-browser](docs/capture-with-agent-browser.md): screenshots, mobile viewports, scripted WebM recordings, and WebM to MP4
- [T3 Code](docs/t3-code.md): built-in preview and recording tools as an alternative capture path
- [Instagram specs](docs/instagram.md): Reel, Story, and Feed sizes, safe zones, codecs, cover frames, and exact render commands
- [Deploy on Railway](docs/deploy-railway.md)
- [Remote workflow](docs/remote-workflow.md): agent on a remote box, human on a phone

## Design choices

- **The bucket is the database.** A project is just a key prefix, so there's nothing to migrate or back up besides the bucket.
- **No client-side JS in the viewer.** It's server-rendered HTML forms and links. It is simple enough that it keeps working unattended for months.
- **Presigned URLs.** Video never streams through the app. One URL plays inline and a second forces the download, which is what makes "save to phone, then post" work.
- **Props are data.** Every composition is typed by a zod schema. Agents change copy, colors, and beats through `--props`, not by editing code.
- **Stills are safe.** A Remotion `<Still>` renders frame 0, where springs are still at 0 (invisible). Every animation goes through a `useEnter()` hook that returns the settled state for stills.

## Licensing

- The code in this repo is released under the [MIT](LICENSE) license.
- **Remotion has its own license.** It is free for individuals and small teams. Companies above the threshold need a [Remotion company license](https://www.remotion.dev/license). Check it before using the studio commercially.
- agent-browser, Railway, and Instagram are third-party products, each under its own terms.

## Author

Built by **Renan Winter Spatin**, Software Architect and Technology Strategist.
GitHub: [@rwspatin](https://github.com/rwspatin)

If this saved you a few hours, a star or a mention is appreciated. Issues and PRs are welcome.
