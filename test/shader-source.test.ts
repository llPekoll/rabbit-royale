/**
 * Three things that go wrong inside a GLSL string and nowhere else.
 *
 * All three are invisible in the picture when everything is switched on, and
 * all three cost real time to find by looking at the screen — which is the
 * definition of something worth pinning in a test.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../src/game/fx/', import.meta.url);

/** The fragment shader's source, as a plain string. */
function fragmentSource(file = 'WaterShader.ts'): string {
  const src = readFileSync(new URL(file, DIR), 'utf8');
  const open = src.indexOf('const fragment = `');
  return src.slice(open, src.indexOf('\n`;', open));
}

describe('shader source', () => {
  /**
   * A backtick inside the GLSL closes its own template literal, so TypeScript
   * parses the rest of the shader as code. The error points into the middle of
   * the GLSL and never at the quote that caused it.
   */
  it('keeps backticks out of every GLSL literal', () => {
    for (const file of readdirSync(DIR).filter((f) => f.endsWith('.ts'))) {
      const src = readFileSync(new URL(file, DIR), 'utf8');
      for (const name of ['vertex', 'fragment']) {
        const open = src.indexOf(`const ${name} = \``);
        if (open === -1) continue;
        const start = open + `const ${name} = \``.length;
        const end = src.indexOf('\n`;', start);
        expect(end, `${file}: unterminated ${name} literal`).toBeGreaterThan(start);
        expect(
          src.slice(start, end),
          `${file}: a backtick inside the ${name} shader closes its template literal`,
        ).not.toContain('`');
      }
    }
  });

  /**
   * `smoothstep(a, a, x)` is undefined in GLSL and this driver answers 1.0, so
   * an effect whose dial sits at zero draws at FULL strength instead of not at
   * all. The all-on picture looks right and every per-step story is wrong.
   */
  it('never feeds a step dial straight into smoothstep bounds', () => {
    const frag = fragmentSource();
    for (const line of frag.split('\n')) {
      const code = line.trim();
      if (code.startsWith('//') || !code.includes('smoothstep(')) continue;
      // A dial passed straight in is the bug; one wrapped in `max(dial, eps)`
      // — or used inside a block guarded on itself — is fine.
      const m = code.match(/smoothstep\(\s*(u[A-Z]\w*)\s*,/);
      if (!m) continue;
      const guarded = frag.includes(`if (${m[1]} > 0.0)`);
      expect(
        guarded,
        `${m[1]} is a smoothstep bound with no guard: at zero it paints at full strength. `
        + 'Wrap it as `max(dial, 0.001)` or put it inside `if (dial > 0.0)`.',
      ).toBe(true);
    }
  });

  /**
   * GLSL keeps a list of reserved words that look perfectly ordinary in
   * TypeScript — `half`, `sampler`, `input`, `filter`. Using one is a compile
   * error, the program falls back, and the effect renders BLACK with nothing
   * in the console the app surfaces.
   */
  it('avoids GLSL reserved words as local names', () => {
    const RESERVED = [
      'half', 'input', 'output', 'filter', 'sampler', 'buffer', 'shared',
      'active', 'asm', 'cast', 'common', 'partition', 'union', 'namespace',
    ];
    const frag = fragmentSource();
    for (const line of frag.split('\n')) {
      const code = line.trim();
      if (code.startsWith('//')) continue;
      const m = code.match(/^(?:float|vec2|vec3|vec4|int|bool)\s+(\w+)\s*[=;]/);
      if (!m) continue;
      expect(
        RESERVED,
        `"${m[1]}" is a GLSL reserved word: the shader will not compile`,
      ).not.toContain(m[1]);
    }
  });

  /**
   * GLSL has no block shadowing: a second `float nearShore = ...` in the same
   * main() is a compile error, the program falls back, and the whole effect
   * renders BLACK with no message anywhere in the app.
   */
  it('declares each local name once per shader', () => {
    const body = fragmentSource().slice(fragmentSource().indexOf('void main'));
    const seen = new Map<string, number>();
    for (const line of body.split('\n')) {
      const code = line.trim();
      if (code.startsWith('//')) continue;
      const m = code.match(/^(?:float|vec2|vec3|vec4|int)\s+(\w+)\s*=/);
      if (!m) continue;
      seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    expect(dupes, `redeclared in main(): ${dupes.join(', ')}`).toEqual([]);
  });
});

/**
 * A mesh whose quad is scaled inside the VERTEX SHADER reports 1x1 bounds.
 *
 * Pixi measures geometry on the CPU, so it never sees the multiply: the mesh
 * is a single pixel as far as culling and layout are concerned, and the effect
 * runs, animates and stays invisible with nothing in the console. The size has
 * to be in the buffer, where both the GPU and Pixi can read it.
 */
describe('mesh geometry', () => {
  it('sizes its quad in the vertex buffer, not in the vertex shader', () => {
    const src = readFileSync(new URL('SurfaceTexture.ts', DIR), 'utf8');
    const open = src.indexOf('const vertex = `');
    const vert = src.slice(open, src.indexOf('\n`;', open));
    expect(
      vert,
      'the vertex shader scales aPosition, so Pixi will measure the mesh as 1x1 '
      + 'and the plane renders as a dot. Put the size in the geometry instead.',
    ).not.toMatch(/aPosition\s*\*/);
  });
});
