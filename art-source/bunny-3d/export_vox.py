"""Write a single editable voxel model in the MagicaVoxel v150 format.

Format: https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt
"""
import struct
from pathlib import Path


def write_vox(path, grid, palette):
    keys = list(palette)
    origin = tuple(min(p[a] for p in grid) for a in range(3))
    size = tuple(max(p[a] for p in grid) - origin[a] + 1 for a in range(3))
    assert all(0 < value <= 256 for value in size)
    assert len(keys) <= 255

    def chunk(name, content=b"", children=b""):
        return name + struct.pack("<II", len(content), len(children)) + content + children

    records = b"".join(bytes((*[p[a] - origin[a] for a in range(3)],
                              keys.index(color) + 1))
                       for p, color in sorted(grid.items()))
    colors = b"".join(bytes((*palette[key], 255)) for key in keys)
    colors += bytes((0, 0, 0, 255)) * (256 - len(keys))
    children = chunk(b"SIZE", struct.pack("<III", *size))
    children += chunk(b"XYZI", struct.pack("<I", len(grid)) + records)
    children += chunk(b"RGBA", colors)
    Path(path).write_bytes(b"VOX " + struct.pack("<I", 150) + chunk(b"MAIN", children=children))

    # Read back every voxel and color to check the actual artifact.
    data = Path(path).read_bytes()
    assert data[:8] == b"VOX " + struct.pack("<I", 150)
    assert struct.unpack_from("<II", data, 12) == (0, len(data) - 20)
    offset, chunks = 20, {}
    while offset < len(data):
        name, length, child_length = struct.unpack_from("<4sII", data, offset)
        assert child_length == 0
        chunks[name] = data[offset + 12:offset + 12 + length]
        offset += 12 + length
    assert offset == len(data)
    assert struct.unpack("<III", chunks[b"SIZE"]) == size
    assert struct.unpack_from("<I", chunks[b"XYZI"])[0] == len(grid)
    restored = {}
    for x, y, z, index in struct.iter_unpack("4B", chunks[b"XYZI"][4:]):
        rgb = tuple(chunks[b"RGBA"][(index - 1) * 4:(index - 1) * 4 + 3])
        restored[x + origin[0], y + origin[1], z + origin[2]] = rgb
    assert restored == {p: palette[c] for p, c in grid.items()}
    print(f"Verified {path}: {len(grid)} voxels, dimensions {size}")
