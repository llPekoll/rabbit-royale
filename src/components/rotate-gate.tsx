'use client';

/**
 * The page a phone held upright gets instead of the game.
 *
 * Always in the markup, shown by CSS alone (see PORTRAIT_GATE_QUERY): a gate
 * decided in JavaScript would flash the portrait layout on first paint and
 * again on every rotation before the handler caught up. No state, no effect,
 * and still no logic — it reads the language and nothing else.
 *
 * A CLIENT COMPONENT only because of that: the words are the player's
 * language, which is known in the browser and not on the server (see
 * i18n/provider.tsx). It is inside <LocaleProvider/> in the root layout, so
 * the first paint is English and it settles a frame later — the same bargain
 * every other surface makes, and this one is behind a media query anyway.
 */
import { useT } from '@/i18n/provider';

export function RotateGate() {
  const t = useT();
  return (
    <div className="rr-rotate-gate" role="dialog" aria-modal="true" aria-labelledby="rr-rotate-title">
      <span className="rr-rotate-phone" aria-hidden />
      <p id="rr-rotate-title" className="rr-rotate-title">{t.chrome.rotateTitle}</p>
      <p className="rr-rotate-sub">{t.chrome.rotateBody}</p>
    </div>
  );
}
