import React from "react";
import { Composition, Folder, Still } from "remotion";
import { Promo, promoSchema, type PromoProps } from "./components/Promo";
import { ScreenTour, calculateTourMetadata, screenTourSchema, type ScreenTourProps } from "./components/ScreenTour";
import { DEFAULT_BRAND } from "./theme";

// Instagram-native canvases. All 30fps; keep Reels <= 90s (2700 frames).
const REEL = { width: 1080, height: 1920, fps: 30 } as const; // 9:16 Reel / Story
const FEED = { width: 1080, height: 1350, fps: 30 } as const; // 4:5 feed post
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
  </>
);
