#!/usr/bin/env bash
# Example: record a scripted browser flow to WebM with agent-browser, grab
# screenshots at each step, then convert the recording to an Instagram-safe
# MP4 ready for apps/studio/public/.
#
# Usage: scripts/capture-flow.sh <url> [out-dir] [mobile|desktop]
#   scripts/capture-flow.sh http://localhost:3000 apps/studio/public/captures mobile
#
# This is a TEMPLATE: edit the "flow" section to drive your own app. Prefer
# stable locators (find role/text/label) over @refs in scripts, since refs are
# regenerated on every snapshot.
set -euo pipefail

url="${1:?usage: capture-flow.sh <url> [out-dir] [mobile|desktop]}"
out="${2:-captures}"
mode="${3:-mobile}"
here="$(cd "$(dirname "$0")" && pwd)"
ab() { agent-browser --session "${AB_SESSION:-agentic-media}" "$@"; }

command -v agent-browser >/dev/null || { echo "agent-browser not found: npm i -g agent-browser && agent-browser install" >&2; exit 1; }
mkdir -p "$out"

ab open "$url"
if [ "$mode" = "mobile" ]; then
  ab set device "iPhone 14"          # mobile viewport + DPR + touch + UA
else
  ab set viewport 1440 900 2         # desktop, 2x for crisp screenshots
fi
ab wait --load networkidle
ab screenshot "$out/01-landing.png"

ab record start "$out/flow.webm"    # new context, keeps cookies/localStorage
ab wait --load networkidle
ab wait 1200                        # let the first paint settle on camera

# --- flow: replace with your app's steps ---------------------------------
ab scroll down 600
ab wait 800
ab screenshot "$out/02-scrolled.png"
ab scroll down 600
ab wait 800
ab scroll up 1200
ab wait 800
# e.g. ab find role button click --name "Get started"
#      ab wait --url "**/signup"
#      ab find label "Email" fill "demo@example.com"
# -------------------------------------------------------------------------

ab record stop
ab screenshot "$out/03-final.png"
ab close

"$here/webm-to-mp4.sh" "$out/flow.webm" "$out/flow.mp4"
echo "captures in $out/ (reference them from apps/studio/public as e.g. captures/flow.mp4)"
