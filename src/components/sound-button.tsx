'use client';

/**
 * The sound control, bottom-left on every screen.
 *
 * One tap mutes the music, which is the thing a player actually reaches for —
 * someone playing on a phone in public wants the sound off NOW, not after
 * finding a settings screen. The chevron beside it opens the rest (the SFX bus
 * and the volume), so the common case costs one tap and the rare case is still
 * reachable.
 *
 * BOTTOM-LEFT, LIFTED. It used to sit at `bottom: 10px`, flush in the corner —
 * which put it underneath two other things at once: the full-width GO FARM
 * button (whose 400px-wide box reaches the left edge on a phone and ends within
 * two pixels of the mute's own box), and, in development, Next's own dev-tools
 * indicator, which owns exactly that corner. The corner is contested, so this
 * control steps out of it: `--rr-sound-lift` clears the GO button's band, and
 * the whole cluster sits above it. See globals.css.
 *
 * DRAWN FROM THE KIT. Everything else on this screen is pixel art cut from
 * `@domin8/arcade-kit` — nine-slice buttons, nine-slice panels, the bitmap
 * face. This control was the exception: a rounded-rect `<button>` with an emoji
 * in it, over a panel of native checkboxes and a native range slider, which is
 * the same "web UI wearing a game's art" problem burrow-chrome.tsx was written
 * to fix. It now builds from the same three primitives as the burrow, wears the
 * burrow's soil palette, and its speaker glyph is a real 16x16 sprite on the
 * kit's own grid (tools/gen_sound_icon.py) rather than a font-dependent emoji
 * that renders differently on every platform.
 */
import { useEffect, useRef, useState } from 'react';
import { NineSliceButton, NineSlicePanel, BitmapText } from '@domin8/arcade-kit';
import { useAudioSettings } from '@/components/use-audio-settings';
import {
  UI_PIXEL, SOIL, PLANK, CHALK, CARROT, CARROT_DEEP, LAMP,
} from '@/components/burrow-chrome';

/** The two states of the speaker, on the kit's 16px button grid. */
const SPEAKER_ON = '/assets/ui/sound/speaker-on.webp';
const SPEAKER_OFF = '/assets/ui/sound/speaker-off.webp';

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
        <NineSlicePanel
          color={SOIL}
          scale={UI_PIXEL}
          className="rr-sound-panel"
          role="group"
          aria-label="Sound"
        >
          <div className="rr-sound-panel-inner">
            <SoundToggle label="Music" on={!musicMuted} onToggle={toggleMusic} />
            <SoundToggle label="Effects" on={!sfxMuted} onToggle={toggleSfx} />

            {/* The one setting that is not a yes/no. Kept as a real
                <input type="range"> — it is the one control a native element
                does better than a redrawn one (drag, arrow keys, screen
                readers, all for free) — but retinted to the burrow's palette
                so it stops arriving in system blue. */}
            <label className="rr-sound-row">
              <BitmapText scale={1.25} style={{ color: CHALK }}>Volume</BitmapText>
              <input
                className="rr-sound-range"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Volume"
              />
            </label>
          </div>
        </NineSlicePanel>
      )}

      <div className="rr-sound-cluster">
        <NineSliceButton
          color={musicMuted ? PLANK : CARROT}
          shadowColor={musicMuted ? undefined : CARROT_DEEP}
          scale={UI_PIXEL}
          height={`${UI_PIXEL * 20}px`}
          className="rr-sound-btn"
          onClick={toggleMusic}
          aria-label={musicMuted ? 'Unmute music' : 'Mute music'}
          aria-pressed={musicMuted}
          title={musicMuted ? 'Music off' : 'Music on'}
        >
          {/* Not a label: a sprite, so it never depends on which emoji font
              the device happens to ship. */}
          <img
            className="rr-sound-glyph"
            src={musicMuted ? SPEAKER_OFF : SPEAKER_ON}
            alt=""
            width={16 * UI_PIXEL}
            height={16 * UI_PIXEL}
            draggable={false}
          />
        </NineSliceButton>

        {/* The disclosure is secondary to the mute, so it is narrower and
            wears the soil face rather than the carrot one. */}
        <NineSliceButton
          color={PLANK}
          scale={UI_PIXEL}
          height={`${UI_PIXEL * 20}px`}
          textColor={LAMP}
          className="rr-sound-more"
          onClick={() => setOpen((v) => !v)}
          aria-label="Sound settings"
          aria-expanded={open}
        >
          {open ? 'v' : '^'}
        </NineSliceButton>
      </div>
    </div>
  );
}

/**
 * One bus, as a row: its name, and a button that says what it currently is.
 *
 * A checkbox was the wrong control here twice over — it arrives as a native
 * 13px square in the middle of pixel art, and "checked" is a weaker signal
 * than a button whose face reads ON or OFF in the game's own two colours.
 */
function SoundToggle({
  label, on, onToggle,
}: { label: string; on: boolean; onToggle(): void }) {
  return (
    <div className="rr-sound-row">
      <BitmapText scale={1.25} style={{ color: CHALK }}>{label}</BitmapText>
      <NineSliceButton
        color={on ? CARROT : PLANK}
        shadowColor={on ? CARROT_DEEP : undefined}
        textColor={on ? undefined : CHALK}
        scale={UI_PIXEL}
        labelPixel={`${UI_PIXEL}px`}
        pressed={!on}
        onClick={onToggle}
        role="switch"
        aria-checked={on}
        aria-label={label}
      >
        {on ? 'ON' : 'OFF'}
      </NineSliceButton>
    </div>
  );
}
