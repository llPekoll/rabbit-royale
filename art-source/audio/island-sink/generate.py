"""Original sinking-island Foley: earth cracking, water surge, submerged bubbles.

Deterministic synthesis, no external samples. Run with python3; requires ffmpeg.
2.5 seconds, -23 dBFS RMS, played at 0.40 in both clients.
"""
import math
import random
import struct
import subprocess
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RATE = 44100
DURATION = 2.5
rng = random.Random(7319)
samples = [0.0] * int(RATE * DURATION)
low = mid = deep = 0.0
for i in range(len(samples)):
    t = i / RATE
    noise = rng.uniform(-1, 1)
    low += 0.025 * (noise - low)
    mid += 0.19 * (noise - mid)
    deep += 0.008 * (noise - deep)
    # Soft earth collapse, followed by a broad, falling wash of water.
    earth = (1 - math.exp(-t / 0.018)) * math.exp(-t / 0.23)
    surge = (1 - math.exp(-t / 0.19)) * math.exp(-t / 0.50)
    samples[i] = 2.8 * deep * earth + 2.6 * (mid - low) * surge
    samples[i] += 0.18 * math.sin(math.tau * (83 * t - 12 * t * t)) * earth

# Irregular rock cracks: short filtered noise, no cannon-like blast.
for start, gain in [(0.025, 0.18), (0.083, 0.13), (0.16, 0.09), (0.27, 0.055)]:
    filtered = 0.0
    for j in range(int(0.12 * RATE)):
        t = j / RATE
        filtered += 0.35 * (rng.uniform(-1, 1) - filtered)
        env = (1 - math.exp(-t / 0.001)) * math.exp(-t / 0.015)
        samples[int(start * RATE) + j] += gain * filtered * env

# Rising resonant bubbles with varied pitch and damping in the watery tail.
for _ in range(44):
    start = rng.uniform(0.32, 2.22)
    freq = rng.uniform(180, 720)
    decay = rng.uniform(0.018, 0.045)
    gain = rng.uniform(0.025, 0.075) * (1 - start / DURATION)
    for j in range(min(int(0.22 * RATE), len(samples) - int(start * RATE))):
        t = j / RATE
        env = (1 - math.exp(-t / 0.002)) * math.exp(-t / decay)
        samples[int(start * RATE) + j] += gain * env * math.sin(math.tau * freq * (t + 1.8 * t * t))

for i in range(len(samples)):
    samples[i] *= min(1, i / (RATE * 0.005), (len(samples) - 1 - i) / (RATE * 0.18))
rms = math.sqrt(sum(s * s for s in samples) / len(samples))
scale = min(10 ** (-23 / 20) / rms, 0.85 / max(map(abs, samples)))
path = ROOT / 'public/assets/sfx/island_sink.wav'
with wave.open(str(path), 'wb') as out:
    out.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
    out.writeframes(b''.join(struct.pack('<h', round(s * scale * 32767)) for s in samples))
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(path),
                '-codec:a', 'libmp3lame', '-b:a', '192k',
                str(ROOT / 'godot/assets/sound/island_sink.mp3')], check=True)
print(f'island_sink: {DURATION}s, RMS {20 * math.log10(rms * scale):.1f} dBFS, '
      f'peak {20 * math.log10(max(map(abs, samples)) * scale):.1f} dBFS')
