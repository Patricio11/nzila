# Builds a small test scene and saves it: two city blocks of plain boxes, a
# few round trees and a painted palette, spread over two chunks. It exists to
# test the pack pipeline (tools/pack/src/assets.integration.test.ts) and is
# not art: nothing made here ships.
#
#   blender -b --factory-startup --python art/scripts/make_test_block.py -- <out.blend>

import os
import sys

import bpy

out = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
bpy.ops.wm.read_factory_settings(use_empty=True)

# A small palette, written to a file so the exporter has a real image to carry.
palette = bpy.data.images.new("palette", width=64, height=64, alpha=False)
colours = [(0.71, 0.31, 0.18), (0.96, 0.95, 0.91), (0.12, 0.39, 0.77), (0.09, 0.53, 0.50)]
pixels = []
for y in range(64):
    for x in range(64):
        r, g, b = colours[(x // 32) + 2 * (y // 32)]
        pixels.extend((r, g, b, 1.0))
palette.pixels = pixels
palette.filepath_raw = os.path.join(os.path.dirname(out), "palette.png")
palette.file_format = "PNG"
palette.save()

material = bpy.data.materials.new("palette")
material.use_nodes = True
nodes = material.node_tree.nodes
texture = nodes.new("ShaderNodeTexImage")
texture.image = palette
shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])


# A second material with a picture of its own, as a landmark's hand-painted detail will have:
# its texture must come through the build, compressed. The palette's must not.
detail = bpy.data.materials.new("detail-ground")
detail.use_nodes = True
detail_texture = detail.node_tree.nodes.new("ShaderNodeTexImage")
detail_texture.image = palette
detail_shader = next(node for node in detail.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
detail.node_tree.links.new(detail_texture.outputs["Color"], detail_shader.inputs["Base Color"])


def finish(name, painted=False):
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(detail if painted else material)
    return obj


# The district runs from the origin toward +X and -Y (see export_chunks.py).
for chunk in range(2):
    east = chunk * 64
    bpy.ops.mesh.primitive_plane_add(size=60, location=(east + 32, -32, 0))
    finish(f"ground-{chunk}", painted=True)
    for i in range(4):
        height = 6 + 3 * i
        bpy.ops.mesh.primitive_cube_add(size=1, location=(east + 10 + i * 13, -14, height / 2))
        block = finish(f"block-{chunk}-{i}")
        block.scale = (9, 9, height)
    for i in range(3):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=2.5, location=(east + 14 + i * 16, -44, 5))
        finish(f"tree-{chunk}-{i}")

bpy.ops.wm.save_as_mainfile(filepath=out)
print(f"nzila: test block saved to {out}")
