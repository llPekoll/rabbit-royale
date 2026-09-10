# Watch paths — ne redéployer que ce qui a changé

Un push redéploie **rr-web ET rr-ws**, toujours, même quand un seul des deux
est concerné. Coolify a un champ « Watch Paths » par application (Configuration
→ General) : tant qu'il est vide, tout commit déclenche un build.

Ces listes sont dérivées de ce que **chaque Dockerfile copie réellement**, pas
de ce qui semble logique. Les vérifier avant de les modifier :

```
grep '^COPY' Dockerfile        # web
grep '^COPY' Dockerfile.ws     # ws
```

---

## rr-ws (`asshbpvdvfb4jmks7oyy20py`)

`Dockerfile.ws` copie `package.json`, `bun.lock`, `tsconfig.json`, `config/`,
`server/` et `src/`. Rien d'autre n'entre dans le binaire.

```
server/**
config/**
src/lib/**
src/config/**
Dockerfile.ws
package.json
bun.lock
tsconfig.json
```

**Pourquoi `src/lib` et `src/config` et pas `src/**`.** Le serveur WS importe
depuis `src/` — c'est le piège de cette configuration, et une règle « le ws ne
surveille que `server/` » raterait de vrais changements. Mais il n'importe que
`src/lib/*` et `src/config/*` (vérifié : `grep "from '../src" server/index.ts`).
Il ne touche **jamais** `src/app`, `src/components`, `src/game` ni `src/stories`.

Le `COPY src ./src` du Dockerfile est plus large que ces imports, donc changer
`src/components` modifie le contexte de build du ws sans rien changer au binaire
produit. C'est exactement ce qu'on veut éviter de rebuild.

⚠️ **Si un jour le serveur importe depuis un autre dossier de `src/`, il faut
l'ajouter ici.** C'est le seul mode de panne de ce réglage : un déploiement qui
ne part pas alors qu'il aurait dû. Il est silencieux — la prod tourne juste sur
l'ancien code.

## rr-web (`kpj80wphpilv7dzarcbyn4qi`)

`Dockerfile` fait `COPY . .` puis `bun run build`. Presque tout compte :

```
src/**
config/**
public/**
next.config.ts
package.json
bun.lock
tsconfig.json
Dockerfile
```

`server/**` est volontairement absent : le serveur WS n'est ni importé ni
bundlé par Next.

---

## Ce qui ne redéploie plus rien (et c'est voulu)

`test/`, `.storybook/`, `src/stories/`, `scripts/`, `drizzle/`, `android/`,
`docs/`, les `*.md`.

**`drizzle/` mérite un mot.** Les migrations ne sont pas appliquées au
déploiement dans ce projet (elles sont passées à la main sur la prod) : une
nouvelle migration ne doit donc pas déclencher un build, elle doit déclencher
une action manuelle. Les retirer des watch paths ne casse rien ; l'oublier au
moment de migrer, si.

## Vérifier que ça marche

Après avoir rempli les champs, un commit qui ne touche que `test/` ne doit
lancer **aucun** des deux builds. Un commit sur `src/lib/leaderboard.ts` doit
lancer **les deux** (les deux l'importent) — c'est le cas de test le plus utile,
parce que c'est celui où une règle trop étroite se ferait prendre.
