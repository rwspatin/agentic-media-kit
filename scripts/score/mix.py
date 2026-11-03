# Adapted from elvarofficial/teardown, MIT (see LICENSE-teardown).
# Removed the typing helper; master() gained a fade-in and a configurable
# ceiling, and write() takes the output path only.
"""Mixer: place sounds in time, master to a loudness target, write a WAV."""

import math
import os
import random
import struct
import wave

from loudness import integrated_lufs, true_peak
from synth import SR

DRIVES = (1.2, 1.5, 1.8, 2.0, 2.2, 2.5, 3.0, 4.0)


class Mix:
    def __init__(self, duration, seed=11):
        random.seed(seed)
        self.duration = duration
        self.n = int(SR * duration)
        self.left = [0.0] * self.n
        self.right = [0.0] * self.n
        self.count = 0
        self._out = None

    def put(self, t, samples, gain=1.0, pan=0.0):
        """Place mono samples at t seconds. pan: -1 left, 0 centre, +1 right (equal power)."""
        ang = (pan + 1) * math.pi / 4
        gl, gr = gain * math.cos(ang), gain * math.sin(ang)
        i0 = int(round(t * SR))
        a, b = max(0, i0), min(self.n, i0 + len(samples))
        if b <= a:
            return
        seg = samples[a - i0:b - i0]
        self.left[a:b] = [x + s * gl for x, s in zip(self.left[a:b], seg)]
        self.right[a:b] = [x + s * gr for x, s in zip(self.right[a:b], seg)]
        self.count += 1

    def put_stereo(self, t, left, right, gain=1.0):
        """Place a stereo pair at t seconds."""
        i0 = int(round(t * SR))
        a, b = max(0, i0), min(self.n, i0 + len(left))
        if b <= a:
            return
        self.left[a:b] = [x + s * gain for x, s in zip(self.left[a:b], left[a - i0:b - i0])]
        self.right[a:b] = [x + s * gain for x, s in zip(self.right[a:b], right[a - i0:b - i0])]
        self.count += 1

    def master(self, target_lufs=-14.0, ceiling_db=-1.5, fade_in=0.0, fade_out=0.25):
        """Soft-clip and set gain so the mix hits target_lufs with true peak <= ceiling_db.

        Drive only rises when the ceiling would otherwise be crossed. If no
        drive reaches the target within the ceiling, the mix comes out quieter
        rather than crushed.
        """
        peak = max(max(map(abs, self.left)), max(map(abs, self.right))) or 1.0
        in_n = max(1, int(fade_in * SR))
        out_n = max(1, int(fade_out * SR))
        fade = [min(1.0, i / in_n, (self.n - i) / out_n) for i in range(self.n)]
        ceiling = 10 ** (ceiling_db / 20)

        def shaped(drive):
            norm = math.tanh(drive)
            tanh = math.tanh
            k = drive / peak
            return (
                [tanh(k * x) / norm * f for x, f in zip(self.left, fade)],
                [tanh(k * x) / norm * f for x, f in zip(self.right, fade)],
            )

        best = None
        for drive in DRIVES:
            left, right = shaped(drive)
            gain = 10 ** ((target_lufs - integrated_lufs(left, right)) / 20)
            if gain > ceiling:
                continue
            tp = max(true_peak(left), true_peak(right))
            fit = min(gain, ceiling / tp)
            if best is None or fit / gain > best[0]:
                best = (fit / gain, drive, left, right, fit, tp)
            if gain * tp <= ceiling:
                break
        if best is None:
            left, right = shaped(DRIVES[0])
            tp = max(true_peak(left), true_peak(right))
            best = (0, DRIVES[0], left, right, ceiling / tp, tp)
        _, drive, left, right, gain, tp = best

        self._out = ([x * gain for x in left], [x * gain for x in right])
        lufs = integrated_lufs(*self._out)
        if lufs < target_lufs - 0.5:
            print(f"warning: {lufs:.1f} LUFS, short of {target_lufs}: the mix is too sparse to get louder without clipping.")
        return {"lufs": lufs, "peak_db": 20 * math.log10(gain * tp), "drive": drive}

    def write(self, path):
        """Write 16-bit stereo WAV at 48 kHz; masters with defaults first if master() wasn't called."""
        if self._out is None:
            self.master()
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        left, right = self._out
        clip = lambda v: -32767 if v < -1 else 32767 if v > 1 else int(v * 32767)
        with wave.open(path, "wb") as wf:
            wf.setnchannels(2)
            wf.setsampwidth(2)
            wf.setframerate(SR)
            inter = [0] * (2 * self.n)
            inter[0::2] = [clip(a) for a in left]
            inter[1::2] = [clip(b) for b in right]
            wf.writeframes(struct.pack(f"<{len(inter)}h", *inter))
