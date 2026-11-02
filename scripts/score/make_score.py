#!/usr/bin/env python3
"""Procedural music score for a video timeline. Python 3 stdlib only.

    python3 scripts/score/make_score.py --timeline timeline.json --out music.wav [--mood calm] [--bpm 84] [--key F]

timeline.json: {"bpm", "durationSec", "key", "mood", "cuts": [sec, ...], "voice": [{"startSec", "endSec"}, ...]}
(bpm/key/mood fall back to the mood's defaults in moods.json).

Writes a 48 kHz stereo WAV mastered to -14 LUFS integrated, true peak <= -1 dBTP:
  - a bed whose bar grid starts at t=0: e-piano chords (one per bar), bass,
    soft drums from bar 2, a motif every other bar (rested while a voice
    speaks), an optional 8th-note pulse;
  - a soft accent (hit + short riser) landing exactly on every cut;
  - a gentle fade-in, and an ending that resolves: dominant on the
    second-to-last bar, the tonic rung out from the last bar line.
The bed is NOT ducked under the voice; the composition does that.

The engine (synth.py, dsp.py, mix.py, loudness.py) is adapted from
elvarofficial/teardown (MIT, see LICENSE-teardown). Moods live in moods.json.
"""

import argparse
import functools
import json
import math
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import synth  # noqa: E402
from dsp import add, reverb, svf, zeros  # noqa: E402
from mix import Mix  # noqa: E402
from synth import SR  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET_LUFS = -14.0
CEILING_DB = -1.5  # leaves room for AAC overshoot so the muxed file stays <= -1 dBTP
FADE_IN = 0.8
FADE_OUT = 1.2

_SEMI = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}


def semitone(name):
    """Pitch class offset from A of a note name without octave ("F#", "Bb")."""
    s = _SEMI[name[0].upper()]
    for ch in name[1:]:
        s += 1 if ch == "#" else -1 if ch == "b" else 0
    return s


def hz(name):
    """Note name to frequency: "A4" = 440, "F#3", "Bb2"."""
    base, rest = name[0], name[1:]
    shift = 0
    while rest and rest[0] in "#b":
        shift += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    return 440.0 * 2 ** ((_SEMI[base] + shift + 12 * (int(rest) - 4)) / 12)


def chord(spec, ratio):
    """ "Fmaj7:F3 A3 C4 E4/F2" -> ([note Hz, ...], bass Hz), transposed by ratio."""
    notes, root = spec.split(":", 1)[1].split("/")
    return [hz(n) * ratio for n in notes.split()], hz(root.strip()) * ratio


# Tonal one-shots repeat a lot (same chords every few bars): cache them.
epiano = functools.lru_cache(maxsize=None)(synth.epiano)
bass = functools.lru_cache(maxsize=None)(synth.bass)
kick = functools.lru_cache(maxsize=None)(synth.kick)
blip = functools.lru_cache(maxsize=None)(synth.blip)


def load_mood(name):
    with open(os.path.join(HERE, "moods.json"), encoding="utf8") as f:
        moods = {k: v for k, v in json.load(f).items() if not k.startswith("_")}
    if name not in moods:
        sys.exit(f"make_score: unknown mood {name!r} (one of: {', '.join(moods)})")
    return moods[name]


def in_voice(t, voice):
    return any(v["startSec"] - 0.1 <= t < v["endSec"] + 0.1 for v in voice)


def score(tl, mood_name, bpm, key, seed=11):
    m = load_mood(mood_name)
    dur = float(tl["durationSec"])
    cuts = [float(c) for c in tl.get("cuts", [])]
    voice = tl.get("voice", [])

    shift = (semitone(key) - semitone(m["tonic"])) % 12
    if shift > 5:
        shift -= 12  # stay within a tritone of the written register
    ratio = 2 ** (shift / 12)
    prog = [chord(c, ratio) for c in m["chords"]]
    cadence = chord(m["cadence"], ratio)
    motif = [(bt, hz(n) * ratio) for bt, n in m["motif"]]

    beat = 60.0 / bpm
    bar = 4 * beat
    n = int(dur * SR)
    mix = Mix(dur, seed=seed)
    random.seed(seed)

    # The last bar line with at least 1.5 beats of room carries the resolving tonic.
    end_bar = int(dur / bar)
    if dur - end_bar * bar < 1.5 * beat:
        end_bar -= 1
    end_bar = max(end_bar, 0)

    keys, low, drums = zeros(n), zeros(n), zeros(n)
    k = m["keys"]
    d = m["drums"]
    p = m["pulse"]
    for b in range(end_bar + 1):
        t = b * bar
        final = b == end_bar and b > 0
        if final:
            notes, root = prog[0]
        elif b == end_bar - 1 and b > 0:
            notes, root = cadence
        else:
            notes, root = prog[b % len(prog)]

        if final:
            ring = max(beat, dur - t)
            for i, f in enumerate(notes):
                add(keys, epiano(f, ring, k["vel"], ring / 2.2), int((t + 0.018 * i) * SR))
            add(low, bass(root, ring, 0.8), int(t * SR))
            add(drums, kick(0.7), int(t * SR))
            hi = sorted(notes)[-2:]
            add(keys, synth.chime([f * 2 for f in hi], min(ring, 2.4), 0.8), int(t * SR), 0.18)
            break

        for i, f in enumerate(notes):
            add(keys, epiano(f, 2.9 * 84 / bpm + 0.4, k["vel"], k["decay"]), int((t + 0.012 * i) * SR))
            if k["restrike"] and i >= 2:
                add(keys, epiano(f, 1.3, k["vel"] * 0.5, k["decay"]), int((t + 1.5 * beat + 0.01 * i) * SR))
        for st in k["stabs"]:
            for i, f in enumerate(notes):
                add(keys, epiano(f, 0.9 * beat, k["vel"] * 0.45, 0.25), int((t + st * beat + 0.006 * i) * SR))
        if b % 2 == 1:
            for bt, f in motif:
                at = t + bt * beat
                if in_voice(at, voice):
                    continue
                if m["motifVoice"] == "epiano":
                    add(keys, epiano(f, 1.1, 0.34, 0.6), int(at * SR))
                else:
                    add(keys, blip(f, 0.32, 0.11), int(at * SR), 0.45)
        for bt, length, vel in m["bass"]:
            add(low, bass(root, length * beat, vel), int((t + bt * beat) * SR))
        if p and b >= 1:
            tones = sorted(notes)
            for e in range(p["steps"]):
                f = tones[e % len(tones)] * 2 ** p["octave"]
                add(keys, blip(f, 0.22, 0.07), int((t + e * 4 * beat / p["steps"]) * SR), p["gain"] * (1.0 if e % 2 == 0 else 0.7))
        if b >= 1:  # drums from bar 2
            for bt in d["kicks"]:
                add(drums, kick(d["kickVel"] if bt == 0 else d["kickVel"] * 0.75), int((t + bt * beat) * SR))
            for bt in d["snares"]:
                add(drums, synth.snare(d["snareVel"]), int((t + bt * beat) * SR))
            hats = d["hats"]
            for e in range(hats):
                sw = d["swing"] * beat if (hats == 8 and e % 2) else 0.0
                add(drums, synth.hat(d["hatVel"] if e % 2 == 0 else d["hatVel"] * 0.65), int((t + e * 4 * beat / hats + sw) * SR))

    keys = svf(keys, k["lp"], 0.6, "lp")
    rv = m["reverb"]
    wl, wr = reverb(keys, size=rv["size"], damp=0.5, scale=0.9)
    dry = 1.0 - rv["wet"] * 0.5
    mix.put_stereo(0, [x * dry + w * rv["wet"] for x, w in zip(keys, wl)], [x * dry + w * rv["wet"] for x, w in zip(keys, wr)])
    mix.put(0, svf(low, 900, 0.7, "lp"), 0.9)
    mix.put(0, svf(drums, d["lp"], 0.6, "lp"), d["gain"])
    if m["crackle"]:
        mix.put(0, synth.crackle(dur), m["crackle"])

    # Cut accents: a short riser that ends on the cut, the hit exactly on it.
    acc = m["accent"]
    for c in cuts:
        if c < 0.3 or c > dur - 0.3:
            continue
        rdur = min(beat, 0.5)
        if acc["riser"]:
            mix.put(c - rdur, synth.riser(rdur, 400, 6000), acc["riser"])
        mix.put(c, synth.hit(), acc["gain"])
        b = int(c / bar + 1e-6)
        notes = prog[b % len(prog)][0]
        hi = sorted(notes)[-2:]
        if acc["voice"] == "chime":
            mix.put(c, synth.chime([f * 2 for f in hi], 1.2, 0.45), acc["gain"] * 0.3)
        elif acc["voice"] == "blip":
            mix.put(c, blip(hi[-1] * 2, 0.3, 0.1), acc["gain"] * 0.35)

    return mix, {"bars": end_bar + 1, "endBarSec": round(end_bar * bar, 3)}


def main():
    ap = argparse.ArgumentParser(description="Render a procedural score for a video timeline.")
    ap.add_argument("--timeline", required=True, help="timeline JSON (bpm, durationSec, key, mood, cuts, voice)")
    ap.add_argument("--out", required=True, help="output WAV (48 kHz stereo)")
    ap.add_argument("--mood", help="override the timeline's mood")
    ap.add_argument("--bpm", type=float, help="override the timeline's bpm")
    ap.add_argument("--key", help="override the timeline's key (tonic note name, e.g. F, Eb, A)")
    ap.add_argument("--seed", type=int, default=11)
    args = ap.parse_args()

    with open(args.timeline, encoding="utf8") as f:
        tl = json.load(f)
    mood = args.mood or tl.get("mood") or "calm"
    m = load_mood(mood)
    bpm = float(args.bpm or tl.get("bpm") or m["bpm"])
    key = args.key or tl.get("key") or m["key"]

    t0 = time.time()
    mix, info = score(tl, mood, bpm, key, args.seed)
    stats = mix.master(target_lufs=TARGET_LUFS, ceiling_db=CEILING_DB, fade_in=FADE_IN, fade_out=FADE_OUT)
    mix.write(args.out)
    print(
        f"wrote {args.out}: {mood} {bpm:g} bpm in {key}, {tl['durationSec']:.2f} s, {info['bars']} bars "
        f"(tonic at {info['endBarSec']} s), {len(tl.get('cuts', []))} cut accents, "
        f"{stats['lufs']:.1f} LUFS, true peak {stats['peak_db']:.1f} dBTP, drive {stats['drive']}, {time.time() - t0:.1f} s"
    )


if __name__ == "__main__":
    main()
