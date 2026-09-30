#!/usr/bin/env bash
# Publish a rendered file to media-viewer so a human can review/download it
# from a phone. Uses the agent bearer token (no cookie login needed).
#
# Env:  MEDIA_VIEWER_URL  e.g. https://your-viewer.example.com (no trailing slash)
#       UPLOAD_TOKEN      same value as the server's UPLOAD_TOKEN
# Usage: scripts/upload.sh <project-slug> <file> [more files...]
#   scripts/upload.sh my-app apps/studio/out/tour-reel.mp4 apps/studio/out/reel-cover.png
set -euo pipefail

project="${1:?usage: upload.sh <project-slug> <file> [more files...]}"
shift
[ "$#" -ge 1 ] || { echo "usage: upload.sh <project-slug> <file> [more files...]" >&2; exit 1; }
: "${MEDIA_VIEWER_URL:?set MEDIA_VIEWER_URL (e.g. https://your-viewer.example.com)}"
: "${UPLOAD_TOKEN:?set UPLOAD_TOKEN (must match the server env var)}"
base="${MEDIA_VIEWER_URL%/}"

mime_for() {
  case "${1##*.}" in
    mp4|m4v) echo video/mp4 ;; mov) echo video/quicktime ;; webm) echo video/webm ;;
    png) echo image/png ;; jpg|jpeg) echo image/jpeg ;; webp) echo image/webp ;; gif) echo image/gif ;;
    *) echo application/octet-stream ;;
  esac
}

for file in "$@"; do
  [ -f "$file" ] || { echo "not a file: $file" >&2; exit 1; }
  response="$(curl -sS -w $'\n%{http_code}' \
    -H "Authorization: Bearer ${UPLOAD_TOKEN}" \
    -F "project=${project}" \
    -F "file=@${file};type=$(mime_for "$file")" \
    "${base}/upload")"
  status="${response##*$'\n'}"
  body="${response%$'\n'*}"
  if [ "$status" != "201" ]; then
    echo "upload failed for ${file}: HTTP ${status} ${body}" >&2
    exit 1
  fi
  echo "uploaded ${file} -> ${body}"
done
echo "review: ${base}/p/${project}"
