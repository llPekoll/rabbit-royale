/**
 * The gauge itself warns when little is left (Paul, 2026-09-21): the arc
 * that remains flushes on the bolt's own beat and clock, under a third of
 * the tank, quickening towards empty — and keeps warning, steadily, when
 * motion is reduced. Asserted against the sources: a rendering condition.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('the dial flushes with the beat', () => {
  it('lights the remaining arc on the same clock as the bolt', () => {
    const DIAL = read('../src/components/energy-dial.tsx');
    expect(DIAL).toMatch(/\{beatOn && \(\s*<span\s*className="rr-dial-flush"[\s\S]{0,300}maskImage: disc,\s*animationDuration: `\$\{beatMs\}ms`,/);
    expect(DIAL).toMatch(/className=\{beatOn \? 'rr-dial-beat' : undefined\}/);
  });

  it('is a brightness flush, never a move, and survives reduced motion', () => {
    const CSS = read('../src/app/globals.css');
    expect(CSS).toMatch(/@keyframes rr-dial-flush \{[^}]*filter: none;[\s\S]{0,200}brightness\(/);
    expect(CSS).not.toMatch(/@keyframes rr-dial-flush \{[^@]*(scale|transform)/);
    // Both alarms are re-declared inside the same reduced-motion block.
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*@keyframes rr-dial-beat[\s\S]{0,600}?@keyframes rr-dial-flush \{[\s\S]{0,200}?brightness\(/);
  });
});
