/**
 * The map drains to grey.
 *
 * Played when the local rabbit spends its last point of energy: the run is
 * over, and the world it was running across should stop looking like a place
 * that is still open to it. The recap already SAYS "Out of energy"; this is the
 * part a player sees without reading, and it is what turns the slumped rabbit
 * from one sprite among the tiles into the state of the whole screen.
 *
 * The MAP, not the interface — the filter goes on display objects the scene
 * hands over (its own container and the sea behind it), never on the stage.
 * The stage also carries the carrot wipe, and a grey shutter on the way home
 * would drag the ending into the next scene. The React HUD is DOM over the
 * canvas and keeps its colour by construction.
 */
import { ColorMatrixFilter, type Container } from 'pixi.js';
import gsap from 'gsap';

/** Rec. 709 luma: how bright each channel reads to the eye. */
const LUMA = [0.2126, 0.7152, 0.0722] as const;

/**
 * How dark the drained map sits. Grey, not black: the board stays legible
 * under the recap, because where the run ended is part of what it says.
 */
export const DRAIN_BRIGHTNESS = 0.7;

/** How long the colour takes to go. Longer than a hop, so it reads as a fade and not a cut. */
export const DRAIN_SECONDS = 0.9;

/**
 * The colour matrix at `t` of the way from full colour (0) to drained (1).
 *
 * A straight blend of the identity with a luma projection, dimmed by the same
 * share: halfway is half the saturation AND half the dimming, so the fade has
 * no moment where the map is grey but still at full brightness.
 */
export function drainMatrix(t: number, brightness = DRAIN_BRIGHTNESS): number[] {
  const k = 1 + (brightness - 1) * t;
  const m: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const identity = row === col ? 1 : 0;
      m.push((identity + (LUMA[col] - identity) * t) * k);
    }
    // No alpha contribution, no offset.
    m.push(0, 0);
  }
  // Alpha passes through: a drained sprite keeps its silhouette.
  m.push(0, 0, 0, 1, 0);
  return m;
}

export class Drain {
  private readonly filter = new ColorMatrixFilter();
  private readonly state = { t: 0 };
  private targets: Container[] = [];
  private tween: gsap.core.Tween | null = null;

  /** Whether the map is drained, or on its way there. */
  get active(): boolean {
    return this.targets.length > 0;
  }

  /**
   * Fade `targets` to grey. Once per ending: a second call while drained does
   * nothing, so a repeated server event cannot restart the fade from colour.
   */
  start(targets: Container[], seconds = DRAIN_SECONDS): void {
    if (this.active) return;
    this.targets = targets;
    // Appended, not assigned: whatever filters a target already carries stay.
    for (const c of targets) c.filters = [...(c.filters ?? []), this.filter];
    this.set(0);
    // Same rule as the embers: under reduced motion the change still happens,
    // it just does not travel.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.set(1);
      return;
    }
    this.tween = gsap.to(this.state, {
      t: 1,
      duration: seconds,
      ease: 'sine.out',
      onUpdate: () => this.set(this.state.t),
    });
  }

  /** Back to full colour at once — the scene is leaving, or a new island is starting. */
  clear(): void {
    this.tween?.kill();
    this.tween = null;
    for (const c of this.targets) {
      if (!c.destroyed) c.filters = (c.filters ?? []).filter((f) => f !== this.filter);
    }
    this.targets = [];
    this.state.t = 0;
  }

  destroy(): void {
    this.clear();
    this.filter.destroy();
  }

  private set(t: number): void {
    this.state.t = t;
    this.filter.matrix = drainMatrix(t) as ColorMatrixFilter['matrix'];
  }
}
