"""Original chest Foley + reward tones; deterministic, no external samples.

Run: python3 art-source/audio/chest/generate.py
Outputs PCM for the web and MP3 for Godot (requires ffmpeg). Mean level: -24 dBFS;
playback gain 0.40 puts each cue near -32 dBFS in the existing SFX mix.
"""
import math
import random
import struct
import subprocess
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RATE = 44100
rng = random.Random(472)


def render(name, duration, notes, knocks, air=False):
    samples = [0.0] * int(RATE * duration)
    for start, freq, decay, gain in notes:
        for i in range(int(start * RATE), len(samples)):
            t = i / RATE - start
            env = (1 - math.exp(-t / 0.006)) * math.exp(-t / decay)
            # Rounded bell: a fundamental with quiet, quickly fading overtones.
            tone = math.sin(math.tau * freq * t)
            tone += 0.19 * math.sin(math.tau * freq * 2.01 * t) * math.exp(-t / 0.12)
            samples[i] += gain * env * tone
    for start, freq, gain in knocks:
        for i in range(int(start * RATE), min(len(samples), int((start + 0.18) * RATE))):
            t = i / RATE - start
            env = (1 - math.exp(-t / 0.0015)) * math.exp(-t / 0.025)
            wood = math.sin(math.tau * freq * t) + 0.4 * math.sin(math.tau * freq * 1.63 * t)
            samples[i] += gain * env * (wood + 0.16 * rng.uniform(-1, 1))
    if air:
        filtered = 0.0
        for i in range(min(len(samples), int(0.30 * RATE))):
            t = i / RATE
            filtered = 0.94 * filtered + 0.06 * rng.uniform(-1, 1)
            samples[i] += 0.22 * filtered * math.sin(math.pi * t / 0.30) ** 2
    # Fade to exact silence, avoiding a click when the tail ends.
    for i in range(len(samples)):
        samples[i] *= min(1, (len(samples) - 1 - i) / (RATE * 0.12))
    rms = math.sqrt(sum(s * s for s in samples) / len(samples))
    scale = min(10 ** (-24 / 20) / rms, 0.85 / max(abs(s) for s in samples))
    pcm = b''.join(struct.pack('<h', round(s * scale * 32767)) for s in samples)
    for folder in ('public/assets/sfx',):
        path = ROOT / folder / (name + '.wav')
        with wave.open(str(path), 'wb') as out:
            out.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
            out.writeframes(pcm)
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-i', str(ROOT / 'public/assets/sfx' / (name + '.wav')),
        '-codec:a', 'libmp3lame', '-b:a', '192k',
        str(ROOT / 'godot/assets/sound' / (name + '.mp3')),
    ], check=True)
    print(f'{name}: {duration:.2f}s, peak {20 * math.log10(max(abs(s * scale) for s in samples)):.1f} dBFS')


render('chest_arrive', 0.38, [(0.025, 392, 0.065, 0.08)],
       [(0, 185, 0.65), (0.045, 740, 0.16)])
render('chest_open', 1.45,
       [(0.035, 523.25, 0.23, 0.30), (0.105, 659.25, 0.26, 0.25),
        (0.18, 783.99, 0.29, 0.22), (0.265, 1046.5, 0.32, 0.16)],
       [(0, 235, 0.40), (0.022, 920, 0.10)], air=True)
