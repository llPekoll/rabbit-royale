# Block islands

The `/island` generator drawn as stacked isometric blocks, from
`public/assets/world/isometric-sandbox-sheet-32x32.png` — prototype art, to be
swapped for the real thing later.

Open <http://localhost:3010/isoworld> to look at one. Same seed, same knobs as
`/island`, so one island can be compared in both projections.

## The pieces

| File | Knows about | Does not know about |
|---|---|---|
| `terrain.ts` | ramps, props, rotation — on top of `generateIsland`'s tiers | textures, Pixi |
| `sheet.ts` | the sheet's layout, Pixi textures | islands |
| `IsoWorldView.ts` | all of the above | gameplay |

```ts
const tileset = await loadIsoTileset();
const map = generateIsland({ seed: 'harbour-9', tiers: 3 });
const world = rotateIsoWorld(planIsoWorld(map, { ramps: 0.35, stairs: 0.3 }), 0);
stage.addChild(new IsoWorldView({ world, tileset }).view);
```

## The sheet

192x288, 32px cells, three materials of three rows each (grass 0-2, stone 3-5,
dirt 6-8). Every sprite is bottom-aligned in its cell, so every piece is placed
by the same rule. One block is 32 wide, 16 deep and 16 tall.

```
col   0        1        2          3          4           5
r0    cube     slab     slope W    slope N    stairs N    stairs W
r1    turf     flat     slope S    slope E    block W     block E
r2    (water)  (water)  (water)    (water)    block S     block N
```

Only two stair directions exist, the two climbing away from the camera. A
stairs ramp turned to face the camera is drawn as a slope.

## Ramps

A cell at tier `t` can take a ramp when exactly one neighbour is at `t + 1`
and the cell opposite is plain ground at `t`. `ramps` is the share of those
candidates that get one, and `stairs` is the share of ramps built as stairs.

## Turning

An isometric camera sees two sides of anything. `rotateIsoWorld` turns the data
a quarter at a time, and ramps and props turn with their cells, so the same
island comes back after four turns. Q and E on the workbench.

## Drawing

- **Painter's order** along `x + y`, bottom-up within a cell, with sprites
  created in that order, so nothing sorts.
- **Hidden blocks are skipped**: a block whose east and south neighbours both
  stand at least as high shows no face.
- **The sea** is the water block's top face in one flat opaque colour, and the
  canvas background matches it. Each water cell covers the foot of the land
  behind it, which gives the coast its waterline. The sheet's translucent
  water, laid edge to edge, drew a grid of glass boxes.
- **`tiered` ground**: grass turf over a dirt top block, stone below, bare dirt
  on the beach ring touching the sea.
