/**
 * The block-island workbench.
 *
 * The isometric sibling of `/island`: the same generator and the same knobs,
 * drawn as stacked blocks from the isometric sandbox sheet, with ramps between
 * the tiers. Not part of the game — a page for judging the shapes before
 * anything is built on them.
 */
import { IsoWorldWorkbench } from './IsoWorldWorkbench';

export const metadata = {
  title: 'Iso world workbench',
};

export default function IsoWorldPage() {
  return <IsoWorldWorkbench />;
}
