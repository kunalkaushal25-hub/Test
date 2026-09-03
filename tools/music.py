#!/usr/bin/env python3
"""
music.py — the ambient bed under the film.

A slow four-chord pad, synthesised from scratch with the standard library
only (no numpy in this environment). Sines come from a wavetable rather than
math.sin so the per-sample loop stays affordable in pure Python, and the whole
thing is rendered at 22.05 kHz — the pad has nothing above 2 kHz, and ffmpeg
resamples on the way into AAC.

    python3 tools/music.py out/ambient.wav [duration_seconds]
"""

import array
import math
import sys
import wave

SR = 22050
TABLE_BITS = 13
TABLE = 1 << TABLE_BITS
MASK = TABLE - 1

# Am - F - C - G, voiced low and open so it sits under dialogue-free picture.
CHORDS = [
    (110.00, 164.81, 220.00, 261.63),   # Am
    (87.31, 130.81, 220.00, 174.61),    # F
    (130.81, 196.00, 261.63, 329.63),   # C
    (98.00, 146.83, 196.00, 246.94),    # G
]

SINE = [math.sin(2.0 * math.pi * i / TABLE) for i in range(TABLE)]


def render_pad(total_s):
    """Additive pad, rendered chord by chord with overlapping crossfades."""
    n_total = int(total_s * SR)
    buf = [0.0] * n_total

    slot = 12.4                      # seconds per chord
    fade = 3.2                       # crossfade length
    n_slots = max(1, int(math.ceil(total_s / slot)))

    for i in range(n_slots):
        notes = CHORDS[i % len(CHORDS)]
        start = int(i * slot * SR)
        length = int((slot + fade) * SR)
        if start >= n_total:
            break
        length = min(length, n_total - start)
        n_fade = int(fade * SR)

        # Each note gets two slightly detuned oscillators plus a soft octave.
        oscs = []
        for j, f in enumerate(notes):
            amp = 0.30 / (1.0 + 0.55 * j)          # roll the top voices back
            for det in (-0.11, 0.11):
                oscs.append([0.0, (f + det) / SR * TABLE, amp])
            oscs.append([0.0, (f * 2.0) / SR * TABLE, amp * 0.16])
        # Sub-octave weight under the root.
        oscs.append([0.0, (notes[0] * 0.5) / SR * TABLE, 0.22])

        # A slow breath so the pad never sits perfectly still.
        lfo_ph = 0.0
        lfo_inc = 0.055 / SR * TABLE

        for n in range(length):
            if n < n_fade:
                env = 0.5 - 0.5 * math.cos(math.pi * n / n_fade)
            elif n > length - n_fade:
                k = (length - n) / n_fade
                env = 0.5 - 0.5 * math.cos(math.pi * k)
            else:
                env = 1.0

            lfo_ph += lfo_inc
            env *= 0.86 + 0.14 * SINE[int(lfo_ph) & MASK]

            s = 0.0
            for o in oscs:
                o[0] += o[1]
                s += SINE[int(o[0]) & MASK] * o[2]
            buf[start + n] += s * env

    return buf


def comb(x, delay, fb, mix):
    """Feedback comb — cheap depth without a full reverb network."""
    n = len(x)
    buf = [0.0] * delay
    idx = 0
    out = [0.0] * n
    for i in range(n):
        d = buf[idx]
        v = x[i] + fb * d
        buf[idx] = v
        idx += 1
        if idx == delay:
            idx = 0
        out[i] = x[i] + mix * d
    return out


def one_pole(x, a):
    y = 0.0
    out = [0.0] * len(x)
    for i, v in enumerate(x):
        y += a * (v - y)
        out[i] = y
    return out


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'out/ambient.wav'
    dur = float(sys.argv[2]) if len(sys.argv) > 2 else 99.0

    dry = render_pad(dur)
    dry = one_pole(dry, 0.42)                       # take the edge off

    # Slightly different comb pairs per channel give the bed some width.
    left = comb(comb(dry, 1231, 0.42, 0.34), 1699, 0.34, 0.26)
    right = comb(comb(dry, 1409, 0.40, 0.34), 1877, 0.33, 0.26)

    peak = max(1e-9, max(max(abs(v) for v in left), max(abs(v) for v in right)))
    gain = 0.26 / peak                              # a bed, not a score

    n = len(dry)
    fade_in = int(3.0 * SR)
    fade_out = int(4.5 * SR)

    out = array.array('h', bytes(4 * n))
    for i in range(n):
        e = 1.0
        if i < fade_in:
            e = 0.5 - 0.5 * math.cos(math.pi * i / fade_in)
        if i > n - fade_out:
            k = (n - i) / fade_out
            e = min(e, 0.5 - 0.5 * math.cos(math.pi * k))
        l = int(max(-32767, min(32767, left[i] * gain * e * 32767)))
        r = int(max(-32767, min(32767, right[i] * gain * e * 32767)))
        out[2 * i] = l
        out[2 * i + 1] = r

    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(out.tobytes())

    print(f'wrote {path}  {dur:.1f}s  {SR} Hz stereo')


if __name__ == '__main__':
    main()
