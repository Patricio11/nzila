# Builds a line of people to be looked at, each from a `spec` (who they are:
# build, skin, hair, clothes), and writes them as one binary glTF.
#
#   blender -b --factory-startup --python art/scripts/make_people.py -- <out dir> <palette.json> <palette.png>
#
# It writes <out dir>/pessoas.glb and <out dir>/pessoas.json (where each one
# stands), for the client's /corpo page. These are bodies standing still: the
# skeleton and the movement come after the founder has seen them (Task 1.3).

import json
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import person  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
out_dir = os.path.abspath(args[0])
with open(args[1], encoding="utf-8") as handle:
    palette = json.load(handle)
os.makedirs(out_dir, exist_ok=True)

SPECS = [
    {"name": "Luzia", "sex": "f", "skin": 0, "height": 1.63, "hair": "trancas", "top": "blusa", "top_colour": "person3", "bottom": "pano", "bottom_colour": "awningRed", "bands": "cloth", "shoe": "chinelo", "smile": True},
    {"name": "Mário", "sex": "m", "skin": 2, "height": 1.78, "hair": "baixo", "top": "tshirt", "top_colour": "person1", "bottom": "trousers", "bottom_colour": "jeans", "shoe": "shoeWhite"},
    {"name": "Weza", "sex": "f", "skin": 3, "height": 1.68, "hair": "afro", "top": "vestido", "top_colour": "person4", "bottom": "none", "shoe": "shoeTan", "short": True},
    {"name": "Kota Zé", "sex": "m", "skin": 1, "height": 1.72, "build": 1.12, "hair": "baixo", "hair_colour": "hairGrey", "beard": True, "top": "shirt", "top_colour": "paintWhite", "bottom": "trousers", "bottom_colour": "khaki", "shoe": "shoe"},
    {"name": "Tia Bela", "sex": "f", "skin": 2, "height": 1.60, "build": 1.14, "hair": "lenco", "lenco": "person1", "top": "blusa", "top_colour": "awningTeal", "bottom": "pano", "bottom_colour": "zincBlue", "bands": "paintWhite", "shoe": "chinelo"},
    {"name": "Dino", "sex": "m", "skin": 4, "height": 1.82, "build": 0.94, "hair": "dreads", "top": "alcas", "top_colour": "person0", "bottom": "shorts", "bottom_colour": "clothBlack", "shoe": "chinelo", "smile": True},
    {"name": "Nádia", "sex": "f", "skin": 4, "height": 1.70, "build": 0.95, "hair": "puxinho", "top": "tshirt", "top_colour": "clothBlack", "bottom": "trousers", "bottom_colour": "jeansDark", "shoe": "shoeWhite"},
    {"name": "Paulo", "sex": "m", "skin": 0, "height": 1.75, "hair": "afro", "afro": 0.86, "top": "long", "top_colour": "vanBlue", "bottom": "trousers", "bottom_colour": "clothBlack", "shoe": "shoe"},
]

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

b = kit.Builder(palette, material, 10_000.0, smooth=True)
b.at(0.0, 0.0)
rng = random.Random(11)
SPACING = 1.0
standing = []
for i, spec in enumerate(SPECS):
    px = (i - (len(SPECS) - 1) / 2) * SPACING
    tall = person.pessoa(b, px, 0.0, 0.0, spec, rng)
    standing.append({"name": spec["name"], "x": round(px, 3), "z": 0.0, "height": tall, "model": f"pessoa-{i}.glb", "skirt": spec.get("bottom") in ("skirt", "pano") or spec.get("top") in ("dress", "vestido")})
b.write()

triangles = sum(len(polygon.vertices) - 2 for obj in bpy.data.objects if obj.type == "MESH" for polygon in obj.data.polygons)


def export(path, skins):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=not skins,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=False,
        export_normals=True,
        export_skins=skins,
    )


for obj in bpy.data.objects:
    obj.select_set(obj.type == "MESH")
export(os.path.join(out_dir, "pessoas.glb"), False)

# Each person again, alone at the origin, with a skeleton: what the game moves.
for i, spec in enumerate(SPECS):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    image = bpy.data.images.load(os.path.abspath(args[2]))
    material = bpy.data.materials.new("palette")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])

    one = kit.Builder(palette, material, 10_000.0, smooth=True)
    one.at(0.0, 0.0)
    one.weigher = person.pesos(spec)
    person.pessoa(one, 0.0, 0.0, 0.0, spec, random.Random(11 + i))
    one.write()
    body = one.objects[0]
    body.name = "body"

    scale = spec.get("height", 1.70) / 1.70
    data = bpy.data.armatures.new("skeleton")
    rig = bpy.data.objects.new("skeleton", data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    made = {}
    for name, parent, head, tail in person.ossos(spec):
        bone = data.edit_bones.new(name)
        # The game's (x, y, z) is Blender's (x, -z, y).
        bone.head = (head[0] * scale, -head[2] * scale, head[1] * scale)
        bone.tail = (tail[0] * scale, -tail[2] * scale, tail[1] * scale)
        bone.roll = 0.0
        if parent:
            bone.parent = made[parent]
        made[name] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    body.parent = rig
    modifier = body.modifiers.new("skeleton", "ARMATURE")
    modifier.object = rig
    for obj in bpy.data.objects:
        obj.select_set(True)
    export(os.path.join(out_dir, f"pessoa-{i}.glb"), True)

with open(os.path.join(out_dir, "pessoas.json"), "w", encoding="utf-8") as handle:
    json.dump({"people": standing, "triangles": triangles, "each": round(triangles / len(SPECS))}, handle, indent=2)
print(f"nzila: {len(SPECS)} people, {triangles} triangles in all, saved to {out_dir}")
