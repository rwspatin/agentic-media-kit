#!/usr/bin/env bash
# Convert any video (WebM screen recording, Remotion MP4, MOV...) into an
# Instagram-safe MP4: H.264 High, yuv420p (limited range), 30fps CFR,
# AAC 48kHz stereo (silent track added if the input has no audio), moov atom
# up front (+faststart) so it streams/previews before fully downloading.
# Audible audio is loudness-normalized to -14 LUFS / -1 dBTP, the target
# Reels, TikTok and Shorts normalize to (see docs/audio.md). Silent tracks
# (every Remotion render has one) are left alone: loudnorm turns them to NaN.
#
# Usage: scripts/webm-to-mp4.sh <input> [output.mp4] [fps]
#   scripts/webm-to-mp4.sh captures/flow.webm                # -> captures/flow.mp4
#   scripts/webm-to-mp4.sh out/reel.mp4 out/reel-ig.mp4       # normalize a render
set -euo pipefail

in="${1:?usage: webm-to-mp4.sh <input> [output.mp4] [fps]}"
out="${2:-${in%.*}.mp4}"
fps="${3:-30}"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found (brew install ffmpeg / apt-get install ffmpeg)" >&2; exit 1; }
[ -f "$in" ] || { echo "input not found: $in" >&2; exit 1; }
if [ "$(cd "$(dirname "$in")" && pwd)/$(basename "$in")" = "$(cd "$(dirname "$out")" 2>/dev/null && pwd)/$(basename "$out")" ]; then
  out="${in%.*}-ig.mp4"
fi

has_audio="$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$in" | head -n1 || true)"

# Peak level of the audio track in dB ("-inf"/-91 for digital silence).
audio_af=()
if [ -n "$has_audio" ]; then
  peak="$(ffmpeg -hide_banner -i "$in" -map 0:a:0 -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-*[0-9.inf]*\) dB.*/\1/p' | tail -n1)"
  if [ -n "$peak" ] && [ "$peak" != "-inf" ] && awk "BEGIN{exit !($peak > -70)}"; then
    audio_af=(-af "loudnorm=I=-14:TP=-1:LRA=11")
  fi
fi

# Even dimensions are required by yuv420p; the scale filter rounds down.
vf="scale=trunc(iw/2)*2:trunc(ih/2)*2:out_range=tv,fps=${fps},format=yuv420p"
common=(-c:v libx264 -profile:v high -preset slow -crf 18 -pix_fmt yuv420p -color_range tv
        -c:a aac -b:a 128k -ar 48000 -ac 2 -movflags +faststart)

if [ -n "$has_audio" ]; then
  ffmpeg -hide_banner -loglevel error -y -i "$in" -vf "$vf" ${audio_af[@]+"${audio_af[@]}"} "${common[@]}" "$out"
else
  ffmpeg -hide_banner -loglevel error -y -i "$in" \
    -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 \
    -map 0:v:0 -map 1:a:0 -shortest -vf "$vf" "${common[@]}" "$out"
fi

echo "$out"
ffprobe -v error -show_entries stream=codec_name,width,height,pix_fmt -show_entries format=duration -of compact "$out" >&2
