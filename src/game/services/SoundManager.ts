import { Howl } from 'howler';
import * as Keys from '@/config/assetKeys';
import { INSERT_COIN_SFX_URL } from '@domin8/arcade-kit/sfx';

/**
 * Module-level mute state. The hub's global MUSIC + SFX toggles are the single
 * source of truth (pushed via `domin8:mute` `{muted, musicMuted, sfxMuted}`);
 * the game has no in-game toggle. Audio defaults ON. Kept at module scope (not
 * per-instance) so the React canvas mount can flip it via `setGlobalAudio()`
 * without holding a reference to the live SoundManager — and so the state
 * survives across the SoundManager instances a scene might create. Not
 * persisted: the hub owns it.
 *
 * Two independent buses (2026-07-10, split from one flag): `musicMuted` gates
 * the looping/sting tracks (MUSIC_MAP), `sfxMuted` the one-shots (SOUND_MAP).
 * NOTE: no more `Howler.mute()` — that's a global output kill, which can't
 * express one bus staying live.
 */
let musicMuted = false;
let sfxMuted = false;
/** The player's MUSIC LEVEL (0..1), pushed by the hub as `musicVolume` on the
 *  same `domin8:mute` message. It SCALES the per-track volume rather than
 *  replacing it, so the island loop stays quieter than the victory fanfare at
 *  every setting. 1 until told otherwise — the behaviour before the field. */
let musicLevel = 1;
/** The player's SFX LEVEL (0..1) — the SAME global volume as `musicLevel`,
 *  wired to the one-shots too so one meter governs ALL the game's audio. Scales
 *  each SFX's own mix at play time; 1 = the behaviour before the field. */
let sfxLevel = 1;
// Live SoundManager instances, so a music toggle can pause/resume their
// looping track immediately (a paused loop must actually resume on unmute; a
// one-shot sting simply isn't started while its bus is muted).
const instances = new Set<SoundManager>();

/** Apply the hub's audio state to the game. */
export function setGlobalAudio(next: { musicMuted: boolean; sfxMuted: boolean; musicVolume?: number }): void {
  musicMuted = next.musicMuted;
  sfxMuted = next.sfxMuted;
  if (typeof next.musicVolume === 'number' && next.musicVolume >= 0 && next.musicVolume <= 1) {
    // One global level feeds both buses (music track + one-shots).
    musicLevel = next.musicVolume;
    sfxLevel = next.musicVolume;
    // Live: a level change must be audible on the track that is playing, not
    // only on the next one. (One-shots read sfxLevel at play time.)
    for (const inst of instances) inst.applyMusicLevel(musicLevel);
  }
  // Pause/resume the looping music so it doesn't advance silently while
  // muted and resumes cleanly when music comes back on. SFX need no sweep —
  // they're short one-shots gated at play time.
  for (const inst of instances) inst.applyMusicMuted(next.musicMuted);
}

export function isGloballyMuted(): boolean {
  return musicMuted && sfxMuted;
}

/** The SFX bus, for DOM chrome that plays its own one-shots outside the Pixi
 *  game (the season pass' chest ceremony). Reads the same module state the
 *  hub pushes in via `setGlobalAudio`, so there is one answer for the whole
 *  app; `false` before the game has mounted, which is the correct default. */
export function isSfxMuted(): boolean {
  return sfxMuted;
}

const SOUND_MAP: Record<string, { src: string; volume: number; format?: string[] }> = {
  // The shared arcade "insert coin" chirp from the kit — every game plays it
  // when a bet is committed. Ships as a data: URL, so Howler needs the
  // explicit format hint (no file extension to sniff).
  [Keys.SFX_INSERT_COIN]: { src: INSERT_COIN_SFX_URL, volume: 0.4, format: ['mp3'] },
  [Keys.SFX_HOP]: { src: '/assets/sfx/Jump.mp3', volume: 0.3 },
  [Keys.SFX_STEP]: { src: '/assets/sfx/04_step_grass_1.mp3', volume: 0.2 },
  [Keys.SFX_COIN]: { src: '/assets/sfx/coin.mp3', volume: 0.4 },
  [Keys.SFX_COIN_START]: { src: '/assets/sfx/events/coin_start.mp3', volume: 0.5 },
  [Keys.SFX_CHIME]: { src: '/assets/sfx/8_bit_chime_positive.mp3', volume: 0.5 },
  [Keys.SFX_CHIME_QUICK]: { src: '/assets/sfx/8_bit_chime_quick.mp3', volume: 0.4 },
  // Kept low: the death reveal fires one per revealed mine (≈10 overlapping
  // instances in a cascade), so the per-instance volume must stay quiet.
  [Keys.SFX_EXPLOSION]: { src: '/assets/sfx/explosion_small.mp3', volume: 0.15 },
  [Keys.SFX_DIE]: { src: '/assets/sfx/die.mp3', volume: 0.5 },
  [Keys.SFX_MATCH]: { src: '/assets/sfx/match_synth_1.mp3', volume: 0.5 },
};

/** The music bed's own place in the mix, before the player's level scales it. */
const MUSIC_MIX = 0.3;

const MUSIC_MAP: Record<string, { src: string; loop: boolean }> = {
  [Keys.MUSIC_ISLAND]: { src: '/assets/music/Mossy Keypath Loop.mp3', loop: true },
  [Keys.MUSIC_GAMEOVER]: { src: '/assets/music/Fallen Knight Chime.mp3', loop: false },
  [Keys.MUSIC_VICTORY]: { src: '/assets/music/Crown Chest Fanfare.mp3', loop: false },
};

export class SoundManager {
  private sounds = new Map<string, Howl>();
  private music: Howl | null = null;
  private musicKey: string | null = null;
  /** Playback id of our one live music instance. Howler's play() WITHOUT an id
   *  always spawns a NEW playback, so pause/resume must target this id — the
   *  id-less resume in applyMusicMuted was stacking a fresh island loop on
   *  every hub mute message (each MUSIC/SFX toggle added another copy). */
  private musicId: number | null = null;

  constructor() {
    // Pre-load SFX
    for (const [key, { src, volume, format }] of Object.entries(SOUND_MAP)) {
      this.sounds.set(key, new Howl({ src: [src], volume, ...(format ? { format } : {}) }));
    }
    instances.add(this);
    // No mute sync needed here: both buses gate at play time against the
    // module-level flags, which the React listener keeps current.
  }

  private playSfx(key: string): void {
    // One-shots gate at play time on the SFX bus.
    if (sfxMuted) return;
    const h = this.sounds.get(key);
    if (!h) return;
    const id = h.play();
    // Scale this shot by the global level, on top of its own mix. At level 1
    // this is the sound's base volume — unchanged from before the field.
    const base = SOUND_MAP[key]?.volume ?? 1;
    h.volume(base * sfxLevel, id);
  }

  /** Pause our looping music on music-mute; resume it on unmute. Called by
   *  setGlobalAudio() for every live instance. */
  /** Re-apply the level to the live track. */
  applyMusicLevel(level: number): void {
    this.music?.volume(MUSIC_MIX * level);
  }

  applyMusicMuted(next: boolean): void {
    if (!this.music) return;
    if (next) {
      this.music.pause();
    } else if (this.musicId === null) {
      // Track was created while music was muted and never started.
      this.musicId = this.music.play();
    } else if (!this.music.playing(this.musicId)) {
      // Resume OUR paused instance; a redundant unmute (hub re-sends the full
      // state on every toggle) while it's already playing is a no-op.
      this.music.play(this.musicId);
    }
  }

  playHop(): void { this.playSfx(Keys.SFX_HOP); }
  playStep(): void { this.playSfx(Keys.SFX_STEP); }
  playCoin(): void { this.playSfx(Keys.SFX_COIN); }
  playChime(): void { this.playSfx(Keys.SFX_CHIME); }
  playChimeQuick(): void { this.playSfx(Keys.SFX_CHIME_QUICK); }
  playExplosion(): void { this.playSfx(Keys.SFX_EXPLOSION); }
  playDie(): void { this.playSfx(Keys.SFX_DIE); }
  playMatch(): void { this.playSfx(Keys.SFX_MATCH); }
  playCoinStart(): void { this.playSfx(Keys.SFX_COIN_START); }
  playInsertCoin(): void { this.playSfx(Keys.SFX_INSERT_COIN); }

  startMusic(key: string = Keys.MUSIC_ISLAND): void {
    if (this.musicKey === key && this.music?.playing()) return;
    this.stopMusic();
    const cfg = MUSIC_MAP[key];
    if (!cfg) return;
    this.music = new Howl({ src: [cfg.src], loop: cfg.loop, volume: MUSIC_MIX * musicLevel });
    // Music starts only while the MUSIC bus is on; the loop then survives in
    // the Howl so applyMusicMuted() can resume it on unmute. A one-shot
    // (non-loop) sting is simply not started while muted — nothing to resume.
    if (!musicMuted) this.musicId = this.music.play();
    this.musicKey = key;
  }

  stopMusic(): void {
    if (this.music) {
      this.music.stop();
      this.music.unload();
      this.music = null;
      this.musicKey = null;
      this.musicId = null;
    }
  }
}
