import React from "react";
import { Html5Audio, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { DUCK_TO, MUSIC_VOLUME, type MusicConfig } from "./schema";

// A voice clip placed on the composition timeline (absolute frames).
export type VoiceSegment = {
  fromFrame: number;
  src: string; // relative to public/
  durationInFrames: number;
};

const MUSIC_FADE_IN = 15;
const MUSIC_FADE_OUT = 30;
const DUCK_RAMP = 8;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// 0 when no voice is speaking, 1 while one is, with short ramps either side
// so the music dips under the voice instead of cutting.
const duckAmount = (frame: number, segments: VoiceSegment[]) =>
  segments.reduce((max, s) => {
    const end = s.fromFrame + s.durationInFrames;
    const d = interpolate(frame, [s.fromFrame - DUCK_RAMP, s.fromFrame, end, end + DUCK_RAMP], [0, 1, 1, 0], clamp);
    return Math.max(max, d);
  }, 0);

// Voiceover clips + an optional looping music bed that fades in/out and ducks
// under the voice. Reusable by any composition: pass absolute-frame segments.
export const AudioLayer: React.FC<{
  voice: VoiceSegment[];
  music?: MusicConfig;
  voiceVolume?: number;
}> = ({ voice, music, voiceVolume = 1 }) => {
  const { durationInFrames } = useVideoConfig();
  const base = music?.volume ?? MUSIC_VOLUME;
  const duckTo = music?.duckTo ?? DUCK_TO;

  const musicVolume = (frame: number) => {
    const fade = Math.min(
      interpolate(frame, [0, MUSIC_FADE_IN], [0, 1], clamp),
      interpolate(frame, [durationInFrames - MUSIC_FADE_OUT, durationInFrames], [1, 0], clamp),
    );
    const duck = 1 - duckAmount(frame, voice) * (1 - duckTo);
    return base * fade * duck;
  };

  return (
    <>
      {voice.map((s, i) => (
        <Sequence key={i} from={s.fromFrame} durationInFrames={s.durationInFrames} layout="none">
          <Html5Audio src={staticFile(s.src)} volume={voiceVolume} />
        </Sequence>
      ))}
      {music && (
        // "extend" keeps the volume callback on composition frames across loops.
        <Html5Audio src={staticFile(music.src)} loop loopVolumeCurveBehavior="extend" volume={musicVolume} />
      )}
    </>
  );
};
