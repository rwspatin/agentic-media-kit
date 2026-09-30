import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";

// Fonts are fetched once at render/bundle time. Swap these two for your brand
// typefaces (any @remotion/google-fonts family, or a local @font-face).
export const { fontFamily: sans } = loadInter("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});
export const { fontFamily: serif } = loadFraunces("normal", {
  weights: ["500", "600"],
  subsets: ["latin"],
});

// Brand-neutral defaults. Override per render with --props, or edit here.
export const DEFAULT_BRAND = {
  brand: "Your Product",
  accent: "#7c9cff",
  bg: "#0b0f1a",
  fg: "#f4f6fb",
} as const;

// Instagram UI overlays (username, caption, action buttons) cover parts of a
// 9:16 Reel. Keep text inside these insets (px at 1080x1920) — see
// docs/instagram.md. Feed/square posts have no overlay but get a small margin.
export const safeZoneFor = (width: number, height: number) => {
  const isVertical = height / width > 1.5;
  return isVertical
    ? { top: Math.round(height * 0.11), bottom: Math.round(height * 0.22), left: 64, right: Math.round(width * 0.12) }
    : { top: Math.round(height * 0.07), bottom: Math.round(height * 0.08), left: 72, right: 72 };
};
