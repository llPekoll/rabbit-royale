'use client';

import { WoodlandSurface as NineSlicePanel } from '@/components/woodland/runtime';

/**
 * The sound control: two squares at the right end of the top bar.
 *
 * One tap mutes the music, which is the thing a player actually reaches for —
 * someone playing on a phone in public wants the sound off NOW, not after
 * finding a settings screen. The arrow beside it opens the rest (the SFX bus
 * and the volume), so the common case costs one tap and the rare case is still
 * reachable.
 *
 * TOP-RIGHT, IN THE ROW. It spent its life moving round the bottom corners,
 * a cluster of its own shape lifted over whatever the floor held that week.
 * It is chrome, like the shop, the story and the season board, so it is now
 * built like them — `HubIconButton` squares at `--rr-icon` — and pinned to the
 * top bar's right end. It is the one piece of that row on EVERY screen, so it
 * owns the corner and the others line up to its left (`.rr-lb-launch`, and the
 * bar's reserve in page.tsx). The panel drops DOWN from it.
 *
 * The speaker is a real 16x16 sprite (tools/gen_sound_icon.py) and the arrow
 * is the kit's, rather than font-dependent glyphs.
 */
import { useEffect, useRef, useState } from 'react';
import { ARROW_URLS } from '@domin8/arcade-kit';
import { HubIconButton, hubIconArt } from './hub-icon-button';
import { InstallRow } from './install-guide';
import { PixelText as BitmapText } from './pixel-text';
import { WoodlandToggle } from '@/components/woodland';
import { useAudioSettings } from '@/components/use-audio-settings';
import { useT } from '@/i18n/provider';
import { UI_PIXEL, SOIL, CHALK } from '@/components/burrow-chrome';

/** The two states of the speaker, on the kit's 16px button grid. */
const SPEAKER_ON = '/assets/sound/speaker-on.webp';
const SPEAKER_OFF = '/assets/sound/speaker-off.webp';

export function SoundButton() {
  const t = useT();
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
      <div className="rr-sound-cluster">
        {/* Muted reads as pressed: the cap sinks and the speaker loses its
            waves, so the state is in the shape and not only in the sprite. */}
        <HubIconButton
          label={musicMuted ? t.sound.unmute : t.sound.mute}
          pressed={musicMuted}
          onClick={toggleMusic}
        >
          <img
            className="rr-sound-glyph"
            src={musicMuted ? SPEAKER_OFF : SPEAKER_ON}
            alt=""
            draggable={false}
            style={hubIconArt}
          />
        </HubIconButton>

        {/* Points the way the panel will go: down to open, up to fold it. */}
        <HubIconButton
          label={t.sound.settings}
          pressed={open}
          onClick={() => setOpen((v) => !v)}
        >
          <img
            src={open ? ARROW_URLS.up : ARROW_URLS.down}
            alt=""
            draggable={false}
            style={{ ...hubIconArt, height: 'clamp(16px, 5.5svh, 32px)' }}
          />
        </HubIconButton>
      </div>

      {open && (
        <NineSlicePanel
          color={SOIL}
          scale={UI_PIXEL}
          className="rr-sound-panel"
          role="group"
          aria-label={t.sound.group}
        >
          <div className="rr-sound-panel-inner">
            {/* The three sound settings are one group and read as a column:
                every control lines up in the same gutter at the right, so the
                eye finds one edge instead of four. */}
            <div className="rr-sound-settings">
              <WoodlandToggle label={t.sound.music} checked={!musicMuted} onChange={toggleMusic} />
              <WoodlandToggle label={t.sound.effects} checked={!sfxMuted} onChange={toggleSfx} />

              {/* The one setting that is not a yes/no. Kept as a real
                  <input type="range"> — it is the one control a native element
                  does better than a redrawn one (drag, arrow keys, screen
                  readers, all for free) — but retinted to the burrow's palette
                  so it stops arriving in system blue. */}
              <label className="rr-sound-row">
                <BitmapText scale={1.25} style={{ color: CHALK }}>{t.sound.volume}</BitmapText>
                <input
                  className="rr-sound-range"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  aria-label={t.sound.volume}
                />
              </label>
            </div>

            {/* The standing door to the installed app, where the browser has
                one. The panel is the game's settings in all but name — but
                this is a way OUT of it, not a sound setting, so it sits below
                the rule and carries less weight than the row it used to
                outshout. */}
            <InstallRow />
          </div>
        </NineSlicePanel>
      )}
    </div>
  );
}

