/**
 * The tile-island workbench.
 *
 * Not part of the game: a page for looking at what `src/game/island` produces
 * before anything is built on it. Change a seed, change the terrain tiers,
 * watch what the generator and the Tiny Swords sheets do together. The island
 * drawn here is drawn by the SAME code a game would use, so what shows up on
 * this page is evidence rather than an illustration.
 */
import { IslandWorkbench } from './IslandWorkbench';

export const metadata = {
  title: 'Island workbench',
};

export default function IslandPage() {
  return <IslandWorkbench />;
}
