"""LE PREVIEW X — ~70 s, peu de plans, une seule musique (le user, 2026-10-01 :
« ya trop de cut », « fait attention au cut c'est hyper desagreable avec la
music »).

    RAW=marketing/out/x/raw NOMUSIC=1 marketing/seeker.sh 85   # le jeu, bruitages seuls
    python3 marketing/x/preview.py

La musique du jeu sautait a chaque coupe : la partie est refilmee le bus Music
muet, et UNE musique court sous tout le film, de la premiere image a la carte
de fin. Les plans se fondent (image et bruitages), jamais de coupe seche.
Reprend les legendes et la carte de fin (celle de l'ep01) de la video Seeker.
Les raids (le user : « qd tu raid qq et qd on te raid ») gardent leur son ; la
fanfare du raid gagne fait baisser la musique le temps qu'elle joue.
Ecrit marketing/out/x/rabbit-royale-x.mp4.
"""
from __future__ import annotations
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "seeker"))
import cut  # noqa: E402

ROOT = cut.ROOT
OUT = ROOT / "marketing/out/x"
CLIPS = ROOT / "marketing/out/seeker/clips"
# Pour X : la largeur du Seeker (20:9) ramenee a 1920.
XW, XH = 1920, 864
FADE = 0.4      # le fondu entre deux plans
END_S = 5.0
MUSIC_DB = -15.0
DUCK = 0.15     # la musique sous la fanfare du raid (~ -16 dB)
FANFARE_AT = 12.3  # dans raid-attack.mp4 : le pas qui atteint le potager
# La fanfare elle-meme : remontee de +14 dB avec les pas, elle passait 17 dB
# au-dessus de tout le reste.
FANFARE_GAIN = 0.25  # -12 dB


def dur(path: Path) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                 "-of", "csv=p=0", str(path)], capture_output=True, text=True).stdout)


def main() -> None:
    cut.RAW = OUT / "raw"
    cut.WORK = OUT / "work"
    cut.WORK.mkdir(parents=True, exist_ok=True)
    game = cut.RAW / "game.mp4"
    t = cut.marks()
    first = lambda k: t[k][0]

    segs: list[Path] = []
    # 1. UNE ILE EN LIGNE, d'un seul plan : creuser, marquer, sauter.
    a = first("island") + 1.3
    m1 = t["mark"][1] - a
    blast = first("blast") - a
    b = first("blast") + 4.2
    segs.append(cut.segment(game, a, b, [
        (cut.caption("dig", "DIG", "Each number counts the bombs around it. Find the chests."), 0.3, m1),
        (cut.caption("mark", "MARK A BOMB", "Right guess: energy. Wrong guess: it costs you.", cut.RED), m1, blast - 0.6),
        (cut.caption("boom", "BOOM", "Step on a bomb and you're blown back.", cut.RED), blast - 0.3, b - a),
    ], gain_db=4.0))
    # 2. LE DERNIER COFFRE, L'ILE COULE.
    done = first("chests-done")
    segs.append(cut.segment(game, done - 3.5, done + 2.4, [
        (cut.caption("chests", "LAST CHEST", "Take it and the island sinks. Carrots go home."), 0.5, 5.9),
    ], gain_db=4.0))
    # 4. LE PVP : deux plans du banc (son du Movie Maker tres bas : +14 dB).
    # 3. LE RAID, PUIS LA DEFENSE : un plan chacun, de bout en bout.
    raid_at = len(segs)
    segs.append(cut.segment(CLIPS / "raid-attack.mp4", 0.3, 17.6, [
        (cut.caption("raid", "RAID", "Walk a neighbour's burrow blind. Reach the garden.", corner=True), 0.6, 6.0),
        (cut.caption("steal", "TAKE THEIR CARROTS", "Mind their bombs on the way in.", corner=True), 6.2, 11.8),
    ], gain_db=14.0))
    segs.append(cut.segment(CLIPS / "raid-defend.mp4", 0.3, 14.6, [
        (cut.caption("defend", "DEFEND", "Someone's in your burrow. Bury bombs in their path.", cut.RED, corner=True, y=450), 0.8, 7.5),
        (cut.caption("strike", "STRIKE BACK", "Tap the raider: lightning.", corner=True, y=450), 7.7, 11.6),
    ], gain_db=14.0))
    segs.append(cut.segment(CLIPS / "pvp-lightning.mp4", 0.6, 6.6, [
        (cut.caption("lightning", "LIGHTNING", "From level 10 you share the island. Tap a rival: zapped."), 0.5, 6.0),
    ], gain_db=14.0))
    segs.append(cut.segment(CLIPS / "pvp-drown.mp4", 0.9, 7.4, [
        (cut.caption("push", "PUSH", "Shove them into the sea.", cut.SEA), 0.5, 6.5),
    ], gain_db=14.0))
    # 5. LA FIN DE L'EP01 : le Seeker qui monte.
    segs.append(cut.end_card(END_S))

    # Les fondus : image et bruitages ensemble ; le noir avant la carte.
    durs = [dur(p) for p in segs]
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-y"]
    for p in segs:
        cmd += ["-i", str(p)]
    cmd += ["-stream_loop", "-1", "-i", str(cut.MUSIC)]
    chain = [f"[{i}:v]scale={XW}:{XH}:flags=lanczos,fps={cut.FPS},format=yuv420p,setsar=1,settb=AVTB[v{i}]"
             for i in range(len(segs))]
    chain += [f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo[a{i}]" for i in range(len(segs))]
    starts = [0.0]
    v, a, at = "v0", "a0", durs[0]
    for i in range(1, len(segs)):
        kind = "fadeblack" if i == len(segs) - 1 else "fade"
        chain.append(f"[{v}][v{i}]xfade=transition={kind}:duration={FADE}:offset={at - FADE:.3f}[vx{i}]")
        chain.append(f"[{a}][a{i}]acrossfade=d={FADE}[ax{i}]")
        starts.append(at - FADE)
        v, a, at = f"vx{i}", f"ax{i}", at + durs[i] - FADE
    # La fanfare : du pas sur le potager a la fin du plan (+ le fondu).
    fa = starts[raid_at] + FANFARE_AT - 0.3
    fb = starts[raid_at] + durs[raid_at] + FADE
    duck = (f"volume='1-{1 - DUCK}*clip((t-{fa - 0.4:.3f})/0.4,0,1)*clip(({fb:.3f}-t)/0.8,0,1)':eval=frame,")
    # UNE musique, du debut a la fin ; elle s'efface sur la carte.
    m = len(segs)
    chain.append(f"[{m}:a]atrim=0:{at:.3f},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,"
                 f"volume={MUSIC_DB}dB,{duck}afade=t=in:d=0.6,afade=t=out:st={at - 2.5:.3f}:d=2.5[mus]")
    chain.append(f"[{a}]volume='1-{1 - FANFARE_GAIN}*clip((t-{fa - 0.2:.3f})/0.2,0,1)"
                 f"*clip(({fb:.3f}-t)/0.4,0,1)':eval=frame[sfx]")
    a = "sfx"
    chain.append(f"[{a}][mus]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[aout]")
    final = OUT / "rabbit-royale-x.mp4"
    cmd += ["-filter_complex", ";".join(chain), "-map", f"[{v}]", "-map", "[aout]", "-t", f"{at:.3f}",
            "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", str(cut.FPS),
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final)]
    cut.run(cmd)
    print(f"{final}  ({dur(final):.1f} s)")


if __name__ == "__main__":
    main()
