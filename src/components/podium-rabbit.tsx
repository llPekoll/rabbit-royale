/**
 * A player's rabbit on the season board's podium, crowned if they lead.
 *
 * One still frame, cropped from the sheet by CSS — no second asset and no
 * canvas, which is the point when three of these sit in a list that also
 * scrolls. The geometry is in `lib/game/podium.ts`, shared with the story that
 * tuned it.
 */
import { AVATAR_FRAME, avatarSrc } from '@/lib/game/avatars';
import { ART, CROWN_URL, CROWN_TILT, HEAD_DX, crownBox } from '@/lib/game/podium';

export interface PodiumRabbitProps {
  /** The avatar key from the server, or null for a player who never picked. */
  avatar: string | null | undefined;
  /** Sheet multiples — `LEAD_SIZE` for the leader, `PODIUM_SIZE` below them. */
  size: number;
  /** Wear the crown. The season's #1 only. */
  crowned?: boolean;
}

export function PodiumRabbit({ avatar, size, crowned = false }: PodiumRabbitProps) {
  const crown = crownBox(size);

  return (
    // A fixed-width cell for every podium row, bottom-aligned: the rabbits are
    // different heights and they have to stand on the same floor.
    <span
      style={{
        // The GRID track sizes this cell (`FACE_COL` in the row's
        // `gridTemplateColumns`), so the span just fills it.
        width: '100%',
        minWidth: 0,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        alignSelf: 'end',
        position: 'relative',
      }}
      aria-hidden
    >
      {crowned && (
        // Absolutely positioned so it overlaps the ears instead of making the
        // row taller — the row reserves its headroom with padding, from
        // `crownBox().rise`.
        <img
          src={CROWN_URL}
          alt=""
          // The slow glint the emoji crown had, kept — it is a thing being
          // watched. The class owns the `transform` (placement AND glint in one
          // declaration, see globals.css), so this style must not set one.
          className="rr-crown-worn"
          style={{
            position: 'absolute',
            // Sized as a share of the cell, so the crown follows the rabbit
            // down on a narrow panel instead of floating free of a head that
            // shrank underneath it.
            width: `min(${crown.w}px, ${((crown.w / (ART.w * size)) * 100).toFixed(1)}%)`,
            aspectRatio: `${crown.w} / ${crown.h}`,
            height: 'auto',
            // In percent of the cell, for the same reason: a pixel offset
            // measured against the full-size rabbit lifts the crown off a
            // shrunken one.
            bottom: `${(((ART.h * size - crown.bite) / (ART.h * size)) * 100).toFixed(1)}%`,
            // Centred on the HEAD, not on the cell — see `HEAD_DX`.
            left: `calc(50% + ${HEAD_DX * size}px)`,
            // The tilt reaches CSS as a variable rather than a transform, so
            // the keyframes can lean away from it and back.
            ['--rr-crown-worn-tilt' as string]: `${CROWN_TILT}deg`,
            imageRendering: 'pixelated',
          }}
        />
      )}
      <span
        style={{
          display: 'block',
          // Never wider than the cell. On a narrow panel `FACE_COL_CSS` gives
          // way, and a fixed-width rabbit inside it would simply hang out over
          // the name — `maxWidth` makes the art follow the column down instead.
          width: ART.w * size,
          maxWidth: '100%',
          aspectRatio: `${ART.w} / ${ART.h}`,
          height: 'auto',
          backgroundImage: `url('${avatarSrc(avatar)}')`,
          // The sheet is 8 frames wide, so it scales as a whole and the window
          // slides onto frame 0's rabbit.
          backgroundSize: `${AVATAR_FRAME * 8 * size}px auto`,
          backgroundPosition: `${-ART.x * size}px ${-ART.y * size}px`,
          imageRendering: 'pixelated',
        }}
      />
    </span>
  );
}
