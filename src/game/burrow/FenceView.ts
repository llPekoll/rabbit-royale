/**
 * THE FENCES ON THE BOARD: what is built, and where one could go.
 *
 * TARGETS, NOT PREVIEWS. The first version ghosted the fence SPRITE on every
 * side you could close — the thing itself, at half opacity, waiting to be
 * bought. It read as a row of gold beads dropped along the garden, and Paul
 * said so: "on dirrais que mon potager a des fence qui sont enterer", then
 * "tu devrais avoir pour les fence juste des truc bleu juste autour du potager
 * pour placer les planches".
 *
 * He is describing what the BOMBS already do, and they are right: placement
 * mode paints a blue diamond on each cell you may mine, gold under the
 * pointer, and the bomb itself appears only once it is in the ground. A target
 * is a flat mark that says "here"; a preview is a picture of the object, and a
 * translucent picture of a 192px fence squeezed onto a 22px cell edge is
 * neither a mark nor a fence. So this layer speaks the board's own language:
 *
 *   - a span you could close     → a blue diamond on the cell across it
 *   - the span under the pointer → that diamond, gold
 *   - a span already walled      → the PLANK, solid, and no diamond; gold
 *                                  under the pointer, since a tap lifts it
 *
 * ONE PLANK AT A TIME. It first lit and built a whole side per press; Paul,
 * 2026-09-21: "ca en met plein d'un coup, c'est une a une". So the unit here
 * is the span, and the hover names one.
 *
 * ITS OWN LAYER, not another branch of the trap hints. Those are per-TILE, and
 * every rule they express ("minable", "doorstep") is a property of a cell. A
 * fence is a property of an EDGE — four per cell — so folding edges into a
 * system whose every index is a tile would have given `tileOfHint` a second
 * meaning. The scene drives this with three facts: what is built, what is on
 * offer, and which side is hovered.
 *
 * THE PLANK IS NEVER ROTATED. It is drawn along one iso diagonal and MIRRORED
 * onto the other by a negative scale — a rotation would tip the posts over.
 * That constraint, the two post feet used as the pivot, and the fractional
 * source coordinates all come from the storybook prototype (`FENCE_FOOT`).
 */
import { Assets, Container, Polygon, Sprite, Texture, type FederatedPointerEvent } from 'pixi.js';
import { gsap } from 'gsap';
import {
  FENCE_FOOT, FENCE_SPAN, fenceSpans, outerTile, segKey,
  type FenceSeg, type FenceSpan,
} from './fence';
import * as Keys from '@/config/assetKeys';
import { burrowTileScreen, burrowDepth } from './screen';
import { BURROW_HALF_W, BURROW_HALF_H } from '@/config/burrowConfig';
import { getDiamondFill, diamondScaleFor } from '@/game/services/TileTextures';

/**
 * The board's own two placement colours, borrowed rather than invented: blue
 * is "you could put one here" and gold is "this one is yours if you click"
 * everywhere else on this screen (see `PLACEABLE_TINT` and `HOVER_TINT` in
 * BurrowScene). A fence mode with a fifth colour would be a second visual
 * language for the same gesture.
 */
const OFFER_TINT = 0x8fd6ff;
const OFFER_ALPHA = 0.42;
const HOVER_TINT = 0xffd45c;
const HOVER_ALPHA = 0.85;

/**
 * How far in front of its cell a plank draws.
 *
 * The FX depth ruler applies: a thing in the island's container sorts on
 * `isoDepth`, never on a literal zIndex, or it lands wholly in front of or
 * behind terrain it should interleave with. So the base is the cell's own
 * depth and this is only the tie-break that puts the posts in front of the
 * grass they stand on and behind whatever stands on the next cell.
 */
const PLANK_BIAS = 0.3;
/**
 * A fence BEHIND its cell draws before it, not after.
 *
 * `burrowDepth` is the cell's own diagonal, and a plank hangs off one of its
 * four edges — two of which are on the far side of it. Biased forward for all
 * four, the rails on the garden's back edge were drawn OVER the carrots and
 * the soil they stand behind. The near edges (SE, SW) keep the forward bias so
 * their posts stand in front of the crop; the far ones (NE, NW) take the same
 * step backwards, which is where the ground already puts them.
 */
const PLANK_BEHIND = -0.3;
/**
 * The target's height INSIDE its cell's block — `mountVeil`'s zIndex, which is
 * a different ruler from the board's depth. The block's own ground tile sits
 * at 1, so the placement diamonds mount at 2 (the method's default) and a
 * bomb on top of them at 3. This first shipped as 0.05, read off the board's
 * ruler: eighteen diamonds drawn UNDER the grass, "visible" to every probe
 * and to nobody's eye. Paul, 2026-09-21: "rien ne se passe comme il faut".
 */
/*
 * ABOVE the hints (2), not level with them: two sprites at one zIndex keep
 * insertion order, the hints are built after this layer, and so on a walkable
 * ring cell the hint sat on top and took the target's taps and hovers. The
 * hint path then had to name the span by distance, and missed — see `pick`.
 * Under the bombs (3), which must stay on top of everything in the cell.
 */
const MARK_Z = 2.5;
/** And on the board, when a cell has no block to mount in: flat on the cell. */
const MARK_BIAS = 0.05;

/** One span of the perimeter, with both things that can be drawn on it. */
interface Drawn {
  /** The fence itself. Visible only once the span is BUILT. */
  plank: Sprite;
  /** The blue/gold target on the cell across this span. */
  mark: Sprite;
  seg: FenceSeg;
  key: string;
  /**
   * The EDGE's midpoint, in board space — what `pick` measures against.
   *
   * Not the mark's cell: at a notch one outer cell borders two field cells
   * and would carry two marks at one point, so the mark cannot tell two spans
   * apart. The edge midpoint is unique per span.
   */
  x: number;
  y: number;
}

export interface FenceViewOptions {
  /** The burrow's owner id, which is the seed its ground is grown from. */
  seed: string;
  /**
   * Put a sprite inside its cell's terrain block, as the placement diamonds
   * are mounted. Returns false when the cell has no block, and the caller
   * positions the sprite against the board instead — the same contract
   * `BurrowTerrain.mountVeil` states.
   */
  mount(tile: number, holder: Container, zIndex: number): boolean;
  /** Where a sprite goes when `mount` says no: the board's own container. */
  fallback: Container;
  /**
   * THE TARGETS TAKE THEIR OWN TAPS.
   *
   * The board's hint diamonds carry every other press on this screen, and
   * the first version routed fence taps through them by distance. But hints
   * exist only on WALKABLE cells, and a target sits on the ring outside the
   * potager — a rock, a tree, the sea. There, nothing received the press and
   * the tap was simply lost; on the next burrow over it worked. Seen in the
   * Playwright drive, 2026-09-21: a tap with no POST behind it.
   *
   * So a mark and a plank are interactive themselves, and hand the scene the
   * three things it needs: the tap, the hover, and the press that may become
   * a drag (`onPress` feeds the pan recogniser, so a drag that starts on a
   * target still pans the board like a drag from anywhere else).
   */
  onTap(seg: FenceSeg): void;
  onHover(seg: FenceSeg | null): void;
  onPress(e: FederatedPointerEvent): void;
}

export class FenceView {
  private readonly drawn: Drawn[] = [];
  private built = new Set<string>();
  private offered = new Set<string>();
  private hovered: string | null = null;
  private placing = false;

  constructor(private readonly options: FenceViewOptions) {
    this.build();
  }

  /** Every span of the field's perimeter, drawn once and then only restyled. */
  private build(): void {
    const { seed, mount, fallback } = this.options;
    /*
     * FROM THE CACHE, BY KEY — not `Texture.from(url)`.
     *
     * This layer is built inside `BurrowScene.create`, which the BOOT awaits,
     * and `Texture.from` on a url that has not been loaded does not fetch it:
     * it warns and hands back `undefined`, so the next line threw and took the
     * whole scene down before the first frame. The plank is registered in
     * `AssetLoader` (Keys.GARDEN_FENCE), which is what the boot waits for.
     *
     * The TARGETS do not need it — they are the board's own diamond, baked at
     * runtime like every other hint here — so a plank that fails to decode
     * costs the potager its walls and still leaves it placeable.
     */
    const texture = Assets.get<Texture>(Keys.GARDEN_FENCE);
    // Nearest, like every other pixel sprite on this board: the segment is a
    // 192x128 bitmap shown several times its size, and a smoothed one reads as
    // a different art style from the terrain it stands on.
    if (texture) texture.source.scaleMode = 'nearest';

    for (const span of fenceSpans(seed)) {
      const centre = burrowTileScreen(seed, span.tile);
      const plank = this.paintPlank(span, centre, texture);
      // The target goes on the cell ACROSS the edge — the ring round the
      // garden — see `outerTile`. A span on the board's edge, with nothing
      // across it, keeps its target on the field cell rather than losing it.
      const markTile = outerTile(span) ?? span.tile;
      const markAt = burrowTileScreen(seed, markTile);
      const mark = this.paintMark(markAt);
      plank.label = `fence-plank-${span.side}-${span.tile}`;
      mark.label = `fence-mark-${span.side}-${span.tile}`;

      /*
       * THE PLANK GOES IN THE BOARD, NOT IN THE CELL'S BLOCK.
       *
       * `mountVeil` OVERWRITES the sprite's position with the centre of its
       * cell (`veil.position.set(p.x, p.y)` — it exists to place cell-shaped
       * overlays, and says so). A plank is not cell-shaped: it is anchored on
       * one post's FOOT, on the edge between two cells. Mounted, every fence
       * was yanked to the middle of its tile and lost the lift that put its
       * feet on the terrace — so the rails sank into the ground. Paul,
       * 2026-09-21: "j'ai l'impression que les barriere sont en dessous".
       *
       * The storybook had this right and it is the reason: it adds each
       * segment to the WORLD container with a computed depth, never to a
       * block. `burrowTileScreen` already includes the terrace lift, so a
       * plank positioned against the board sits on the ground it belongs to.
       *
       * The MARK below is genuinely cell-shaped, so it still mounts — that is
       * what keeps it from lapping over the terrace edge behind it.
       */
      const behind = span.side === 'NE' || span.side === 'NW';
      plank.zIndex = burrowDepth(seed, span.tile) + (behind ? PLANK_BEHIND : PLANK_BIAS);
      fallback.addChild(plank);
      if (!mount(markTile, mark, MARK_Z)) {
        mark.zIndex = burrowDepth(seed, markTile) + MARK_BIAS;
        fallback.addChild(mark);
      }
      const mid = {
        x: centre.x + ((span.a.x + span.b.x) / 2 - (span.a.y + span.b.y) / 2) * BURROW_HALF_W,
        y: centre.y + ((span.a.x + span.b.x) / 2 + (span.a.y + span.b.y) / 2) * BURROW_HALF_H,
      };
      const seg = { tile: span.tile, side: span.side };
      this.wire(mark, seg);
      this.wire(plank, seg);
      this.drawn.push({ plank, mark, seg, key: segKey(seg), x: mid.x, y: mid.y });
    }
    this.restyle(0);
  }

  /** A sprite that answers for one span — see `onTap` in the options. */
  private wire(sprite: Sprite, seg: FenceSeg): void {
    const { onTap, onHover, onPress } = this.options;
    sprite.eventMode = 'static';
    sprite.cursor = 'pointer';
    sprite.on('pointertap', () => onTap({ ...seg }));
    sprite.on('pointerdown', (e: FederatedPointerEvent) => onPress(e));
    sprite.on('pointerover', () => onHover({ ...seg }));
    sprite.on('pointermove', () => onHover({ ...seg }));
    sprite.on('pointerout', () => onHover(null));
  }

  /**
   * THE TARGET: the board's own placement diamond, on the field cell this span
   * hangs off.
   *
   * On a CELL, not on the edge — the diamond is a cell-shaped mark, and
   * straddling it across a boundary would read as a cell of its own, half in
   * the garden and half outside it. The cell is the one just OUTSIDE the
   * garden (`outerTile`), so a side's targets form a run of the ring round
   * it and light together: what the player sees is one whole edge of the
   * potager glowing at once, which is exactly the unit being bought.
   */
  private paintMark(centre: { x: number; y: number }): Sprite {
    const mark = new Sprite(getDiamondFill());
    mark.anchor.set(0.5);
    const k = diamondScaleFor(BURROW_HALF_W, BURROW_HALF_H);
    mark.scale.set(k.x, k.y);
    mark.position.set(centre.x, centre.y);
    mark.alpha = 0;
    mark.visible = false;
    // The FULL diamond as the hit area, in the sprite's own space (it is
    // scaled to the cell, so the half-sizes are divided back) — the same
    // shape the hint diamonds answer taps with, for the same reason: the
    // hairline between two cells belongs to one of them.
    const hw = BURROW_HALF_W / k.x;
    const hh = BURROW_HALF_H / k.y;
    mark.hitArea = new Polygon([0, -hh, hw, 0, 0, hh, -hw, 0]);
    return mark;
  }

  /**
   * THE PLANK, placed by its two post feet.
   *
   * ONE UNIFORM SCALE, not one per axis. The prototype scaled x and y
   * independently so the feet landed exactly on the span's ends — right in the
   * STORY, whose world container is scaled 3x, and wrong here: a cell edge is
   * 22x12 screen pixels against a 74x31 sprite, so per-axis scaling squashed a
   * 192px fence to about 57 and drew gold beads along the garden. Sized like
   * every other pixel prop on this board instead (see `trapBombScale`).
   */
  private paintPlank(
    span: FenceSpan,
    centre: { x: number; y: number },
    texture: Texture | undefined,
  ): Sprite {
    const project = (p: { x: number; y: number }) => ({
      x: centre.x + (p.x - p.y) * BURROW_HALF_W,
      y: centre.y + (p.x + p.y) * BURROW_HALF_H,
    });
    let a = project(span.a);
    let b = project(span.b);
    // Lower point first, so the plank is always drawn top-down and the mirror
    // is decided by the geometry rather than by the walk order.
    if (a.y > b.y) [a, b] = [b, a];

    const sprite = new Sprite(texture ?? Texture.EMPTY);
    const width = Math.hypot(b.x - a.x, b.y - a.y);
    const native = Math.hypot(FENCE_SPAN.x, FENCE_SPAN.y);
    const k = native > 0 ? width / native : 1;
    // A negative x is the MIRROR onto the other diagonal. Never `rotation`:
    // that tips the posts over, and they must stay upright.
    sprite.scale.set((b.x - a.x) < 0 ? -k : k, k);
    sprite.pivot.set(FENCE_FOOT.x, FENCE_FOOT.y);
    sprite.position.set(a.x, a.y);
    sprite.visible = false;
    return sprite;
  }

  /**
   * What is built, and what may be offered.
   *
   * `offered` is the server's list of closable spans rather than everything
   * the geometry exposes: the gate rule and the bag are the server's to
   * enforce, and a board that marks a span the server would refuse is the
   * exact inconsistency the raid route's own note warns about.
   */
  setState(built: readonly FenceSeg[], offered: readonly FenceSeg[]): void {
    this.built = new Set(built.map(segKey));
    this.offered = new Set(offered.map(segKey));
    this.restyle(0.2);
  }

  setPlacing(placing: boolean): void {
    if (this.placing === placing) return;
    this.placing = placing;
    if (!placing) this.hovered = null;
    this.restyle(0.2);
  }

  /** The span under the pointer, or null. This is the surbrillance. */
  setHovered(seg: FenceSeg | null): void {
    const key = seg ? segKey(seg) : null;
    if (this.hovered === key) return;
    this.hovered = key;
    this.restyle(0.12);
  }

  /**
   * Which span a point on the board names, or null.
   *
   * Measured to the EDGE's midpoint — unique per span, where the mark's cell
   * is not (see `Drawn.x`). Candidates are the spans a tap would CHANGE: the
   * ones on offer, plus the ones already built (tapping a plank is how it
   * comes down, the same gesture that lifts a bomb off a mined tile). The
   * gate is not a candidate, so a tap on the one edge that must stay open
   * finds nothing rather than a refusal.
   */
  pick(x: number, y: number, maxDistance = 24): FenceSeg | null {
    let best: Drawn | null = null;
    let bestScore = maxDistance;
    let bestEdge = Infinity;
    for (const d of this.drawn) {
      if (!this.offered.has(d.key) && !this.built.has(d.key)) continue;
      // Nearest of the two things the player can aim at: the mark's cell
      // (what they see while placing) or the edge itself (what they see once
      // a plank stands). Measured to the edge alone, a pointer dead centre on
      // a mark was 12.5 board px from its edge against a 12.2 px radius, and
      // the hint path found nothing. The edge still breaks the tie between
      // two spans that share one ring cell at a notch.
      const toEdge = Math.hypot(d.x - x, d.y - y);
      const toMark = Math.hypot(d.mark.x - x, d.mark.y - y);
      const score = Math.min(toEdge, toMark);
      if (score < bestScore || (score === bestScore && toEdge < bestEdge)) {
        bestScore = score;
        bestEdge = toEdge;
        best = d;
      }
    }
    return best ? { ...best.seg } : null;
  }

  /** Every sprite's look, from the state it is in. The only place that decides. */
  private restyle(duration: number): void {
    for (const { plank, mark, key } of this.drawn) {
      const built = this.built.has(key);
      const offered = this.placing && this.offered.has(key);
      const hovered = this.placing && key === this.hovered && (offered || built);

      // THE PLANK is the homestead, not the interface: it shows whenever the
      // span is built, walling or not, and never before. Under the pointer it
      // goes gold — the tap would lift it, and a highlight that only ever
      // meant "build" would leave the one reversible gesture unsignposted.
      plank.visible = built;
      plank.alpha = built ? 1 : 0;
      plank.tint = built && hovered ? HOVER_TINT : 0xffffff;

      // THE TARGET exists only while walling, and never under a built span —
      // the plank already says that edge is taken, and a blue diamond beside
      // it would read as "free" on the one edge that is not.
      const alpha = !this.placing || built ? 0
        : hovered ? HOVER_ALPHA
          : offered ? OFFER_ALPHA : 0;
      mark.tint = hovered ? HOVER_TINT : OFFER_TINT;
      // `visible` as well as alpha: a diamond left in the tree at alpha 0 is
      // still composited every frame, and there are a few dozen of these.
      mark.visible = alpha > 0;
      gsap.killTweensOf(mark);
      if (duration <= 0) mark.alpha = alpha;
      else gsap.to(mark, { alpha, duration });
    }
  }

  destroy(): void {
    for (const { plank, mark } of this.drawn) {
      gsap.killTweensOf(mark);
      plank.destroy();
      mark.destroy();
    }
    this.drawn.length = 0;
  }
}
