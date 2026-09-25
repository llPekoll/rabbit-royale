# Landmark sprites

Generated with the built-in imagegen tool. Original game sprites are preserved in `originals/`; selected generated masters are `*-source.png`. `preview.png` shows the four final assets at 2× nearest-neighbour scale.

Final assets: `godot/assets/buildings/landmarks/{dig,defend,raid,shop}.png`.

The selected DIG is the open shaft with ladder, as requested. The later trampoline variant was discarded. The sprites were reduced to small logical resolutions (DIG 64×42, DEFEND 108×45, RAID 52×80, SHOP 67×53), fitted preserving aspect ratio, quantized to 32 colors, and enlarged without smoothing into the existing canvas dimensions. Alpha is binary to remove translucent fringe. Existing game footprint and references are retained. PNG dimensions and alpha were checked; in-game appearance has not been verified.

## Current higher-detail version

The game assets now use the full original canvas resolution, resized directly from the generated masters without the 32-color reduction. Their dimensions and Godot scale remain unchanged. The previous coarse versions are preserved in `low-resolution/`. See `preview-higher-resolution.png` for the current sprites at 2×.

## Generation prompts

Shared prompt:

Create one production game sprite for Rabbit Royale. Use case: stylized-concept. Crisp hand-pixeled 2D pixel art, consistent chunky pixel clusters, dark brown outlines, restrained warm wood ochre and green palette, sunlight upper left, orthographic 2:1 isometric view seen from above matching a cozy rabbit island game. Readable small silhouette, simplified intentional details, no painterly rendering, no blur, no text, no UI, no signboard, no surrounding island, no grass tile, no bridge, no water backdrop. Genuine transparent alpha background. Entire isolated object within frame with minimal transparent margin.

Each prompt used the corresponding original sprite as its edit reference, followed by:

- DIG: Asset DIG: redesign the reference excavation entrance as a charming round timber-lined mine shaft with a visibly deep dark opening, thick wooden rim, short ladder descending inside, small shovel leaning at right, a little earth around the foot only. Low wide silhouette. Preserve its visual role but remove pale trampoline-like surface and all cutout debris. This is a standalone individual sprite.
- DEFEND: Asset DEFEND: redesign reference as a compact coherent wooden rabbit fort gateway, a stout central gatehouse with blue hanging shield banner, short pointed-log palisade wings either side, brass fittings. Broad low silhouette, approximately twice as wide as tall. No detached logs, no bridge behind it, no grass baked in. Standalone individual sprite.
- RAID: Asset RAID: redesign reference as a small sturdy wooden expedition sailboat, single rich burgundy square sail and small pennant, readable curved hull, rope and warm hanging lantern at stern. Full boat visible, no cropped hull, no dock or attached bridge, no waves. Tall silhouette roughly 2:3 width to height. Standalone individual sprite.
- SHOP: Asset SHOP: redesign reference as a compact charming wooden merchant stall with orange and cream striped canvas canopy, a few readable carrots and jars on counter, one barrel at side, small hanging gold coin emblem without letters. Coherent sturdy construction, clean outline, no scattered clutter outside stall. Roughly square silhouette slightly wider than tall. Standalone individual sprite.
