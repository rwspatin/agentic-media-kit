#!/usr/bin/env bash
# Capture two versions of a page (before | after) as full-page screenshots,
# record where each section starts, and tile them for the BeforeAfter
# composition (apps/studio/src/before-after).
#
# Usage: scripts/capture-before-after.sh <before-url> <after-url> <out-dir> [desktop|mobile|both]
#   scripts/capture-before-after.sh http://localhost:3000 http://localhost:3001 \
#     apps/studio/public/before-after/my-site both
#
# Output in <out-dir>: <before|after>-<desktop|mobile>-<n>.jpg tiles (<= 3000px
# tall, Chrome's texture limit) and meta.json:
#   { "<ver>-<viewport>": { width, total, anchors[], tiles, tile } }
# anchors are section top offsets in image px, in document order.
#
# Env:
#   SECTION_SELECTOR  CSS selector for sections (default "main > section, main section";
#                     nested matches are dropped so only top-level sections count)
#   CAPTURE_CSS       path to a CSS file injected before capture (un-stick
#                     headers, hide cookie banners, pause animations...)
#   DESKTOP_WIDTH     desktop viewport width in CSS px (default 1440, DPR 1)
#   MOBILE_WIDTH      mobile tiles are downscaled to this width (default 780 = 2x of 390)
#   AB_SESSION        agent-browser session name (default before-after)
#
# Pages are given urls; local files work too (file:///abs/path/page.html).
set -euo pipefail

usage="usage: capture-before-after.sh <before-url> <after-url> <out-dir> [desktop|mobile|both]"
before_url="${1:?$usage}"
after_url="${2:?$usage}"
out="${3:?$usage}"
mode="${4:-both}"
here="$(cd "$(dirname "$0")" && pwd)"
selector="${SECTION_SELECTOR:-main > section, main section}"
desktop_width="${DESKTOP_WIDTH:-1440}"
mobile_width="${MOBILE_WIDTH:-780}"
ab() { agent-browser --session "${AB_SESSION:-before-after}" "$@"; }

case "$mode" in desktop|mobile|both) ;; *) echo "$usage" >&2; exit 1 ;; esac
command -v agent-browser >/dev/null || { echo "agent-browser not found: npm i -g agent-browser && agent-browser install" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not found" >&2; exit 1; }
[ -z "${CAPTURE_CSS:-}" ] || [ -f "$CAPTURE_CSS" ] || { echo "CAPTURE_CSS not found: $CAPTURE_CSS" >&2; exit 1; }

mkdir -p "$out"
raw="$(mktemp -d)"
trap 'rm -rf "$raw"; ab close >/dev/null 2>&1 || true' EXIT

# JSON-encode values so selectors and CSS reach the page intact.
json() { node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"; }
sel_json="$(json "$selector")"
css_json='""'
[ -n "${CAPTURE_CSS:-}" ] && css_json="$(node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(process.argv[1], "utf8")))' "$CAPTURE_CSS")"

capture() { # <ver> <viewport> <url>
  local ver="$1" vp="$2" url="$3" name="$1-$2"
  echo "· $name  $url"
  ab open "$url" >/dev/null
  if [ "$vp" = "mobile" ]; then
    ab set device "iPhone 14" >/dev/null    # 390x844 @3x, touch, mobile UA
  else
    ab set viewport "$desktop_width" 900 1 >/dev/null
  fi
  ab open "$url" >/dev/null                 # reload so the page boots at this viewport/UA
  ab wait --load networkidle >/dev/null

  # Eager images, walk the page to trigger lazy content, back to top,
  # optional user CSS, then measure section tops (CSS px).
  ab eval --stdin >"$raw/$name.json" <<EOF
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = "eager"; });
  for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(innerHeight * 0.8)) {
    scrollTo(0, y);
    await sleep(120);
  }
  scrollTo(0, 0);
  const css = ${css_json};
  if (css) {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }
  await Promise.all([...document.images].map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
  await sleep(400);
  const found = [...document.querySelectorAll(${sel_json})];
  const top = found.filter((el) => !found.some((other) => other !== el && other.contains(el)));
  const anchors = top.map((el) => Math.round(el.getBoundingClientRect().top + scrollY));
  return {
    cssWidth: document.documentElement.clientWidth,
    cssHeight: document.documentElement.scrollHeight,
    anchors: [...new Set(anchors)].sort((a, b) => a - b),
  };
})()
EOF
  ab screenshot --full "$raw/$name.png" >/dev/null
}

viewports=()
[ "$mode" = "mobile" ] || viewports+=(desktop)
[ "$mode" = "desktop" ] || viewports+=(mobile)
for vp in "${viewports[@]}"; do
  capture before "$vp" "$before_url"
  capture after "$vp" "$after_url"
done

node "$here/lib/tile-captures.mjs" "$raw" "$out" "$mobile_width"
echo "captures in $out/ (set capturesDir to its path under apps/studio/public/)"
