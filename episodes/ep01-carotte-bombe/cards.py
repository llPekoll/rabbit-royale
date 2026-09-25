"""Images du montage de l'ep01 : l'iris en crane de lapin et la carte de fin.

    python3 cards.py iris <dossier> <images>      # masques, blanc = on voit
    python3 cards.py end  <dossier> <secondes>    # la carte de fin, image par image

Lance depuis la racine du repo (montage.sh le fait).
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W = 960
FPS = 30
EP = Path("episodes/ep01-carotte-bombe")
REFS = EP / "shots/refs"
AVENIR = "/System/Library/Fonts/Avenir Next.ttc"
HEAVY, MEDIUM = 8, 5


def avenir(size: int, face: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(AVENIR, size, index=face)


def ease_out(t: float) -> float:
    return 1 - (1 - t) ** 3


# ------------------------------------------------------------------ l'iris

def rabbit_silhouette(holes: bool = True) -> Image.Image:
    """Le crane de lapin de Rabbit Royale (l'icone RR-Skull), en masque."""
    skull = Image.open("public/assets/bunnies/RR-Skull.png").convert("RGBA")
    mask = Image.new("L", skull.size, 0)
    px, out = skull.load(), mask.load()
    for y in range(skull.height):
        for x in range(skull.width):
            r, g, b, a = px[x, y]
            # L'os seulement : le contour, les yeux et le nez sombres sont des
            # trous — c'est eux qui font lire un crane et pas une tache.
            if a > 128 and (not holes or (r + g + b) / 3 > 110):
                out[x, y] = 255
    return mask.crop(mask.getbbox())


# Ou est MON lapin a la fin du dernier plan (la noyade), en pixels du carre 960.
IRIS_AT = (440, 482)


def iris(folder: Path, frames: int) -> None:
    """Le crane se referme sur mon lapin : du plein cadre a rien."""
    rabbit = rabbit_silhouette()
    # Tant qu'il deborde du cadre, le crane est plein : ses yeux, geants,
    # coupaient l'image en bandes noires des la premiere image.
    solid = rabbit_silhouette(holes=False).resize(rabbit.size)
    # Assez grand au depart pour que le corps couvre tout le cadre.
    start = 3.2 * W / rabbit.width
    for i in range(frames):
        t = i / max(1, frames - 1)
        k = start * (1 - t) ** 2.4
        frame = Image.new("L", (W, W), 0)
        if k > 0.05:
            shape = solid if rabbit.height * k > 1.3 * W else rabbit
            r = shape.resize((max(1, round(rabbit.width * k)), max(1, round(rabbit.height * k))), Image.NEAREST)
            # Le milieu du crane (sous les oreilles) sur lui.
            frame.paste(r, (IRIS_AT[0] - r.width // 2, IRIS_AT[1] - round(r.height * 0.6)))
        frame.save(folder / f"iris{i:03d}.png")


# ------------------------------------------------------------ la carte de fin

def heart(size: int) -> Image.Image:
    """Un coeur lisse. La forme est un MASQUE pose sur un aplat rouge : reduire
    une image RGBA melait le rouge au noir transparent du fond, d'ou un liseré
    sombre autour."""
    s = 8 * size
    pts = []
    for i in range(360):
        a = math.radians(i)
        x = 16 * math.sin(a) ** 3
        y = 13 * math.cos(a) - 5 * math.cos(2 * a) - 2 * math.cos(3 * a) - math.cos(4 * a)
        pts.append((s / 2 + x * s / 34, s * 0.44 - y * s / 34))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    out = Image.new("RGBA", (size, size), (255, 64, 88, 255))
    out.putalpha(mask.resize((size, size), Image.LANCZOS))
    return out


def fit_h(img: Image.Image, h: int) -> Image.Image:
    return img.resize((round(img.width * h / img.height), h), Image.LANCZOS)


def with_alpha(img: Image.Image, a: float) -> Image.Image:
    if a >= 1:
        return img
    out = img.copy()
    out.putalpha(out.getchannel("A").point(lambda v: round(v * a)))
    return out


def end(folder: Path, seconds: float) -> None:
    logo = Image.open("godot/assets/ui/rr-logo-1x.webp").convert("RGBA")
    logo = logo.resize((logo.width * 2, logo.height * 2), Image.NEAREST)
    seeker = fit_h(Image.open(REFS / "solana-logo.png").convert("RGBA"), 76)  # le mot « Seeker »
    ios = fit_h(Image.open(REFS / "indies-on-solana.png").convert("RGBA"), 62)
    phone = Image.open(REFS / "seeker-photo.png").convert("RGBA")
    phone = phone.resize((1180, round(phone.height * 1180 / phone.width)), Image.LANCZOS)
    love = heart(42)

    # Le bas assombri : le texte « made with » passe sur le corps du telephone.
    shade = Image.new("RGBA", (W, 240))
    for y in range(240):
        ImageDraw.Draw(shade).line([(0, y), (W, y)], fill=(0, 0, 0, round(235 * min(1, y / 150))))

    n = round(seconds * FPS)
    for i in range(n):
        t = i / FPS
        f = Image.new("RGBA", (W, W), (0, 0, 0, 255))
        # LE TELEPHONE monte doucement pendant toute la carte.
        rise = ease_out(min(1, t / seconds))
        f.alpha_composite(with_alpha(phone, min(1, t / 0.5)), (-150, round(640 - 190 * rise)))
        f.alpha_composite(shade, (0, W - 240))
        a = min(1, t / 0.35)
        f.alpha_composite(with_alpha(logo, a), ((W - logo.width) // 2, 70))
        text = Image.new("RGBA", (W, W))
        d = ImageDraw.Draw(text)
        white = (255, 255, 255, round(255 * a))
        soon = avenir(40, HEAVY)
        tw = d.textlength("SOON ON", font=soon)
        d.text(((W - tw) / 2, 312), "SOON ON", font=soon, fill=white)
        f.alpha_composite(with_alpha(seeker, a), ((W - seeker.width) // 2, 368))
        by = avenir(24, MEDIUM)
        tw = d.textlength("by Solana Mobile", font=by)
        d.text(((W - tw) / 2, 456), "by Solana Mobile", font=by, fill=(200, 200, 200, round(255 * a)))
        # EN BAS : made with <coeur> and Indies on Solana.
        b = min(1, max(0, (t - 0.4) / 0.4))
        # LE CTA : du texte seul, juste au-dessus de « made with ».
        c = min(1, max(0, (t - 0.7) / 0.3))
        cta = avenir(38, HEAVY)
        label = "Follow @RabbitRoyaleX"
        cw = d.textlength(label, font=cta)
        d.text(((W - cw) / 2, 790), label, font=cta, fill=(255, 255, 255, round(255 * c)))
        made = avenir(34, MEDIUM)
        mw = d.textlength("Made with", font=made)
        aw = d.textlength("and", font=made)
        gap = 14
        total = mw + gap + love.width + gap + aw + gap + ios.width
        x = (W - total) / 2
        y = 866
        d.text((x, y + 10), "Made with", font=made, fill=(255, 255, 255, round(255 * b)))
        x += mw + gap
        f.alpha_composite(with_alpha(love, b), (round(x), y + 12))
        x += love.width + gap
        d.text((x, y + 10), "and", font=made, fill=(255, 255, 255, round(255 * b)))
        x += aw + gap
        f.alpha_composite(with_alpha(ios, b), (round(x), y))
        f.alpha_composite(text)
        f.convert("RGB").save(folder / f"end{i:03d}.png")


if __name__ == "__main__":
    what, folder, amount = sys.argv[1], Path(sys.argv[2]), sys.argv[3]
    folder.mkdir(parents=True, exist_ok=True)
    if what == "iris":
        iris(folder, int(amount))
    else:
        end(folder, float(amount))
