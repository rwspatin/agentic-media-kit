# Review: lint, contact sheet, clean-context check

A render can succeed and still be wrong: a caption nobody can read in time, a zoom on every shot, the safe-zone overlay left on. Three scripts catch that before a human sees it, and a fresh agent with no stake in the work does the final look.

```bash
# from the repo root
node scripts/lint-video.mjs /tmp/tour.json --composition Tour-Reel        # exit 1 on errors
node scripts/contact-sheet.mjs apps/studio/out/tour.mp4 /tmp/tour-sheet.png --at-cuts /tmp/tour.json
node scripts/check-beats.mjs apps/studio/out/tour.mp4 apps/studio/public/audio/<slug>/timeline.json   # procedural score only
```

`scripts/audio.mjs` already runs the lint on the props it writes (non-fatal, `--no-lint` to skip).

## Lint rules

`node scripts/lint-video.mjs --rules` prints this table. Thresholds are constants at the top of `scripts/lint-video.mjs`; frames assume `--fps` (default 30).

| id | severity | rule | why |
|---|---|---|---|
| `min-shot` | error | every beat ≥ 45 frames (1.5 s) | shorter reads as a glitch, not a cut |
| `caption-rate` | error > 3.0, warn ≥ 2.5 | caption words ÷ beat seconds | people read about 3 words/s on a phone, while also looking at the screen |
| `caption-length` | error | caption ≤ 90 characters | two lines at the caption size |
| `eyebrow-length` | error | eyebrow ≤ 24 characters | one short uppercase line |
| `narration-rate` | warn | narration words ÷ voice seconds ≤ 2.7 | faster sounds rushed; cut words rather than speed up |
| `voice-fit` | error | 6-frame lead + voice duration ≤ beat | otherwise the voice is cut off at the next beat |
| `voice-needs-narration` | error | a voice mode has narration on ≥ 1 beat | nothing to speak |
| `narration-unvoiced` | warn | in a voice mode, every narrated beat has a `voice` | `scripts/audio.mjs` wasn't run (or failed) |
| `reel-length` | error | `Tour-Reel` total ≤ 2700 frames (90 s) | Reels limit |
| `zoom-max` | error | zoom `from`/`to` ≤ 1.15 | beyond that captures go soft and the push feels like a lurch |
| `zoom-budget` | warn | zooms ≤ ceil(shots ÷ 2) | a highlight on every shot is no highlight |
| `safe-zones` | error | `showSafeZones` is false | it's a preview overlay |
| `font-min` | error | every overlay size in `apps/studio/src/type-scale.json` ≥ 28 px at 1080 wide | smaller text is unreadable on a phone in a feed |

Not checked: whether the device matches the capture (phone mockup with a desktop screenshot). Look at the contact sheet for that.

`--json` prints `{ errors, warnings, findings: [{ id, severity, beat, message }] }` for tools.

## Contact sheet

`scripts/contact-sheet.mjs <video> <out.png>` tiles frames into one PNG, each labelled with its time (and beat number with `--at-cuts`):

- `--at-cuts <props.json>`: one frame at the middle of every beat, so each caption is fully in.
- `--every <sec>`: one frame every N seconds (default: 12 frames over the video).
- `--cols 4`, `--width 360` (tile width in px), `--fps 30`.

Labels are drawn in JavaScript, so it works with ffmpeg builds that lack `drawtext`.

## Clean-context review

The agent that built the video has read the brief, chosen the copy and watched it render; it sees what it meant, not what's there. So the last check goes to a **fresh subagent** that gets only:

1. the contact sheet PNG path,
2. the props JSON path,
3. the rules (this file's table, or the output of `lint-video.mjs --rules`) and the lint output,
4. the stated goal and placement, in one or two sentences.

Not the conversation, not the build history. Spawn it with an explicit model tier (a mid-tier model such as Sonnet is enough); never let it inherit the parent's model by default. Ask for:

```
PASS or FAIL, then a numbered list of concrete issues, each with the beat number and a fix
(e.g. "beat 3: caption covers the button the zoom is pointing at; move zoom.y to 0.3").
Check: captions readable and inside the frame, nothing cropped or blank, device matches
the capture, one idea per beat, the story serves the goal, the outro says what to do next.
```

On FAIL: fix the props (or the capture), re-render, re-run lint + sheet, and review again with a new fresh subagent. Two rounds is usually enough; if the same issue survives twice, tell the human instead of looping.
