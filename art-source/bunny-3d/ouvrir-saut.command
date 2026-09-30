#!/bin/sh
# Double-clic : ouvre saut-edit.blend avec l'apercu en direct (-y autorise son script).
open -na Blender --args -y "$(dirname "$0")/saut-edit.blend"
