# Le front web (Vite). Le serveur de jeu a sa propre image — voir Dockerfile.ws
# — parce qu'ils ne passent pas a l'echelle sur le meme axe : le web est
# statique et replicable, le WS tient l'etat des iles en memoire.
#
# Ce n'est plus une app Next : le bundle est un tas de fichiers statiques, et
# /api part vers le serveur socket. Le reverse proxy (Coolify) doit donc router
# /api vers rr-ws — le bundle appelle /api en RELATIF, il n'embarque aucune URL
# et un changement d'adresse ne demande aucun rebuild.
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Nginx sert les fichiers : ni Node ni Bun ne tournent en production ici.
FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
# `assets/world/` (1,7 Mo) est la planche de l'atelier /isoworld, que cette
# image ne sert plus. Vite copie `public/` en entier, donc la planche arrive
# quand meme ici : on la retire.
RUN rm -rf /usr/share/nginx/html/assets/world
# `templates/*.template` : l'entrypoint de l'image nginx y substitue les
# variables d'environnement au demarrage et ecrit le resultat dans conf.d.
# C'est ce qui permet de pointer l'API sans reconstruire l'image.
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
# L'amont par defaut : le nom du service de jeu sur le reseau Docker. Coolify
# peut le remplacer (https://ws.rabbit.rip si l'on sort par l'exterieur).
ENV API_UPSTREAM=http://rr-ws:3010
# Le DNS de Docker resout les noms de services sur un reseau utilisateur.
ENV DNS_RESOLVER=127.0.0.11
# L'entrypoint substitue TOUTES les $variables par defaut — y compris celles
# de nginx ($host, $request_uri, $remote_addr), qu'il viderait. On lui dit de
# ne toucher qu'aux notres.
ENV NGINX_ENVSUBST_FILTER='(API_UPSTREAM|DNS_RESOLVER)'
EXPOSE 3010
