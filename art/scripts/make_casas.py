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

# What a house is furnished with (Task 5.3): each thing alone, as one model. The catalogue says which things there
# are and the floor each stands on; a thing with no model, a model with no thing, or a model wider than its floor
# is refused here, so that nothing set down ever reaches into the cell beside it.
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "packages", "economy", "tunables", "items.json"), encoding="utf-8") as handle:
    floors = {item["id"]: item["chao"] for item in json.load(handle)["items"] if item["kind"] == "mobilia"}
if set(floors) != set(kit_casas.MOVEIS):
    raise SystemExit(f"nzila: the catalogue's furniture and the models drawn for it differ: {sorted(set(floors) ^ set(kit_casas.MOVEIS))}")
moveis = []
for name, draw in kit_casas.MOVEIS.items():
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
    b.level = kit.FULL
    b.soft = True
    draw(b)
    merged = []
    for key in list(b.groups):
        merged.extend(b.groups[key])
    across = max(abs(point[0]) for face in merged for point in face[0]) * 2
    deep = max(abs(point[2]) for face in merged for point in face[0]) * 2
    high = max(point[1] for face in merged for point in face[0])
    if across > floors[name][0] * 0.5 or deep > floors[name][1] * 0.5:
        raise SystemExit(f"nzila: {name} is {across:.2f} m by {deep:.2f} m and its floor is {floors[name][0] * 0.5} by {floors[name][1] * 0.5}")
    b.groups = {((0, 0), kit.BOTH): merged}
    b.write()
    triangles = sum(len(polygon.vertices) - 2 for obj in bpy.data.objects if obj.type == "MESH" for polygon in obj.data.polygons)
    for obj in bpy.data.objects:
        obj.select_set(obj.type == "MESH")
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, f"{name}.glb"), export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False, export_animations=False, export_extras=False, export_normals=True)
    moveis.append({"id": name, "model": f"{name}.glb", "chao": floors[name], "high": round(high, 2), "triangles": triangles})

# Where in the palette's picture each paint a door or a sign is given is, as a model counts it (from the top left):
# the game colours the doors it hangs from these, without carrying the palette's own list for it.
cells = palette["cells"]
paint = {name: [round((palette["squares"][name] % cells + 0.5) / cells, 5), round((palette["squares"][name] // cells + 0.5) / cells, 5)] for name in [*kit.DOOR_PAINTS, "flagYellow", "tarShade"]}
with open(os.path.join(out_dir, "casas.json"), "w", encoding="utf-8") as handle:
    json.dump({"kinds": kinds, "paint": paint, "moveis": moveis}, handle, ensure_ascii=False)
print(f"nzila: {len(kinds)} kind(s) of home: " + ", ".join(f"{k['id']} {k['triangles']} triangles" for k in kinds))
print(f"nzila: {len(moveis)} thing(s) to furnish with: " + ", ".join(f"{m['id']} {m['triangles']}" for m in moveis))
