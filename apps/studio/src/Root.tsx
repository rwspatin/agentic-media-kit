import React from "react";
import { Composition, Folder, Still } from "remotion";
import { Promo, promoSchema, type PromoProps } from "./components/Promo";
import { ScreenTour, calculateTourMetadata, screenTourSchema, type ScreenTourProps } from "./components/ScreenTour";
import { DEFAULT_BRAND } from "./theme";
import { Launch, LaunchCover, launchSchema, type LaunchProps } from "./launch/Launch";
import { LAUNCH_DURATION } from "./launch/theme";
import { BeforeAfter, beforeAfterSchema, calculateBeforeAfterMetadata, type BeforeAfterProps } from "./before-after/BeforeAfter";

// Instagram-native canvases. All 30fps; keep Reels <= 90s (2700 frames).
const REEL = { width: 1080, height: 1920, fps: 30 } as const; // 9:16 Reel / Story
const FEED = { width: 1080, height: 1350, fps: 30 } as const; // 4:5 feed post
const LANDSCAPE = { width: 1920, height: 1080, fps: 30 } as const; // 16:9 (X, LinkedIn, YouTube)
const SQUARE = { width: 1080, height: 1080, fps: 30 } as const; // 1:1

const promoDefaults: PromoProps = {
  ...DEFAULT_BRAND,
  eyebrow: "Now in beta",
  headline: "Ship the feature. Post the reel.",
  subheadline: "Capture your running app, compose a vertical video and review it from your phone — all driven by your coding agent.",
  cta: "Try it free",
  showSafeZones: false,
};

// The default tour uses the generated DemoScreen, so it renders with zero
// assets. Replace `media` with { type: "image", src: "shots/01.png" } or
// { type: "video", src: "captures/flow.mp4" } to use real captures in public/.
const tourDefaults: ScreenTourProps = {
  ...DEFAULT_BRAND,
  device: "phone",
  url: "app.example.com",
  outroSub: "app.example.com",
  showSafeZones: false,
  beats: [
    { kind: "intro", eyebrow: "Product tour", caption: "From idea to live in three taps.", durationInFrames: 60 },
    {
      kind: "shot",
      eyebrow: "Step 01",
      caption: "See what matters the moment you open the app.",
      durationInFrames: 90,
      media: { type: "demo", demoVariant: "dashboard" },
      zoom: { x: 0.3, y: 0.6, from: 1, to: 1.06 },
    },
    {
      kind: "shot",
      eyebrow: "Step 02",
      caption: "Pick up exactly where your team left off.",
      durationInFrames: 90,
      media: { type: "demo", demoVariant: "list" },
      zoom: { x: 0.15, y: 0.35, from: 1, to: 1.1 },
    },
    {
      kind: "shot",
      eyebrow: "Step 03",
      caption: "Publish, and everyone knows instantly.",
      durationInFrames: 75,
      media: { type: "demo", demoVariant: "success" },
    },
    { kind: "outro", eyebrow: "Get started", caption: "Your product, in motion.", durationInFrames: 60 },
  ],
};

// The kit's own launch pieces (src/launch/). Needs the captures in
// public/launch/ — see src/launch/README.md to recapture them.
const launchDefaults: LaunchProps = {
  viewerSrc: "launch/viewer.mp4",
  viewerCuts: [
    { from: 2.2, to: 3.6 }, // gallery → tap "launch"
    { from: 6.1, to: 8.6 }, // the reel itself playing in the viewer
    { from: 11.3, to: 13.3 }, // scroll to the Download button (runs to scene end)
  ],
  downloadAtFrame: 136,
  downloadPoint: { x: 0.79, y: 0.83 },
  showSafeZones: false,
};

// Before/after of a page redesign. The defaults describe the bundled demo
// (apps/studio/before-after-demo/, captured into public/before-after/demo/).
// Point capturesDir at your own capture and rewrite the copy; meta.json is
// loaded by calculateMetadata, which also derives the duration.
const beforeAfterDefaults: BeforeAfterProps = {
  accent: DEFAULT_BRAND.accent,
  bg: DEFAULT_BRAND.bg,
  fg: DEFAULT_BRAND.fg,
  capturesDir: "before-after/demo",
  beforeLabel: "Before",
  afterLabel: "After",
  intro: {
    eyebrow: "Before / after · landing page",
    title: "Same copy. Same sections.",
    titleAccent: "A calmer system.",
    sub: "Before on the left. After on the right.",
  },
  desktop: {
    beats: [
      { section: 0, caption: "Gradient background and gradient headline → flat ground, a serif headline.", durationInFrames: 90 },
      { section: 1, caption: "Floating cards with emoji icons → a ruled grid on shared hairlines.", durationInFrames: 90 },
      { section: 2, caption: "Gradient number bubbles → plain step labels in one accent.", durationInFrames: 75 },
      { section: 3, caption: "Pills, glows and a scaled-up plan → corners of 4px or less, one tinted cell.", durationInFrames: 90 },
      { section: 4, caption: "An all-caps eyebrow on every section → none. The quote stands alone.", durationInFrames: 90 },
    ],
  },
  mobile: {
    eyebrow: "390 px",
    title: "On a phone,",
    titleAccent: "too.",
    sub: "The cards stack into one column of shared hairlines instead of floating in a gutter.",
    beats: [
      { section: 0, durationInFrames: 60 },
      { section: 1, durationInFrames: 60 },
      { section: 3, durationInFrames: 75 },
      { section: 4, durationInFrames: 45 },
    ],
  },
  checklist: {
    title: "Audit",
    label: "Checked on the before page",
    flagLabel: "Removed",
    items: [
      { text: "Purple-to-pink gradient background", flagged: true },
      { text: "Gradient text on headline and prices", flagged: true },
      { text: "Pills and corners above 4px", flagged: true },
      { text: "Shadows and glows under cards", flagged: true },
      { text: "Emoji standing in for icons", flagged: true },
      { text: "All-caps eyebrow on every section", flagged: true },
      { text: "Three accent hues competing", flagged: true },
      { text: "Translucent, blurred sticky header", flagged: true },
      { text: "Copy rewritten", flagged: false },
      { text: "Sections reordered", flagged: false },
    ],
    summary: "Eight patterns removed. The copy and the section order did not change.",
  },
  outro: {
    title: "Same page,",
    titleAccent: "calmer system.",
    left: "Captured with agent-browser · composed with Remotion",
    right: "agentic-media-kit",
  },
};

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Promo">
      <Composition id="Promo-Reel" component={Promo} schema={promoSchema} defaultProps={promoDefaults} durationInFrames={180} {...REEL} />
      <Composition id="Promo-Feed" component={Promo} schema={promoSchema} defaultProps={promoDefaults} durationInFrames={150} {...FEED} />
      <Composition id="Promo-Square" component={Promo} schema={promoSchema} defaultProps={promoDefaults} durationInFrames={150} {...SQUARE} />
    </Folder>

    <Folder name="Stills">
      {/* A Still renders frame 0 — components use useEnter() so they show the settled state. */}
      <Still id="Promo-Still" component={Promo} schema={promoSchema} defaultProps={promoDefaults} width={FEED.width} height={FEED.height} />
      <Still id="Reel-Cover" component={Promo} schema={promoSchema} defaultProps={promoDefaults} width={REEL.width} height={REEL.height} />
      <Still id="Square-Still" component={Promo} schema={promoSchema} defaultProps={promoDefaults} width={SQUARE.width} height={SQUARE.height} />
    </Folder>

    <Folder name="Tour">
      <Composition
        id="Tour-Reel"
        component={ScreenTour}
        schema={screenTourSchema}
        defaultProps={tourDefaults}
        calculateMetadata={calculateTourMetadata}
        durationInFrames={375}
        {...REEL}
      />
      <Composition
        id="Tour-Feed"
        component={ScreenTour}
        schema={screenTourSchema}
        defaultProps={{ ...tourDefaults, device: "browser" }}
        calculateMetadata={calculateTourMetadata}
        durationInFrames={375}
        {...FEED}
      />
    </Folder>

    <Folder name="Launch">
      <Composition id="Launch-Reel" component={Launch} schema={launchSchema} defaultProps={launchDefaults} durationInFrames={LAUNCH_DURATION} {...REEL} />
      <Composition id="Launch-Feed" component={Launch} schema={launchSchema} defaultProps={launchDefaults} durationInFrames={LAUNCH_DURATION} {...FEED} />
      <Still id="Launch-Cover" component={LaunchCover} schema={launchSchema} defaultProps={launchDefaults} width={REEL.width} height={REEL.height} />
    </Folder>

    <Folder name="BeforeAfter">
      <Composition
        id="BeforeAfter-Landscape"
        component={BeforeAfter}
        schema={beforeAfterSchema}
        defaultProps={beforeAfterDefaults}
        calculateMetadata={calculateBeforeAfterMetadata}
        durationInFrames={1200}
        {...LANDSCAPE}
      />
      <Composition
        id="BeforeAfter-Feed"
        component={BeforeAfter}
        schema={beforeAfterSchema}
        defaultProps={beforeAfterDefaults}
        calculateMetadata={calculateBeforeAfterMetadata}
        durationInFrames={1200}
        {...FEED}
      />
    </Folder>
  </>
);
