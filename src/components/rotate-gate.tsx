'use client';

/**
 * The page a phone held upright gets instead of the game.
 *
 * Always in the markup, shown by CSS alone (see PORTRAIT_GATE_QUERY): a gate
 * decided in JavaScript would flash the portrait layout on first paint and
 * again on every rotation before the handler caught up. No state, no effect,
 * and still no logic — it reads the language and nothing else.
 *
 * It is mounted INSIDE `#root` like everything else (main.tsx), and the CSS
 * that hides the rest of the page hides `#root` with it — so the gate names
 * itself visible again, which a descendant of a hidden element may do. Under
 * Next it sat directly in <body/> and never needed to; the Vite entry moved
 * it and the portrait screen went blank until this line came back.
 *
 * Dressed as one of the game's dialogs: the codex's parchment in its leaf
 * frame (PxPanel), the panel title face every dialog wears, the ink and the
 * gold of the Woodland kit — not the HUD greys, which read as a web page
 * wrapped around a game. See src/components/px.tsx.
 *
 * A CLIENT COMPONENT only because of the words: they are the player's
 * language, which is known in the browser and not on the server (see
 * i18n/provider.tsx). It is inside <LocaleProvider/> in the root layout, so
 * the first paint is English and it settles a frame later — the same bargain
 * every other surface makes, and this one is behind a media query anyway.
 */
import { useT } from '@/i18n/provider';
import { PanelTitle } from './pixel-text';
import { PxPanel } from './px';
import { SOIL } from './shop-palette';

export function RotateGate() {
  const t = useT();
  return (
    <div className="rr-rotate-gate" role="dialog" aria-modal="true" aria-labelledby="rr-rotate-title">
      <PxPanel color={SOIL} className="rr-rotate-card rr-px-dialog">
        <span className="rr-rotate-phone" aria-hidden />
        <h2 id="rr-rotate-title" className="rr-rotate-title">
          <PanelTitle>{t.chrome.rotateTitle}</PanelTitle>
        </h2>
        <p className="rr-rotate-sub">{t.chrome.rotateBody}</p>
      </PxPanel>
    </div>
  );
}
