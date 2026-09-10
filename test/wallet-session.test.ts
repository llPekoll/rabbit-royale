/**
 * ONE wallet session, shared by everything that reads it.
 *
 * The bug: `useWalletLogin` was a plain hook, and it was called independently
 * by `page.tsx` and by `wallet-button.tsx`. A hook with `useState` gives each
 * caller its own state, so there were two sessions. Both restored from the same
 * localStorage token, which is why it looked correct — until someone signed
 * out. `logout()` cleared the BUTTON's copy (the chip flipped back to "Connect
 * wallet") while the page's copy still held a player, so the burrow, the carrot
 * counter and the leaderboard stayed on screen for a signed-out player.
 *
 * It is an easy mistake to make again: calling a hook twice looks completely
 * ordinary, and the failure only shows on logout, which is the path nobody
 * clicks while building a feature. So the shape is pinned here.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const HOOK = read('../src/components/use-wallet-login.tsx');
const PAGE = read('../src/app/page.tsx');
const BUTTON = read('../src/components/wallet-button.tsx');

describe('wallet session', () => {
  it('is held in a context, not created per caller', () => {
    // The state-owning hook is private; what callers import must be a READER.
    expect(HOOK).toMatch(/function useWalletSession\(/);
    expect(HOOK).not.toMatch(/export function useWalletSession\(/);
    expect(HOOK).toMatch(/createContext/);
    expect(HOOK).toMatch(/export function WalletSessionProvider/);
  });

  it('reads the context rather than owning state', () => {
    const reader = HOOK.slice(HOOK.indexOf('export function useWalletLogin'));
    expect(reader).toMatch(/useContext\(/);
    // The reader must not mint its own state — that is the whole bug.
    expect(reader).not.toMatch(/useState\(/);
  });

  it('refuses to hand back a private session when unmounted', () => {
    // Returning a fresh session here would silently restore the two-copy bug
    // instead of failing loudly at the wiring mistake that caused it.
    expect(HOOK).toMatch(/throw new Error\([^)]*WalletSessionProvider/);
  });

  it('mounts the provider above every consumer', () => {
    expect(PAGE).toMatch(/<WalletSessionProvider>/);
    // Both halves still read the session; they must now read the SAME one.
    expect(PAGE).toMatch(/useWalletLogin\(\)/);
    expect(BUTTON).toMatch(/useWalletLogin\(\)/);
  });

  it('clears player AND token on logout', () => {
    const logout = HOOK.slice(HOOK.indexOf('const logout ='));
    const body = logout.slice(0, logout.indexOf('}, []'));
    // A logout that drops the token but keeps the player (or the reverse) is
    // the same half-signed-out screen by another route.
    expect(body).toMatch(/removeItem\(TOKEN_KEY\)/);
    expect(body).toMatch(/setToken\(null\)/);
    expect(body).toMatch(/setPlayer\(null\)/);
  });

  it('puts the page back on the doorstep when the session ends', () => {
    // Clearing the session is only half of it. The page keeps state that is
    // NOT derived from the player -- which screen you are on, which drawers
    // are open -- and that state outlived the sign-out: logging out on the
    // island left the island's HUD and its arrow floating over the sign-in
    // screen, and a shop drawer left open reopened for whoever signed in next.
    const reset = PAGE.slice(PAGE.indexOf('if (player) return;'));
    const body = reset.slice(0, reset.indexOf('}, [player]);'));
    expect(body).toMatch(/setWhere\('burrow'\)/);
    expect(body).toMatch(/setCrossing\(false\)/);
    expect(body).toMatch(/setShopOpen\(false\)/);
    expect(body).toMatch(/setPickingTarget\(false\)/);
    expect(body).toMatch(/setLoreOpen\(false\)/);
    expect(body).toMatch(/setPlacing\(false\)/);
    // The burrow's own numbers are the previous player's. Left in place they
    // would flash on screen for the NEXT one before the fetch answers.
    expect(body).toMatch(/setBurrow\(null\)/);
    // The canvas is unmounted with the player, so a kept handle points at a
    // destroyed Pixi app and `ready` would let the chrome draw over nothing.
    expect(body).toMatch(/handles\.current = null/);
    expect(body).toMatch(/setReady\(false\)/);
  });
});
