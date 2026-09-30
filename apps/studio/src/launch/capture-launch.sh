#!/usr/bin/env bash
# Recapture the real footage used by the Launch-* compositions:
#   public/launch/viewer.mp4  mobile recording of a PUBLIC_READ media-viewer:
#                             gallery -> tap project -> video plays -> Download
#
# Env:   MEDIA_VIEWER_URL  a viewer running with PUBLIC_READ=true that already
#                          has a video as the newest file in project $PROJECT
# Usage: apps/studio/src/launch/capture-launch.sh [project]
# After recapturing, re-measure `viewerCuts`, `downloadAtFrame` and
# `downloadPoint` in src/Root.tsx (extract frames with ffmpeg and look).
set -euo pipefail

project="${1:-launch}"
: "${MEDIA_VIEWER_URL:?set MEDIA_VIEWER_URL (a viewer with PUBLIC_READ=true)}"
base="${MEDIA_VIEWER_URL%/}"
here="$(cd "$(dirname "$0")" && pwd)"
kit="$(cd "$here/../../../.." && pwd)"
out="$kit/apps/studio/public/launch"
tmp="$(mktemp -d)"
ab() { agent-browser --session "${AB_SESSION:-amk-launch}" "$@"; }
mkdir -p "$out"

# Viewer flow, recorded anonymously (no login needed in public mode).
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

"$kit/scripts/webm-to-mp4.sh" "$tmp/viewer.webm" "$out/viewer.mp4"
rm -rf "$tmp"
echo "captures in $out"
