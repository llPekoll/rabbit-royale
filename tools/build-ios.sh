#!/usr/bin/env bash
# L'APP iOS (monde web2) : le plugin RabbitApple, le projet Xcode, et sur
# demande l'installation sur l'iPhone.
#
#   tools/build-ios.sh                 projet Xcode debug dans dist/ios/
#   tools/build-ios.sh release         idem en release
#   IPHONE=<id devicectl> tools/build-ios.sh debug --install
#
# POURQUOI CE SCRIPT ET PAS UN EXPORT DE L'ÉDITEUR : rabbit_apple.gdextension
# ne déclare QU'iOS. Laissé dans le projet, chaque Godot qui n'est pas iOS
# (l'éditeur du Mac, l'export web de Coolify sous Linux, le pack Android)
# chargerait une extension sans bibliothèque pour lui et le crierait à chaque
# lancement. Il dort donc sous le nom .gdextension.ios, et ce script ne le
# réveille que le temps de l'export iOS.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
mode=${1:-debug}
install=${2:-}
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
G=${GODOT:-/Applications/Godot.app/Contents/MacOS/Godot}
godot="$root/godot"
ext="$godot/addons/RabbitApple/rabbit_apple.gdextension"

# 1. Le plugin (godot-cpp hors du repo : GODOT_CPP, ~/work/ton/godot-cpp par
#    défaut — git clone https://github.com/godotengine/godot-cpp.git).
(cd "$godot/plugin-src/apple" \
  && scons -Q platform=ios target=template_debug ios_min_version=14.0 -j8 \
  && scons -Q platform=ios target=template_release ios_min_version=14.0 -j8)

# 2. L'extension réveillée le temps de l'export, puis rendormie quoi qu'il
#    arrive (l'import qui suit retire sa ligne de .godot/extension_list.cfg).
cp "$ext.ios" "$ext"
sleep_again() {
  rm -f "$ext" "$ext.uid"
  "$G" --headless --path "$godot" --import >/dev/null 2>&1 || true
}
trap sleep_again EXIT
"$G" --headless --path "$godot" --import >/dev/null 2>&1 || true
mkdir -p "$root/dist/ios"
"$G" --headless --path "$godot" "--export-$mode" "iOS" ../dist/ios/RabbitRoyale.ipa

[ "$install" = "--install" ] || exit 0

# 3. Signé (équipe GRAVITY 5) pour CET iPhone : sans -destination id=, le
#    profil n'inclut pas l'appareil et l'installation est refusée.
: "${IPHONE:?IPHONE=<identifiant de xcrun devicectl list devices>}"
udid=$(xcrun devicectl device info details --device "$IPHONE" 2>/dev/null \
  | grep -oE '[0-9A-F]{8}-[0-9A-F]{16}' | head -1)
config=$([ "$mode" = release ] && echo Release || echo Debug)
cd "$root/dist/ios"
xcodebuild -project RabbitRoyale.xcodeproj -scheme RabbitRoyale -configuration "$config" \
  -destination "id=$udid" -derivedDataPath build \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM=2C3W4AGDCR CODE_SIGN_STYLE=Automatic build | tail -5
app=$(find build/Build/Products -maxdepth 2 -name '*.app' -type d | head -1)
xcrun devicectl device install app --device "$IPHONE" "$app"
