/**
 * Le point d'entree du jeu — ce que `layout.tsx` faisait sous Next.
 *
 * Le layout de Next melait deux choses : des metadonnees (parties dans
 * index.html) et un arbre de composants (ici). L'ordre de cet arbre compte et
 * il est repris tel quel : <LocaleProvider/> au-dessus de tout, parce que
 * <PixelFont/> lui demande quelle face cette langue peut reellement utiliser.
 *
 * Pas de <React.StrictMode>. Pixi possede le canvas WebGL de facon imperative
 * et le double montage du mode strict le detruit : la premiere app demonte le
 * contexte, la seconde n'arrive plus a lier ses shaders sur un contexte mort.
 * C'etait `reactStrictMode: false` dans next.config.ts, pour cette raison
 * exacte.
 */
import { createRoot } from 'react-dom/client';

import { PixelFont } from '@/components/pixel-font';
import { RotateGate } from '@/components/rotate-gate';
import { FullscreenOnTap } from '@/components/fullscreen-on-tap';
import { InstallGuideHost } from '@/components/install-guide';
import { LocaleProvider } from '@/i18n/provider';
import Game from '@/app/page';

import '@/app/globals.css';
// Le deploiement du chrome pixel, un fichier par groupe de surfaces pour que
// chacun se restyle sans toucher aux autres — apres globals.css, pour gagner a
// specificite egale. Voir src/components/px.tsx.
import '@/app/px-top-floor.css';
import '@/app/px-dialogs.css';
import '@/app/px-raid.css';
import '@/components/woodland/runtime.css';

const hote = document.getElementById('root');
if (!hote) throw new Error('#root est absent de index.html');

createRoot(hote).render(
  <LocaleProvider>
    <PixelFont />
    <Game />
    <RotateGate />
    <FullscreenOnTap />
    {/* Les etapes d'installation et le service worker — install-guide.tsx. */}
    <InstallGuideHost />
  </LocaleProvider>,
);
