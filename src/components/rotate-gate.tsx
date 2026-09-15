/**
 * The page a phone held upright gets instead of the game.
 *
 * Always in the markup, shown by CSS alone (see PORTRAIT_GATE_QUERY): a gate
 * decided in JavaScript would flash the portrait layout on first paint and
 * again on every rotation before the handler caught up. No state, no effect —
 * it renders on the server like the rest of the layout.
 */
export function RotateGate() {
  return (
    <div className="rr-rotate-gate" role="dialog" aria-modal="true" aria-labelledby="rr-rotate-title">
      <span className="rr-rotate-phone" aria-hidden />
      <p id="rr-rotate-title" className="rr-rotate-title">Turn your phone sideways</p>
      <p className="rr-rotate-sub">Rabbit Royale plays in landscape.</p>
    </div>
  );
}
