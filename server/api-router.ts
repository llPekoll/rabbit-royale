/**
 * Les routes /api/* du jeu, servies par le serveur socket.
 *
 * POURQUOI ICI. Les 21 routes de `src/app/api` n'importent RIEN de Next :
 * ce sont des handlers `Request -> Response` de l'API web standard, que Bun
 * sait servir nativement. Les heberger a cote du WebSocket donne UNE SEULE
 * origine a l'app native (API + socket), au lieu de deux services a joindre.
 *
 * Les fichiers de route ne sont pas modifies : ils restent la ou Next les
 * lit, et pendant la migration Next les proxifie vers ce serveur (voir
 * `next.config.ts`). Une seule implementation, deux portes d'entree.
 *
 * Aucune route n'est dynamique (pas de `[id]`), d'ou la table statique plus
 * bas : le chemin suffit a designer le module.
 *
 * CE SERVICE DEPEND DONC DE `src/app/api/**` ET DE `src/game/**` (les regles
 * du terrier et de l'ile que ces routes importent). Les watch paths Coolify
 * de rr-ws doivent les couvrir (docs/DEPLOY-WATCH-PATHS.md) : sans eux, un
 * commit qui ne change qu'une route ou une regle ne redeploie pas rr-ws, et
 * la prod garde l'ancien code sans rien dire — vu le 2026-09-23, trois
 * commits (e0a9c75, 3e83909, 4c7b0b6) restes sur ca5237c.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Un module de route, tel que Next l'attend. */
type ModuleRoute = {
  GET?: (req: Request) => Promise<Response> | Response;
  POST?: (req: Request) => Promise<Response> | Response;
  PATCH?: (req: Request) => Promise<Response> | Response;
  PUT?: (req: Request) => Promise<Response> | Response;
  DELETE?: (req: Request) => Promise<Response> | Response;
};

/**
 * Chemin -> import du module.
 *
 * Les imports sont paresseux : le serveur demarre sans toucher a la base ni
 * aux secrets tant qu'aucune route n'est appelee, et une route cassee ne
 * bloque pas le WebSocket.
 */
const ROUTES: Record<string, () => Promise<ModuleRoute>> = {
  '/api/auth/abandon': () => import('../src/app/api/auth/abandon/route'),
  '/api/auth/challenge': () => import('../src/app/api/auth/challenge/route'),
  '/api/auth/guest': () => import('../src/app/api/auth/guest/route'),
  '/api/auth/link': () => import('../src/app/api/auth/link/route'),
  '/api/auth/logout': () => import('../src/app/api/auth/logout/route'),
  '/api/auth/me': () => import('../src/app/api/auth/me/route'),
  '/api/auth/verify': () => import('../src/app/api/auth/verify/route'),
  '/api/burrow': () => import('../src/app/api/burrow/route'),
  '/api/burrow/layout': () => import('../src/app/api/burrow/layout/route'),
  '/api/config': () => import('../src/app/api/config/route'),
  '/api/fences': () => import('../src/app/api/fences/route'),
  '/api/leaderboard': () => import('../src/app/api/leaderboard/route'),
  '/api/player': () => import('../src/app/api/player/route'),
  '/api/player/history': () => import('../src/app/api/player/history/route'),
  '/api/quests': () => import('../src/app/api/quests/route'),
  '/api/raid': () => import('../src/app/api/raid/route'),
  '/api/raid/incoming': () => import('../src/app/api/raid/incoming/route'),
  '/api/raid/strike': () => import('../src/app/api/raid/strike/route'),
  '/api/rpc': () => import('../src/app/api/rpc/route'),
  '/api/shop': () => import('../src/app/api/shop/route'),
  '/api/shop/pay': () => import('../src/app/api/shop/pay/route'),
  '/api/traps': () => import('../src/app/api/traps/route'),
  '/api/webhooks/alchemy': () => import('../src/app/api/webhooks/alchemy/route'),
};

/** Le corps d'une requete Node, en entier. */
function lireCorps(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const morceaux: Buffer[] = [];
    req.on('data', (c: Buffer) => morceaux.push(c));
    req.on('end', () => resolve(Buffer.concat(morceaux)));
    req.on('error', reject);
  });
}

/** IncomingMessage -> Request (ce que les routes attendent). */
async function versRequest(req: IncomingMessage, base: string): Promise<Request> {
  const url = new URL(req.url ?? '/', base);
  const entetes = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    entetes.set(k, Array.isArray(v) ? v.join(', ') : v);
  }
  const methode = (req.method ?? 'GET').toUpperCase();
  const avecCorps = methode !== 'GET' && methode !== 'HEAD';
  // Uint8Array plutot que Buffer : c'est ce que BodyInit accepte.
  const corps = avecCorps ? new Uint8Array(await lireCorps(req)) : undefined;
  return new Request(url, { method: methode, headers: entetes, body: corps });
}

/** Response -> ServerResponse, en preservant les Set-Cookie multiples. */
async function ecrireReponse(rep: Response, res: ServerResponse) {
  const entetes: Record<string, string | string[]> = {};
  rep.headers.forEach((valeur, cle) => {
    // getSetCookie() rend les cookies un par un ; les concatener casserait
    // les sessions (un seul header pour plusieurs cookies).
    if (cle.toLowerCase() === 'set-cookie') return;
    entetes[cle] = valeur;
  });
  const cookies = (rep.headers as any).getSetCookie?.() as string[] | undefined;
  if (cookies?.length) entetes['set-cookie'] = cookies;

  res.writeHead(rep.status, entetes);
  if (rep.body) {
    const buf = Buffer.from(await rep.arrayBuffer());
    res.end(buf);
  } else {
    res.end();
  }
}

/**
 * Sert la requete si c'est une route /api/*.
 * Rend `true` si elle a ete prise en charge, `false` sinon.
 */
export async function servirApi(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const chemin = (req.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/';
  const charger = ROUTES[chemin];
  if (!charger) return false;

  const methode = (req.method ?? 'GET').toUpperCase();

  // Prevol CORS : l'app native n'a pas d'origine, le navigateur en a une.
  if (methode === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': req.headers.origin ?? '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }).end();
    return true;
  }

  try {
    const mod = await charger();
    const handler = (mod as any)[methode];
    if (typeof handler !== 'function') {
      res.writeHead(405, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: `${methode} non supporte sur ${chemin}` }));
      return true;
    }

    const hote = req.headers.host ?? 'localhost';
    const protocole = (req.headers['x-forwarded-proto'] as string) ?? 'http';
    const requete = await versRequest(req, `${protocole}://${hote}`);
    const reponse = await handler(requete);
    // Banc local (RR_STAGE=1) : chaque appel, son statut, et la raison d'un refus.
    if (process.env.RR_STAGE === '1' && !chemin.startsWith('/api/tuning')) {
      const refus = reponse.status >= 400 ? ` ${(await reponse.clone().text()).slice(0, 200)}` : '';
      console.log(`[api] ${methode} ${chemin}${req.url?.includes('?') ? '?' + req.url.split('?')[1] : ''} -> ${reponse.status}${refus}`);
    }

    // L'app native envoie ses requetes sans origine : on autorise large ici,
    // l'authentification tient au JWT, pas a l'origine.
    const origine = req.headers.origin;
    if (origine) {
      reponse.headers.set('Access-Control-Allow-Origin', origine);
      reponse.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    await ecrireReponse(reponse, res);
    return true;
  } catch (e) {
    console.error(`[api] ${methode} ${chemin} a echoue :`, e);
    res.writeHead(500, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ error: 'internal' }));
    return true;
  }
}
