# studio

A brand-neutral Remotion 4 template for Instagram-native video and stills. Every composition is typed by a zod schema, so you can edit props in the Studio panel or pass them with `--props` (inline JSON or a path to a `.json` file).

```bash
npm install
npm run studio                                   # visual editor
npx remotion still Reel-Cover out/cover.png
npx remotion render Tour-Reel out/tour.mp4 --codec=h264 --pixel-format=yuv420p --audio-codec=aac
```

| Id | Type | Size |
|---|---|---|
| `Promo-Reel` / `Promo-Feed` / `Promo-Square` | video | 1080×1920 / 1080×1350 / 1080×1080 |
| `Promo-Still` / `Reel-Cover` / `Square-Still` | still | 1080×1350 / 1080×1920 / 1080×1080 |
| `Tour-Reel` / `Tour-Feed` | video (duration = sum of beats) | 1080×1920 (phone) / 1080×1350 (browser) |

Screen tour beats take `media: {type: "image"|"video"|"demo", src?, demoVariant?, startAtSeconds?, position?}` and an optional `zoom: {x, y, from, to}` push-in. Put captures in `public/` (see [public/README.md](public/README.md)).

Brand: edit `src/theme.ts` (fonts, default colors) or override per render. Specs and codec flags: [../../docs/instagram.md](../../docs/instagram.md).

Remotion is licensed separately from this repo. It's free for individuals and small teams; companies need a [company license](https://www.remotion.dev/license).
