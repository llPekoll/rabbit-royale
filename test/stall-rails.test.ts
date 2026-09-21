/**
 * THE CURRENCY SWITCH IS ALWAYS ON THE BOARD.
 *
 * It used to disappear whenever the deployment took no money — `tokens` empty,
 * so `StallRails` returned nothing. That reads as a correct guard and plays as
 * a broken shop: a player told the game takes USDC, SOL and SKR opens the
 * stall, finds no switch at all, and reports that the shop is broken. Which is
 * what happened (2026-09-21).
 *
 * So the rails are DRAWN even when they cannot be used, and the two halves of
 * that are what this file pins: every rail the build knows is offered, and a
 * rail the server did not list is inert — `disabled`, carrying its reason.
 * The second half is the one that matters. A rail that looks live, quotes a
 * price and then fails at signing is worse than no switch at all.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAY_TOKEN_IDS } from '../src/lib/pay/tokens';
import { DICTIONARIES } from '../src/i18n/dictionaries';
import { LOCALES } from '../src/i18n/locales';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const STALL = read('../src/components/stall-card.tsx');
const SHOP = read('../src/components/shop-card.tsx');
const CSS = read('../src/app/globals.css');

describe('the currency switch', () => {
  it('offers every rail the build knows, not just the live ones', () => {
    // The shop hands `offered` the closed list from pay/tokens, so a rail
    // added there shows up on the switch without touching this component.
    expect(SHOP).toMatch(/offered=\{PAY_TOKEN_IDS\}/);
    expect(PAY_TOKEN_IDS.length).toBeGreaterThan(1);
  });

  it('only vanishes when there is no money rail at all in the build', () => {
    // The original guard, kept — but on `offered`, not on `tokens`. Guarding
    // on `tokens` is precisely the bug: it hides the switch on a deployment
    // that simply has not been configured yet.
    expect(STALL).toMatch(/if \(offered\.length === 0\) return <span \/>;/);
    expect(STALL).not.toMatch(/if \(tokens\.length === 0\) return/);
  });

  it('marks a rail the server did not list as dead, with its reason', () => {
    // Live = carrots, or a token the SERVER listed. `offered` may be wider.
    expect(STALL).toMatch(/const live = carrots \|\| tokens\.includes\(r as PayTokenId\)/);
    // Three ways it must not be pressable, because `disabled` alone on a
    // custom button is only as good as the kit's forwarding of it.
    expect(STALL).toMatch(/onClick=\{\(\) => \{ if \(live\) onRail\(r\); \}\}/);
    expect(STALL).toMatch(/disabled=\{!live\}/);
    expect(STALL).toMatch(/aria-disabled=\{!live\}/);
    // And it must SAY why rather than just sitting there greyed.
    expect(STALL).toMatch(/title=\{live \? undefined : disabledNote\}/);
  });

  it('says WHICH of the two reasons is in force', () => {
    // The two look identical on screen and are fixed by opposite things: no
    // treasury is a deploy, no wallet is one click by the player. Telling a
    // signed-in player "not switched on yet" sends them to wait for something
    // that already happened, so the note picks on `usdcEnabled` — the server
    // fact — exactly as the strapline below the shelf does.
    expect(SHOP).toMatch(
      /disabledNote=\{shop && !shop\.usdcEnabled \? t\.shop\.cardsOff : t\.shop\.connectForCard\}/,
    );
  });

  it('gives the dead rails a reason every language can speak', () => {
    // Dictionary lines, not hardcoded sentences — the same rule the refusal
    // codes follow, and what stops a language shipping one of them missing.
    for (const loc of LOCALES) {
      const { cardsOff, connectForCard } = DICTIONARIES[loc].shop;
      expect(cardsOff, `${loc} is missing shop.cardsOff`).toBeTruthy();
      expect(connectForCard, `${loc} is missing shop.connectForCard`).toBeTruthy();
    }
  });

  it('dims a dead rail without recolouring the plank', () => {
    // `grayscale` turned the wooden button into a grey pebble — a different
    // object, not the same one asleep. Dim only, and not so far that the
    // label stops being readable: a switch you cannot read is not an offer.
    const rule = CSS.match(/\.rr-stall-rails \.rr-stall-rail\.off \{([^}]*)\}/);
    expect(rule, 'the .off rule is gone').toBeTruthy();
    expect(rule![1]).not.toMatch(/grayscale/);
    expect(rule![1]).toMatch(/cursor:\s*not-allowed/);
    const opacity = Number(rule![1].match(/opacity:\s*([\d.]+)/)?.[1]);
    expect(opacity).toBeGreaterThanOrEqual(0.5);
    expect(opacity).toBeLessThan(1);
  });
});
