'use client';

/**
 * The player's sound settings, owned by this game.
 *
 * Inside the arcade the hub owns audio and pushes it in on `domin8:mute`
 * (see game/services/SoundManager). Rabbit Royale also runs STANDALONE — on the
 * Seeker it is the whole app, there is no hub around it — and in that case
 * nothing ever called `setGlobalAudio`, so the music simply never started. This
 * hook is the missing owner.
 *
 * It deliberately reuses the hub's storage keys and its shape (two independent
 * buses plus one level, mute kept separate from volume) so a player who set
 * their preference in the arcade finds the same setting here, and vice versa —
 * one key, one meaning, across the whole stack.
 *
 * The hub still wins when it is there: `domin8:mute` messages are honoured and
 * overwrite what is stored, because inside an iframe the hub's control bar is
 * the one the player is actually looking at.
 */
import { useCallback, useEffect, useState } from 'react';
import { setGlobalAudio, startAmbientMusic, ambientMusicPlaying } from '@/game/services/SoundManager';

/** The hub's own keys, shared on purpose — see the note above. */
const MUSIC_MUTED_KEY = 'domin8:music-muted';
const SFX_MUTED_KEY = 'domin8:sfx-muted';
const VOLUME_KEY = 'domin8:music-volume';

/** Full: the mix is already tuned quiet, so this is not "loud". */
const DEFAULT_VOLUME = 1;

export interface AudioSettings {
  musicMuted: boolean;
  sfxMuted: boolean;
  volume: number;
  toggleMusic(): void;
  toggleSfx(): void;
  setVolume(v: number): void;
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    // Private windows and blocked site data throw on access, not on read.
    return fallback;
  }
}

function readVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A preference that cannot be saved is still worth honouring this session.
  }
}

export function useAudioSettings(): AudioSettings {
  // Audio is ON by default: a game that opens silent looks broken, and the
  // player has a visible way to turn it off.
  const [musicMuted, setMusicMuted] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);

  // Read the stored preference AFTER mount: there is no localStorage during
  // SSR, and seeding state from it directly would make the server and the
  // first client render disagree.
  useEffect(() => {
    setMusicMuted(readBool(MUSIC_MUTED_KEY, false));
    // Seeded from the music key on first run, as in the hub: someone who had
    // everything muted before the buses were split stays fully muted.
    setSfxMuted(readBool(SFX_MUTED_KEY, readBool(MUSIC_MUTED_KEY, false)));
    setVolumeState(readVolume());
  }, []);

  // Push whatever we hold down into the game's audio engine.
  useEffect(() => {
    setGlobalAudio({ musicMuted, sfxMuted, musicVolume: volume });
  }, [musicMuted, sfxMuted, volume]);

  // Every browser refuses audio until the player has interacted with the page,
  // so the loop cannot simply be started on mount — it is armed here and takes
  // on the first tap or key, whichever comes first. Once it is playing the
  // listeners are done, which is why they remove themselves.
  useEffect(() => {
    if (musicMuted) return;
    // Try immediately: a soft navigation from another page in the app already
    // carries the interaction, and then there is nothing to wait for.
    startAmbientMusic();
    const go = () => {
      startAmbientMusic();
      // STAY ARMED until the loop is genuinely audible. `startAmbientMusic` is
      // asynchronous twice over — the track may still be loading, and the
      // browser may refuse the start outright — so the gesture that unlocks
      // audio is often not the one that gets a sound out. Tearing the
      // listeners down on the first tap regardless (what this did before) left
      // the game silent for the whole session. `ambientMusicPlaying()` reads
      // Howler's own play/playerror events rather than its optimistic
      // `playing()`, so it only says yes once a sound has actually started.
      if (!ambientMusicPlaying()) return;
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
    };
    window.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go);
    return () => {
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
    };
  }, [musicMuted]);

  // Inside the arcade the hub is the control the player can see, so it wins.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data as
        | { type?: string; muted?: boolean; musicMuted?: boolean; sfxMuted?: boolean; musicVolume?: number }
        | null;
      if (!d || d.type !== 'domin8:mute') return;
      // Legacy shape: a single `muted` means both buses.
      const music = d.musicMuted ?? d.muted;
      const sfx = d.sfxMuted ?? d.muted;
      if (typeof music === 'boolean') setMusicMuted(music);
      if (typeof sfx === 'boolean') setSfxMuted(sfx);
      if (typeof d.musicVolume === 'number') setVolumeState(d.musicVolume);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const toggleMusic = useCallback(() => {
    setMusicMuted((m) => {
      write(MUSIC_MUTED_KEY, m ? '0' : '1');
      return !m;
    });
  }, []);

  const toggleSfx = useCallback(() => {
    setSfxMuted((m) => {
      write(SFX_MUTED_KEY, m ? '0' : '1');
      return !m;
    });
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    write(VOLUME_KEY, String(clamped));
    setVolumeState(clamped);
  }, []);

  return { musicMuted, sfxMuted, volume, toggleMusic, toggleSfx, setVolume };
}
