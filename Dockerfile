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
# `assets/world/` (1,7 Mo) est la planche de l'atelier /isoworld. L'atelier
# reste servi, mais ses tuiles ne sont pas du jeu : hors de l'image.
RUN rm -rf /usr/share/nginx/html/assets/world
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3010
