# AGENTS.md

Operating guide for Codex, T3 Code, Cursor, and any other agent that reads `AGENTS.md`.

**The canonical guide is [CLAUDE.md](CLAUDE.md).** It applies to every agent, not just Claude. Read it first. The pipeline, step by step, is in [.claude/skills/agentic-media/SKILL.md](.claude/skills/agentic-media/SKILL.md). It's plain Markdown, so follow it as a checklist even if your harness doesn't load skills.

## TL;DR

```bash
# capture → compose → publish
scripts/capture-flow.sh http://localhost:3000 apps/studio/public/captures mobile
(cd apps/studio && npx remotion render Tour-Reel out/tour.mp4 --props=./tour.json --codec=h264 --pixel-format=yuv420p --audio-codec=aac)
scripts/webm-to-mp4.sh apps/studio/out/tour.mp4 apps/studio/out/tour-ig.mp4
scripts/upload.sh my-project apps/studio/out/tour-ig.mp4          # needs MEDIA_VIEWER_URL + UPLOAD_TOKEN
```

## Verification before you say "done"

```bash
node --check apps/media-viewer/server.js
(cd apps/studio && npx tsc --noEmit)
for f in scripts/*.sh; do bash -n "$f"; done
```

Also open at least one rendered PNG or frame and confirm it isn't blank.

## Codex specifics

- Rendering and capture need network access (Google Fonts, the target site) and write access to `apps/studio/out`. Run with `-s workspace-write` and allow network, or pre-cache fonts.
- In a sandbox without a browser, skip capture and render with the generated `DemoScreen` media (`{"type":"demo"}`).
- Never print `UPLOAD_TOKEN` or the viewer password in logs or summaries.
