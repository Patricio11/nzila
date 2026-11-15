# Builds the wardrobe: every body a player may have and every way of wearing
# their hair, each as its own model with the shared skeleton, painted with
# markers and not with colours. The game puts a body and a head of hair
# together and repaints the markers with what the player chose
# (apps/client/src/render/wardrobe.ts), so one small set of models dresses
# everybody.
#
#   blender -b --factory-startup --python art/scripts/make_wardrobe.py -- <out dir> <palette.json> <palette.png>
#
# It writes <out dir>/corpo-<sex>-<top>-<bottom>.glb, cabelo-<sex>-<style>.glb
# and guarda-roupa.json (what there is).

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

# What each of them may wear and how they may wear their hair. A style with no model ("baixo", "careca")
# is only the scalp, which is part of the body.
SEXES = {
    "f": {"height": 1.64, "tops": ["tshirt", "blusa", "alcas"], "bottoms": ["trousers", "shorts", "skirt", "pano"], "whole": ["vestido"], "hair": ["baixo", "careca", "afro", "cachos", "trancas", "bob", "puxinho", "dreads", "lenco", "bone"], "extras": ["brincos", "oculos"]},
    "m": {"height": 1.76, "tops": ["tshirt", "long", "alcas"], "bottoms": ["trousers", "shorts"], "whole": [], "hair": ["baixo", "careca", "afro", "galo", "dreads", "trancas", "bone"], "extras": ["barba", "bigode", "oculos", "brincos"]},
}
MARKERS = {"skin_colour": "slotSkin", "lip_colour": "slotLip", "lip_dark": "slotLipDark", "hair_colour": "slotHair", "lenco": "slotHair", "cap": "slotHair", "brow_colour": "hairBlack", "top_colour": "slotTop", "bottom_colour": "slotBottom", "bands": "slotBands", "shoe": "slotShoe"}
NO_MODEL = ("baixo", "careca")


def build(spec, path, only):
    """One piece with the skeleton, saved to `path`. Returns its triangles, or 0 when there was nothing to it."""
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
    one.only = only
    one.weigher = person.pesos(spec)
    person.pessoa(one, 0.0, 0.0, 0.0, spec, random.Random(7))
    one.write()
    if not one.objects:
        return 0
    body = one.objects[0]
    body.name = only
    triangles = sum(len(polygon.vertices) - 2 for polygon in body.data.polygons)

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
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False, export_yup=True, export_cameras=False, export_lights=False, export_animations=False, export_extras=False, export_normals=True, export_skins=True)
    return triangles


listed = {}
count = 0
for sex, has in SEXES.items():
    base = {"sex": sex, "height": has["height"], **MARKERS}
    bodies = {}
    outfits = [(top, bottom) for top in has["tops"] for bottom in has["bottoms"]] + [(whole, "none") for whole in has["whole"]]
    for top, bottom in outfits:
        name = f"corpo-{sex}-{top}-{bottom}.glb"
        # The scalp is painted as hair: the game repaints it as skin for a shaved head.
        triangles = build({**base, "hair": "baixo", "top": top, "bottom": bottom, "short": top == "vestido"}, os.path.join(out_dir, name), "body")
        bodies.setdefault(top, {})[bottom] = {"model": name, "triangles": triangles, "skirt": bottom in ("skirt", "pano") or top == "vestido"}
        count += 1
    hair = {}
    for style in has["hair"]:
        name = f"cabelo-{sex}-{style}.glb"
        triangles = 0 if style in NO_MODEL else build({**base, "hair": style, "top": "tshirt", "bottom": "trousers"}, os.path.join(out_dir, name), "hair")
        hair[style] = {"model": name, "triangles": triangles} if triangles else None
        count += 1 if triangles else 0
    # What is worn on the face and the ears: a beard takes the hair's natural dark, hoops are gold, glasses black.
    extras = {}
    for extra in has["extras"]:
        name = f"extra-{sex}-{extra}.glb"
        wearing = {"beard": True, "bigode": True, "beard_colour": "slotHair", "brincos": "awningGold", "oculos": "clothBlack"}
        triangles = build({**base, **wearing, "hair": "baixo", "top": "tshirt", "bottom": "trousers"}, os.path.join(out_dir, name), extra)
        extras[extra] = {"model": name, "triangles": triangles}
        count += 1
    listed[sex] = {"height": has["height"], "bodies": bodies, "hair": hair, "extras": extras}

with open(os.path.join(out_dir, "guarda-roupa.json"), "w", encoding="utf-8") as handle:
    json.dump(listed, handle, ensure_ascii=False)
print(f"nzila: wardrobe of {count} pieces, saved to {out_dir}")
