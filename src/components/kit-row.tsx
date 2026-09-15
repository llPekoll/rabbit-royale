'use client';

/**
 * THE KIT: everything you are carrying, as one row of slots.
 *
 * WHY IT EXISTS. Six of the seven things the shop sells were invisible the
 * moment they were bought. A bomb, a lightning, a mirage and a shield went into
 * the bag and the burrow screen never mentioned them again — the only way to
 * learn you owned three bombs was to re-open the shop and read the shelf's
 * "3/20". That is the shop reporting on your inventory, which is backwards: the
 * shelf is for deciding what to buy, and the burrow is where you stand.
 *
 * WHAT IT IS NOT. It is not a second shop, and it is not an action bar. Exactly
 * one of these is spendable from the burrow — the shield, whose window the raid
 * resolver already reads — and it is the only one wired to a press. The other
 * four carried kinds act on SOMEBODY ELSE'S island, mid-run, so their home is
 * the raid screen and not this one; the row shows them because owning them is a
 * fact about you, and hiding a fact until its screen opens is what this replaces.
 *
 * TRAPS ARE IN THE ROW, AND THEY ARE THE EXCEPTION THAT PROVES IT. A trap is
 * also spent elsewhere (the BASE tile, which places them), so its slot is a
 * READOUT with no press. What it shows is the pair the shop tile could not:
 * held over placed, because "4 traps" means something completely different
 * depending on whether the ground is bare.
 *
 * ORDER IS DEFENCE FIRST. Shield, smoke, traps — the things that keep what you
 * have — then bomb, lightning, mirage, the things that take somebody else's.
 * The row is read left to right on the screen where you decide whether to go
 * out or dig in, so the defensive half comes first.
 *
 * THE BOTTLES ARE IN IT TOO, at the end. They were given their own corner for
 * a while, on the reasoning that pouring water on your vegetables is a
 * different errand from raiding. It is — but splitting them across two corners
 * of the same floor meant a player checking "what am I carrying" had to look in
 * two places, and the second row was two lonely squares that read as a stray
 * control rather than as kit. One row answers the question once.
 *
 * ORDER CARRIES THE SPLIT INSTEAD: defence, then offence, then the garden. It
 * is the same left-to-right reading, and it costs no screen furniture.
 */
import type { CSSProperties } from 'react';
import { ItemSlot } from './item-slot';
import { ITEM_META } from './item-meta';
import type { ItemKind } from './use-shop';

/** Hours and minutes, the shortest form that is still true. */
function shortWait(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

/** One garden bottle's two facts, as `gardenBoostView` reports them. */
export interface BoostState {
  held: number;
  /** Milliseconds of window still running, or null when none is. */
  activeMs: number | null;
}

export interface KitRowProps {
  /** What the bag holds, by kind. Missing kinds read as zero. */
  held: Partial<Record<ItemKind, number>>;
  /** Milliseconds of shield still standing, or null when raids can land. */
  shieldMs: number | null;
  /** Whole days of smoke still banked. */
  smokeDays: number;
  /** Traps buried right now, and the ceiling — the slot shows both. */
  trapsPlaced?: number;
  trapsMaxPlaced?: number;
  /** Raise a shield from the bag. Omitted, the slot is a readout. */
  onShield?(): void;
  /** The garden bottles, at the end of the row. */
  water?: BoostState;
  fertiliser?: BoostState;
  /** Pour one on the garden. Omitted, the two bottles are readouts. */
  onPour?(kind: 'water' | 'fertiliser'): void;
  /** A request is in flight; nothing may be pressed twice. */
  pending?: boolean;
}

/**
 * The order the row reads in: defence, offence, then the garden. See the header.
 *
 * The bottles are not `ItemKind`s to this list — they are two extra slots
 * appended after it, because what they report is a WINDOW as well as a count
 * and `KitSlot`'s per-kind reading does not cover that. See `BOTTLE`.
 */
const ORDER: ItemKind[] = ['shield', 'smoke', 'trap', 'bomb', 'lightning', 'mirage'];

export function KitRow({
  held, shieldMs, smokeDays, trapsPlaced, trapsMaxPlaced, onShield,
  water, fertiliser, onPour, pending,
}: KitRowProps) {
  return (
    <div className="rr-kit-row" style={row} role="group" aria-label="What you are carrying">
      {ORDER.map((kind) => (
        <KitSlot
          key={kind}
          kind={kind}
          held={held[kind] ?? 0}
          shieldMs={shieldMs}
          smokeDays={smokeDays}
          trapsPlaced={trapsPlaced}
          trapsMaxPlaced={trapsMaxPlaced}
          onShield={onShield}
          pending={pending}
        />
      ))}
      {/* THE GARDEN HALF, pushed to the far edge.
          `marginLeft: auto` on the first bottle eats the row's slack, so the
          raid kit stays at the left margin and these two land at the right one.
          The gap between the groups is the whole floor's width, which is what
          separates them — see `.rr-kit-row` in globals.css. */}
      {([['water', water], ['fertiliser', fertiliser]] as const).map(([kind, state], i) => (
        <span key={kind} style={i === 0 ? bottleStart : undefined}>
          <BottleSlot kind={kind} state={state} onPour={onPour} pending={pending} />
        </span>
      ))}
    </div>
  );
}

/**
 * One slot, and the per-kind reading that makes the row worth having.
 *
 * Every kind answers "what does my corner say?" differently, and the
 * differences are the information: a count is a thing in your pocket, a
 * countdown is a thing already running, and for the shield they are BOTH true
 * at once — you can hold two while one is up. When they collide the RUNNING
 * state wins the corner, because a shield standing over your burrow is the more
 * urgent fact and the held count is one shop-tile away.
 */
function KitSlot({
  kind, held, shieldMs, smokeDays, trapsPlaced, trapsMaxPlaced, onShield, pending,
}: {
  kind: ItemKind;
  held: number;
  shieldMs: number | null;
  smokeDays: number;
  trapsPlaced?: number;
  trapsMaxPlaced?: number;
  onShield?(): void;
  pending?: boolean;
}) {
  const meta = ITEM_META[kind];

  if (kind === 'shield') {
    const live = shieldMs !== null;
    // Pressable only when there is one to raise AND none already standing:
    // raising a second over the first would spend it on time the burrow
    // already has. `RAID.ITEM_SHIELD_MS` is a fixed window, not a bank.
    const canRaise = held > 0 && !live && !!onShield && !pending;
    const said = live
      ? `Shield: holding, ${shortWait(shieldMs)} left. ${held} in the bag.`
      : held > 0
        ? `Shield: ${held} in the bag. Raise one. Raids bounce off while it holds.`
        : 'Shield: none. Buy one in the shop.';
    return (
      <ItemSlot
        art={meta.art}
        aspect={meta.aspect}
        fallback={meta.icon}
        chip={live ? shortWait(shieldMs) : held > 0 ? String(held) : null}
        live={live}
        label={said}
        onClick={onShield}
        disabled={!canRaise}
      />
    );
  }

  if (kind === 'smoke') {
    // Smoke is never HELD — it is an expiry instant, and buying it applies it.
    // So the slot has only two states, and "off" is the honest empty one.
    const live = smokeDays > 0;
    return (
      <ItemSlot
        fallback={meta.icon}
        chip={live ? `${smokeDays}d` : null}
        live={live}
        label={live
          ? `Smoke screen: up, ${smokeDays} day${smokeDays === 1 ? '' : 's'} left. Raiders cross your burrow blind.`
          : 'Smoke screen: off. Buy one in the shop to hide your numbers.'}
      />
    );
  }

  if (kind === 'trap') {
    // Held AND buried, because either number alone misleads: "4" with a bare
    // burrow reads as defended, and "0" with eight in the ground reads as
    // undefended. Placed is the one the corner carries — it is what a raider
    // would actually walk into — and `lit` keeps the slot bright while the
    // ground is defended even though nothing is pressable here.
    const placed = trapsPlaced ?? 0;
    const max = trapsMaxPlaced ?? 0;
    return (
      <ItemSlot
        fallback={meta.icon}
        chip={placed > 0 ? `${placed}` : held > 0 ? String(held) : null}
        lit={placed > 0}
        label={`Traps: ${placed}${max ? ` of ${max}` : ''} in the ground, ${held} in the shed. Bury them from BASE.`}
      />
    );
  }

  // Bomb, lightning, mirage — carried, and spent on somebody else's island
  // rather than here. A readout: the row says you have them, the raid screen
  // is where they are thrown.
  return (
    <ItemSlot
      art={meta.art}
      aspect={meta.aspect}
      fallback={meta.icon}
      chip={held > 0 ? String(held) : null}
      lit={held > 0}
      label={held > 0
        ? `${meta.name}: ${held} in the bag. ${meta.blurb}`
        : `${meta.name}: none. ${meta.blurb}`}
    />
  );
}

/** The garden bottles' own art — the chest's files, as `chest-prize` flies them. */
const BOTTLE = {
  water: { src: '/assets/ui/icons/water.webp', aspect: 33 / 32, name: 'Watering' },
  fertiliser: { src: '/assets/ui/icons/fertiliser.webp', aspect: 29 / 32, name: 'Fertiliser' },
} as const;

/**
 * ONE BOTTLE — a count and a window, which is why it is not a `KitSlot`.
 *
 * Pressable whenever there is one to pour, running window or not: a second
 * bottle EXTENDS the first (`extendGardenBoost`), which is the whole reason a
 * player banks them. When both facts are true the RUNNING one takes the corner,
 * since a window already ticking is the more urgent of the two.
 */
function BottleSlot({
  kind, state, onPour, pending,
}: {
  kind: 'water' | 'fertiliser';
  state?: BoostState;
  onPour?(kind: 'water' | 'fertiliser'): void;
  pending?: boolean;
}) {
  const art = BOTTLE[kind];
  const count = state?.held ?? 0;
  const activeMs = state?.activeMs ?? null;
  const live = activeMs !== null;
  const canPour = count > 0 && !!onPour && !pending;
  return (
    <ItemSlot
      art={art.src}
      aspect={art.aspect}
      chip={live ? shortWait(activeMs) : count > 0 ? String(count) : null}
      live={live}
      lit={count > 0}
      label={live
        ? `${art.name}: running, ${shortWait(activeMs)} left. ${count} in the bag.`
        : count > 0
          ? `${art.name}: ${count} in the bag. Pour one on the garden.`
          : `${art.name}: none. Found in chests.`}
      onClick={() => onPour?.(kind)}
      disabled={!canPour}
    />
  );
}

/**
 * What sets the garden half apart. The row is centred and only as wide as its
 * slots now (see `.rr-kit-row`), so the split is a wider gap before the first
 * bottle rather than the whole floor between two corners. A wrapper rather
 * than a style on `ItemSlot` itself, because the slot is shared with the
 * garden card and knows nothing about this row.
 *
 * `display: flex` so the wrapper hugs the square instead of adding a line box
 * under it, which would knock the two groups out of vertical alignment.
 */
const bottleStart: CSSProperties = {
  marginLeft: 14,
  display: 'flex',
  // The gap between the two bottles is the row's own; this wrapper only moves
  // the pair, so it must not introduce a second one.
  marginRight: 0,
};

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  /* The row is furniture on the floor, so WHERE it sits belongs to
     globals.css (`.rr-kit-row`) alongside the launcher tiles it stands on and
     the mute it shares the corner with — those three have to agree, and they
     cannot agree across an inline style. `--rr-slot` is declared there too,
     for the same reason: the column's reserved strip is measured against it.
     What stays here is only the row's own shape. */
  pointerEvents: 'none',
};
