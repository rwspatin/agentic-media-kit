import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { z } from "zod";
import { SafeZoneOverlay } from "../components/shared";
import { AUTHOR, AUTHOR_ROLE, C, REPO, SCENES, body, display, mono } from "./theme";
import { Darkroom, Eyebrow, Fade, Phone, ProgressRail, Reveal, SceneFrame, Slate, useLayout } from "./parts";
import { Terminal, activeStep } from "./Terminal";

// The kit's own launch video, made with the kit (capture → compose → publish).
// Media paths are relative to public/; recapture them with
// src/launch/capture-launch.sh (see src/launch/README.md).
export const launchSchema = z.object({
  viewerSrc: z.string(), // mobile screen recording of the live media-viewer
  // Segments of the recording to play back to back (jump cuts), in seconds.
  viewerCuts: z.array(z.object({ from: z.number(), to: z.number() })).min(1),
  // When the Download button is on screen in the recording (scene frames),
  // and where it is (0-1 fractions of the screen). Drives the caption switch
  // and the tap ring. Re-measure after recapturing.
  downloadAtFrame: z.number().optional(),
  downloadPoint: z.object({ x: z.number(), y: z.number() }).optional(),
  repoSrc: z.string(), // full-page mobile screenshot of the GitHub repo
  showSafeZones: z.boolean().optional(),
});
export type LaunchProps = z.infer<typeof launchSchema>;

const Accent: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ color: C.signal }}>{children}</span>
);

// ---------------------------------------------------------------- 1. hook
const Hook: React.FC = () => {
  const { isReel, z, W } = useLayout();
  const size = isReel ? 158 : 132;
  return (
    <AbsoluteFill style={{ padding: `0 ${z.right}px 0 ${z.left + 8}px`, justifyContent: "center" }}>
      <div style={{ marginTop: isReel ? -120 : -40 }}>
        {/* Negative delays: the hook is already on screen at frame 0, which is
            the poster frame players and feeds show before playback. */}
        <Fade delay={-20} y={0}>
          <Eyebrow size={isReel ? 26 : 22}>● Rec — nenhum editor de vídeo</Eyebrow>
        </Fade>
        <div style={{ fontFamily: display, fontStyle: "italic", fontSize: size, lineHeight: 0.98, color: C.paper, marginTop: 34, letterSpacing: "-0.02em" }}>
          <Reveal delay={-20}>Este vídeo</Reveal>
          <Reveal delay={-16}>foi feito por</Reveal>
          <Reveal delay={2}>
            um <Accent>agente.</Accent>
          </Reveal>
        </div>
        <Fade delay={26} style={{ marginTop: 44, maxWidth: W * 0.72 }}>
          <div style={{ fontFamily: body, fontSize: isReel ? 38 : 32, lineHeight: 1.35, color: C.muted }}>
            Gravado, montado e publicado <span style={{ color: C.paper }}>direto do terminal</span>.
          </div>
        </Fade>
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ 2. terminal
const STEPS = ["Capturar", "Compor", "Publicar"];

const StepRail: React.FC<{ active: number; size: number }> = ({ active, size }) => (
  <div style={{ display: "flex", gap: size * 1.2, fontFamily: mono, fontSize: size, letterSpacing: "0.1em", textTransform: "uppercase" }}>
    {STEPS.map((s, i) => (
      <span key={s} style={{ color: i === active ? C.paper : i < active ? C.muted : C.dim, display: "flex", gap: 10, alignItems: "baseline" }}>
        <span style={{ color: i <= active ? C.signal : C.dim }}>0{i + 1}</span>
        {s}
      </span>
    ))}
  </div>
);

const TerminalScene: React.FC = () => {
  const t = useCurrentFrame();
  const { isReel, z, W } = useLayout();
  const width = W - z.left - 8 - z.right;
  return (
    <AbsoluteFill style={{ paddingLeft: z.left + 8, paddingTop: z.top + (isReel ? 40 : 60) }}>
      <Fade delay={0}>
        <StepRail active={Math.max(0, activeStep(t))} size={isReel ? 24 : 21} />
      </Fade>
      <div style={{ fontFamily: display, fontStyle: "italic", fontSize: isReel ? 112 : 100, lineHeight: 1, color: C.paper, marginTop: isReel ? 40 : 28, letterSpacing: "-0.02em" }}>
        <Reveal delay={2}>Três comandos.</Reveal>
        <Reveal delay={7}>
          <Accent>Zero</Accent> editor.
        </Reveal>
      </div>
      <Fade delay={8} y={40} style={{ marginTop: isReel ? 80 : 40 }}>
        <Terminal t={t} width={width} fontSize={isReel ? 26 : 25} />
      </Fade>
    </AbsoluteFill>
  );
};

// -------------------------------------------------------------- 3. viewer
const TapRing: React.FC<{ at: number; x: number; y: number; w: number; h: number }> = ({ at, x, y, w, h }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const t = frame - at;
  const pulse = (t % 24) / 24;
  const size = w * 0.3;
  return (
    <div style={{ position: "absolute", left: x * w - size / 2, top: y * h - size / 2, width: size, height: size }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 999, border: `4px solid ${C.signal}`, transform: `scale(${0.5 + pulse * 0.7})`, opacity: 1 - pulse }} />
      <div style={{ position: "absolute", inset: size * 0.32, borderRadius: 999, background: `${C.signal}55`, border: `3px solid ${C.signal}` }} />
    </div>
  );
};

const ViewerScene: React.FC<{
  src: string;
  cuts: { from: number; to: number }[];
  downloadAt: number;
  point: { x: number; y: number };
}> = ({
  src,
  cuts,
  downloadAt,
  point,
}) => {
  const frame = useCurrentFrame();
  const { isReel, z, W, H } = useLayout();
  const switchAt = downloadAt - 60;
  const second = frame >= switchAt;
  const screenW = isReel ? 560 : 470;
  const screenH = Math.round(screenW * (844 / 390));
  const rise = interpolate(frame, [0, 26], [80, 0], { extrapolateRight: "clamp", easing: (x) => 1 - Math.pow(1 - x, 3) });

  const copy = (
    <div>
      <Fade delay={0}>
        <Eyebrow size={isReel ? 24 : 20}>03 Publicar · media-viewer</Eyebrow>
      </Fade>
      <div style={{ fontFamily: display, fontStyle: "italic", fontSize: isReel ? 104 : 80, lineHeight: 1, color: C.paper, marginTop: 26, letterSpacing: "-0.02em" }}>
        {!second ? (
          <>
            <Reveal delay={3}>Revise</Reveal>
            <Reveal delay={8}>no celular.</Reveal>
          </>
        ) : (
          <Sequence from={switchAt} layout="none">
            <Reveal delay={0}>
              <Accent>Baixe.</Accent>
            </Reveal>
            <Reveal delay={5}>Poste.</Reveal>
          </Sequence>
        )}
      </div>
      <Fade delay={second ? switchAt + 10 : 14} style={{ marginTop: 26, maxWidth: isReel ? 820 : 360 }}>
        <div style={{ fontFamily: body, fontSize: isReel ? 32 : 27, lineHeight: 1.35, color: C.muted }}>
          {second ? "Botão de download de verdade, pronto para o Instagram." : "Link público, sem login para assistir."}
        </div>
      </Fade>
    </div>
  );

  const phone = (
    <Phone w={screenW} h={screenH} style={{ transform: `translateY(${rise}px)` }}>
      {cuts.map((c, i) => {
        const from = cuts.slice(0, i).reduce((sum, p) => sum + Math.round((p.to - p.from) * 30), 0);
        return (
          <Sequence key={i} from={from} durationInFrames={Math.round((c.to - c.from) * 30)} layout="none">
            <OffthreadVideo
              src={staticFile(src)}
              muted
              trimBefore={Math.round(c.from * 30)}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }}
            />
          </Sequence>
        );
      })}
      <TapRing at={downloadAt} x={point.x} y={point.y} w={screenW} h={screenH} />
    </Phone>
  );

  if (isReel) {
    return (
      <AbsoluteFill>
        <div style={{ position: "absolute", left: z.left + 8, top: z.top + 40, right: z.right }}>{copy}</div>
        <div style={{ position: "absolute", top: z.top + 460, left: (W - screenW) / 2 - 16 }}>{phone}</div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: z.left, top: z.top + 60, width: 400 }}>{copy}</div>
      <div style={{ position: "absolute", top: (H - screenH) / 2 - 10, right: z.right - 10 }}>{phone}</div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 4. repo
const RepoScene: React.FC<{ src: string }> = ({ src }) => {
  const frame = useCurrentFrame();
  const { isReel, z, W, H } = useLayout();
  const screenW = isReel ? 560 : 470;
  const screenH = Math.round(screenW * (844 / 390));
  const scroll = interpolate(frame, [20, SCENES.repo.duration], [0, 0.22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (x) => x * x * (3 - 2 * x),
  });
  const rise = interpolate(frame, [0, 26], [80, 0], { extrapolateRight: "clamp", easing: (x) => 1 - Math.pow(1 - x, 3) });

  const copy = (
    <div>
      <Fade delay={0}>
        <Eyebrow size={isReel ? 24 : 20}>Open source · MIT</Eyebrow>
      </Fade>
      <div style={{ fontFamily: display, fontStyle: "italic", fontSize: isReel ? 104 : 80, lineHeight: 1, color: C.paper, marginTop: 26, letterSpacing: "-0.02em" }}>
        <Reveal delay={3}>Código aberto.</Reveal>
        <Reveal delay={8}>
          Seu <Accent>agente</Accent> usa.
        </Reveal>
      </div>
      <Fade delay={16} style={{ marginTop: 26, maxWidth: isReel ? 820 : 380 }}>
        <div style={{ fontFamily: body, fontSize: isReel ? 32 : 27, lineHeight: 1.35, color: C.muted }}>
          Claude Code, Codex ou qualquer agente com shell.
        </div>
      </Fade>
    </div>
  );

  const phone = (
    <Phone w={screenW} h={screenH} style={{ transform: `translateY(${rise}px)` }}>
      <Img
        src={staticFile(src)}
        style={{ width: "100%", display: "block", transform: `translateY(${-scroll * 100}%)` }}
      />
    </Phone>
  );

  if (isReel) {
    return (
      <AbsoluteFill>
        <div style={{ position: "absolute", left: z.left + 8, top: z.top + 40, right: z.right }}>{copy}</div>
        <div style={{ position: "absolute", top: z.top + 460, left: (W - screenW) / 2 - 16 }}>{phone}</div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: z.left, top: z.top + 60, width: 410 }}>{copy}</div>
      <div style={{ position: "absolute", top: (H - screenH) / 2 - 10, right: z.right - 10 }}>{phone}</div>
    </AbsoluteFill>
  );
};

// ----------------------------------------------------------------- 5. CTA
export const CtaBlock: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { isReel } = useLayout();
  const urlSize = isReel ? 82 : 76;
  const [host, user, repo] = REPO.split("/");
  return (
    <div>
      <Fade delay={0}>
        <Eyebrow size={isReel ? 26 : 22}>Clone e rode ↓</Eyebrow>
      </Fade>
      <div style={{ fontFamily: mono, fontWeight: 700, fontSize: urlSize, lineHeight: 1.08, color: C.paper, marginTop: 30, letterSpacing: "-0.03em" }}>
        <Reveal delay={3}>
          <span style={{ color: C.muted, fontWeight: 400 }}>{host}/</span>
        </Reveal>
        <Reveal delay={7}>{user}/</Reveal>
        <Reveal delay={11}>
          <span style={{ color: C.signal }}>{repo}</span>
        </Reveal>
      </div>
      {!compact && (
        <Fade delay={22} style={{ marginTop: 40 }}>
          <div style={{ fontFamily: display, fontStyle: "italic", fontSize: isReel ? 54 : 46, lineHeight: 1.1, color: C.paper }}>
            Do print ao post, sem sair do terminal.
          </div>
        </Fade>
      )}
      <Fade delay={compact ? 10 : 32} style={{ marginTop: compact ? 36 : 64, display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ width: 56, height: 3, background: C.signal }} />
        <div>
          <div style={{ fontFamily: body, fontWeight: 600, fontSize: isReel ? 34 : 29, color: C.paper }}>{AUTHOR}</div>
          <div style={{ fontFamily: mono, fontSize: isReel ? 21 : 18, color: C.muted, marginTop: 6, letterSpacing: "0.02em" }}>
            {AUTHOR_ROLE}
          </div>
        </div>
      </Fade>
    </div>
  );
};

const CtaScene: React.FC = () => {
  const { isReel, z } = useLayout();
  return (
    <AbsoluteFill style={{ padding: `0 ${z.right}px 0 ${z.left + 8}px`, justifyContent: "center" }}>
      <div style={{ marginTop: isReel ? 20 : 0 }}>
        <CtaBlock />
      </div>
    </AbsoluteFill>
  );
};

// --------------------------------------------------------------- the reel
const ORDER = ["hook", "terminal", "viewer", "repo", "cta"] as const;

export const Launch: React.FC<LaunchProps> = ({
  viewerSrc,
  viewerCuts,
  downloadAtFrame = 255,
  downloadPoint = { x: 0.667, y: 0.487 },
  repoSrc,
  showSafeZones,
}) => {
  const frame = useCurrentFrame();
  const scenesDone = ORDER.filter((k) => frame >= SCENES[k].from).length;
  const seq = (k: (typeof ORDER)[number], node: React.ReactNode, opts?: { fadeIn?: boolean; fadeOut?: boolean }) => (
    <Sequence key={k} from={SCENES[k].from} durationInFrames={SCENES[k].duration} name={k}>
      <SceneFrame duration={SCENES[k].duration} {...opts}>
        {node}
      </SceneFrame>
    </Sequence>
  );
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      <Darkroom />
      <ProgressRail scenesDone={scenesDone} totalScenes={ORDER.length} />
      {seq("hook", <Hook />, { fadeIn: false })}
      {seq("terminal", <TerminalScene />)}
      {seq("viewer", <ViewerScene src={viewerSrc} cuts={viewerCuts} downloadAt={downloadAtFrame} point={downloadPoint} />)}
      {seq("repo", <RepoScene src={repoSrc} />)}
      {seq("cta", <CtaScene />, { fadeOut: false })}
      <Slate />
      {showSafeZones && <SafeZoneOverlay />}
    </AbsoluteFill>
  );
};

// -------------------------------------------------------------- the cover
// Reel cover. The profile grid crops to the centre 1080x1440, so everything
// that matters sits between y≈240 and y≈1680.
export const LaunchCover: React.FC<Pick<LaunchProps, "showSafeZones">> = ({ showSafeZones }) => {
  const { W, H, z } = useLayout();
  const left = z.left + 8;
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      <Darkroom />
      <Slate />
      <div style={{ position: "absolute", left, right: z.right - 40, top: (H - 1440) / 2 + 60 }}>
        <Eyebrow size={26}>● Rec — open source</Eyebrow>
        <div style={{ fontFamily: display, fontStyle: "italic", fontSize: 146, lineHeight: 0.98, color: C.paper, marginTop: 30, letterSpacing: "-0.02em" }}>
          Este vídeo
          <br />
          foi feito por
          <br />
          um <Accent>agente.</Accent>
        </div>
        <div style={{ marginTop: 56, transform: "rotate(-1.2deg)", transformOrigin: "left top" }}>
          <Terminal t={10_000} width={W - left - z.right + 40} fontSize={21} />
        </div>
      </div>
      <div style={{ position: "absolute", left, bottom: (H - 1440) / 2 + 40, fontFamily: mono, fontWeight: 700, fontSize: 40, color: C.paper, letterSpacing: "-0.02em" }}>
        <span style={{ color: C.muted, fontWeight: 400 }}>github.com/rwspatin/</span>
        <span style={{ color: C.signal }}>agentic-media-kit</span>
      </div>
      {showSafeZones && <SafeZoneOverlay />}
    </AbsoluteFill>
  );
};
