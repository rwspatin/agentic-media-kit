# Instagram specs and render commands

Platform limits change. These are safe, widely accepted targets as of 2026. Check Instagram's help center if an upload is rejected.

## Formats

| Placement | Size | Aspect | Composition(s) | Notes |
|---|---|---|---|---|
| **Reel** | 1080×1920 | 9:16 | `Promo-Reel`, `Tour-Reel` | Aim for **≤ 90 s**, which is universally accepted and the best length for retention. Some accounts now allow longer. |
| **Story** | 1080×1920 | 9:16 | same as Reel | Up to 60 s per story card. |
| **Feed post (portrait)** | 1080×1350 | 4:5 | `Promo-Feed`, `Tour-Feed`, `Promo-Still` | Takes the most vertical space in the feed grid. |
| **Square** | 1080×1080 | 1:1 | `Promo-Square`, `Square-Still` | Carousels and older layouts. |
| **Reel cover** | 1080×1920 | 9:16 | `Reel-Cover` | The grid crops it to the center 1080×1440 (3:4) area, so keep the headline there. |

All compositions render at **30 fps**.

## Encoding

- Container **MP4**. Video **H.264** (High profile) with **yuv420p** pixel format, constant 30 fps.
- Audio **AAC**, 48 kHz stereo. Include a (silent) track even if there's no sound.
- **faststart** (moov atom at the front), so previews start before the download finishes.
- Bitrate: CRF 18 is visually lossless at 1080p and lands around 4–10 Mbps for UI footage. Instagram re-encodes anyway.

## Safe zones (9:16)

Instagram draws UI on top of Reels: the username, caption, and audio line at the bottom, action buttons on the right, and the header at the top. `src/theme.ts#safeZoneFor()` keeps text inside:

| Edge | Inset at 1080×1920 |
|---|---|
| Top | ~211 px (11%) |
| Bottom | ~422 px (22%) |
| Right | ~130 px (12%) |
| Left | 64 px |

Set `"showSafeZones": true` in props to overlay these bands in red while designing. **Turn it off before the final render.**

## Render commands

Run from `apps/studio`:

```bash
# Reel / Story (9:16)
npx remotion render Tour-Reel out/tour-reel.mp4 \
  --codec=h264 --pixel-format=yuv420p --audio-codec=aac --crf=18

# Feed post video (4:5)
npx remotion render Tour-Feed out/tour-feed.mp4 --codec=h264 --pixel-format=yuv420p --audio-codec=aac

# Stills
npx remotion still Reel-Cover out/reel-cover.png
npx remotion still Promo-Still out/feed-post.png

# A cover frame taken from the video itself (any composition, any frame)
npx remotion still Tour-Reel out/cover.png --frame=120

# Custom copy / data
npx remotion render Promo-Reel out/launch.mp4 --props='{"brand":"Acme","eyebrow":"Launch week","headline":"Faster checkout.","subheadline":"Two taps from cart to paid.","cta":"Try it","accent":"#7c9cff","bg":"#0b0f1a","fg":"#f4f6fb"}'

# Fast preview while iterating (half resolution, first 3 s only)
npx remotion render Tour-Reel out/preview.mp4 --scale=0.5 --frames=0-89
```

### Final normalization pass (recommended)

Remotion's H.264 output reports `yuvj420p` (full-range) when JPEG intermediate frames are used. Most players are fine with it, but for maximum upload compatibility, normalize before publishing:

```bash
../../scripts/webm-to-mp4.sh out/tour-reel.mp4 out/tour-reel-ig.mp4
ffprobe -v error -show_entries stream=codec_name,pix_fmt,width,height -of compact out/tour-reel-ig.mp4
# stream|codec_name=h264|width=1080|height=1920|pix_fmt=yuv420p
# stream|codec_name=aac
```

## Checklist before posting

- [ ] Duration ≤ 90 s (`ffprobe -show_entries format=duration`)
- [ ] 1080 px wide, correct aspect, `yuv420p`, AAC present
- [ ] No text inside the safe-zone bands, and `showSafeZones` is off
- [ ] Cover frame chosen (the `Reel-Cover` still, or a `--frame=` still)
- [ ] Watched on a phone via media-viewer, not only on desktop
