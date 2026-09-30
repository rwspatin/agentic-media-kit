import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadSans } from "@remotion/google-fonts/InstrumentSans";

// "Darkroom" look for the kit's own launch: warm ink, bone paper, one
// vermilion signal colour, an editorial italic serif and a monospace that
// doubles as the terminal. Everything else in src/launch reads from here.
export const { fontFamily: display } = loadSerif("italic", { weights: ["400"], subsets: ["latin", "latin-ext"] });
loadSerif("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] });
export const { fontFamily: mono } = loadMono("normal", { weights: ["400", "500", "700"], subsets: ["latin", "latin-ext"] });
export const { fontFamily: body } = loadSans("normal", { weights: ["400", "500", "600"], subsets: ["latin", "latin-ext"] });

export const C = {
  ink: "#0e0d0b",
  ink2: "#171511",
  line: "#2b2721",
  paper: "#efe8da",
  muted: "#8d8577",
  dim: "#5a544a",
  signal: "#ff4d1c",
} as const;

export const FPS = 30;

// Scene timeline (frames at 30fps). Reel and feed share it, so the story is
// identical and only the layout changes. Consecutive scenes overlap by
// OVERLAP frames and cross-dissolve, so no frame is ever empty.
// Total stays 441 frames: only the last scene doesn't overlap.
export const OVERLAP = 6;
export const SCENES = {
  hook: { from: 0, duration: 66 },
  terminal: { from: 66, duration: 105 },
  viewer: { from: 171, duration: 165 },
  cta: { from: 336, duration: 105 },
} as const;
export const LAUNCH_DURATION = SCENES.cta.from + SCENES.cta.duration;

export const REPO = "github.com/rwspatin/agentic-media-kit";
export const AUTHOR = "Renan Winter Spatin";
export const AUTHOR_ROLE = "Software Architect · Technology Strategist";
