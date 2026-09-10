# art-source

Source art. **Nothing in here is served to the browser** — that is the whole
point of the folder. `public/` ships what the game loads and nothing else, so a
player downloads about a hundred files instead of eight hundred.

| Folder | What it is |
| --- | --- |
| `tiny-swords/` | The two Tiny Swords packs, consolidated into one tree by `tools/consolidate_tiny_swords.py`, plus the `manifest.json` recording every sheet's pixel size and alpha bounds. That manifest is the input to `src/game/island/tileset.ts`, so no sheet geometry is ever typed in by hand. |
| `legacy-rr/` | The original Rabbit Royale PNGs. Every one of them exists in `public/assets/` as a WebP of identical dimensions — these are the masters those were cut from. |

## Adding a sheet the island loads

The island reads about thirty of the pack's six hundred files. They are copied
across by hand into `public/assets/terrain/` and `public/assets/deco/`, and the
list lives in `tileset.ts` (`ISLAND_SHEETS`, `propUrl`, `seaRockUrl`,
`tierPaletteUrl`). Point the code at a new sheet and you must copy that sheet
into `public/assets/` too, or it will 404 in the browser while resolving
perfectly well on disk here.

## Why the legacy PNGs are kept

They are the masters. The shipped WebPs are lossless re-encodes, so the pixels
survive a round trip — but a future re-cut (a different crop, a new scale, a
palette edit) wants the PNG, not a WebP of a PNG.

The one place the two trees genuinely disagree is the wordmark:
`legacy-rr/ui/RR-Logo_Banner.png` is 365x78 with an **empty** ribbon, and that
is the one the sign-in screen uses. An earlier 365x106 cut had a second, smaller
logo baked into the ribbon, which read as the wordmark drawn twice.
