# Tile islands

A seeded island of square tiles with stacked plateaus, drawn from the Tiny
Swords terrain sheets. Groundwork for a future game, not wired into Rabbit
Royale's isometric board — that one keeps its painted backdrop.

Open <http://localhost:3010/island> to look at one.

## The three pieces, and why they are apart

| File | Knows about | Does not know about |
|---|---|---|
| `generate.ts` | seeds, tiers, erosion | textures, Pixi, the screen |
| `autotile.ts` | a cell's four neighbours | the map, the sheets |
| `tileset.ts` | sheet geometry, Pixi textures | islands |
| `iso.ts` | the diamond lattice, projection, depth | the map, the sheets |
| `IslandView.ts` | all of the above | gameplay |
| `IsoIslandView.ts` | all of the above, isometrically | gameplay |

A map is `Int8Array` of terrain tiers plus its size — small enough to travel as
a seed, and assertable without a canvas. `test/island-tiles.test.ts` covers the
two halves that fail by drawing the wrong picture rather than by throwing.

## How a plateau is drawn

Every terrain sheet here is the classic 4-wide **blob set**: the column comes from
whether the cell has a west and an east neighbour, the row from north and
south. Sixteen combinations, no inner corners — which is why plateaus in this
pack read as blocky shelves.

A tier above sea level is painted **twice**:

1. the rock shelf, from `tilemap-elevation`,
2. grass over it.

The grass tiles have rounded, transparent corners, so a thin rim of rock
survives around the edge. The **cliff face** is a third tile, drawn one cell
*below* the shelf's southern edge, standing on whatever is down there. Tier 1
skips the rock entirely, which is how a beach meets the water with nothing but
foam between them.

### Every tier gets its own grass

The cliff face only ever appears on a shelf's *southern* edge. Paint every level
the same green and the other three sides of a plateau vanish into the ground
below it, leaving an island that reads as flat with some walls lying on it.

The free pack ships the same grass in five palettes, and the pack's own key art
uses them exactly this way — sampling it finds sea level at `#9bb94e` (palette
1) and the shelf above it at `#85b156` (palette 2). So tier *n* takes palette
*n*, and tiers past the fifth share the last one. Pass `ground: 'grass'` or
`'sand'` to paint everything from one flat set instead.

Sheet layout, all cells 64px:

```
tilemap-flat        640x256   grass blob at cols 0-3, sand at 5-8, tufts at 4 and 9
tilemap-elevation   256x512   surfaces on rows 0/1/2 and 4
                              cliff faces on rows 3 (tall shelf) and 5 (one row deep)
                              row 7 stacks a second storey of face
tilemap-color-1..5  576x384   the five grass palettes; blob set at cols 5-8
                              (cols 0-3 are the same set with surf painted in,
                              which this module does not use — its foam animates)
foam                1536x192  8 frames, each centred on the tile it edges
```

## The isometric cut

`IsoIslandView` draws the same map, from the same sheets, on a diamond lattice
instead of a square one. Open the `Island/Iso island` stories to look at one.

```ts
const island = new IsoIslandView({ map, tileset });   // metrics default to 2:1
```

The projection is the standard one, `screenX = (x - y) * w/2`, `screenY =
(x + y) * h/2 - tier * z`. Two things about it are worth knowing before
changing anything:

**The ground is sheared, the rest is not.** Moving a square tile onto an
isometric lattice and leaving it square does not read as isometric — the tile's
edges stay axis-aligned while the grid runs diagonally, so neighbours overlap
as offset rectangles and a plateau comes out as a staircase of playing cards.
So the flat layers go through a matrix that takes the tile's unit square to the
cell's diamond. Trees, props and rocks keep their own upright sprites, which is
how an isometric scene draws standing things anyway. The shear costs some pixel
crispness on the ground; that is the trade, and it is the reason this view is a
separate class rather than a flag on `IslandView`.

**A raised cell is a column, not a sprite.** Lifting a plateau by `tier * z`
opens a gap underneath, and if nothing fills it the shelf hovers. Each land
cell therefore stamps the cliff face down to its lowest visible neighbour
(south and east are the sides this camera sees past) before stamping its
surface. `tileZ` defaults to 32 because that is how tall the pack's face
actually draws — lift by less and a band of rock hangs below the shelf, by more
and the sea shows through.

Draw order is painter's along `x + y` with height breaking ties, in one flat
`sortableChildren` container: a tree on a near cell has to be able to draw in
front of a cliff on a far one, and no stack of layers can express that.

## Generating

```ts
const map = generateIsland({ seed: 'harbour-9', tiers: 3 });
```

| Option | Default | What it does |
|---|---|---|
| `width` / `height` | 34 x 24 | grid in cells |
| `tiers` | 3 | how many levels to attempt; 1 is a flat island |
| `land` | 0.46 | share of the box the coastline aims to fill |
| `rise` | 0.55 | share of each tier that climbs into the next |
| `raggedness` | 0.4 | 0 is a round blob, 1 is scattered noise |

`land` and `rise` are thresholds by **rank**, not by cutoff: the generator sorts
the field and takes the top share. That is what lets them stay honest dials when
the noise or the falloff changes underneath them.

Two invariants the renderer depends on, both enforced rather than hoped for:

- **A one-cell margin of sea around the grid.** A shore cell on the border has
  nowhere to put its foam, and a plateau there loses the row its cliff stands on.
- **Each tier is eroded out of the one below**, so every plateau cell has ground
  at most one step down on all four sides. A cliff never drops straight to water.

`tiers` is a request. When a shelf comes out smaller than ten cells the climb
stops, and `map.tiers` reports what actually got built.

## Drawing

```ts
const tileset = await loadIslandTileset();     // cached by URL; call it freely
const island = new IslandView({ map, tileset });
stage.addChild(island.view);
app.ticker.add((t) => island.update(t.deltaMS));   // foam and tree sway
```

Every tile is a slice of a shared sheet, so an island of a few thousand sprites
costs about a dozen texture uploads. `IslandView.destroy()` drops the sprites and
leaves the sheets in Pixi's cache for the next island.

## The art

`art-source/tiny-swords/`, consolidated from the free pack and Update 010 by
`tools/consolidate_tiny_swords.py` — lossless WebP, kebab-case, no editor
sources. Update 010 is canon; `classic/` holds what only the free pack has
(lancers, monks, the extra buildings and UI). `manifest.json` records every
file's size and alpha bounds, which is where the prop foot offsets in
`tileset.ts` were measured.
