/**
 * L'atelier de l'ile en blocs.
 *
 * Le frere isometrique de `/island` : meme generateur, memes molettes, dessine
 * en blocs empiles depuis la planche isometrique, avec les rampes entre les
 * paliers. Hors du jeu — une page pour juger les formes avant qu'on batisse
 * dessus.
 *
 * `?style=smooth|pixel` et `?seed=...` choisissent la planche et l'ile de
 * depart, pour qu'un rendu se partage par lien. Next lisait ces parametres sur
 * le SERVEUR (`searchParams`, page async) ; sans serveur ils se lisent ici, sur
 * l'URL, ce qui revient au meme pour une page entierement client.
 */
import { createRoot } from 'react-dom/client';

import { IsoWorldWorkbench } from '@/app/isoworld/IsoWorldWorkbench';
import { ISO_STYLES, type IsoStyle } from '@/game/isoworld';
import '@/app/globals.css';

const params = new URLSearchParams(window.location.search);

const styleDemande = params.get('style');
const style = styleDemande && (ISO_STYLES as readonly string[]).includes(styleDemande)
  ? (styleDemande as IsoStyle)
  : undefined;

const seed = params.get('seed') || undefined;

const hote = document.getElementById('root');
if (!hote) throw new Error('#root est absent de index.html');

createRoot(hote).render(<IsoWorldWorkbench style={style} seed={seed} />);
