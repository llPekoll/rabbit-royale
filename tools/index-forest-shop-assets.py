"""Index generated transparent atlases without editing their pixels.

python3 tools/index-forest-shop-assets.py

Each alpha-bounded cell becomes a Godot AtlasTexture region. The originals
remain intact; nine-slice insets are metadata, like CampStyle's panel table.
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'godot/assets/ui/shop-forest'


def regions(filename, columns, rows, names, boxes=None):
    image = Image.open(ASSETS / filename)
    if image.mode != 'RGBA':
        raise ValueError(f'{filename}: expected RGBA, got {image.mode}')
    alpha = image.getchannel('A')
    lowest, highest = alpha.getextrema()
    if lowest != 0 or highest < 250:
        raise ValueError(f'{filename}: missing transparent or opaque pixels')
    result = {}
    for i, name in enumerate(names):
        col, row = i % columns, i // columns
        if boxes:
            reference = boxes[i]
            cell = tuple(round(v * (image.width / 1536 if j % 2 == 0 else image.height / 1024))
                         for j, v in enumerate(reference))
        else:
            cell = (round(col * image.width / columns), round(row * image.height / rows),
                    round((col + 1) * image.width / columns), round((row + 1) * image.height / rows))
        # Alpha noise is ignored when choosing bounds, but the source remains
        # untouched and the complete retained soft edges still render normally.
        bounds = alpha.crop(cell).point(lambda value: 255 if value > 8 else 0).getbbox()
        if not bounds:
            raise ValueError(f'{filename}: empty cell {name}')
        x0, y0, x1, y1 = bounds
        result[name] = {'atlas': filename, 'region': [cell[0] + x0, cell[1] + y0, x1 - x0, y1 - y0]}
    return result


parts = regions('forest-ui-kit.png', 3, 3,
                ['panel', 'tab-off', 'tab-on', 'action', 'nameplate', 'close',
                 'pedestal', 'discount', 'selected'],
                # The approved generator output uses differently sized rows.
                # These isolating cells follow the inspected source, not the
                # requested grid; alpha then supplies tight per-part bounds.
                [(0, 0, 520, 425), (520, 100, 1020, 400), (1020, 100, 1536, 400),
                 (0, 420, 520, 640), (520, 420, 1080, 640), (1100, 400, 1450, 638),
                 (0, 638, 550, 1024), (570, 638, 1010, 1024), (1035, 638, 1536, 1024)])
parts.update(regions('pack-illustrations.png', 2, 2,
                     ['shiro_stash', 'kuro_tantrum', 'refill_3', 'refill_10']))
for key in ['panel', 'selected']:
    # Include frame thickness and the corner ornaments in the fixed region.
    w, h = parts[key]['region'][2:]
    # Keep the entire upper-left leafy ornament inside the fixed corner;
    # stretching the top through it would turn a leaf into a long green stripe.
    parts[key]['slice'] = [round(w * .56), round(h * .28), round(w * .22), round(h * .22)]
for key in ['tab-off', 'tab-on', 'action', 'nameplate']:
    w, h = parts[key]['region'][2:]
    parts[key]['slice'] = [round(min(w * .18, h * .45)), 0] * 2
(ASSETS / 'atlas-regions.json').write_text(json.dumps(parts, indent=2) + '\n')
print(f'Indexed {len(parts)} assets from two RGBA atlases; source pixels unchanged.')
for key, part in parts.items():
    print(f"  {key}: {part['region']}")
