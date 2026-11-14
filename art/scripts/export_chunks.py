# Exports the open Blender scene as the chunks of a district.
#
#   blender -b district.blend --python art/scripts/export_chunks.py -- <out dir> [chunk metres] [lod ratio]
#
# What it does, and nothing more: a script places and varies what a person
# designed; it designs nothing (D-0.23).
#
#   Chunking  Every mesh object goes into the chunk its centre falls in. A
#             chunk is a square of <chunk metres> (64 by default).
#   LODs      Each chunk is written twice: as modelled (l0), and reduced (l1).
#             The reduced model is the only one the reference phone ever sees
#             (Poupança never downloads l0), so it must look right on its own:
#               - a mesh of 48 triangles or fewer is left exactly as it is: a
#                 box has nothing to spare, and "simplifying" it wrecks it;
#               - a larger mesh is reduced to <lod ratio> of its triangles
#                 (0.35 by default);
#               - an object with the custom property `lod0_only` is left out:
#                 small detail that cannot be seen at a distance;
#               - an object with `lod1_only` is in the reduced model alone: a
#                 lighter version made on purpose, or the patch of shade baked
#                 under a tree for phones that draw no shadows;
#               - an object with `lod_exact` is never reduced by this script:
#                 whoever made it has already decided its shape.
#             An object with `nzila_chunk` ("2,1") belongs to that chunk
#             wherever its middle falls.
#   Export    Binary glTF, Y up, modifiers applied, no cameras, lights or animation.
#
# It writes <out dir>/chunks/<id>.l0.glb and .l1.glb, and <out dir>/chunks.json,
# which lists each chunk's id, its box in the game's coordinates and its files.
# `pack build` then compresses them (Meshopt, KTX2), measures and hashes them.
#
# Coordinates. Blender is Z up; the game is Y up with X east and Z south, in
# metres. The exporter turns Blender (x, y, z) into the game's (x, z, -y). A
# district is modelled from the Blender origin toward +X and -Y, so that its
# game coordinates are positive.

import json
import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if not args:
    raise SystemExit("usage: blender -b <file> --python export_chunks.py -- <out dir> [chunk metres] [lod ratio]")
out_dir = os.path.abspath(args[0])
chunk_m = float(args[1]) if len(args) > 1 else 64.0
lod_ratio = float(args[2]) if len(args) > 2 else 0.35
os.makedirs(os.path.join(out_dir, "chunks"), exist_ok=True)


def game_box(obj):
    """The object's box in game coordinates: (min x, min y, min z), (max x, max y, max z)."""
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    xs = [c.x for c in corners]
    ys = [c.z for c in corners]
    zs = [-c.y for c in corners]
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))


chunks = {}
for obj in bpy.context.scene.objects:
    if obj.type != "MESH" or obj.hide_render:
        continue
    low, high = game_box(obj)
    if obj.get("nzila_chunk"):
        ix, iz = (int(part) for part in obj["nzila_chunk"].split(","))
    else:
        ix = math.floor((low[0] + high[0]) / 2 / chunk_m)
        iz = math.floor((low[2] + high[2]) / 2 / chunk_m)
    if ix < 0 or iz < 0:
        raise SystemExit(f'"{obj.name}" lies outside the district: model from the origin toward +X and -Y.')
    chunks.setdefault((ix, iz), []).append((obj, low, high))


# A mesh this light is never reduced.
KEEP_WHOLE_TRIANGLES = 48


def triangles(obj):
    return sum(len(polygon.vertices) - 2 for polygon in obj.data.polygons)


def export(objects, path, ratio):
    bpy.ops.object.select_all(action="DESELECT")
    added = []
    reduced = ratio < 1.0
    for obj in objects:
        if (reduced and obj.get("lod0_only")) or (not reduced and obj.get("lod1_only")):
            continue
        obj.select_set(True)
        if reduced and not obj.get("lod_exact") and triangles(obj) > KEEP_WHOLE_TRIANGLES:
            modifier = obj.modifiers.new(name="nzila_lod", type="DECIMATE")
            modifier.ratio = ratio
            added.append((obj, modifier))
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=False,
    )
    for obj, modifier in added:
        obj.modifiers.remove(modifier)


listing = []
for (ix, iz), members in sorted(chunks.items()):
    chunk_id = f"c-{ix:02d}-{iz:02d}"
    objects = [m[0] for m in members]
    lows = [m[1] for m in members]
    highs = [m[2] for m in members]
    aabb = [round(min(l[i] for l in lows), 3) for i in range(3)] + [round(max(h[i] for h in highs), 3) for i in range(3)]
    files = []
    for level, ratio in (("l0", 1.0), ("l1", lod_ratio)):
        name = f"chunks/{chunk_id}.{level}.glb"
        export(objects, os.path.join(out_dir, name), ratio)
        files.append(name)
    listing.append({"id": chunk_id, "aabb": aabb, "lods": files})

with open(os.path.join(out_dir, "chunks.json"), "w", encoding="utf-8") as handle:
    json.dump(listing, handle, indent=2)
    handle.write("\n")
print(f"nzila: exported {len(listing)} chunk(s) to {out_dir}")
