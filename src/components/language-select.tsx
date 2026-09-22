'use client';

/**
 * THE LANGUAGE PICKER, on the doorstep.
 *
 * It belongs on the sign-in screen and only there. Someone who cannot read the
 * interface has to be able to fix that BEFORE they are asked to connect a
 * wallet, and once they have chosen, the choice is remembered (localStorage,
 * see i18n/provider.tsx) — so a picker in the running game would be a control
 * nobody touches twice, taking space from the loop.
 *
 * A DRAWN BUTTON AND A DIALOG, NOT A NATIVE <select>. This used to be a real
 * `<select>`, and the argument written here for it was that the platform's own
 * list — the wheel on iOS, the dialog on Android — beats anything drawn, for
 * the one control a player uses when they cannot read the screen. That was a
 * fair case, and it lost to a plainer one: the doorstep is a painting with two
 * carved planks on it, and a retinted system dropdown in the middle of them
 * read as a form that had wandered in. Paul, 2026-09-22: "forget the select to
 * select lang do a button with a modal with a radio".
 *
 * What the native control was actually buying is kept rather than dropped:
 * the closed button still shows the flag AND the language's own name, the
 * options are 44px tall, Escape and a tap outside both close, and the choice
 * is announced to a screen reader through `role="radio"` — see the group
 * below. What is lost is the platform wheel on a phone, which is the price of
 * the screen reading as one piece.
 *
 * THE FLAG IS THE LABEL, and the language's own name is beside it — "Français",
 * never "French". A picker that names languages in the language the player
 * cannot read is written for the developer.
 *
 * NOT THE BITMAP FACE, anywhere in here. The kit's atlas is ASCII 32..126
 * (see i18n/locales.ts), and three of the four names — Français, 中文,
 * Português — plus every flag emoji fall straight through it. The labels are
 * therefore `pxLabel` spans in the fallback face, never `PanelTitle`.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { WoodlandClose as CloseButton, WoodlandSurface as NineSlicePanel } from '@/components/woodland/runtime';
import { useLocale } from '@/i18n/provider';
import { LOCALE_LIST, LOCALE_META } from '@/i18n/locales';
import { PxButton, pxLabel } from './px';
import { CHALK, DIALOG_PX, PLANK, PLANK_LIT, SOIL } from './shop-card';

/** The dialog itself. Mounted only while open — see LanguageSelect. */
function LanguageModal({ onClose }: { onClose(): void }) {
  const { locale, setLocale, dict } = useLocale();

  // Escape closes. Copied rather than shared because every dialog in this
  // project does it this way (there is no useEscape hook to reach for), and a
  // one-off abstraction here would be the only one of its kind.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    // The scrim is the click target that closes; the panel stops the bubble so
    // a press inside it does not. Same pair as the Shed and the energy popup.
    <div className="rr-shop-scrim" onClick={onClose}>
      <NineSlicePanel
        color={SOIL}
        pixelScale={DIALOG_PX}
        className="rr-shop-modal rr-lang-modal rr-px-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={dict.lang.label}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rr-shop-top">
          {/* Plain text, NOT PanelTitle: "Language" is ASCII in English but
              "Langue"/"语言"/"Idioma" are what the other three dictionaries
              return, and 语言 has no glyph in the bitmap atlas. */}
          <h2><span style={{ ...pxLabel, fontSize: 14 }}>{dict.lang.label}</span></h2>
          <CloseButton className="rr-shop-x" onClick={onClose} aria-label={dict.chrome.close} />
        </header>
        {/* A REAL RADIO GROUP, in ARIA terms: exactly one of four is current,
            which is what `radio` means and what `aria-pressed` — the project's
            other selected-state idiom, used for avatars and toggles — does not
            say. It is the first radiogroup in the codebase; the kit has no
            radio to draw, so the control is the `tab` skin.

            THE GOLD FILL COMES FROM `.on`, NOT FROM `aria-checked`. That rule
            (woodland/runtime.css) matches `[data-pressed]`,
            `[aria-selected=true]` or `.on`, and the runtime only mirrors
            `aria-pressed` into `data-pressed` — so a radio marked solely with
            `aria-checked` would be correct to a screen reader and invisible on
            screen. Both are set: the class paints it, the ARIA states it. */}
        <div className="rr-lang-list" role="radiogroup" aria-label={dict.lang.label}>
          {LOCALE_LIST.map((l) => {
            const on = l.code === locale;
            return (
              <PxButton
                key={l.code}
                skin="tab"
                /* Requis par PxButtonProps, et jete par le skin woodland qui
                   peint la planche (runtime.tsx). Ce sont les couleurs que le
                   bevel rendrait si le skin sautait, d'ou la palette du
                   dialogue plutot qu'une valeur inventee. */
                color={on ? PLANK_LIT : PLANK}
                textColor={CHALK}
                className={`rr-lang-opt${on ? ' on nine-btn--pressed' : ''}`}
                role="radio"
                aria-checked={on}
                onClick={() => { setLocale(l.code); onClose(); }}
              >
                <span style={{ ...pxLabel, fontSize: 13 }}>{l.flag} {l.label}</span>
              </PxButton>
            );
          })}
        </div>
      </NineSlicePanel>
    </div>,
    document.body,
  );
}

export function LanguageSelect({ className }: { className?: string }) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const here = LOCALE_META[locale];

  return (
    <>
      {/* The closed control: the same ghost plank as the guest door above it,
          so the column reads as one stack rather than as two buttons and a
          form field. It says the CURRENT language, which is the only thing a
          closed picker has to say. */}
      <PxButton
        className={className ? `rr-btn ghost rr-lang-btn ${className}` : 'rr-btn ghost rr-lang-btn'}
        /* Les memes que la porte invitee juste au-dessus, pour que les deux
           planches soient la meme planche. Voir page.tsx. */
        color="#161b22"
        shadowColor="#0b0f14"
        textColor="#b1bac4"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{ height: 44 }}
      >
        <span style={pxLabel}>{here.flag} {here.label}</span>
      </PxButton>
      {open && <LanguageModal onClose={() => setOpen(false)} />}
    </>
  );
}
