/**
 * Every character the interface shows must exist in the pixel font.
 *
 * The kit's atlas covers printable ASCII 32-126 and nothing else, so a typographic
 * dash, a middot or a curly quote renders as a blank or as the wrong glyph — on
 * screen "Dig deeper — level 6" came out as "Dig deeper _ level 6". It is
 * invisible in review (the source looks right) and only shows up in a
 * screenshot, which is exactly why it is worth a test.
 *
 * `&middot;` and friends are fine: HTML entities are decoded by the browser to
 * the same characters, but writing them as entities makes the intent explicit
 * and keeps them out of this scan's way — so the rule is about RAW characters
 * in source strings.
 *
 * The scan covers `src/` AND `src/config/` prose tables. The lore codex put its
 * chapters in config/lore.ts rather than in the component that renders them,
 * which is the right place for a content table — and it walked straight past a
 * scan that only read components. Every em-dash in it shipped as a blank, and
 * only a screenshot caught it. Copy is copy wherever it is declared.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
// fileURLToPath, NOT url.pathname: on Windows the latter yields "/C:/…", a
// path readdirSync then resolves against the drive root and fails to find.
import { fileURLToPath } from 'node:url';

/**
 * Files whose strings reach the DOM.
 *
 * `.tsx` for components, and the HOOKS in the same folder: player-facing copy
 * migrated into them once the shop needed one message table for many failures,
 * and a scan that only read components let two bad glyphs through. Anything
 * under src/components renders, whatever its extension.
 */
function uiFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      uiFiles(path, out);
    } else if (
      /\.tsx$/.test(name)
      || (/\.ts$/.test(name) && /[\\/](?:components|config)[\\/]/.test(path))
    ) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Characters the kit's ASCII atlas cannot draw. Emoji are exempt: they are
 * rendered by the system font, not by the bitmap face.
 *
 * U+2212 MINUS SIGN is in the list because it is the one that actually got
 * shipped: it looks identical to a hyphen in an editor, so `-300` written with
 * it passed every review and rendered as a blank box beside the price.
 */
const UNSUPPORTED = /[‐-―‘’“”•·…×−←-⇿]/;

/**
 * The same characters written as HTML ENTITIES.
 *
 * The header of this file says entities are fine, and for a while they were —
 * the browser decodes them, so writing `&middot;` made the intent explicit and
 * kept the raw character out of this scan's way. But decoding is the problem:
 * `&mdash;` reaches the bitmap face as U+2014 and draws the same blank box the
 * raw character would. It shipped as a literal `_` in the raid HUD.
 *
 * `&middot;` and `&times;` are omitted: those two are already used widely in
 * this codebase and render acceptably in the fallback stack.
 */
const ENTITIES = /&(mdash|ndash|hellip|lsquo|rsquo|ldquo|rdquo|bull|minus);/;

describe('pixel font coverage', () => {
  const root = fileURLToPath(new URL('../src', import.meta.url));

  it('uses no character the bitmap face cannot draw', () => {
    const offenders: string[] = [];

    for (const file of uiFiles(root)) {
      // `\r?\n`, not `\n`: on a CRLF checkout every line would keep a trailing
      // carriage return, and `\r` is a line terminator — so the `//.*$` that
      // strips trailing comments below could never match, and every em dash in
      // a note beside a line of code got reported as player-facing copy.
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      let inComment = false;
      lines.forEach((line, i) => {
        // Comments are prose for humans and never reach the screen. That
        // includes the CONTINUATION lines of a JSX block comment, which start
        // with neither a marker nor a slash — so track whether we are inside one.
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) {
          inComment = /\/\*/.test(t) && !/\*\//.test(t);
          return;
        }
        if (inComment) {
          if (/\*\//.test(t)) inComment = false;
          return;
        }
        if (/\{\/\*/.test(t) && !/\*\/\}/.test(t)) { inComment = true; return; }
        // A TRAILING comment is prose too. `const SOIL = '#2a1810'; // earth —
        // packed` is a colour, not a string that reaches the screen, and
        // flagging its em dash sends someone to ASCII-ify a note nobody reads
        // on a device. Only the code before the `//` is scanned.
        //
        // Deliberately naive about `//` inside a string literal: a URL in
        // player-facing copy would have its tail skipped. That trade is fine —
        // this test exists to catch typographic glyphs in PROSE, and prose does
        // not contain URLs.
        const code = line.replace(/\/\/.*$/, '');
        const m = code.match(UNSUPPORTED) ?? code.match(ENTITIES);
        if (m) {
          offenders.push(`${file.replace(root, 'src')}:${i + 1}  ${JSON.stringify(m[0])}  ${t.slice(0, 60)}`);
        }
      });
    }

    expect(offenders, `Use ASCII or an HTML entity instead:\n${offenders.join('\n')}`)
      .toEqual([]);
  });
});
