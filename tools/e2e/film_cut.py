"""LE MONTAGE DU TOURNAGE A QUATRE — 1920x1080, 30 i/s, musique dessous.

    python3 tools/e2e/film_cut.py [tools/e2e/out/<date>] [--purge]   (le dernier sinon)

Lit film.json (tools/e2e/film.ts), les images horodatees de chaque fenetre
(<tag>/rec/<ms>.jpg) et leurs events.jsonl. Ecrit <run>/film/rabbit-royale-x4.mp4.

  1. le titre ;
  2. LES FENETRES S'OUVRENT une a une sur la grille 2x2, chacune avec son
     nom ; en haut, le compteur de l'ile — 1/4, 2/4, 3/4, 4/4 « L'ILE EST
     PLEINE » ;
  3. LA MELEE : la grille en accelere, coupee par les coups en plein ecran
     (l'ecran de celui qui les prend : eclair, encre, noyade) ;
  4. L'ERUPTION en plein ecran, le niveau gagne ;
  5. la carte de fin.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
W, H = 1920, 1080
FPS = 30
LILITA = str(ROOT / "marketing/seeker/fonts/LilitaOne-Regular.ttf")
AVENIR = "/System/Library/Fonts/Avenir Next.ttc"
MUSIC = ROOT / "godot/assets/sound/music_island.mp3"
LOGO = ROOT / "landing/assets/logo.png"
SFX = ROOT / "godot/assets/sound"
GOLD = (255, 209, 56)
CREAM = (255, 243, 220)
RED = (255, 96, 80)
SEA = (120, 214, 255)
INK = (190, 140, 255)
# La grille : 2x2 cases de 960x540 — les fenetres s'enregistrent en 16:9.
CW, CH = 960, 540
SLOTS = [(0, 0), (CW, 0), (0, CH), (CW, CH)]


def run(cmd: list[str]) -> None:
    subprocess.run([str(c) for c in cmd], check=True, cwd=ROOT)


PURGE = "--purge" in sys.argv
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]


def pick_run() -> Path:
    if ARGS:
        return Path(ARGS[0]).resolve()
    runs = sorted((ROOT / "tools/e2e/out").glob("*/film.json"))
    if not runs:
        sys.exit("pas de film.json — lancer d'abord tools/e2e/film.ts")
    return runs[-1].parent


RUN = pick_run()
FILM = json.loads((RUN / "film.json").read_text())
WORK = RUN / "film"
WORK.mkdir(exist_ok=True)
PLAYERS = FILM["players"]


# ── Les sources : une video par fenetre, a l'heure murale ────────────────────

def frames(p: dict) -> list[tuple[int, Path]]:
    """Les images de la fenetre, a l'heure murale. Apres `--purge`, la liste
    d'encodage (src-<tag>.txt) en garde les noms — donc les heures."""
    out = []
    for f in sorted((RUN / p["rec"]).glob("*.jpg")):
        try:
            out.append((int(f.stem), f))
        except ValueError:
            pass
    listed = WORK / f"src-{p['tag']}.txt"
    if not out and listed.exists():
        for line in listed.read_text().splitlines():
            if line.startswith("file '"):
                f = Path(line[6:-1])
                try:
                    out.append((int(f.stem), f))
                except ValueError:
                    pass
        out = sorted(set(out))
    return out


T0 = min(p["launchedAt"] for p in PLAYERS) - 400  # ms : un souffle avant la 1re fenetre


def build_source(i: int, p: dict) -> tuple[Path, float]:
    """La fenetre `i` en video 30 i/s ; rend (chemin, debut en s depuis T0)."""
    fs = frames(p)
    out = WORK / f"src-{p['tag']}.mp4"
    lst = WORK / f"src-{p['tag']}.txt"
    if out.exists() and lst.exists() and not any(f.exists() for _, f in fs[:1]):
        return out, (fs[0][0] - T0) / 1000.0
    lines = []
    for k, (t, f) in enumerate(fs):
        nxt = fs[k + 1][0] if k + 1 < len(fs) else t + 50
        lines.append(f"file '{f}'\nduration {max(1, nxt - t) / 1000:.3f}")
    lines.append(f"file '{fs[-1][1]}'")
    lst.write_text("\n".join(lines) + "\n")
    if not out.exists():
        run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst,
             "-vf", f"fps={FPS},scale=1920:-2:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "19",
             "-preset", "fast", out])
    # `--purge` : les JPG bruts (≈ 850 Mo par fenetre) partent une fois la
    # video faite — le tournage remplit vite un disque.
    if PURGE and out.exists() and out.stat().st_size > 1_000_000:
        for _, f in fs:
            f.unlink(missing_ok=True)
    return out, (fs[0][0] - T0) / 1000.0


# La fin de chaque fenetre, relevee AVANT que `--purge` n'emporte les images.
LAST = [(frames(p)[-1][0] - T0) / 1000.0 if frames(p) else 0.0 for p in PLAYERS]
SRC = [build_source(i, p) for i, p in enumerate(PLAYERS)]
PREVIEW = "--preview" in sys.argv
SPAN = max(LAST)


# ── Ce qui s'est passe, a la meme horloge ─────────────────────────────────────

def events() -> list[dict]:
    out = []
    for p in PLAYERS:
        path = RUN / p["events"]
        if path.exists():
            for line in path.read_text().splitlines():
                try:
                    e = json.loads(line)
                except json.JSONDecodeError:
                    continue
                e["g"] = (int(e["t"]) - T0) / 1000.0
                out.append(e)
    return sorted(out, key=lambda e: e["g"])


EV = events()
TAG_INDEX = {p["tag"]: i for i, p in enumerate(PLAYERS)}
ID_TAG: dict[str, str] = {}
for e in EV:  # qui est qui : le premier `island` de chacun donne son lapin
    pass


def first(tag: str, ev: str, after: float = 0.0) -> float | None:
    for e in EV:
        if e["tag"] == tag and e["ev"] == ev and e["g"] >= after:
            return e["g"]
    return None


SPAWN = [(p["launchedAt"] - T0) / 1000.0 for p in PLAYERS]
JOIN = [first(p["tag"], "island") or SPAWN[i] + 12 for i, p in enumerate(PLAYERS)]
FULL = max(JOIN)
ERUPT = next((e["g"] for e in EV if e["ev"] == "eruption"), None)
OVER = next((e["g"] for e in EV if e["ev"] == "run_over" and e.get("cleared")), None)
END = min(SPAN - 0.5, (OVER or SPAN) + 4.0)


def highlights() -> list[tuple[float, int, str, tuple]]:
    """Les coups, vus sur l'ecran de celui qui les prend : (g, fenetre, mot, encre)."""
    out: list[tuple[float, int, str, tuple]] = []
    for e in EV:
        if e["g"] <= FULL or (ERUPT and e["g"] >= ERUPT - 1):
            continue
        # Chaque client voit tout : on garde l'evenement tel que la VICTIME l'a recu.
        mine = e.get("playerId")
        if e["ev"] == "rabbit_struck":
            word, ink = "ZAPPED!", GOLD
        elif e["ev"] == "rabbit_inked":
            word, ink = "INKED!", INK
        elif e["ev"] == "rabbit_pushed" and e.get("drowned"):
            word, ink = "INTO THE SEA!", SEA
        else:
            continue
        victim = next((p["tag"] for p in PLAYERS if PLAYER_IDS.get(p["tag"]) == mine), None)
        if victim is None or victim != e["tag"]:
            continue
        if out and e["g"] - out[-1][0] < 5.0:
            continue
        out.append((e["g"], TAG_INDEX[victim], word, ink))
    return out[:5]


def player_ids() -> dict[str, str]:
    """L'id serveur de chaque fenetre : celui qu'aucun `rabbit_joined` de SA
    fenetre ne nomme, parmi ceux que les autres annoncent."""
    seen: dict[str, set[str]] = {p["tag"]: set() for p in PLAYERS}
    for e in EV:
        if e["ev"] == "rabbit_joined" and e.get("playerId"):
            seen[e["tag"]].add(e["playerId"])
    every = set().union(*seen.values())
    out = {}
    for p in PLAYERS:
        others = every - seen[p["tag"]]
        if len(others) == 1:
            out[p["tag"]] = next(iter(others))
    return out


PLAYER_IDS = player_ids()


# ── Les images posees par-dessus ──────────────────────────────────────────────

def card(name: str, title: str, line: str = "", size: int = 150, ink=GOLD) -> Path:
    """Le logo au-dessus, le titre, la ligne."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    logo = Image.open(LOGO).convert("RGBA").resize((420, 420), Image.LANCZOS)
    img.alpha_composite(logo, ((W - 420) // 2, 90))
    big = ImageFont.truetype(LILITA, size)
    small = ImageFont.truetype(AVENIR, 46, index=2)
    d = ImageDraw.Draw(img)
    tw = d.textlength(title, font=big)
    y = 530
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text(((W - tw) / 2, y + 10), title, font=big, fill=(0, 0, 0, 200))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(10)))
    d = ImageDraw.Draw(img)
    d.text(((W - tw) / 2, y), title, font=big, fill=(*ink, 255), stroke_width=6, stroke_fill=(40, 22, 10, 255))
    if line:
        lw = d.textlength(line, font=small)
        d.text(((W - lw) / 2, y + size + 30), line, font=small, fill=(*CREAM, 255),
               stroke_width=3, stroke_fill=(20, 14, 10, 255))
    path = WORK / f"card-{name}.png"
    img.save(path)
    return path


def banner(name: str, text: str, ink=GOLD, size: int = 78) -> Path:
    """Le mot dans une pastille, au croisement des quatre cases."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    font = ImageFont.truetype(LILITA, size)
    d = ImageDraw.Draw(img)
    tw = d.textlength(text, font=font)
    bw, bh = tw + 90, size + 54
    x0, y0 = (W - bw) / 2, (H - bh) / 2
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x0, y0 + 10, x0 + bw, y0 + bh + 10), 40, fill=(0, 0, 0, 150))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((x0, y0, x0 + bw, y0 + bh), 40, fill=(18, 14, 10, 225), outline=(*ink, 255), width=6)
    d.text(((W - tw) / 2, y0 + 22), text, font=font, fill=(*ink, 255), stroke_width=4, stroke_fill=(30, 18, 8, 255))
    path = WORK / f"banner-{name}.png"
    img.save(path)
    return path


def chip(i: int, p: dict) -> Path:
    """« 1 · SHIRO » dans le coin de sa case."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    font = ImageFont.truetype(LILITA, 40)
    d = ImageDraw.Draw(img)
    text = f"P{i + 1} · {p['name'].upper()}"
    tw = d.textlength(text, font=font)
    x, y = SLOTS[i]
    bx, by = x + CW - tw - 54, y + CH - 70
    d.rounded_rectangle((bx, by, bx + tw + 36, by + 56), 18, fill=(18, 14, 10, 210), outline=(*GOLD, 255), width=3)
    d.text((bx + 18, by + 6), text, font=font, fill=(*CREAM, 255))
    path = WORK / f"chip-{p['tag']}.png"
    img.save(path)
    return path


def backdrop() -> Path:
    img = Image.new("RGB", (W, H), (10, 26, 40))
    d = ImageDraw.Draw(img)
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=(int(10 + 8 * k), int(30 + 30 * k), int(48 + 40 * k)))
    path = WORK / "backdrop.png"
    img.save(path)
    return path


# ── Les segments ─────────────────────────────────────────────────────────────

_n = 0


def _seg_path() -> Path:
    global _n
    _n += 1
    return WORK / f"seg-{_n:02d}.mp4"


def still(path: Path, seconds: float) -> Path:
    out = _seg_path()
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-loop", "1", "-t", f"{seconds}", "-i", backdrop(),
         "-loop", "1", "-t", f"{seconds}", "-i", path,
         "-filter_complex", f"[1:v]format=rgba,fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st={seconds - 0.3}:d=0.3:alpha=1[c];"
         f"[0:v][c]overlay=0:0,fps={FPS},format=yuv420p",
         "-r", FPS, "-c:v", "libx264", "-crf", "17", out])
    return out


def grid(g0: float, g1: float, speed: float = 1.0, pop: bool = False,
         overlays: list[tuple[Path, float, float]] = ()) -> Path:
    """La grille de [g0, g1] (heure du film), a `speed`. `pop` : une fenetre
    qui s'ouvre dans l'intervalle glisse et s'allume. `overlays` : (png, de, a)
    en heure du film."""
    dur = g1 - g0
    out = _seg_path()
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-loop", "1", "-t", f"{dur}", "-i", backdrop()]
    chain = ["[0:v]fps=30,setsar=1[bg]"]
    last = "bg"
    k = 1
    for i, (src, off) in enumerate(SRC):
        if off >= g1:
            continue
        ss = max(0.0, g0 - off)
        delay = max(0.0, off - g0)
        cmd += ["-ss", f"{ss}", "-t", f"{dur - delay}", "-i", src]
        x, y = SLOTS[i]
        a = f"[{k}:v]scale={CW}:{CH}:flags=lanczos,setpts=PTS-STARTPTS+{delay}/TB,format=rgba"
        if pop and delay > 0:
            a += f",fade=t=in:st={delay}:d=0.35:alpha=1"
            ypos = f"{y}+40*max(0\\,1-(t-{delay})/0.35)"
        else:
            ypos = f"{y}"
        chain.append(f"{a}[p{k}]")
        chain.append(f"[{last}][p{k}]overlay=x={x}:y='{ypos}':eof_action=pass:enable='gte(t,{delay})'[g{k}]")
        last = f"g{k}"
        k += 1
    for path, a, b in overlays:
        a, b = max(0.0, a - g0), min(dur, b - g0)
        if b <= a:
            continue
        cmd += ["-loop", "1", "-t", f"{dur}", "-i", path]
        chain.append(f"[{k}:v]format=rgba,fade=t=in:st={a}:d=0.2:alpha=1,fade=t=out:st={max(a, b - 0.25)}:d=0.25:alpha=1[o{k}]")
        chain.append(f"[{last}][o{k}]overlay=0:0:enable='between(t,{a},{b})'[g{k}]")
        last = f"g{k}"
        k += 1
    chain.append(f"[{last}]trim=0:{dur},setpts=(PTS-STARTPTS)/{speed},fps={FPS},format=yuv420p[v]")
    cmd += ["-filter_complex", ";".join(chain), "-map", "[v]", "-r", FPS, "-c:v", "libx264", "-crf", "17",
            "-preset", "fast", out]
    run(cmd)
    return out


# ── Les feuilles : les fenetres arrivent en 3D ───────────────────────────────

import math
import numpy as np

SHEET_S = 1.35    # la duree du vol d'une feuille, en secondes du film monte
FOCAL = 1600.0    # la camera : plus court = perspective plus forte


def _ease_out_cubic(x: float) -> float:
    return 1 - (1 - x) ** 3


def _ease_out_back(x: float, k: float = 1.4) -> float:
    return 1 + (k + 1) * (x - 1) ** 3 + k * (x - 1) ** 2


def _spring(x: float) -> float:
    """Un vacillement amorti : 1 au depart, 0 a l'arrivee, deux rebonds."""
    return math.exp(-5.0 * x) * math.cos(9.0 * x)


def _bezier(p0, p1, p2, t: float):
    u = 1 - t
    return tuple(u * u * a + 2 * u * t * b + t * t * c for a, b, c in zip(p0, p1, p2))


def _coeffs(dst: list[tuple[float, float]], src: list[tuple[float, float]]) -> list[float]:
    """Les 8 coefficients PIL qui envoient un point de `dst` (sortie) sur `src`."""
    a, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        b += [u, v]
    return list(np.linalg.solve(np.array(a, float), np.array(b, float)))


STRIPS = 32       # les bandes de la feuille : assez pour qu'elle se courbe sans facettes


def _sheet_frame(i: int, x: float):
    """Ou est la feuille `i` a l'avancee `x`, et comment elle est tournee."""
    sx, sy = SLOTS[i]
    target = (sx + CW / 2 - W / 2, sy + CH / 2 - H / 2, 0.0)
    side = -1 if i % 2 == 0 else 1
    # L'ARC : elle entre par le haut, du cote de sa case, tres pres de la
    # camera ; le point de controle la fait plonger puis glisser en place.
    start = (side * 220.0, -240.0, -720.0)
    ctrl = (target[0] + side * 520.0, target[1] - 360.0, -300.0)
    # Depart doux, arrivee amortie : la courbe se lit en entier.
    glide = _ease_out_cubic(x) * 0.35 + (0.5 - 0.5 * math.cos(math.pi * x)) * 0.65
    pos = _bezier(start, ctrl, target, glide)
    tilt = math.radians(78.0) * (1 - _ease_out_back(min(1.0, x * 1.08), 1.25))   # couchee → a plat
    roll = math.radians(-side * 16.0) * _spring(x)                             # le vacillement
    yaw = math.radians(side * 22.0) * (1 - _ease_out_cubic(x))
    return pos, tilt, yaw, roll


def _bend(x: float) -> tuple[float, float, float]:
    """LE PAPIER : la courbure totale (rad) d'un bord a l'autre — un C franc
    au depart, qui se relache avec un contre-coup amorti — et l'ondulation
    qui parcourt la feuille pendant le vol (amplitude, phase)."""
    # Roulee pendant tout le vol, deroulee peu a peu, un contre-coup juste
    # avant de se poser — et 0 pile a l'atterrissage.
    curl = 2.4 * (1 - x) ** 1.4
    if x > 0.7:
        curl -= 0.35 * math.sin(math.pi * (x - 0.7) / 0.3)
    wave = 0.32 * (1 - x) ** 2
    phase = 11.0 * x
    return curl, wave, phase


def sheet_pose(i: int, x: float) -> list[tuple[tuple[float, float], tuple[float, float], float]] | None:
    """La feuille `i` a l'avancee `x` (0 → 1), courbee comme du papier DANS
    SA LARGEUR (le profil en X/Z : elle s'enroule d'un bord a l'autre) :
    STRIPS + 1 colonnes (point du haut, point du bas, angle local) a l'ecran,
    de gauche a droite. None : pas encore dans le champ."""
    pos, tilt, yaw, roll = _sheet_frame(i, x)
    curl, wave, phase = _bend(x)
    # Le profil (x, z) par la longueur d'arc, le milieu fixe : l'angle de
    # chaque bande, puis on integre vers les deux bords.
    n = STRIPS
    ds = CW / n
    angle = [curl * ((k + 0.5) / n - 0.5) + wave * math.sin(2 * math.pi * (k + 0.5) / n * 1.5 - phase)
             for k in range(n)]
    xs, zs = [0.0] * (n + 1), [0.0] * (n + 1)
    mid = n // 2
    for k in range(mid, n):
        xs[k + 1] = xs[k] + ds * math.cos(angle[k])
        zs[k + 1] = zs[k] + ds * math.sin(angle[k])
    for k in range(mid - 1, -1, -1):
        xs[k] = xs[k + 1] - ds * math.cos(angle[k])
        zs[k] = zs[k + 1] - ds * math.sin(angle[k])
    cols = []
    for k in range(n + 1):
        pts = []
        for cy in (-CH / 2, CH / 2):
            cx, cz = xs[k], zs[k]
            # rotations : X (la feuille couchee), Y (de biais), Z (le vacillement)
            y1, z1 = cy * math.cos(tilt) - cz * math.sin(tilt), cy * math.sin(tilt) + cz * math.cos(tilt)
            x2, z2 = cx * math.cos(yaw) + z1 * math.sin(yaw), -cx * math.sin(yaw) + z1 * math.cos(yaw)
            x3, y3 = x2 * math.cos(roll) - y1 * math.sin(roll), x2 * math.sin(roll) + y1 * math.cos(roll)
            X, Y, Z = x3 + pos[0], y3 + pos[1], z2 + pos[2]
            depth = FOCAL + Z
            if depth < 60:
                return None
            pts.append((W / 2 + FOCAL * X / depth, H / 2 + FOCAL * Y / depth))
        cols.append((pts[0], pts[1], angle[min(k, n - 1)] + yaw))
    return cols


def sheet_outline(cols) -> list[tuple[float, float]]:
    return [c[0] for c in cols] + [c[1] for c in reversed(cols)]


def draw_sheet(frame: Image.Image, img: Image.Image, cols) -> None:
    """Pose la feuille courbee bande par bande (bandes verticales) ; une bande
    qui se detourne de la camera s'assombrit un peu (le papier prend la lumiere)."""
    n = len(cols) - 1
    src = img.convert("RGBA")
    for k in range(n):
        (t0, b0, a0), (t1, b1, _) = cols[k], cols[k + 1]
        x0 = round(k * CW / n)
        x1 = round((k + 1) * CW / n)
        wd = max(1, x1 - x0)
        # Une colonne de recouvrement : pas de fente entre deux bandes.
        ext = 1.5 / wd
        t1e = (t1[0] + (t1[0] - t0[0]) * ext, t1[1] + (t1[1] - t0[1]) * ext)
        b1e = (b1[0] + (b1[0] - b0[0]) * ext, b1[1] + (b1[1] - b0[1]) * ext)
        quad = [t0, t1e, b1e, b0]
        bx0 = max(0, int(math.floor(min(p[0] for p in quad))))
        by0 = max(0, int(math.floor(min(p[1] for p in quad))))
        bx1 = min(W, int(math.ceil(max(p[0] for p in quad))) + 1)
        by1 = min(H, int(math.ceil(max(p[1] for p in quad))) + 1)
        if bx1 - bx0 < 1 or by1 - by0 < 2:
            continue
        crop = src.crop((x0, 0, min(CW, x1 + 1), CH))
        shade = 1.0 - 0.32 * abs(math.sin(a0))
        if shade < 0.995:
            alpha = crop.getchannel("A")
            crop = Image.alpha_composite(crop, Image.new("RGBA", crop.size, (0, 0, 0, int(255 * (1 - shade)))))
            crop.putalpha(alpha)
        local = [(px - bx0, py - by0) for px, py in quad]
        part = crop.transform((bx1 - bx0, by1 - by0), Image.PERSPECTIVE,
                              _coeffs(local, [(0, 0), (crop.width, 0), (crop.width, CH), (0, CH)]),
                              Image.BILINEAR, fillcolor=(0, 0, 0, 0))
        frame.alpha_composite(part, (bx0, by0))


class _Reader:
    """Une fenetre lue image par image (960x540), a partir de `start` s."""

    def __init__(self, src: Path, start: float):
        self.p = subprocess.Popen(
            ["ffmpeg", "-nostdin", "-v", "error", "-ss", f"{start}", "-i", str(src),
             "-vf", f"scale={CW}:{CH}:flags=lanczos,fps={FPS}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            stdout=subprocess.PIPE)
        self.start = start
        self.n = -1
        self.img: Image.Image | None = None

    def at(self, t: float) -> Image.Image | None:
        want = int(max(0.0, t - self.start) * FPS)
        while self.n < want:
            raw = self.p.stdout.read(CW * CH * 3)
            if len(raw) < CW * CH * 3:
                break
            self.img = Image.frombytes("RGB", (CW, CH), raw)
            self.n += 1
        return self.img

    def close(self) -> None:
        self.p.kill()


def sheets_intro(g0: float, g1: float, speed: float, overlays: list[tuple[Path, float, float]]) -> Path:
    """La grille de [g0, g1] a `speed`, les fenetres arrivant en feuilles 3D,
    rendue image par image (PIL), avec les surimpressions (png, de, a)."""
    out = _seg_path()
    dur_out = (g1 - g0) / speed
    n_frames = int(round(dur_out * FPS))
    bg = Image.open(backdrop()).convert("RGBA")
    over = [(Image.open(pth).convert("RGBA"), a, b) for pth, a, b in overlays]
    readers = [_Reader(src, max(0.0, g0 - off)) for src, off in SRC]
    enc = subprocess.Popen(
        ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-crf", "17", "-preset", "fast", "-pix_fmt", "yuv420p", str(out)],
        stdin=subprocess.PIPE)
    # L'instant ou chaque feuille se pose, en secondes du segment.
    lands = [(off - g0) / speed + SHEET_S for _, off in SRC if g0 <= off < g1]
    still_of: dict[int, Image.Image] = {}
    for k in range(n_frames):
        t_out = k / FPS
        g = g0 + t_out * speed
        frame = bg.copy()
        flying = []
        for i, ((src, off), rd) in enumerate(zip(SRC, readers)):
            if g < off:
                continue
            img = rd.at(g - off)
            if img is None:
                continue
            x = (g - off) / speed / SHEET_S          # l'avancee du vol, en temps du film monte
            if x >= 1.0:
                frame.paste(img, SLOTS[i])
                continue
            # En vol, la feuille garde sa premiere image (l'ecran de demarrage) :
            # la fenetre passe par le rideau noir du jeu pendant ce temps-la.
            if i not in still_of:
                # La premiere image CLAIRE : la toute premiere est noire.
                luma = sum(img.resize((16, 9)).convert("L").getdata()) / 144
                if luma < 40:
                    continue
                still_of[i] = img.copy()
            flying.append((i, still_of[i], x))
        # Les feuilles en vol par-dessus les posees, la plus avancee dessous.
        for i, img, x in sorted(flying, key=lambda f: -f[2]):
            rows = sheet_pose(i, x)
            if rows is None:
                continue
            # L'ombre : le contour de la feuille, decale et flou.
            sh = Image.new("L", (W, H), 0)
            ImageDraw.Draw(sh).polygon([(px + 18, py + 28) for px, py in sheet_outline(rows)],
                                       fill=int(150 * min(1.0, x * 1.6)))
            sh = sh.resize((W // 8, H // 8)).filter(ImageFilter.GaussianBlur(3)).resize((W, H))
            frame.paste((0, 0, 0, 255), (0, 0), sh)
            draw_sheet(frame, img, rows)
        for ov, a, b in over:
            if a <= g <= b:
                fade = min(1.0, (g - a) / 0.2, (b - g) / 0.25)
                if fade >= 0.999:
                    frame.alpha_composite(ov)
                else:
                    o = ov.copy()
                    o.putalpha(o.getchannel("A").point(lambda v: int(v * fade)))
                    frame.alpha_composite(o)
        enc.stdin.write(frame.convert("RGB").tobytes())
    enc.stdin.close()
    enc.wait()
    for rd in readers:
        rd.close()
    global SHEET_LANDS
    SHEET_LANDS = lands
    return out


SHEET_LANDS: list[float] = []


def full(i: int, g0: float, g1: float, word: Path | None = None, zoom: bool = True) -> Path:
    """La fenetre `i` en plein ecran sur [g0, g1], une lente poussee, le mot."""
    src, off = SRC[i]
    dur = g1 - g0
    out = _seg_path()
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{max(0.0, g0 - off)}", "-t", f"{dur}", "-i", src]
    # LA POUSSEE : un `scale` qui grandit image par image, recadre au centre.
    # (`zoompan` sur une video sortait des segments de 29 min.)
    z = (f"scale=w='trunc(iw*(1+0.10*t/{dur})/2)*2':h=-2:eval=frame:flags=bicubic,"
         f"crop={W}:{H}:(iw-{W})/2:(ih-{H})/2") if zoom else ""
    chain = [f"[0:v]scale={W}:{H}:flags=lanczos{',' + z if z else ''},setsar=1[v0]"]
    last = "v0"
    k = 1
    if word is not None:
        cmd += ["-loop", "1", "-t", f"{dur}", "-i", word]
        chain.append(f"[{k}:v]format=rgba,fade=t=in:st=0.15:d=0.15:alpha=1,fade=t=out:st={dur - 0.3}:d=0.3:alpha=1[w]")
        chain.append(f"[{last}][w]overlay=0:0[v1]")
        last = "v1"
        k += 1
    cmd += ["-loop", "1", "-t", f"{dur}", "-i", watermark("corner")]
    chain.append(f"[{last}][{k}:v]overlay=0:0[v2]")
    last = "v2"
    chain.append(f"[{last}]fps={FPS},format=yuv420p[v]")
    cmd += ["-filter_complex", ";".join(chain), "-map", "[v]", "-r", FPS, "-t", f"{dur}", "-c:v", "libx264",
            "-crf", "17", "-preset", "fast", out]
    run(cmd)
    return out


def watermark(where: str) -> Path:
    """Le petit logo : `corner` (plein ecran, haut gauche, sur l'eau) ou
    `center` (la grille, au croisement des quatre cases)."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    size = 150 if where == "corner" else 170
    logo = Image.open(LOGO).convert("RGBA").resize((size, size), Image.LANCZOS)
    at = (28, 24) if where == "corner" else ((W - size) // 2, (H - size) // 2)
    img.alpha_composite(logo, at)
    path = WORK / f"logo-{where}.png"
    img.save(path)
    return path


def flash_word(name: str, text: str, ink) -> Path:
    """Le mot du coup, gros, sous la barre du jeu : une ombre floue derriere
    et un contour epais — il doit se lire sur la mer comme sur l'herbe."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    font = ImageFont.truetype(LILITA, 180)
    d = ImageDraw.Draw(img)
    tw = d.textlength(text, font=font)
    x, y = (W - tw) / 2, 170
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text((x, y + 12), text, font=font, fill=(0, 0, 0, 220), stroke_width=16, stroke_fill=(0, 0, 0, 220))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(16)))
    d = ImageDraw.Draw(img)
    d.text((x, y), text, font=font, fill=(*ink, 255), stroke_width=13, stroke_fill=(24, 12, 6, 255))
    path = WORK / f"word-{name}.png"
    img.save(path)
    return path


# ── Le film ──────────────────────────────────────────────────────────────────

def main() -> None:
    segs: list[tuple[Path, float]] = []  # (fichier, duree)
    sfx: list[tuple[str, float]] = []    # (son, instant dans le film monte)
    clock = 0.0

    def add(path: Path, dur: float) -> None:
        nonlocal clock
        segs.append((path, dur))
        clock += dur

    # 1. Le titre.
    add(still(card("title", "RABBIT ROYALE", "4 players. 1 island. Zap, ink, push them in the sea."), 2.4), 2.4)

    # 2. Les fenetres s'ouvrent, l'ile se remplit.
    counters: list[tuple[Path, float, float]] = []
    joins = sorted(JOIN)
    for n, g in enumerate(joins, start=1):
        nxt = joins[n] if n < len(joins) else g + 3.2
        text = f"ISLAND {n}/4" if n < 4 else "4/4 — ISLAND FULL!"
        counters.append((banner(f"count{n}", text, GOLD if n < 4 else RED), g, nxt))
    g0, g1 = 0.0, FULL + 3.2
    # Le temps mort avant la premiere entree passe vite ; les entrees, a 1,5x.
    spawn_speed = 1.5
    # L'etiquette arrive avec sa feuille, quand elle se pose.
    chips = [(chip(i, p), SRC[i][1] + SHEET_S * spawn_speed, FULL + 3.2) for i, p in enumerate(PLAYERS)]
    start = clock
    add(sheets_intro(g0, g1, spawn_speed, chips + counters), (g1 - g0) / spawn_speed)
    for t in SHEET_LANDS:
        sfx.append(("hop.mp3", start + t - 0.05))
    for g in joins:
        sfx.append(("coin.mp3", start + (g - g0) / spawn_speed))
    sfx.append(("chime.mp3", start + (FULL - g0) / spawn_speed))

    # 3. La melee : la grille en accelere, coupee par les coups.
    hits = highlights()
    fight_end = (ERUPT - 1.5) if ERUPT else min(END, FULL + 60)
    g = FULL + 3.2
    # Entre deux coups, la grille a 4x, et jamais plus de 3,5 s a l'ecran :
    # le reste saute (coupe franche) — un film pour les reseaux, pas un replay.
    fast, most = 4.0, 2.5
    for hg, who, text, ink in hits:
        if hg - 1.4 > g + 1.0:
            seg_to = hg - 1.4
            g = max(g, seg_to - most * fast)
            add(grid(g, seg_to, fast, overlays=[(watermark("center"), g, seg_to)]), (seg_to - g) / fast)
        word = flash_word(f"h{len(segs)}", text, ink)
        sound = {"ZAPPED!": "explosion.mp3", "INTO THE SEA!": "die.mp3"}.get(text, "match.mp3")
        sfx.append((sound, clock + 1.3))
        add(full(who, hg - 1.4, hg + 2.0, word), 3.4)
        g = hg + 2.0
    if fight_end > g + 1.0:
        g0 = max(g, fight_end - most * fast)
        add(grid(g0, fight_end, fast, overlays=[(watermark("center"), g0, fight_end)]), (fight_end - g0) / fast)
        g = fight_end

    # 4. L'eruption, en plein ecran, puis le niveau gagne sur la grille.
    if ERUPT:
        who = next((TAG_INDEX[e["tag"]] for e in EV if e["ev"] == "eruption"), 0)
        e0, e1 = ERUPT - 1.0, min(END, (OVER or ERUPT + 4.0) + 1.5)
        sfx.append(("explosion.mp3", clock + 1.0))
        add(full(who, e0, e1, flash_word("erupt", "ERUPTION!", RED)), e1 - e0)
        if END > e1 + 0.5:
            lvl = int(FILM.get("level", 7)) + 1
            add(grid(e1, END, 1.0, overlays=[(banner("lvl", f"EVERYONE LEVEL {lvl}!", GOLD), e1, END)]), END - e1)
            sfx.append(("chime.mp3", clock - (END - e1) + 0.3))

    # 5. La fin.
    add(still(card("end", "RABBIT ROYALE", "Dig. Raid. Push them in the sea.  ·  rabbit.rip"), 3.0), 3.0)
    sfx.append(("chime_quick.mp3", clock - 2.8))

    # L'assemblage, puis le son : la musique en boucle, les bruitages poses.
    lst = WORK / "segs.txt"
    lst.write_text("".join(f"file '{p}'\n" for p, _ in segs))
    silent = WORK / "silent.mp4"
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", silent])
    total = clock
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", silent, "-stream_loop", "-1", "-i", MUSIC]
    chain = [f"[1:a]atrim=0:{total},volume=-4dB,afade=t=out:st={total - 1.5}:d=1.5,aresample=48000[m]"]
    mix = ["[m]"]
    for k, (name, at) in enumerate(sfx, start=2):
        cmd += ["-i", SFX / name]
        ms = int(max(0.0, at) * 1000)
        chain.append(f"[{k}:a]adelay={ms}|{ms},volume=-2dB,aresample=48000[s{k}]")
        mix.append(f"[s{k}]")
    chain.append(f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0:duration=first,alimiter=limit=0.95[a]")
    final = WORK / "rabbit-royale-x4.mp4"
    cmd += ["-filter_complex", ";".join(chain), "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac",
            "-b:a", "192k", "-t", f"{total}", final]
    run(cmd)
    print(f"{final}  ({total:.1f} s, {len(hits)} coups en plein ecran)")



def preview() -> None:
    """`--preview` : les poses du vol des feuilles 0 et 1, sur une planche."""
    rd = _Reader(SRC[0][0], 4.0)
    img = rd.at(4.0)
    rd.close()
    shots = []
    for x in (0.0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0):
        frame = Image.open(backdrop()).convert("RGBA")
        for i in (2, 3):
            rows = sheet_pose(i, x)
            if rows is not None:
                draw_sheet(frame, img, rows)
        shots.append(frame.convert("RGB").resize((640, 360)))
    sheet = Image.new("RGB", (640 * 4, 360 * 2), (0, 0, 0))
    for k, im in enumerate(shots):
        sheet.paste(im, ((k % 4) * 640, (k // 4) * 360))
    sheet.save(WORK / "sheet-preview.jpg", quality=88)
    print(WORK / "sheet-preview.jpg")


preview() if PREVIEW else main()
