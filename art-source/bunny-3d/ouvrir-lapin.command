#!/bin/sh
# Double-clic : ouvre hero-voxel-v2.blend avec ses scripts autorises (-y),
# pour que le contour noir suive la camera. Ne change aucun reglage de Blender.
open -na Blender --args -y "$(dirname "$0")/hero-voxel-v2.blend"
