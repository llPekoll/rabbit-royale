# Le front web : l'export WEB DU CLIENT GODOT (2026-09-25). Le client
# Vite/Pixi n'est plus construit — Godot est le seul client. Le serveur de jeu
# a sa propre image, voir Dockerfile.ws : le web est statique et replicable, le
# WS tient l'etat des iles en memoire.
#
# Le client parle a `ws.rabbit.rip` en URL ABSOLUE (godot/scripts/net.gd), et
# le serveur accepte toutes les origines (server/api-router.ts, socket.io
# `origin: '*'`) : le proxy /api de nginx n'est plus sur le chemin du jeu.

# GODOT ET SES TEMPLATES, dans des couches a eux. Les templates pesent 1,3 Go
# et ne changent qu'avec la version du moteur : tant que GODOT_VERSION ne
# bouge pas, le cache de build les garde et un deploiement ne les retelecharge
# pas. Seul le template web sans threads est garde (le preset Web est sans
# threads : pas d'en-tetes COOP/COEP a servir).
FROM debian:bookworm-slim AS godot
ARG GODOT_VERSION=4.7.2
ARG TARGETARCH
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip libfontconfig1 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/godot
RUN arch="$([ "$TARGETARCH" = "arm64" ] && echo arm64 || echo x86_64)" \
  && base="https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-stable" \
  && curl -fsSL -o godot.zip "$base/Godot_v${GODOT_VERSION}-stable_linux.${arch}.zip" \
  && unzip -q godot.zip && rm godot.zip \
  && mv Godot_v${GODOT_VERSION}-stable_linux.${arch} /usr/local/bin/godot
RUN base="https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-stable" \
  && dest="/root/.local/share/godot/export_templates/${GODOT_VERSION}.stable" \
  && mkdir -p "$dest" \
  && curl -fsSL -o /tmp/t.tpz "$base/Godot_v${GODOT_VERSION}-stable_export_templates.tpz" \
  && unzip -q -j /tmp/t.tpz 'templates/web_nothreads_release.zip' 'templates/version.txt' -d "$dest" \
  && rm /tmp/t.tpz

# LE MOTEUR WEB, RECOMPILE SANS CE QUE LE JEU N'UTILISE PAS (2026-09-26).
#
# Le template officiel porte tout Godot : la 3D, la physique, la navigation,
# l'XR, les formats d'import... 39,5 Mo de wasm que chaque joueur telechargeait
# pour un jeu 2D. La liste de ce qu'on retire est godot/web/engine.gdbuild ;
# SEUL ce fichier est copie avant la compilation, donc le cache de build ne la
# refait que s'il change ou si GODOT_VERSION bouge. Un premier build coute un
# quart d'heure de CPU (10 coeurs). EM_VERSION est celui de
# .github/workflows/web_builds.yml du tag, et celui qui a ete teste.
# Resultat mesure : wasm 39,5 -> 22,6 Mo, 10,0 -> 5,7 Mo en gzip.
FROM emscripten/emsdk:4.0.11 AS engine
ARG GODOT_VERSION=4.7.2
RUN pip install --no-cache-dir scons \
  && git clone --depth 1 --branch ${GODOT_VERSION}-stable https://github.com/godotengine/godot.git /godot
WORKDIR /godot
COPY godot/web/engine.gdbuild /engine.gdbuild
RUN scons platform=web target=template_release threads=no production=yes \
    optimize=size lto=full build_profile=/engine.gdbuild -j"$(nproc)" \
  && test -s bin/godot.web.template_release.wasm32.nothreads.zip

FROM godot AS build
# Le moteur allege prend la place du template officiel, sous son nom : le
# preset Web n'a pas de chemin de template a connaitre, et un export local
# (sans cette etape) retombe sur le template complet, qui marche aussi.
ARG GODOT_VERSION=4.7.2
COPY --from=engine /godot/bin/godot.web.template_release.wasm32.nothreads.zip \
  /root/.local/share/godot/export_templates/${GODOT_VERSION}.stable/web_nothreads_release.zip
WORKDIR /app
COPY godot ./godot
# L'import d'abord, a part : sur un checkout frais il n'y a pas de .godot/, et
# un export lance a froid peut compiler les scripts avant que les `class_name`
# soient connus.
RUN godot --headless --path godot --import || true
RUN mkdir -p dist/web \
  && godot --headless --path godot --export-release "Web" ../dist/web/index.html \
  && test -s dist/web/index.wasm && test -s dist/web/index.pck \
  && gzip -k -9 dist/web/index.wasm dist/web/index.pck dist/web/index.js

# Nginx sert les fichiers : ni Node ni Bun ne tournent en production ici.
FROM nginx:alpine AS runtime
# Les icones, le manifeste et le service worker du site restent : un joueur
# qui avait installe la PWA garde son sw.js (reseau d'abord, rien en cache sauf
# la page hors ligne). `assets/` etait l'art du client Pixi : il reste dehors.
COPY public /usr/share/nginx/html
RUN rm -rf /usr/share/nginx/html/assets /usr/share/nginx/html/.gitkeep
COPY --from=build /app/dist/web /usr/share/nginx/html
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
