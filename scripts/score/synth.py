# Adapted from elvarofficial/teardown, MIT (see LICENSE-teardown).
# Trimmed to the generators a music bed needs; the sample loader, UI/foley
# one-shots and the ffmpeg path were removed. `hit` is new.
"""Sound generators.

Every generator returns mono samples (a list of floats, roughly -1..1) at SR.
Use the module-level `random` for noise so renders stay reproducible.
"""

import math
import random

SR = 48000


def bandnoise(n, fc_at, q=0.8):
    """Building block: white noise through a band-pass, fc_at(k) is the cutoff in Hz at sample k."""
    low = band = 0.0
    out = []
    for k in range(n):
        f = 2 * math.sin(math.pi * min(fc_at(k), SR / 6) / SR)
        x = random.uniform(-1, 1)
        low += f * band
        high = x - low - q * band
        band += f * high
        out.append(band)
    return out


def blip(freq, dur=0.35, tau=0.12):
    """Soft tonal blip: one note of a pulse or motif. Keep freq in key."""
    n = int(dur * SR)
    out = []
    ph = 0.0
    for k in range(n):
        tt = k / SR
        ph += 2 * math.pi * freq / SR
        a = min(1, tt / 0.003) * math.exp(-tt / tau)
        out.append(a * (math.sin(ph) + 0.25 * math.sin(2 * ph) + 0.08 * math.sin(3 * ph)))
    return out


def chime(freqs, dur=1.8, tau=0.7):
    """Bell chord: arrival, a payoff. Pass freqs from the score's key."""
    n = int(dur * SR)
    out = [0.0] * n
    for j, f in enumerate(freqs):
        ph1 = ph2 = 0.0
        g = 1.0 / (1 + j * 0.35)
        for k in range(n):
            tt = k / SR
            ph1 += 2 * math.pi * f / SR
            ph2 += 2 * math.pi * f * 2.76 / SR
            a = min(1, tt / 0.004) * math.exp(-tt / tau)
            out[k] += g * a * (math.sin(ph1) + 0.18 * math.sin(ph2) * math.exp(-tt / 0.15))
    return out


def riser(dur, f0=260, f1=5200):
    """Build-up into a cut: noise sweeping up plus a rising tone. End it exactly on the hit."""
    n = int(dur * SR)
    noise = bandnoise(n, lambda k: f0 * (f1 / f0) ** (k / n), q=0.6)
    out = []
    ph = 0.0
    for k in range(n):
        x = k / n
        ph += 2 * math.pi * (180 * (4.0 ** x)) / SR
        tail = min(1, (n - k) / (0.02 * SR))
        out.append((noise[k] * 1.3 + 0.35 * math.sin(ph)) * x ** 2.2 * tail)
    return out


def hit(f=72, decay=0.16, air=0.5):
    """Soft cut accent: a round low thump plus a short breath of high noise. Subtle, not a slam."""
    n = int(0.45 * SR)
    noise = bandnoise(n, lambda k: 5200, q=0.5)
    out = []
    ph = 0.0
    for k in range(n):
        t = k / SR
        ph += 2 * math.pi * (f + 40 * math.exp(-t / 0.03)) / SR
        body = math.sin(ph) * math.exp(-t / decay)
        tss = noise[k] * air * math.exp(-t / 0.035)
        out.append(min(1.0, t / 0.001) * (body + tss))
    return out


# ---------------------------------------------------------------- a small band, for music beds


def epiano(freq, dur=2.6, vel=1.0, decay=1.1):
    """Electric-piano note (tine and warm body), for chords. Keep freq in key; vel 0..1."""
    n = int(dur * SR)
    out = [0.0] * n
    w1 = 2 * math.pi * freq / SR
    w2 = 2 * w1
    wt = 2 * math.pi * freq * 6.98 / SR
    wtrem = 2 * math.pi * 4.6 / SR
    sin = math.sin
    exp = math.exp
    for k in range(n):
        t = k / SR
        a = (t / 0.006 if t < 0.006 else 1.0) * exp(-t / decay)
        body = sin(w1 * k) + 0.28 * sin(w2 * k) * exp(-t / 0.5)
        tine = 0.16 * sin(wt * k) * exp(-t / 0.09)
        out[k] = vel * a * (body + tine) * (1 + 0.1 * sin(wtrem * k))
    tail = min(n, int(0.08 * SR))
    for i in range(tail):
        out[n - 1 - i] *= i / tail
    return out


def bass(freq, dur=0.9, vel=1.0):
    """Round bass note: sine plus a little second harmonic, gently saturated. Roots under the chords."""
    n = int(dur * SR)
    out = [0.0] * n
    w = 2 * math.pi * freq / SR
    sin = math.sin
    exp = math.exp
    for k in range(n):
        t = k / SR
        a = (t / 0.012 if t < 0.012 else 1.0) * exp(-t / 0.45)
        out[k] = math.tanh(1.4 * vel * a * (sin(w * k) + 0.22 * sin(2 * w * k)))
    tail = min(n, int(0.05 * SR))
    for i in range(tail):
        out[n - 1 - i] *= i / tail
    return out


def kick(vel=1.0):
    """Soft kick: a sine dropping from 110 to 46 Hz. Lo-fi, not club."""
    n = int(0.32 * SR)
    out = [0.0] * n
    ph = 0.0
    for k in range(n):
        t = k / SR
        f = 46 + 64 * math.exp(-t / 0.035)
        ph += 2 * math.pi * f / SR
        out[k] = vel * math.sin(ph) * math.exp(-t / 0.11) * min(1.0, t / 0.002)
    return out


def snare(vel=1.0):
    """Brushed snare: band-passed noise with a short body tone, for beats 2 and 4."""
    n = int(0.22 * SR)
    noise = bandnoise(n, lambda k: 2100, q=0.55)
    return [vel * (noise[k] * 1.6 * math.exp(-k / (0.06 * SR)) + 0.25 * math.sin(2 * math.pi * 190 * k / SR) * math.exp(-k / (0.025 * SR))) for k in range(n)]


def hat(vel=1.0):
    """Closed hat tick: high band noise, very short. Swing the off-beats."""
    n = int(0.05 * SR)
    noise = bandnoise(n, lambda k: 7600, q=0.4)
    return [vel * noise[k] * 1.8 * math.exp(-k / (0.011 * SR)) for k in range(n)]


def crackle(dur, density=7.0, hiss=0.012):
    """Vinyl crackle bed: sparse clicks over a faint hiss. density is clicks per second."""
    n = int(dur * SR)
    out = [random.uniform(-1, 1) * hiss for _ in range(n)]
    for _ in range(int(dur * density)):
        at = random.randrange(n)
        g = random.uniform(0.05, 0.35) * random.choice((-1, 1))
        for i in range(min(40, n - at)):
            out[at + i] += g * math.exp(-i / 6.0)
    return out
