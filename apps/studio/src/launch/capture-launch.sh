#!/usr/bin/env bash
# Recapture the two pieces of real footage used by the Launch-* compositions:
#   public/launch/viewer.mp4  mobile recording of a PUBLIC_READ media-viewer:
#                             gallery -> tap project -> video plays -> Download
#   public/launch/repo.jpg    full-page mobile screenshot of the GitHub repo
#
# Env:   MEDIA_VIEWER_URL  a viewer running with PUBLIC_READ=true that already
#                          has a video as the newest file in project $PROJECT
# Usage: apps/studio/src/launch/capture-launch.sh [project] [repo-url]
# After recapturing, re-measure `viewerCuts`, `downloadAtFrame` and
# `downloadPoint` in src/Root.tsx (extract frames with ffmpeg and look).
set -euo pipefail

project="${1:-launch}"
repo_url="${2:-https://github.com/rwspatin/agentic-media-kit}"
: "${MEDIA_VIEWER_URL:?set MEDIA_VIEWER_URL (a viewer with PUBLIC_READ=true)}"
base="${MEDIA_VIEWER_URL%/}"
here="$(cd "$(dirname "$0")" && pwd)"
kit="$(cd "$here/../../../.." && pwd)"
out="$kit/apps/studio/public/launch"
tmp="$(mktemp -d)"
ab() { agent-browser --session "${AB_SESSION:-amk-launch}" "$@"; }
mkdir -p "$out"

# 1. Viewer flow, recorded anonymously (no login needed in public mode).
ab open "$base/"
ab set device "iPhone 14"
ab wait --load networkidle
ab record start "$tmp/viewer.webm"
ab wait --load networkidle
ab wait 1500
ab find text "$project" click
ab wait --url "**/p/$project"
ab wait --load networkidle
ab wait 1200
ab eval "(() => { const v = document.querySelector('video'); v.muted = true; v.play(); return 1; })()"
ab wait 4500
ab eval "window.scrollBy({ top: 260, behavior: 'smooth' }); 1"
ab wait 3500
ab record stop
ab close

# 2. GitHub repo, full page on mobile, cropped to the top ~3 screens.
ab open "$repo_url"
ab set device "iPhone 14"
ab wait --load networkidle
ab wait 1500
ab screenshot --full "$tmp/repo-full.png"
ab close

"$kit/scripts/webm-to-mp4.sh" "$tmp/viewer.webm" "$out/viewer.mp4"
ffmpeg -hide_banner -loglevel error -y -i "$tmp/repo-full.png" -vf "crop=iw:min(ih\,7600):0:0" -q:v 3 "$out/repo.jpg"
rm -rf "$tmp"
echo "captures in $out"
