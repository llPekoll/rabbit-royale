/**
 * The block-island workbench.
 *
 * The isometric sibling of `/island`: the same generator and the same knobs,
 * drawn as stacked blocks from the isometric sandbox sheet, with ramps between
 * the tiers. Not part of the game — a page for judging the shapes before
 * anything is built on them.
 */
import { IsoWorldWorkbench } from './IsoWorldWorkbench';
import { ISO_STYLES, type IsoStyle } from '@/game/isoworld';

export const metadata = {
  title: 'Iso world workbench',
};

/**
 * `?style=smooth|pixel` and `?seed=...` pick the starting sheet and island,
 * so a look can be linked to directly.
 */
export default async function IsoWorldPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const style = typeof params.style === 'string' && (ISO_STYLES as string[]).includes(params.style)
    ? (params.style as IsoStyle)
    : undefined;
  const seed = typeof params.seed === 'string' && params.seed ? params.seed : undefined;
  return <IsoWorldWorkbench style={style} seed={seed} />;
}
