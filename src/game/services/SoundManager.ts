import { Howl, Howler } from 'howler';
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

  // The app-level loop follows the same rules as a scene's.
  if (ambient) {
    ambient.volume(MUSIC_MIX * musicLevel);
    if (next.musicMuted) {
      if (ambient.playing()) ambient.pause();
    } else {
      resumeAmbient();
    }
  }
}

/**
 * Start or resume the app's loop — the ONE place `ambient.play()` is called.
 *
 * Reported from play: "the same song several times over each other". Every
 * caller used to issue its own `play()` when the loop was not yet audible,
 * and between a `play()` and Howler's 'play' event — the whole time the file
 * is still downloading — the loop is not audible. Each tap that armed the
 * autoplay gate, and each settings push on mount, queued another playback,
 * and they all started together once the file landed.
 *
 * So a play is PENDING from the call until the event answers it, and nothing
 * issues another while one is. A paused loop resumes its own id; a loop that
 * never truly started gets a fresh play. Muted, it does nothing at all.
 */
let ambientPending = false;

function resumeAmbient(): void {
  if (!ambient || musicMuted || ambientPending) return;
  if (sceneMusicPlaying()) return;
  if (ambientId !== null && ambient.playing(ambientId)) return;
  ambientPending = true;
  ambientId = ambient.play(ambientId ?? undefined);
}

/**
 * The app's own background loop, outside any Pixi scene.
 *
 * `IslandScene` starts the music when a run begins, which left every other
 * screen — the burrow, which is where a player spends most of their time —
 * silent. This is the same track on the same bus, owned by the app rather than
 * by a scene, so it keeps playing while the player moves between them.
 *
 * Kept at module scope alongside the buses it obeys: it must honour a mute
 * pushed from anywhere, and there is only ever one of it.
 */
let ambient: Howl | null = null;
let ambientId: number | null = null;
/**
 * Whether the loop has actually made a sound yet.
 *
 * NOT the same question as `ambient.playing()`, and that difference is why the
 * game booted silent. Howler answers `playing()` with `!sound._paused`, and a
 * `play()` issued before the track has loaded is QUEUED — it returns an id that
 * is already un-paused, so `playing()` says `true` while nothing is audible.
 * The autoplay gate then refuses the queued start, Howler emits `playerror`,
 * and the flag went unread: the arming listeners in use-audio-settings tore
 * themselves down on the first tap believing the music was up, and it never
 * played again for the rest of the session.
 *
 * So the truth is taken from the events, which fire only on the real thing.
 */
let ambientStarted = false;

/** Start (or resume) the app's background loop. Safe to call repeatedly. */
export function startAmbientMusic(): void {
  const cfg = MUSIC_MAP[Keys.MUSIC_ISLAND];
  if (!cfg) return;
  if (!ambient) {
    ambient = new Howl({ src: [cfg.src], loop: true, volume: MUSIC_MIX * musicLevel });
    // Only a real 'play' proves the browser let us through; 'playerror' is the
    // autoplay gate saying no, and puts us back to square one so the next tap
    // tries again rather than assuming the loop is already running.
    ambient.on('play', () => { ambientStarted = true; ambientPending = false; });
    ambient.on('playerror', () => { ambientStarted = false; ambientPending = false; });
  }
  // Browsers refuse audio until the player has interacted with the page; the
  // call simply does nothing then, and the next one (after a tap) succeeds.
  resumeAmbient();
}

/** Is the app loop genuinely audible right now? See `ambientStarted`. */
export function ambientMusicPlaying(): boolean {
  return !!ambient && ambientStarted && ambient.playing();
}

export function stopAmbientMusic(): void {
  if (!ambient) return;
  ambient.stop();
  ambient.unload();
  ambient = null;
  ambientId = null;
  ambientStarted = false;
  ambientPending = false;
}

/** Whether a scene's own music is playing, so the ambient loop can stand down. */
function sceneMusicPlaying(): boolean {
  for (const inst of instances) if (inst.hasMusic()) return true;
  return false;
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

/**
 * One-shots for the DOM chrome — the burrow column, the shop, the quest card.
 *
 * The React layer was entirely silent while a full SFX bus sat here unused:
 * only the island scene ever played anything. A shared instance, built on
 * first use (never at import, so server rendering never touches Howler),
 * gives every card the same bus, the same mute and the same level.
 */
export type UiSfx = 'chime' | 'chimeQuick' | 'match' | 'coin' | 'coinStart' | 'step' | 'die' | 'deny' | 'explosion';

let ui: SoundManager | null = null;

export function playUiSfx(kind: UiSfx): void {
  if (typeof window === 'undefined') return;
  ui ??= new SoundManager();
  switch (kind) {
    case 'chime': ui.playChime(); break;
    case 'chimeQuick': ui.playChimeQuick(); break;
    case 'match': ui.playMatch(); break;
    case 'coin': ui.playCoin(); break;
    case 'coinStart': ui.playCoinStart(); break;
    case 'step': ui.playStep(); break;
    case 'die': ui.playDie(); break;
    case 'deny': ui.playDeny(); break;
    case 'explosion': ui.playExplosion(); break;
  }
}

/**
 * VOLUMES ARE SET BY EAR-LEVEL, NOT BY NUMBER.
 *
 * What is heard is the FILE's level times the volume here, and the files are
 * nowhere near each other: measured with ffmpeg `volumedetect`, the samples'
 * mean levels run from -13.6 dB (coin) to -45.2 dB (step). With volumes that
 * looked alike (0.4, 0.5, 0.5) the coin, the golden sting and the death sound
 * came out 10 to 18 dB hotter than the chimes and the hop — and the coin plays
 * on every carrot, a third of all digs (Paul, 2026-09-17: "some sound FX are
 * WAY too loud"). Each volume below is chosen so that
 *
 *     file mean (dB) + 20*log10(volume)
 *
 * lands near -32 dB for an event, a little above for the rare ones that
 * should stand out (golden, death: -30), and well under for what repeats on
 * every step. Re-measure before adding a sample; do not copy a neighbour's number.
 *
 *   sample            file mean   volume   heard
 *   coin                -13.6      0.11    -32.8
 *   coin_start          -16.7      0.22    -29.9
 *   die                 -17.4      0.23    -30.2
 *   explosion_small     -15.5      0.15    -32.0
 *   chime_positive      -24.0      0.50    -30.0
 *   chime_quick         -25.2      0.40    -33.2
 *   Jump                -28.5      0.30    -39.0
 *   match_synth_1       -34.5      0.50    -40.5
 *   step_grass_1        -45.2      0.20    -59.2   (barely audible; untouched)
 */
const SOUND_MAP: Record<string, { src: string; volume: number; format?: string[] }> = {
  // The shared arcade "insert coin" chirp from the kit — every game plays it
  // when a bet is committed. Ships as a data: URL, so Howler needs the
  // explicit format hint (no file extension to sniff).
  [Keys.SFX_INSERT_COIN]: { src: INSERT_COIN_SFX_URL, volume: 0.4, format: ['mp3'] },
  [Keys.SFX_HOP]: { src: '/assets/sfx/Jump.mp3', volume: 0.3 },
  [Keys.SFX_STEP]: { src: '/assets/sfx/04_step_grass_1.mp3', volume: 0.2 },
  [Keys.SFX_COIN]: { src: '/assets/sfx/coin.mp3', volume: 0.11 },
  [Keys.SFX_COIN_START]: { src: '/assets/sfx/coin_start.mp3', volume: 0.22 },
  [Keys.SFX_CHIME]: { src: '/assets/sfx/8_bit_chime_positive.mp3', volume: 0.5 },
  [Keys.SFX_CHIME_QUICK]: { src: '/assets/sfx/8_bit_chime_quick.mp3', volume: 0.4 },
  // Kept low: the death reveal fires one per revealed mine (≈10 overlapping
  // instances in a cascade), so the per-instance volume must stay quiet.
  [Keys.SFX_EXPLOSION]: { src: '/assets/sfx/explosion_small.mp3', volume: 0.15 },
  [Keys.SFX_DIE]: { src: '/assets/sfx/die.mp3', volume: 0.23 },
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
    /**
     * The one-shots are DECLARED here and fetched on first play.
     *
     * Howler's default is `preload: true`, so building these Howls used to
     * fire nine MP3 requests the moment a scene was constructed — which is
     * inside boot, on the same connection as the tileset, and invisible to
     * the loading bar (it only tracks `loadAllAssets`). The bytes are small
     * (~53KB) but the REQUESTS are not free while the board is still loading.
     *
     * `preload: false` keeps the map and the lookup in `playSfx` exactly as
     * they were; Howler loads a sound on its first `play()`. The cost is that
     * the very first hop or coin may be silent if its file has not landed —
     * acceptable for a one-shot, and the same trade the electrocuted sheet
     * already makes.
     */
    for (const [key, { src, volume, format }] of Object.entries(SOUND_MAP)) {
      this.sounds.set(
        key,
        new Howl({ src: [src], volume, preload: false, ...(format ? { format } : {}) }),
      );
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
    // These Howls are built with `preload: false` (see the constructor), and
    // Howler does NOT load on play: its `play()` QUEUES the request when the
    // state is not 'loaded' and waits for a `load()` that, without this line,
    // nobody ever calls — the sound would stay silent for the whole session.
    // `load()` is a no-op once the state has left 'unloaded'.
    if (h.state() === 'unloaded') h.load();
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

  /**
   * "No." Two falling square-wave blips, drawn rather than loaded.
   *
   * There is no refusal in the sample set, and a refusal answered with silence
   * reads as a dropped tap — the one thing a refused press must never feel
   * like. Synthesised on Howler's own context so it rides the same master
   * gain, and gated on the SFX bus and level like every one-shot.
   */
  playDeny(): void {
    if (sfxMuted || sfxLevel <= 0) return;
    const ctx = Howler.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.setValueAtTime(155, t + 0.08);
    // A square wave at 0.07 sits near -23 dB RMS, a good 9 dB over the samples
    // (see SOUND_MAP), and a square is the harshest shape there is. 0.035 puts
    // the "no" level with the rest.
    const peak = Math.max(0.0002, 0.035 * sfxLevel);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    gain.gain.setValueAtTime(peak, t + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain);
    gain.connect(Howler.masterGain ?? ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  /**
   * The volcano, heard: the blast sample slowed to a growl, louder per stage.
   *
   * The warning stages only shook the ground, and a phone on a table does not
   * show a shake. Pitched down so it cannot be mistaken for a bomb — that
   * sound means the player just lost a heart, and this one means "hurry".
   */
  playRumble(stage: number): void {
    if (sfxMuted) return;
    const h = this.sounds.get(Keys.SFX_EXPLOSION);
    if (!h) return;
    const id = h.play();
    const base = SOUND_MAP[Keys.SFX_EXPLOSION]?.volume ?? 1;
    h.rate(0.5, id);
    // Louder per stage, but capped at about +7 dB over a bomb: at 1 + 0.8 * stage
    // the third warning was +10.6 dB, the loudest thing in the game by far.
    h.volume(base * sfxLevel * (1 + 0.4 * Math.max(1, Math.min(3, stage))), id);
  }

  /** Does this instance have a track of its own going? */
  hasMusic(): boolean {
    return !!this.music?.playing();
  }

  startMusic(key: string = Keys.MUSIC_ISLAND): void {
    if (this.musicKey === key && this.music?.playing()) return;
    this.stopMusic();
    // A scene's own track replaces the app's: two copies of the same loop,
    // started at different moments, is the worst sound in the game.
    if (ambient?.playing()) ambient.pause();
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
    // The scene is done; the app's own loop takes the room back.
    resumeAmbient();
  }
}
