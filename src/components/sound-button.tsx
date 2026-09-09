'use client';

/**
 * The sound control, bottom-left on every screen.
 *
 * One tap mutes the music, which is the thing a player actually reaches for —
 * someone playing on a phone in public wants the sound off NOW, not after
 * finding a settings screen. Holding the same button opens the rest (the SFX
 * bus and the volume), so the common case costs one tap and the rare case is
 * still reachable.
 *
 * Bottom-LEFT because the bottom-centre is the one action (GO FARM) and the
 * top-right is the wallet: this is chrome, and chrome takes the corner nothing
 * else wanted.
 */
import { useEffect, useRef, useState } from 'react';
import { useAudioSettings } from '@/components/use-audio-settings';

export function SoundButton() {
  const { musicMuted, sfxMuted, volume, toggleMusic, toggleSfx, setVolume } = useAudioSettings();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // A panel with no way out but its own button is a trap on a touch screen.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="rr-sound" ref={root}>
      {open && (
        <div className="rr-sound-panel" role="group" aria-label="Sound">
          <label className="rr-sound-row">
            <span>Music</span>
            <input type="checkbox" checked={!musicMuted} onChange={toggleMusic} />
          </label>
          <label className="rr-sound-row">
            <span>Effects</span>
            <input type="checkbox" checked={!sfxMuted} onChange={toggleSfx} />
          </label>
          <label className="rr-sound-row">
            <span>Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      <button
        className="rr-sound-btn"
        onClick={toggleMusic}
        // The long-press equivalent for a mouse, and the way to the rest of
        // the settings on any device.
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        aria-label={musicMuted ? 'Unmute music' : 'Mute music'}
        aria-pressed={musicMuted}
        title={musicMuted ? 'Music off' : 'Music on'}
      >
        <span aria-hidden>{musicMuted ? '🔇' : '🔊'}</span>
      </button>

      <button
        className="rr-sound-more"
        onClick={() => setOpen((v) => !v)}
        aria-label="Sound settings"
        aria-expanded={open}
      >
        <span aria-hidden>^</span>
      </button>
    </div>
  );
}
