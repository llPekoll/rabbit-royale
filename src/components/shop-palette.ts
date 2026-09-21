/**
 * THE SHED'S PALETTE — the colours the shop, its cards and the dialogs that
 * borrow its chrome (energy popup, install guide) all paint with.
 *
 * Its own module, because the stall's card (`stall-card.tsx`) needs these and
 * the shop panel (`shop-card.tsx`) needs the card: two files importing each
 * other is a cycle Vite tolerates until the day it does not. `shop-card.tsx`
 * re-exports every name here, so nothing that imported from it has to move.
 *
 * The same tokens `.rr-shop-modal` declares in globals.css, restated in TS
 * because the kit's buttons bake their fill and cannot read a CSS variable.
 */
import type { CSSProperties } from 'react';
import { PX, pxLabel } from './px';

export const SOIL = '#2a1810';
export const SOIL_DEEP = '#1d100a';
export const PLANK = '#4a2f1d';
export const PLANK_LIT = '#6b4526';
export const LAMP_INK = '#ffb238';
export const CHALK = '#f5e6d3';
export const COIN = '#7fd1ff';

/**
 * The dialogs' frame pixel — THE frame pixel, `PX`. It was chunkier here (4px,
 * 3 on a short screen) on the reasoning that a dialog is a bigger object; side
 * by side with the cards that read as a different material. One stroke at
 * every size now: see `PX`.
 */
export const DIALOG_PX = PX;

/**
 * The carrot price: the lamp-lit gradient it always was, top as the face and
 * foot as the bevel, brown ink. The money price: kept cold — the cyan it wore
 * as a rim and ink, on a dark coin-slate face the kit's outline can sit on.
 */
export const CARROT_BTN = { color: '#ffc45c', shadowColor: '#e8912a', textColor: '#3a1f08' } as const;
/**
 * A carrot price that cannot be paid: the lamp gone out, as a FACE colour.
 * The dead state used to be a grayscale filter over the whole button, and a
 * filter cannot spare a child, so the carrot beside the price went grey with
 * it (Paul, 2026-09-16: the carrot stays in colour, however small). The face
 * says "not now"; the carrot still says what it costs. `.rr-carrot-price`
 * turns the filter off in px-dialogs.css.
 */
export const CARROT_BTN_OFF = { color: '#6b5440', shadowColor: '#4a3828', textColor: '#d8c3ab' } as const;
export const COIN_BTN = { color: '#1f3a4a', shadowColor: '#10222e', textColor: COIN } as const;

/** A price label: the game's pixel face (the kit's bitmap one has no carrot). */
export const priceText: CSSProperties = { ...pxLabel, fontSize: 12, fontVariantNumeric: 'tabular-nums' };

/** `a` over `b` at `mix` — hex only, because the kit bakes its colours. */
export function mixHex(a: string, b: string, mix: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v * mix + y[i] * (1 - mix)).toString(16).padStart(2, '0')).join('')}`;
}
