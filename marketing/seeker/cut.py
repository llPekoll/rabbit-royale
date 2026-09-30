"""LE MONTAGE DE LA VIDEO SEEKER (Solana Mobile) — 2 minutes, 2670x1200.

    python3 marketing/seeker/cut.py

Lit marketing/out/seeker/raw/game.mp4 (+ game.log, les reperes [film]) et les
plans de marketing/out/seeker/clips/ (capture.sh en SEEKER=1). Ecrit
marketing/out/seeker/rabbit-royale-seeker.mp4.

La partie jouee d'abord (le demarrage, la lecon, le terrier, une ile en
ligne), puis ce que le jeu devient : le PvP, le raid, la defense. Apres la
lecon, chaque moment dit ce qu'il est (le user, 2026-09-30 : « marque ce que
c'est pour que les mecs comprennent bien »).
"""
from __future__ import annotations
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "marketing/out/seeker"
RAW = OUT / "raw"
CLIPS = OUT / "clips"
WORK = OUT / "work"
W, H = 2670, 1200
FPS = 30
LILITA = str(ROOT / "marketing/seeker/fonts/LilitaOne-Regular.ttf")
AVENIR = "/System/Library/Fonts/Avenir Next.ttc"
DEMI = 2
MUSIC = ROOT / "godot/assets/sound/music_island.mp3"

GOLD = (255, 209, 56)
CREAM = (255, 243, 220)
RED = (255, 96, 80)
SEA = (120, 214, 255)


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def marks() -> dict[str, list[float]]:
    """Les reperes [film] du realisateur, par nom (dans l'ordre)."""
    out: dict[str, list[float]] = {}
    for line in (RAW / "game.log").read_text().splitlines():
        m = re.match(r"\[film\] ([\d.]+) (\S+)", line)
        if m:
            out.setdefault(m.group(2), []).append(float(m.group(1)))
    return out


# ── Les legendes ─────────────────────────────────────────────────────────────

def caption(name: str, title: str, line: str, ink=GOLD, top: bool = False) -> Path:
    """Un encart sombre en bas, au centre : le mot en Lilita, l'explication.
    `top` : sous la barre du haut — pendant la lecon, le bas est a ses legendes."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    big = ImageFont.truetype(LILITA, 96)
    small = ImageFont.truetype(AVENIR, 50, index=DEMI)
    d = ImageDraw.Draw(img)
    tw = d.textlength(title, font=big)
    lw = d.textlength(line, font=small) if line else 0
    box_w = int(max(tw, lw) + 120)
    box_h = 250 if line else 150
    x0 = (W - box_w) // 2
    y0 = 260 if top else H - box_h - 70
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x0, y0 + 10, x0 + box_w, y0 + box_h + 10), 36, fill=(0, 0, 0, 120))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((x0, y0, x0 + box_w, y0 + box_h), 36, fill=(18, 14, 10, 215),
                        outline=(*ink, 255), width=5)
    ty = y0 + 26
    d.text(((W - tw) / 2, ty + 5), title, font=big, fill=(0, 0, 0, 160))
    d.text(((W - tw) / 2, ty), title, font=big, fill=(*ink, 255))
    if line:
        d.text(((W - lw) / 2, y0 + 150), line, font=small, fill=(*CREAM, 255))
    path = WORK / f"cap-{name}.png"
    img.save(path)
    return path


def end_card(seconds: float) -> Path:
    """La carte de fin : le logo, la phrase, ou jouer."""
    img = Image.new("RGB", (W, H), (10, 22, 34))
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    ImageDraw.Draw(glow).ellipse((W * 0.2, -H * 0.3, W * 0.8, H * 0.9), fill=(26, 70, 96))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(160)), 0.7)
    logo = Image.open(ROOT / "public/assets/ui/rr-logo-banner.png").convert("RGBA")
    logo = logo.resize((logo.width * 4, logo.height * 4), Image.NEAREST)
    img.paste(logo, ((W - logo.width) // 2, 250), logo)
    d = ImageDraw.Draw(img)
    for text, font, ink, y in [
        ("Competitive minesweeper with rabbits.", ImageFont.truetype(LILITA, 104), CREAM, 640),
        ("Dig, grow your burrow, raid the neighbours.", ImageFont.truetype(AVENIR, 60, index=DEMI), SEA, 790),
        ("rabbit.rip  ·  on Seeker", ImageFont.truetype(LILITA, 84), GOLD, 960),
    ]:
        tw = d.textlength(text, font=font)
        d.text(((W - tw) / 2, y + 6), text, font=font, fill=(0, 0, 0))
        d.text(((W - tw) / 2, y), text, font=font, fill=ink)
    png = WORK / "end.png"
    img.save(png)
    out = WORK / "seg-99-end.mp4"
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-loop", "1", "-t", str(seconds), "-i", str(png),
         "-f", "lavfi", "-t", str(seconds), "-i", "anullsrc=r=48000:cl=stereo",
         "-vf", f"fade=t=in:d=0.5,fade=t=out:st={seconds - 0.6}:d=0.6,format=yuv420p",
         "-r", str(FPS), "-c:v", "libx264", "-crf", "17", "-c:a", "aac", "-b:a", "192k",
         "-shortest", str(out)])
    return out


# ── Les segments ─────────────────────────────────────────────────────────────

_n = 0


def segment(src: Path, start: float, end: float, caps: list[tuple[str, float, float]] = (),
            gain_db: float = 0.0, music_db: float | None = None) -> Path:
    """[start, end] de `src`, agrandi a 2670x1200, legendes posees par-dessus
    (chemin, debut, fin — en secondes DU SEGMENT), son releve, musique dessous."""
    global _n
    _n += 1
    dur = end - start
    out = WORK / f"seg-{_n:02d}.mp4"
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{start}", "-t", f"{dur}", "-i", str(src)]
    for path, _, _ in caps:
        cmd += ["-loop", "1", "-t", f"{dur}", "-i", str(path)]
    if music_db is not None:
        cmd += ["-stream_loop", "-1", "-i", str(MUSIC)]
    chain = [f"[0:v]scale={W}:{H}:flags=lanczos,fps={FPS},setsar=1[v0]"]
    last = "v0"
    for i, (_, a, b) in enumerate(caps, start=1):
        b = min(b, dur)
        chain.append(f"[{i}:v]format=rgba,fade=t=in:st={a}:d=0.25:alpha=1,"
                     f"fade=t=out:st={max(a, b - 0.3)}:d=0.3:alpha=1[c{i}]")
        chain.append(f"[{last}][c{i}]overlay=0:0:enable='between(t,{a},{b})'[v{i}]")
        last = f"v{i}"
    chain.append(f"[{last}]format=yuv420p[v]")
    audio = f"[0:a]volume={gain_db}dB,aresample=48000"
    if music_db is not None:
        m = len(caps) + 1
        chain.append(f"{audio}[g]")
        chain.append(f"[{m}:a]atrim=0:{dur},volume={music_db}dB,aresample=48000[m]")
        chain.append("[g][m]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]")
    else:
        chain.append(f"{audio},alimiter=limit=0.95[a]")
    cmd += ["-filter_complex", ";".join(chain), "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-r", str(FPS),
            "-c:a", "aac", "-b:a", "192k", "-ac", "2", str(out)]
    run(cmd)
    return out


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    game = RAW / "game.mp4"
    t = marks()
    first = lambda k: t[k][0]

    segs: list[Path] = []
    # 1. LE DEMARRAGE ET LA LECON, telle quelle : ses legendes a elle.
    lesson_end = first("tutorial-done") + 2.2
    # Sans legende : la lecon a les siennes (le user, 2026-09-30).
    segs.append(segment(game, 0.0, lesson_end))
    # 2. LE TERRIER, et le doigt qui tape DIG.
    burrow = first("burrow")
    # Les reperes tombent au debut du rideau, pas quand l'image revient.
    segs.append(segment(game, burrow + 0.9, first("tap-dig") + 0.6, [
        (caption("burrow", "YOUR BURROW", "Your carrots grow here. New islets rise as you level up."), 0.2, 4.8),
    ]))
    # 3. UNE VRAIE ILE, EN LIGNE : les chiffres, les croix.
    island = first("island")
    # Jusqu'a la premiere croix en ligne (la premiere de la liste est celle
    # de la lecon), puis on coupe : le chemin varie d'un tournage a l'autre.
    m1 = t["mark"][1]
    island += 1.0
    segs.append(segment(game, island, m1 + 4.2, [
        (caption("dig", "DIG", "Each number counts the bombs around it. Find the chests."), 0.2, m1 - island - 0.3),
        (caption("mark", "MARK A BOMB", "Right guess: energy. Wrong guess: it costs you.", RED), m1 - island, m1 - island + 4.0),
    ]))
    # 4. LA BOMBE SUR LAQUELLE IL SAUTE.
    blast = first("blast")
    segs.append(segment(game, blast - 0.5, blast + 4.0, [
        (caption("boom", "BOOM", "Step on a bomb and you're blown back.", RED), 0.4, 4.3),
    ]))
    # 5. LE DERNIER COFFRE, L'ILE COULE, LE NIVEAU.
    done = first("chests-done")
    segs.append(segment(game, done - 3.5, done + 2.0, [
        (caption("chests", "LAST CHEST", "Take it and the island sinks. Carrots go home."), 0.3, 5.3),
    ]))
    home = first("home")
    segs.append(segment(game, home + 0.7, home + 5.9, [
        (caption("level", "LEVEL UP", "Bigger islands, more chests, more rabbits.", SEA), 1.6, 5.1),
    ]))
    # 6. CE QUE LE JEU DEVIENT : LE PVP (plans du banc, son releve, musique).
    pvp = dict(gain_db=14.0, music_db=-17.0)
    segs.append(segment(CLIPS / "pvp-lightning.mp4", 0.6, 6.4, [
        (caption("lightning", "LIGHTNING", "From level 10 you share the island. Tap a rival: zapped."), 0.2, 5.8),
    ], **pvp))
    segs.append(segment(CLIPS / "pvp-bloop.mp4", 0.6, 7.2, [
        (caption("bloop", "BLOOP", "Ink their screen. They can't go home.", SEA), 0.2, 6.6),
    ], **pvp))
    segs.append(segment(CLIPS / "pvp-drown.mp4", 0.9, 7.2, [
        (caption("push", "PUSH", "Shove them into the sea...", SEA), 0.2, 6.3),
    ], **pvp))
    segs.append(segment(CLIPS / "pvp-bombshove.mp4", 0.9, 5.6, [
        (caption("bombshove", "...OR ONTO A BOMB", "", RED), 0.2, 4.7),
    ], **pvp))
    # 7. LE RAID, PUIS LA DEFENSE.
    segs.append(segment(CLIPS / "raid-attack.mp4", 0.3, 17.6, [
        (caption("raid", "RAID", "Walk a neighbour's burrow blind. Reach the garden."), 0.4, 6.0),
        (caption("steal", "TAKE THEIR CARROTS", "Mind their bombs on the way in.", GOLD), 6.2, 12.0),
    ], **pvp))
    segs.append(segment(CLIPS / "raid-defend.mp4", 0.3, 16.0, [
        (caption("defend", "DEFEND", "Someone's in your burrow. Bury bombs in their path.", RED), 0.8, 7.5),
        (caption("strike", "STRIKE BACK", "Tap the raider: lightning.", GOLD), 7.7, 12.2),
    ], **pvp))
    segs.append(end_card(4.5))

    listing = WORK / "list.txt"
    listing.write_text("".join(f"file '{p}'\n" for p in segs))
    final = OUT / "rabbit-royale-seeker.mp4"
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
         "-c:v", "libx264", "-crf", "17", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", str(FPS),
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final)])
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                          str(final)], capture_output=True, text=True).stdout.strip()
    print(f"{final}  ({float(dur):.1f} s)")


if __name__ == "__main__":
    main()
