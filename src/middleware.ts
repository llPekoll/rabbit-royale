/**
 * Renvoie /api/* vers le serveur socket, qui heberge desormais ces routes.
 *
 * POURQUOI UN MIDDLEWARE ET PAS UN `rewrites()`. La config de Next est
 * evaluee au BUILD : `API_SERVER_URL` doit alors exister au moment du
 * `bun run build`, dans l'image Docker — pas seulement dans l'environnement
 * du conteneur. Une variable ajoutee cote Coolify n'y arrive jamais, et le
 * rewrite se compile en liste vide sans rien signaler. Le middleware, lui,
 * lit la variable a CHAQUE requete : changer l'URL ne demande pas de rebuild.
 *
 * Les fichiers de `src/app/api` restent en place — c'est le serveur socket
 * qui les importe (voir server/api-router.ts). Ils ne sont plus servis ici,
 * mais ils sont toujours la source unique.
 *
 * Quand le web passera sous Expo, ce fichier et `src/app/api` disparaissent
 * ensemble.
 */
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const cible = process.env.API_SERVER_URL;
  if (!cible) return NextResponse.next();

  const base = cible.replace(/\/+$/, '');
  const url = new URL(req.nextUrl.pathname + req.nextUrl.search, base);
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: '/api/:path*',
};
