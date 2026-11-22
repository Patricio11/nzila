# Writes the inside of each kind of home (art/scripts/kit_casas.py) alone, at the origin with its door looking to
# +Z, as a binary glTF: what the game sets inside the house a player's family was given (Phase 5, D-5.8).
#
#   blender -b --factory-startup --python art/scripts/make_casas.py -- <out dir> <palette.json> <palette.png>
#
# It writes <out dir>/<kind>.glb for each and <out dir>/casas.json: where each kind's family walks, where being
# inside is, its doorway and the door hung in it, and where they wake (packages/world/src/casas.ts).

import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import kit_casas  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
out_dir = os.path.abspath(args[0])
with open(args[1], encoding="utf-8") as handle:
    palette = json.load(handle)
os.makedirs(out_dir, exist_ok=True)

kinds = []
for name, draw in kit_casas.KINDS.items():
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

    b = kit.Builder(palette, material, 10_000.0)
    kind = draw(b)
    # Everything in one object: the inside of a home is one draw.
    merged = []
    for key in list(b.groups):
        if key[1] != kit.LIGHT:
            merged.extend(b.groups[key])
    b.groups = {((0, 0), kit.BOTH): merged}
    b.write()
    triangles = sum(len(polygon.vertices) - 2 for obj in bpy.data.objects if obj.type == "MESH" for polygon in obj.data.polygons)
    for obj in bpy.data.objects:
        obj.select_set(obj.type == "MESH")
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(out_dir, kind["model"]),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=False,
        export_normals=True,
    )
    kinds.append({**kind, "triangles": triangles})

# Where in the palette's picture each paint a door or a sign is given is, as a model counts it (from the top left):
# the game colours the doors it hangs from these, without carrying the palette's own list for it.
cells = palette["cells"]
paint = {name: [round((palette["squares"][name] % cells + 0.5) / cells, 5), round((palette["squares"][name] // cells + 0.5) / cells, 5)] for name in [*kit.DOOR_PAINTS, "flagYellow"]}
with open(os.path.join(out_dir, "casas.json"), "w", encoding="utf-8") as handle:
    json.dump({"kinds": kinds, "paint": paint}, handle, ensure_ascii=False)
print(f"nzila: {len(kinds)} kind(s) of home: " + ", ".join(f"{k['id']} {k['triangles']} triangles" for k in kinds))
