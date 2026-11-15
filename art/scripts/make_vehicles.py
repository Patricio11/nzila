# Writes each vehicle of art/scripts/vehicles.py alone, at the origin and
# facing +Z, as a binary glTF: the models the game drives along its routes.
#
#   blender -b --factory-startup --python art/scripts/make_vehicles.py -- <out dir> <palette.json> <palette.png>
#
# It writes <out dir>/<name>.glb for each and <out dir>/veiculos.json (their sizes).

import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import vehicles  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
out_dir = os.path.abspath(args[0])
with open(args[1], encoding="utf-8") as handle:
    palette = json.load(handle)
os.makedirs(out_dir, exist_ok=True)

listed = []
for name, (draw, half_width, half_length) in vehicles.VEHICLES.items():
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
    # Everything in one object: a vehicle on the road is one draw.
    draw(b, 0.0, 0.0, 0.0, 0.0)
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
        filepath=os.path.join(out_dir, f"{name}.glb"),
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
    listed.append({"name": name, "model": f"{name}.glb", "halfWidth": half_width, "halfLength": half_length, "triangles": triangles, "adSlots": vehicles.VEHICLE_ADS.get(name, [])})

with open(os.path.join(out_dir, "veiculos.json"), "w", encoding="utf-8") as handle:
    json.dump({"vehicles": listed}, handle, ensure_ascii=False)
print(f"nzila: {len(listed)} vehicle(s): " + ", ".join(f"{v['name']} {v['triangles']} triangles" for v in listed))
