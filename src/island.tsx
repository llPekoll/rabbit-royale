/**
 * L'atelier de l'ile en tuiles.
 *
 * Hors du jeu : une page pour regarder ce que produit `src/game/island` avant
 * qu'on batisse dessus. Change une graine, change les paliers, observe ce que
 * le generateur et les planches Tiny Swords font ensemble. L'ile dessinee ici
 * l'est par le MEME code qu'une partie, donc ce qu'on y voit est une preuve et
 * pas une illustration.
 */
import { createRoot } from 'react-dom/client';

import { IslandWorkbench } from '@/app/island/IslandWorkbench';
import '@/app/globals.css';

const hote = document.getElementById('root');
if (!hote) throw new Error('#root est absent de index.html');

createRoot(hote).render(<IslandWorkbench />);
