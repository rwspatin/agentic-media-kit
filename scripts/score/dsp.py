# Adapted from elvarofficial/teardown, MIT (see LICENSE-teardown).
# Trimmed to what make_score.py uses: buffers, the SVF filter and Freeverb.
"""DSP building blocks, pure Python stdlib at 48 kHz.

Signals are plain lists of floats. A Python per-sample loop costs about
0.3 us/sample and a list comprehension about 0.05 us, so the reverb combs and
allpasses run one block at a time (block <= delay length), each block a single
comprehension. The SVF is a tight loop, run only on the few full-length buses.
"""

import math

from synth import SR

TAU = 2.0 * math.pi


# ---------------------------------------------------------------- buffers


def zeros(n):
    return [0.0] * n


def add(dst, src, at=0, gain=1.0):
    """dst[at:] += gain * src, in place, clipped to dst."""
    if at < 0:
        src = src[-at:]
        at = 0
    end = min(len(dst), at + len(src))
    if end <= at:
        return
    seg = dst[at:end]
    if gain == 1.0:
        dst[at:end] = [a + b for a, b in zip(seg, src)]
    else:
        dst[at:end] = [a + b * gain for a, b in zip(seg, src)]


def fade(x, fin=0, fout=0):
    """Linear fade in/out over fin/fout samples, in place."""
    n = len(x)
    fin, fout = min(fin, n), min(fout, n)
    for i in range(fin):
        x[i] *= i / fin
    for i in range(fout):
        x[n - 1 - i] *= i / fout
    return x


# ---------------------------------------------------------------- filters


def svf(x, fc, q=0.7071, mode="lp", ctrl=32):
    """Zero-delay-feedback state-variable filter (Cytomic/Simper), stable under fast modulation.

    fc: Hz, or a function of the sample index evaluated every `ctrl` samples.
    mode: 'lp', 'bp' or 'hp'.
    """
    n = len(x)
    out = [0.0] * n
    k = 1.0 / q
    ic1 = ic2 = 0.0
    const = not callable(fc)
    if const:
        ctrl = max(n, 1)
    tan = math.tan
    pis = math.pi / SR
    for s in range(0, n, ctrl):
        f = fc if const else fc(s)
        f = 10.0 if f < 10.0 else 20000.0 if f > 20000.0 else f
        g = tan(pis * f)
        a1 = 1.0 / (1.0 + g * (g + k))
        a2 = g * a1
        a3 = g * a2
        e = s + ctrl if s + ctrl < n else n
        if mode == "lp":
            for i in range(s, e):
                v3 = x[i] - ic2
                v1 = a1 * ic1 + a2 * v3
                v2 = ic2 + a2 * ic1 + a3 * v3
                ic1 = v1 + v1 - ic1
                ic2 = v2 + v2 - ic2
                out[i] = v2
        elif mode == "bp":
            for i in range(s, e):
                v3 = x[i] - ic2
                v1 = a1 * ic1 + a2 * v3
                v2 = ic2 + a2 * ic1 + a3 * v3
                ic1 = v1 + v1 - ic1
                ic2 = v2 + v2 - ic2
                out[i] = v1
        else:
            for i in range(s, e):
                xi = x[i]
                v3 = xi - ic2
                v1 = a1 * ic1 + a2 * v3
                v2 = ic2 + a2 * ic1 + a3 * v3
                ic1 = v1 + v1 - ic1
                ic2 = v2 + v2 - ic2
                out[i] = xi - k * v1 - v2
    return out


# ------------------------------------------------------------------ reverb

_COMBS = (1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617)
_ALLPASSES = (556, 441, 341, 225)


def _comb(x, m, fb, damp):
    """Freeverb comb, block-vectorized; the in-loop damping is a 2-tap low-pass."""
    n = len(x)
    a = fb * (1.0 - damp)
    b = fb * damp
    w = [0.0] * (n + m + 1)  # w[i + m + 1] = W(i)
    for s in range(0, n, m):
        e = min(s + m, n)
        w[s + m + 1:e + m + 1] = [xi + a * p + b * q for xi, p, q in zip(x[s:e], w[s + 1:e + 1], w[s:e])]
    return w[1:n + 1]


def _allpass(x, m, g=0.5):
    n = len(x)
    v = [0.0] * (n + m)  # v[i + m] = V(i)
    for s in range(0, n, m):
        e = min(s + m, n)
        v[s + m:e + m] = [xi + g * p for xi, p in zip(x[s:e], v[s:e])]
    return [p - xi for xi, p in zip(x, v)]


def reverb(x, size=0.7, damp=0.45, scale=1.0, spread=23):
    """Freeverb (8 combs + 4 allpasses per side): mono in, (left, right) wet out.

    size 0..1 maps to comb feedback 0.7..0.98; scale stretches every delay
    (0.3 = small room, 1.5 = hall). Output is roughly level-matched to input.
    """
    fb = 0.7 + 0.28 * size
    r = SR / 44100 * scale
    outs = []
    for off in (0, spread):
        acc = None
        for m in _COMBS:
            c = _comb(x, max(8, int((m + off) * r)), fb, damp)
            acc = c if acc is None else [p + q for p, q in zip(acc, c)]
        for m in _ALLPASSES:
            acc = _allpass(acc, max(8, int((m + off) * r)))
        outs.append(acc)
    g = math.sqrt((1 - fb * fb) / 8.0) * 1.4
    return [v * g for v in outs[0]], [v * g for v in outs[1]]
