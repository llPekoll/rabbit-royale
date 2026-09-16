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
 * A REAL <select>, NOT A DRAWN ONE. Everything else on this screen is pixel art
 * cut from the kit, and this deliberately is not: the native control brings the
 * platform's own language list behaviour — the wheel on iOS, the dialog on
 * Android, the keyboard on a desktop — and those are better than anything drawn
 * here, for the one control a player uses when they cannot read the screen. It
 * is retinted to the burrow's palette so it does not arrive as system chrome:
 * soil face, chalk ink, the kit's square corners, and the flag doing the real
 * work of saying what it is.
 *
 * THE FLAG IS THE LABEL, and the language's own name is beside it — "Français",
 * never "French". A picker that names languages in the language the player
 * cannot read is written for the developer.
 */
import { useLocale } from '@/i18n/provider';
import { LOCALE_LIST, isLocale } from '@/i18n/locales';

export function LanguageSelect({ className }: { className?: string }) {
  const { locale, setLocale, dict } = useLocale();

  return (
    <label className={className ? `rr-lang ${className}` : 'rr-lang'}>
      {/* The name of the control, for a screen reader only: the flag and the
          language name in the closed select already say it on screen. */}
      <span className="rr-sr-only">{dict.lang.label}</span>
      <select
        className="rr-lang-select"
        value={locale}
        onChange={(e) => {
          if (isLocale(e.target.value)) setLocale(e.target.value);
        }}
      >
        {LOCALE_LIST.map((l) => (
          /* The flag is inside the option text rather than beside the select,
             because a native option cannot hold markup — and it has to survive
             into the closed state, which only renders the option's own text. */
          <option key={l.code} value={l.code}>
            {l.flag} {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
