# Builds the development district: a plain town of boxes on a grid of streets,
# four chunks by three (256 m by 192 m), coloured from the world's palette.
# It exists so that streaming, the character controller and the camera can be
# built and measured before the first real district is modelled. It is not
# art and it is not Luanda: nothing made here ships.
#
#   blender -b --factory-startup --python art/scripts/make_dev_district.py -- <out dir> <palette.json> <palette.png>
#
# It writes <out dir>/district.blend, and beside it a hand-readable walk grid
# for each chunk (chunks/<id>.walk.json): pavement, roads, and nothing where a
# building stands.

import json
import os
import random
import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1:]
out_dir = os.path.abspath(args[0])
with open(args[1], encoding="utf-8") as handle:
    palette = json.load(handle)
os.makedirs(os.path.join(out_dir, "chunks"), exist_ok=True)

CHUNK = 64
ACROSS, DOWN = 4, 3
CELL = 0.5
CELLS = int(CHUNK / CELL)
rng = random.Random(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
image = bpy.data.images.load(os.path.abspath(args[2]))
material = bpy.data.materials.new("palette")
material.use_nodes = True
nodes = material.node_tree.nodes
texture = nodes.new("ShaderNodeTexImage")
texture.image = image
texture.interpolation = "Closest"
shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])


def colour(name, square):
    """Names the active object, gives it the palette, and points every face at one square of it."""
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    index = palette["squares"][square]
    cells = palette["cells"]
    u = (index % cells + 0.5) / cells
    v = 1 - (index // cells + 0.5) / cells
    if not obj.data.uv_layers:
        obj.data.uv_layers.new()
    for loop in obj.data.uv_layers.active.data:
        loop.uv = (u, v)
    return obj


# The walk grids: every cell pavement to begin with. Rows run along the game's Z, cells along X.
grids = {(cx, cz): [["."] * CELLS for _ in range(CELLS)] for cx in range(ACROSS) for cz in range(DOWN)}


def mark(x0, z0, x1, z1, what):
    """Marks a rectangle of the walk grid, in metres of the game's X and Z."""
    for iz in range(int(z0 / CELL), int(z1 / CELL)):
        for ix in range(int(x0 / CELL), int(x1 / CELL)):
            if 0 <= ix < ACROSS * CELLS and 0 <= iz < DOWN * CELLS:
                grids[(ix // CELLS, iz // CELLS)][iz % CELLS][ix % CELLS] = what


def box(name, square, x, z, width, depth, height, lift=0.0):
    """A box standing on the ground at the game's (x, z): Blender's (x, -z)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -z, lift + height / 2))
    obj = colour(name, square)
    obj.scale = (width, depth, height)
    return obj


# Ground, one piece a chunk, so each chunk carries its own.
for cx in range(ACROSS):
    for cz in range(DOWN):
        bpy.ops.mesh.primitive_plane_add(size=CHUNK, location=(cx * CHUNK + CHUNK / 2, -(cz * CHUNK + CHUNK / 2), 0))
        colour(f"ground-{cx}-{cz}", "pavement")

# Streets: one down the middle of every row of chunks, one down every column. Each piece stays inside its chunk.
ROAD = 8
for cz in range(DOWN):
    z = cz * CHUNK + CHUNK / 2
    for cx in range(ACROSS):
        box(f"road-x-{cx}-{cz}", "tar", cx * CHUNK + CHUNK / 2, z, CHUNK, ROAD, 0.04, 0.01)
    mark(0, z - ROAD / 2, ACROSS * CHUNK, z + ROAD / 2, "=")
for cx in range(ACROSS):
    x = cx * CHUNK + CHUNK / 2
    for cz in range(DOWN):
        box(f"road-z-{cx}-{cz}", "tar", x, cz * CHUNK + CHUNK / 2, ROAD, CHUNK, 0.04, 0.012)
    mark(x - ROAD / 2, 0, x + ROAD / 2, DOWN * CHUNK, "=")

# Buildings: one in each quarter of each chunk, set back from the streets.
for cx in range(ACROSS):
    for cz in range(DOWN):
        for qx in (0, 1):
            for qz in (0, 1):
                width = rng.uniform(12, 20)
                depth = rng.uniform(12, 20)
                height = rng.choice([6, 9, 9, 12, 15, 21, 30])
                x = cx * CHUNK + 16 + qx * 32 + (-1 if qx == 0 else 1) * rng.uniform(0, 1.5) - (2 if qx == 0 else -2)
                z = cz * CHUNK + 16 + qz * 32 - (2 if qz == 0 else -2)
                box(f"block-{cx}-{cz}-{qx}{qz}", f"wall{rng.randrange(8)}", x, z, width, depth, height)
                mark(x - width / 2, z - depth / 2, x + width / 2, z + depth / 2, "#")
                # A row of windows on two sides, as one thin dark band a floor.
                for floor in range(1, int(height // 3)):
                    band = box(f"glass-{cx}-{cz}-{qx}{qz}-{floor}", "window", x, z, width + 0.08, depth + 0.08, 1.1, floor * 3 - 1.2)
                    # Detail for up close: left out of the reduced model the reference phone draws.
                    band["lod0_only"] = True

# Trees along the east-west streets: a trunk and a round crown, which is what gives the reduced model something to reduce.
for cz in range(DOWN):
    for i in range(ACROSS * 4):
        x = 8 + i * 16
        z = cz * CHUNK + CHUNK / 2 - ROAD / 2 - 1.2
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.2, depth=4, location=(x, -z, 2))
        colour(f"trunk-{cz}-{i}", "palmTrunk")
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1.8, location=(x, -z, 5))
        colour(f"crown-{cz}-{i}", "palmLeaf")
        mark(x - 0.5, z - 0.5, x + 0.5, z + 0.5, "#")

for (cx, cz), rows in grids.items():
    grid = {"cellMm": int(CELL * 1000), "cellX0": cx * CELLS, "cellZ0": cz * CELLS, "rows": ["".join(row) for row in rows]}
    with open(os.path.join(out_dir, "chunks", f"c-{cx:02d}-{cz:02d}.walk.json"), "w", encoding="utf-8") as handle:
        json.dump(grid, handle)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "district.blend"))
print(f"nzila: development district saved to {out_dir}")
