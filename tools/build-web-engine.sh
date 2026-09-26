#!/usr/bin/env bash
# Recompile le moteur web de Godot sans ce que le jeu n'utilise pas
# (godot/web/engine.gdbuild) et le depose dans docker/godot-web-template.zip,
# que le Dockerfile copie tel quel.
#
# En local, pas sur Coolify : l'edition de liens en LTO complete demande plus
# que les 7 Go du serveur. Il faut Docker et ~8 Go de RAM libres ; ~15 min sur
# 10 coeurs. A relancer quand engine.gdbuild ou la version de Godot changent,
# puis commiter le zip.
#
#   tools/build-web-engine.sh [version]      (defaut : 4.7.2)
set -euo pipefail

VERSION="${1:-4.7.2}"
# Celui de .github/workflows/web_builds.yml au tag, et celui qui a ete teste.
EM_VERSION="4.0.11"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${GODOT_SRC:-$HOME/work/godot-src/$VERSION}"

if [ ! -d "$SRC" ]; then
  git clone --depth 1 --branch "$VERSION-stable" https://github.com/godotengine/godot.git "$SRC"
fi
cp "$ROOT/godot/web/engine.gdbuild" "$SRC/custom.gdbuild"

docker run --rm -v "$SRC":/src -w /src "emscripten/emsdk:$EM_VERSION" bash -c \
  "pip install -q scons >/dev/null 2>&1 && scons platform=web target=template_release threads=no \
   production=yes optimize=size lto=full build_profile=custom.gdbuild -j\$(nproc)"

cp "$SRC/bin/godot.web.template_release.wasm32.nothreads.zip" "$ROOT/docker/godot-web-template.zip"
ls -la "$ROOT/docker/godot-web-template.zip"
