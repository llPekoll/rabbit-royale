/**
 * Landscape only, on a phone.
 *
 * The rule lives in three places that must agree — a CSS media query that
 * shows the gate, the root layout that mounts it, and the Pixi resize that
 * stops laying the board out while it is up — and each can drift on its own
 * without anything on screen saying so until a phone is turned. Pinned
 * against the sources, like the juice test: what is being held is the wiring.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PORTRAIT_GATE_QUERY } from '../src/config/orientation';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const CSS = read('../src/app/globals.css');
const LAYOUT = read('../src/app/layout.tsx');
const APP = read('../src/game/Application.ts');

describe('a phone held upright is refused, not laid out', () => {
  it('is a phone rule: coarse pointer, portrait', () => {
    expect(PORTRAIT_GATE_QUERY).toBe('(orientation: portrait) and (pointer: coarse)');
  });

  it('shows the gate on exactly that query, and hides it otherwise', () => {
    expect(CSS).toMatch(/^\.rr-rotate-gate \{ display: none; \}$/m);
    const media = `@media ${PORTRAIT_GATE_QUERY} {`;
    const at = CSS.indexOf(media);
    expect(at, 'the CSS query must match PORTRAIT_GATE_QUERY verbatim').toBeGreaterThan(-1);
    const block = CSS.slice(at, CSS.indexOf('\n}', at));
    expect(block).toMatch(/\.rr-rotate-gate \{[\s\S]*display: flex;/);
    expect(block).toMatch(/body > :not\(\.rr-rotate-gate\) \{ visibility: hidden; \}/);
  });

  it('sits above every other layer', () => {
    const layers = [...CSS.matchAll(/z-index: *(\d+)/g)].map((m) => +m[1]);
    expect(Math.max(...layers)).toBe(10000);
    expect(layers.filter((z) => z === 10000)).toHaveLength(1);
  });

  it('is mounted on every page', () => {
    expect(LAYOUT).toMatch(/<RotateGate \/>/);
  });

  it('keeps the board in its landscape layout while the gate is up', () => {
    expect(APP).toMatch(/matchMedia\?\.\(PORTRAIT_GATE_QUERY\)/);
    expect(APP).toMatch(/if \(gated && laidOut\) return;/);
  });
});
