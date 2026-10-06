# Before/after video of a page redesign

`BeforeAfter-Landscape` (1920×1080) shows two versions of the same page side by side. Both scroll in sync, section by section, with a caption for each section. Then come the same pages on a phone, an optional checklist of what changed, and an outro. `BeforeAfter-Feed` (1080×1350) renders the same story with the panels stacked.

It renders out of the box from a bundled demo: a fictional landing page in two versions (`apps/studio/before-after-demo/`), captured into `apps/studio/public/before-after/demo/`.

## 1. Capture

```bash
scripts/capture-before-after.sh <before-url> <after-url> apps/studio/public/before-after/<name> [desktop|mobile|both]

# e.g. production vs. a local branch
scripts/capture-before-after.sh https://example.com http://localhost:3000 apps/studio/public/before-after/home both

# the bundled demo (local files work)
D="file://$PWD/apps/studio/before-after-demo"
scripts/capture-before-after.sh "$D/before.html" "$D/after.html" apps/studio/public/before-after/demo both
```

For each version and viewport (desktop at 1440 CSS px and DPR 1, mobile as `iPhone 14`), the script uses agent-browser to:

1. open the page
2. switch lazy images to eager and scroll through the page to trigger lazy content
3. scroll back to the top
4. inject `CAPTURE_CSS` if it's set
5. record the top of every section
6. take a full-page screenshot

`scripts/lib/tile-captures.mjs` (Node, plus ffmpeg) then:

- splits each screenshot into JPG tiles of at most 3000px, because Chrome refuses taller textures
- downscales the mobile captures to 780px wide (2× of 390)
- writes `meta.json`

```json
{ "before-desktop": { "width": 1440, "total": 3282, "anchors": [81, 678, 1311, 1899, 2572], "tiles": 2, "tile": 3000 }, "...": {} }
```

`anchors` are the section tops in image px. Running only `desktop` or `mobile` updates those keys and keeps the others.

| Env | Default | Use |
|---|---|---|
| `SECTION_SELECTOR` | `main > section, main section` | What counts as a section. Nested matches are dropped, so only top-level sections count. Try `[data-section]` or `body > div > section` for sites without `<main>`. |
| `CAPTURE_CSS` | (none) | Path to a CSS file injected before capture. Use it to un-stick headers (`header { position: static !important }`), hide cookie banners, or stop animations. |
| `DESKTOP_WIDTH` | `1440` | Desktop viewport width in CSS px. |
| `MOBILE_WIDTH` | `780` | Width of the mobile tiles, in px. |
| `AB_SESSION` | `before-after` | agent-browser session. Reuse a logged-in one for pages behind auth. |

Look at a tile or two before composing. A sticky header shows up only once (at the top of a full-page capture), but a fixed chat widget or cookie banner can sit in the middle of it. Hide those with `CAPTURE_CSS`.

## 2. Compose

Point `capturesDir` at the folder (relative to `public/`) and write the copy. Duration and `meta.json` are handled by `calculateMetadata`. Don't pass `meta` yourself.

```json
{
  "accent": "#7c9cff", "bg": "#0b0f1a", "fg": "#f4f6fb",
  "capturesDir": "before-after/home",
  "beforeLabel": "Before", "afterLabel": "After",
  "intro": { "eyebrow": "Homepage redesign", "title": "Same content.", "titleAccent": "Half the noise.", "sub": "Before on the left. After on the right." },
  "desktop": { "beats": [
    { "section": 0, "caption": "Hero: three CTAs → one.", "durationInFrames": 90 },
    { "section": 2, "caption": "Feature cards → a ruled grid.", "durationInFrames": 90 },
    { "section": 5, "caption": "", "durationInFrames": 60 }
  ]},
  "mobile": { "eyebrow": "390 px", "title": "On a phone,", "titleAccent": "too.", "sub": "One column, no floating cards.",
    "beats": [ { "section": 0, "durationInFrames": 60 }, { "section": 2, "durationInFrames": 90 } ] },
  "checklist": { "title": "Audit", "label": "Checked on the before page", "flagLabel": "Fixed",
    "items": [ { "text": "Low-contrast body text", "flagged": true }, { "text": "Copy rewritten", "flagged": false } ],
    "summary": "One issue fixed. The copy did not change." },
  "outro": { "title": "Shipped.", "left": "example.com", "right": "@you" }
}
```

```bash
cd apps/studio
npx remotion still  BeforeAfter-Landscape out/ba-check.png --props=./ba.json --frame=150   # look at it
npx remotion render BeforeAfter-Landscape out/before-after.mp4 --props=./ba.json --codec=h264 --pixel-format=yuv420p
npm run before-after                                                                         # the demo
```

**Beats and sections.** `section` indexes `anchors` in `meta.json`: 0 is the first section, and section 0 always scrolls to the very top. At the start of each beat, both pages arrive at the beat's section. During the beat they dwell there, then they glide to the next one in its last 22 frames. Both versions need the same sections in the same order. If one version has an extra section, re-capture with a `SECTION_SELECTOR` that matches only the shared ones. You can skip sections (0 → 2 → 5) or repeat one for a longer hold. An empty `caption` shows nothing.

**Optional scenes.** Leave out `mobile` (or capture only `desktop`) to skip the phone scene. Leave out `checklist` to skip the audit. `intro.durationInFrames` and `outro.durationInFrames` override the defaults (105 and 120 frames).

**Look.** The template uses 1px rules, corners of 4px or less, no shadows, glows or blur, and no gradient text. It uses the kit's serif and sans from `src/theme.ts` and a system mono for labels. `muted` and `border` are derived from `fg`. That restraint is on purpose: the video frames the pages and doesn't compete with them.

## 3. Publish

```bash
scripts/webm-to-mp4.sh apps/studio/out/before-after.mp4 apps/studio/out/before-after-ig.mp4   # adds AAC + faststart
scripts/upload.sh my-site apps/studio/out/before-after-ig.mp4
```

The landscape cut suits X, LinkedIn and YouTube. Use `BeforeAfter-Feed` for an Instagram feed post. Keep the total under 90s for Reels and feed video. The demo runs 40s.

## Tips

- **Same data in both versions.** Capture both against the same content (seeded data, the same CMS state). Otherwise the comparison shows content drift instead of design changes.
- **Pages behind login.** Log in once in the `AB_SESSION` session (`agent-browser --session before-after open ...`, then `auth login`) before running the script.
- **Very long pages** mean many tiles and slower renders (only the tiles in view are mounted per frame). Hide the sections you don't narrate with `CAPTURE_CSS`.
- **Commit size.** Tiles are JPG at about q90. A typical 5-section page is 0.3–1 MB per version and viewport. `public/before-after/*` is gitignored except the bundled `demo/`, so captures of private sites stay out of the repo.
