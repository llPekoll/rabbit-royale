/**
 * The music has to survive the autoplay gate.
 *
 * The game booted silent, and the cause was a lie Howler tells by design:
 * `playing()` is `!sound._paused`, and a `play()` issued before the track has
 * loaded is QUEUED with an id that is already un-paused. So the guard asking
 * "is it playing?" got `true` while nothing was audible, the browser then
 * refused the queued start (`playerror`), and the arming listeners in
 * use-audio-settings removed themselves believing the loop was up. Nothing ever
 * tried again.
 *
 * These tests pin the distinction that fixes it: `ambientMusicPlaying()` must
 * answer NO until a real `play` event has fired, and must go back to NO when
 * the autoplay gate refuses — that being the signal the caller needs in order
 * to stay armed for the next gesture.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A Howl stand-in with the two behaviours that matter: the optimistic
 *  `playing()` and the play/playerror events the real one emits. */
class FakeHowl {
  static last: FakeHowl | null = null;
  private handlers: Record<string, Array<() => void>> = {};
  /** Mirrors Howler: a queued (not yet loaded) play still reads as playing. */
  private optimistic = false;
  playCalls = 0;

  constructor(_opts: unknown) { FakeHowl.last = this; }
  on(evt: string, fn: () => void) { (this.handlers[evt] ??= []).push(fn); }
  emit(evt: string) { for (const fn of this.handlers[evt] ?? []) fn(); }
  play(_id?: number) { this.playCalls++; this.optimistic = true; return 1; }
  playing() { return this.optimistic; }
  pause() { this.optimistic = false; }
  stop() { this.optimistic = false; }
  unload() {}
  volume(_v?: number, _id?: number) {}
  /** The gate says no: Howler resets the sound and reports the error. */
  refuse() { this.optimistic = false; this.emit('playerror'); }
  /** The browser let it through. */
  succeed() { this.emit('play'); }
}

vi.mock('howler', () => ({ Howl: FakeHowl }));

const load = async () => {
  vi.resetModules();
  return import('../src/game/services/SoundManager');
};

describe('ambient music vs the autoplay gate', () => {
  beforeEach(() => { FakeHowl.last = null; });

  it('does not claim to be playing on a merely queued start', async () => {
    const { startAmbientMusic, ambientMusicPlaying } = await load();
    startAmbientMusic();
    // Howler's own playing() is already true here — that is the trap.
    expect(FakeHowl.last!.playing()).toBe(true);
    // Ours must not be fooled: no 'play' event has fired.
    expect(ambientMusicPlaying()).toBe(false);
  });

  it('reports playing only after a real play event', async () => {
    const { startAmbientMusic, ambientMusicPlaying } = await load();
    startAmbientMusic();
    FakeHowl.last!.succeed();
    expect(ambientMusicPlaying()).toBe(true);
  });

  it('goes back to not-playing when the gate refuses', async () => {
    const { startAmbientMusic, ambientMusicPlaying } = await load();
    startAmbientMusic();
    FakeHowl.last!.refuse();
    expect(ambientMusicPlaying()).toBe(false);
  });

  it('retries on the next gesture after a refusal', async () => {
    const { startAmbientMusic } = await load();
    startAmbientMusic();          // on mount: blocked
    const howl = FakeHowl.last!;
    howl.refuse();
    const before = howl.playCalls;
    startAmbientMusic();          // the player taps
    expect(howl.playCalls).toBe(before + 1);
  });

  it('does not stack a second loop once one is truly playing', async () => {
    const { startAmbientMusic } = await load();
    startAmbientMusic();
    const howl = FakeHowl.last!;
    howl.succeed();
    const before = howl.playCalls;
    startAmbientMusic();
    startAmbientMusic();
    expect(howl.playCalls).toBe(before);
  });

  it('stays silent while music is muted', async () => {
    const { setGlobalAudio, startAmbientMusic, ambientMusicPlaying } = await load();
    setGlobalAudio({ musicMuted: true, sfxMuted: false });
    startAmbientMusic();
    // Muted: nothing was even constructed-and-played through the gate.
    expect(ambientMusicPlaying()).toBe(false);
  });
});
