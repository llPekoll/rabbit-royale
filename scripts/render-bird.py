"""
Rend l'oiseau glTF en spritesheet pixel art, dans la perspective de l'ile.

Blender headless : les frames sont rejouables, versionnees, et ne demandent
pas une session graphique ouverte. Lance-le par scripts/render-bird.sh.

La camera est orthographique et calee sur la projection du jeu : les nuages
de src/game/isoworld/clouds.ts courent sur les axes [2, 1] et [2, -1], donc
une iso 2:1, donc une elevation de atan(1/2) = 26.57 degres. Un 30 degres
generique mettrait l'oiseau dans une autre perspective que le ciel qu'il
traverse.

Le rendu sort directement a la taille finale du sprite, filtre Box a zero :
c'est ce qui donne des pixels francs. Agrandir un grand rendu donnerait des
bords laves.

Sortie : public/assets/fx/bird.png et bird.json (format Aseprite, celui que
lisent deja les autres feuilles du jeu), un frameTag par angle.

## L'animation ne boucle pas, et c'est ce qui dicte la lecture

L'action du glTF dure 20 secondes (1001 keyframes) et ne se repete jamais :
en comparant chaque frame a la premiere, l'ecart oscille entre 65 et 120
pixels sans jamais revenir pres de zero. Ce n'est pas un cycle de battement,
c'est un vol libre ou l'oiseau change sans cesse de pose. Trois mesures ont
ete tentees pour y trouver une periode — creux de hauteur, autocorrelation,
comparaison de silhouettes — et toutes n'elisaient que le moins mauvais
decalage d'une courbe qui ne se repete pas.

La feuille preleve donc une TRANCHE continue, que le sprite joue en
PING-PONG. L'aller-retour supprime la question du raccord : la derniere pose
est un point de rebroussement, pas une couture vers la premiere.
"""

import json
import math
import os
import sys

import bpy
from mathutils import Vector

# ---------------------------------------------------------------- reglages

GLTF = os.path.expanduser("~/Downloads/bird_flying_animation/scene.gltf")
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "assets", "fx")
NAME = "bird"

#: Cote du sprite, en pixels. Un oiseau de ciel se lit de loin.
SIZE = 48
#: Le battement, en frames d'animation : un cycle complet mesure sur le
#: modele (hauteur 2.00 -> 4.22 -> 2.04), ailes en bas, en haut, en bas.
FLAP = (99, 108)
#: Le plane : la phase ou l'oiseau tient les ailes a plat. Mesuree sur le
#: modele, elle va de 126 a 183 et la pose y est RIGOUREUSEMENT IMMOBILE
#: (hauteur 2.000, delta nul) — inutile d'en rendre plus d'une image, on la
#: tient en la repetant a la lecture.
GLIDE_FRAME = 150
#: Combien de fois la pose de plane est tenue, en unites de frame de sprite.
#: C'est ce qui donne un oiseau qui plane PLUS qu'il ne bat des ailes : a 14,
#: le plane occupe les deux tiers du cycle.
GLIDE_HOLD = 14
#: Les quatre angles, en degres autour de l'axe vertical, avec leur nom de tag.
#: Le glTF pose l'oiseau face a la camera a 0 degre : c'est donc 90 qui donne
#: le profil, verifie sur le rendu (la vue de face ouvre et referme une grande
#: envergure, le profil garde une largeur stable). On flippe "side" a
#: l'execution pour le sens oppose.
ANGLES = [("side", 90.0), ("front34", 135.0), ("back34", 45.0), ("front", 0.0)]
#: Elevation iso du jeu : atan(1/2), la projection 2:1 des nuages.
ELEVATION = math.degrees(math.atan(0.5))
#: Part du cadre que l'oiseau occupe. Un peu d'air evite que les ailes
#: soient coupees en haut de battement.
FILL = 0.82
#: Duree d'une frame en ms, pour le JSON.
FRAME_MS = 80
#: La couleur de la silhouette, en lineaire (ce que Blender attend dans
#: `pixels`). Noir franc : a 48 px la texture ne se lit pas, et une
#: silhouette ressort sur un ciel clair comme sur un ciel sombre.
SILHOUETTE = (0.0, 0.0, 0.0)


# ------------------------------------------------------------------ scene


def reset():
    """Vide la scene de depart, y compris le cube par defaut."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def load_bird():
    """Importe le glTF et rend son armature + ses meshes."""
    bpy.ops.import_scene.gltf(filepath=GLTF)
    objects = list(bpy.context.scene.objects)
    meshes = [o for o in objects if o.type == "MESH"]
    if not meshes:
        sys.exit("aucun mesh dans le glTF")
    return objects, meshes


def sequence():
    """
    Les frames d'animation a rendre, dans l'ordre, et leur duree.

    Pas une tranche continue : l'action du glTF enchaine des battements puis
    tient une pose de plane, et prendre un morceau au hasard tombait en plein
    battement — d'ou l'oiseau qui moulinait sans jamais planer, et les poses
    qui semblaient se repeter sans rien apporter.

    On compose donc explicitement : un cycle de battement, puis la pose de
    plane TENUE. Le plane est immobile dans le modele (hauteur constante au
    millieme sur 57 frames), donc une seule image suffit : on la garde
    simplement affichee plus longtemps, ce qui ne coute rien en feuille.

    Retourne une liste de (frame d'animation, duree en ms).
    """
    flap = list(range(FLAP[0], FLAP[1] + 1))
    out = [(f, FRAME_MS) for f in flap]
    # La pose de plane, tenue : une seule frame dans la feuille, une longue
    # duree dans le JSON. Le jeu la garde donc a l'ecran sans qu'elle occupe
    # quatorze cases de la spritesheet.
    out.append((GLIDE_FRAME, FRAME_MS * GLIDE_HOLD))
    return out


def bounds(meshes):
    """
    Centre et rayon du modele mesures SUR TOUTE LA TRANCHE.

    Une seule pose ne suffit pas : les ailes s'ecartent au fil du battement,
    et cadrer sur la pose de repos laisse l'oiseau perdu au milieu d'un cadre
    taille pour des ailes qu'il n'a pas encore ouvertes. On balaie la tranche
    et on prend l'enveloppe de toutes les poses.
    """
    lo = Vector((float("inf"),) * 3)
    hi = Vector((float("-inf"),) * 3)

    scene = bpy.context.scene
    for frame, _ms in sequence():
        scene.frame_set(frame)
        deps = bpy.context.evaluated_depsgraph_get()
        for obj in meshes:
            evaluated = obj.evaluated_get(deps)
            for corner in evaluated.bound_box:
                world = evaluated.matrix_world @ Vector(corner)
                lo = Vector((min(a, b) for a, b in zip(lo, world)))
                hi = Vector((max(a, b) for a, b in zip(hi, world)))
    scene.frame_set(sequence()[0][0])

    center = (lo + hi) / 2.0
    size = hi - lo
    # Le modele tourne sous la camera, donc l'empreinte horizontale est un
    # disque : son diametre est la diagonale au sol, pas la largeur vue de
    # face. En hauteur rien ne tourne, donc la hauteur suffit telle quelle.
    span_xy = math.hypot(size.x, size.y)
    return center, max(span_xy, size.z, 1e-4) / 2.0


def add_camera(center, radius):
    """
    Camera orthographique a l'elevation iso, visant le centre du modele.

    ortho_scale est un point de depart : l'empreinte a l'ecran depend de la
    projection, qui ecrase la profondeur, et la deduire du modele donne un
    cadre trop large. fit_camera() la corrige ensuite sur le rendu reel.
    """
    data = bpy.data.cameras.new("iso")
    data.type = "ORTHO"
    data.ortho_scale = (radius * 2.0) / FILL
    cam = bpy.data.objects.new("iso", data)
    bpy.context.scene.collection.objects.link(cam)

    elev = math.radians(ELEVATION)
    dist = radius * 8.0
    cam.location = center + Vector((0.0, -math.cos(elev), math.sin(elev))) * dist
    # Vise le centre : rotation en X pour descendre le regard, Z nul car la
    # camera est posee sur l'axe -Y.
    cam.rotation_euler = (math.radians(90.0) - elev, 0.0, 0.0)

    bpy.context.scene.camera = cam
    return cam


def add_world():
    """
    Fond transparent, sans lumiere : le materiau est en emission pure, donc
    rien dans la scene n'a besoin d'etre eclaire. Des lampes ne feraient que
    ramener les hautes lumieres qu'on cherche a enlever.
    """
    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.0
    bpy.context.scene.world = world


def pivot(objects, center):
    """
    Un empty au centre du modele : tourner CA fait tourner l'oiseau sous une
    camera fixe, ce qui garde le cadrage identique d'un angle a l'autre.
    """
    empty = bpy.data.objects.new("pivot", None)
    empty.location = center
    bpy.context.scene.collection.objects.link(empty)
    for obj in objects:
        if obj.parent is None:
            obj.parent = empty
            obj.matrix_parent_inverse = empty.matrix_world.inverted()
    return empty


def configure_render():
    """Rendu a la taille finale, alpha conserve, filtre a zero."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    # Filtre Box a zero : chaque pixel prend une seule valeur, pas une
    # moyenne etalee sur ses voisins. C'est la difference entre du pixel
    # art et une miniature floue.
    scene.render.filter_size = 0.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.compression = 0
    # Vue Standard, pas AgX : le view transform par defaut de Blender est un
    # tone mapping cinema qui desature et assombrit tout.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    if hasattr(scene, "eevee"):
        # Pas de TAA : l'accumulation sur plusieurs echantillons redonnerait
        # exactement l'antialiasing qu'on vient d'enlever.
        scene.eevee.taa_render_samples = 1


def flat_materials(meshes):
    """
    Remplace le shader par de l'emission pure : la texture sort telle quelle.

    Baisser le speculaire d'un Principled ne suffit pas — il reste un BSDF
    eclaire par des lampes, donc il reste des hautes lumieres, et sur une
    douzaine de paliers de quantification un reflet devient une tache claire
    franche qui se voit (elle apparaissait comme un lisere sur le dessus des
    ailes). En emission il n'y a plus de calcul de lumiere du tout.

    L'assombrissement se fait a la quantification (DARKEN), pas ici : ecraser
    la texture au rendu perdrait les nuances avant qu'on ait de quoi les
    repartir.
    """
    for obj in meshes:
        for slot in obj.material_slots:
            mat = slot.material
            if not mat or not mat.use_nodes:
                continue

            tree = mat.node_tree
            principled = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            output = next((n for n in tree.nodes if n.type == "OUTPUT_MATERIAL"), None)
            if not output:
                continue

            # La texture couleur telle que le glTF la branche, s'il y en a une.
            source = None
            if principled:
                base = principled.inputs["Base Color"]
                if base.is_linked:
                    source = base.links[0].from_socket
                else:
                    rgb = tree.nodes.new("ShaderNodeRGB")
                    rgb.outputs[0].default_value = base.default_value
                    source = rgb.outputs[0]

            emission = tree.nodes.new("ShaderNodeEmission")
            emission.inputs["Strength"].default_value = 1.0
            if source:
                tree.links.new(emission.inputs["Color"], source)

            tree.links.new(output.inputs["Surface"], emission.outputs["Emission"])


# ----------------------------------------------------------------- rendu


def alpha_bbox(path):
    """Boite englobante des pixels non transparents d'un rendu, en pixels."""
    img = bpy.data.images.load(path)
    px = img.pixels[:]
    w, h = img.size
    minx, maxx, miny, maxy = w, -1, h, -1
    for y in range(h):
        base = y * w * 4
        for x in range(w):
            if px[base + x * 4 + 3] > 0.03:
                minx = min(minx, x)
                maxx = max(maxx, x)
                miny = min(miny, y)
                maxy = max(maxy, y)
    bpy.data.images.remove(img)
    if maxx < 0:
        return None
    return minx, maxx, miny, maxy


def fit_camera(tmp_dir, pivot_obj, cam):
    """
    Cale le cadrage sur ce que la camera rend VRAIMENT.

    Deduire ortho_scale de la taille du modele se trompe : la projection iso
    ecrase la profondeur, donc l'empreinte a l'ecran est plus petite que le
    modele, et l'oiseau finit perdu au milieu de son cadre. On rend quelques
    poses, on mesure l'empreinte obtenue, et on resserre d'autant.

    On corrige aussi le centre : l'oiseau n'est pas centre sur son origine, et
    un sprite decentre se lit comme un defaut de cadrage en jeu.
    """
    scene = bpy.context.scene
    probe = os.path.join(tmp_dir, "_fit.png")
    frames = [f for f, _ms in sequence()]

    minx, maxx, miny, maxy = SIZE, -1, SIZE, -1
    for _tag, deg in ANGLES:
        pivot_obj.rotation_euler = (0.0, 0.0, math.radians(deg))
        # Toutes les poses de la sequence : elle est courte, et c'est ce qui
        # garantit que l'enveloppe contient les ailes au plus haut.
        for frame in frames:
            scene.frame_set(frame)
            scene.render.filepath = probe
            bpy.ops.render.render(write_still=True)
            box = alpha_bbox(probe)
            if box:
                minx = min(minx, box[0])
                maxx = max(maxx, box[1])
                miny = min(miny, box[2])
                maxy = max(maxy, box[3])

    if os.path.exists(probe):
        os.remove(probe)
    if maxx < 0:
        return

    used = max(maxx - minx + 1, maxy - miny + 1)
    if used <= 0:
        return

    # Resserre pour que l'empreinte occupe FILL du cadre.
    before = cam.data.ortho_scale
    cam.data.ortho_scale *= (used / SIZE) / FILL

    # Recentre, en fractions de cadre (l'unite de shift_x/y). Le resserrage
    # ci-dessus a change l'echelle, donc l'ecart mesure avant vaut maintenant
    # d'autant moins, d'ou le rapport des deux ortho_scale.
    #
    # shift_y descend quand il augmente : deplacer la camera vers le haut fait
    # descendre le sujet. On soustrait donc l'ecart vertical au lieu de
    # l'ajouter, sinon on pousse l'oiseau plus loin encore du centre.
    grow = before / cam.data.ortho_scale
    cam.data.shift_x += ((minx + maxx + 1) / 2.0 / SIZE - 0.5) * grow
    cam.data.shift_y -= ((miny + maxy + 1) / 2.0 / SIZE - 0.5) * grow

    pivot_obj.rotation_euler = (0.0, 0.0, 0.0)
    scene.frame_set(frames[0])


def render_frames(tmp_dir, pivot_obj):
    """Une passe par angle et par frame, sur toute la tranche."""
    scene = bpy.context.scene
    rendered = []
    frames = sequence()

    for tag, deg in ANGLES:
        pivot_obj.rotation_euler = (0.0, 0.0, math.radians(deg))
        for i, (frame, _ms) in enumerate(frames):
            scene.frame_set(frame)
            path = os.path.join(tmp_dir, f"{tag}_{i:02d}.png")
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            rendered.append((tag, i, path))
    return rendered


def silhouette(buf, width, height):
    """
    Aplatit la feuille en silhouette : une seule couleur, alpha tout ou rien.

    A 48 px un oiseau lointain ne montre de toute facon presque rien de sa
    texture — les 36 bruns de la version precedente se lisaient comme une
    tache brune un peu sale. Une silhouette franche se lit mieux et sur
    n'importe quel ciel, clair ou sombre.

    Cela rend caduques la quantification par paliers et l'assombrissement :
    il n'y a plus qu'une couleur, donc plus de rampe a repartir.
    """
    r, g, b = SILHOUETTE
    for i in range(0, width * height * 4, 4):
        if buf[i + 3] < 0.5:
            buf[i] = buf[i + 1] = buf[i + 2] = buf[i + 3] = 0.0
            continue
        # Alpha binaire : le filtre Box ne produit deja plus de bords laves,
        # et un demi-pixel residuel ferait une frange sur le ciel.
        buf[i] = r
        buf[i + 1] = g
        buf[i + 2] = b
        buf[i + 3] = 1.0


def pack(rendered, out_png, out_json):
    """
    Assemble les frames en une grille, une ligne par angle, et ecrit le JSON
    au format Aseprite que le jeu lit deja.

    Chaque frame porte sa PROPRE duree : la pose de plane est tenue bien plus
    longtemps que les poses de battement, et c'est ce qui donne un oiseau qui
    plane plus qu'il ne bat des ailes sans gonfler la feuille.
    """
    steps = sequence()
    cols = len(steps)
    rows = len(ANGLES)
    sheet = bpy.data.images.new(NAME, width=cols * SIZE, height=rows * SIZE, alpha=True)
    buf = [0.0] * (cols * SIZE * rows * SIZE * 4)

    frames = {}
    tags = []

    for row, (tag, _deg) in enumerate(ANGLES):
        first = row * cols
        # "forward" et non "pingpong" : la sequence est composee (battement
        # puis plane tenu), elle boucle d'elle-meme. La relire a l'envers
        # rejouerait le battement a reculons apres le plane.
        tags.append({"name": tag, "from": first, "to": first + cols - 1, "direction": "forward"})

        for col in range(cols):
            path = next(p for t, i, p in rendered if t == tag and i == col)
            img = bpy.data.images.load(path)
            px = list(img.pixels)

            # Blender ecrit les images de bas en haut ; la feuille se lit de
            # haut en bas. La ligne 0 du JSON doit donc tomber en haut.
            for y in range(SIZE):
                dst_y = (rows - 1 - row) * SIZE + y
                src = (y * SIZE) * 4
                dst = (dst_y * cols * SIZE + col * SIZE) * 4
                buf[dst:dst + SIZE * 4] = px[src:src + SIZE * 4]

            bpy.data.images.remove(img)

            key = f"{NAME} {first + col}.png"
            frames[key] = {
                "frame": {"x": col * SIZE, "y": row * SIZE, "w": SIZE, "h": SIZE},
                "rotated": False,
                "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": SIZE, "h": SIZE},
                "sourceSize": {"w": SIZE, "h": SIZE},
                "duration": steps[col][1],
            }

    silhouette(buf, cols * SIZE, rows * SIZE)

    sheet.pixels = buf
    sheet.filepath_raw = out_png
    sheet.file_format = "PNG"
    sheet.save()

    with open(out_json, "w") as fh:
        json.dump(
            {
                "frames": frames,
                "meta": {
                    "app": "blender headless (scripts/render-bird.py)",
                    "image": f"{NAME}.png",
                    "format": "RGBA8888",
                    "size": {"w": cols * SIZE, "h": rows * SIZE},
                    "scale": "1",
                    "frameTags": tags,
                },
            },
            fh,
            indent=1,
        )


def main():
    if not os.path.exists(GLTF):
        sys.exit(f"glTF introuvable : {GLTF}")
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp_dir = os.path.join(OUT_DIR, ".bird-frames")
    os.makedirs(tmp_dir, exist_ok=True)

    reset()
    objects, meshes = load_bird()
    flat_materials(meshes)
    center, radius = bounds(meshes)
    cam = add_camera(center, radius)
    add_world()
    pivot_obj = pivot(objects, center)
    configure_render()

    fit_camera(tmp_dir, pivot_obj, cam)
    rendered = render_frames(tmp_dir, pivot_obj)
    out_png = os.path.join(OUT_DIR, f"{NAME}.png")
    out_json = os.path.join(OUT_DIR, f"{NAME}.json")
    pack(rendered, out_png, out_json)

    for _t, _i, path in rendered:
        os.remove(path)
    os.rmdir(tmp_dir)

    print(f"[bird] {len(rendered)} frames -> {out_png}")


if __name__ == "__main__":
    main()
