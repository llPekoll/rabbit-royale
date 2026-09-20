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
# L'amont par defaut : le DOMAINE PUBLIC du serveur de jeu.
#
# Un nom de service Docker (`http://rr-ws:3010`) serait plus direct, mais il
# suppose que les deux conteneurs partagent un reseau et que le service porte
# ce nom-la — deux choses que l'hebergeur decide, pas nous. Quand c'est faux,
# nginx ne resout rien et rend un 502 sur CHAQUE appel d'API, le jeu compris.
# Le domaine public, lui, marche partout ; il coute un aller-retour par le
# reverse proxy, ce qui est peu a cote d'un site injoignable. A remplacer par
# le nom de service interne si l'on sait que le reseau est partage.
ENV API_UPSTREAM=https://ws.rabbit.rip
# Un resolver PUBLIC, puisque l'amont par defaut est un nom public : celui de
# Docker (127.0.0.11) ne resout que les noms de services, et ne repond meme
# pas hors d'un reseau utilisateur.
ENV DNS_RESOLVER="1.1.1.1 8.8.8.8"
# L'entrypoint substitue TOUTES les $variables par defaut — y compris celles
# de nginx ($host, $request_uri, $remote_addr), qu'il viderait. On lui dit de
# ne toucher qu'aux notres.
ENV NGINX_ENVSUBST_FILTER='(API_UPSTREAM|AMONT_HOTE|DNS_RESOLVER)'
# Deduit API_UPSTREAM_HOST de l'URL ci-dessus. Le `10-` le fait passer avant
# le `20-envsubst` de l'image, qui lira la variable ainsi posee.
COPY docker/entrypoint-amont.sh /docker-entrypoint.d/10-amont.sh
EXPOSE 3010
