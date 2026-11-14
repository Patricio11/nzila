# Builds the development district: a small town on a grid of streets with a
# promenade along a bay, four chunks by three (256 m by 192 m), made from the
# kit (kit.py) and coloured from the world's palette.
#
# From north to south: a bairro of houses on earth streets, a main street of
# buildings, and the promenade. Most of Angola lives in houses (D-0.42); the
# buildings are the smaller part on purpose.
#
# It exists so that streaming, the character controller and the camera can be
# built and measured before the first real district is modelled, and so that
# the look of a street (trees, buildings, kerbs, lamps, night) can be judged
# early. It is not Luanda and nothing made here ships.
#
#   blender -b --factory-startup --python art/scripts/make_dev_district.py -- <out dir> <palette.json> <palette.png>
#
# It writes <out dir>/district.blend, a walk grid for each chunk
# (chunks/<id>.walk.json), and <out dir>/layout.json: where the spawn, the
# water and a few places worth standing are, for the manifest.

import json
import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
out_dir = os.path.abspath(args[0])
with open(args[1], encoding="utf-8") as handle:
    palette = json.load(handle)
os.makedirs(os.path.join(out_dir, "chunks"), exist_ok=True)

CHUNK = 64
ACROSS, DOWN = 4, 3
CELL = 0.5
CELLS = int(CHUNK / CELL)
ROAD = 8.0
KERB = 0.14  # how far the pavement stands above the road
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

b = kit.Builder(palette, material, CHUNK)

# ---------------------------------------------------------------- walk grids
# Every cell begins as nothing. Rows run along the game's Z, cells along X.
flags = {(cx, cz): [["#"] * CELLS for _ in range(CELLS)] for cx in range(ACROSS) for cz in range(DOWN)}
heights = {(cx, cz): [[0] * CELLS for _ in range(CELLS)] for cx in range(ACROSS) for cz in range(DOWN)}


def mark(x0, z0, x1, z1, what, height_cm=None):
    """Marks a rectangle of the walk grid, in metres of the game's X and Z."""
    for iz in range(math.floor(z0 / CELL), math.ceil(z1 / CELL)):
        for ix in range(math.floor(x0 / CELL), math.ceil(x1 / CELL)):
            if 0 <= ix < ACROSS * CELLS and 0 <= iz < DOWN * CELLS:
                key = (ix // CELLS, iz // CELLS)
                flags[key][iz % CELLS][ix % CELLS] = what
                if height_cm is not None:
                    heights[key][iz % CELLS][ix % CELLS] = height_cm


def block(x, z, radius):
    mark(x - radius, z - radius, x + radius, z + radius, "#")


def flat(x0, z0, x1, z1, y, colour):
    b.face([(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], colour, toward=(0.0, 1.0, 0.0))


def pavement(x0, z0, x1, z1):
    flat(x0, z0, x1, z1, KERB, "pavement")
    mark(x0, z0, x1, z1, ".", round(KERB * 100))


def kerb_x(x0, x1, z, side):
    """A kerb along X at this Z; `side` is +1 when the road is to the south of it."""
    b.box(((x0 + x1) / 2, (KERB + 0.02) / 2, z + side * 0.13), (x1 - x0, KERB + 0.02, 0.26), "kerb")


def kerb_z(z0, z1, x, side):
    b.box((x + side * 0.13, (KERB + 0.02) / 2, (z0 + z1) / 2), (0.26, KERB + 0.02, z1 - z0), "kerb")


places = {"corners": [], "paragens": []}


def frontage(a0, a1, line, along_x, colour, house=None):
    """
    The street side of a plot between a0 and a1: a wall wherever the house itself
    does not stand on the street, with a gate, standing open, in the widest gap.
    """
    spans = [(a0, a1)] if house is None else [(a0, max(a0, house[0])), (min(a1, house[1]), a1)]
    spans = [s for s in spans if s[1] - s[0] > 0.3]
    widest = max(spans, key=lambda s: s[1] - s[0], default=None)
    for span in spans:
        pieces = [span]
        if span is widest and span[1] - span[0] >= 2.2:
            gate = rng.uniform(span[0] + 1.0, span[1] - 1.0)
            pieces = [(span[0], gate - 0.7), (gate + 0.7, span[1])]
            if along_x:
                kit.portao(b, gate, line, True, rng)
            else:
                kit.portao(b, line, gate, False, rng)
        for p0, p1 in pieces:
            if p1 - p0 < 0.15:
                continue
            if along_x:
                kit.muro(b, p0, line, p1, line, colour)
                mark(p0, line - 0.2, p1, line + 0.2, "#")
            else:
                kit.muro(b, line, p0, line, p1, colour)
                mark(line - 0.2, p0, line + 0.2, p1, "#")


def patch(x, z, radius, colour):
    """An uneven patch on an earth street: where water stood, where wheels dug."""
    points = []
    sides = rng.randint(5, 7)
    for k in range(sides):
        angle = 2 * math.pi * k / sides + rng.uniform(-0.3, 0.3)
        reach = radius * rng.uniform(0.55, 1.0)
        points.append((x + math.cos(angle) * reach * 1.7, 0.008, z + math.sin(angle) * reach * 0.6))
    b.face(points, colour, toward=(0.0, 1.0, 0.0))


def bairro(cx, cz):
    """
    One chunk of a bairro, from the founder's photographs: earth streets, houses of
    one storey standing on the street or just behind a wall, the quintal at the back,
    poles and wires. Sixteen houses to the chunk.
    """
    ox, oz = cx * CHUNK, cz * CHUNK
    mid = CHUNK / 2
    lo, hi = mid - ROAD / 2, mid + ROAD / 2
    b.at(ox + mid, oz + mid)
    b.level = kit.BOTH
    flat(ox, oz, ox + CHUNK, oz + CHUNK, 0.0, "sand")
    mark(ox, oz, ox + CHUNK, oz + CHUNK, ".", 0)
    mark(ox, oz + lo, ox + CHUNK, oz + hi, "=", 0)
    mark(ox + lo, oz, ox + hi, oz + CHUNK, "=", 0)
    # The streets are worn unevenly: nothing on them is straight.
    for i in range(14):
        along = rng.uniform(2, CHUNK - 2)
        if rng.random() < 0.5:
            patch(ox + along, oz + mid + rng.uniform(-2.6, 2.6), rng.uniform(0.8, 2.2), "sandDark")
        else:
            px, pz = ox + mid + rng.uniform(-2.6, 2.6), oz + along
            points = []
            for k in range(6):
                angle = 2 * math.pi * k / 6 + rng.uniform(-0.3, 0.3)
                reach = rng.uniform(0.6, 1.8)
                points.append((px + math.cos(angle) * reach * 0.6, 0.008, pz + math.sin(angle) * reach * 1.7))
            b.face(points, "sandDark", toward=(0.0, 1.0, 0.0))
    # A length of concrete pavement on one side only, and the drain beside it.
    if rng.random() < 0.7:
        x0, x1 = ox + hi + 0.5, ox + CHUNK
        b.box(((x0 + x1) / 2, 0.08, oz + lo - 0.75), (x1 - x0, 0.16, 1.5), "concrete")
        mark(x0, oz + lo - 1.5, x1, oz + lo, ".", 16)
        flat(x0, oz + lo + 0.02, x1, oz + lo + 0.35, 0.012, "tarShade")

    quarters = [(ox, oz, ox + lo, oz + lo, -1, -1), (ox + hi, oz, ox + CHUNK, oz + lo, 1, -1), (ox, oz + hi, ox + lo, oz + CHUNK, -1, 1), (ox + hi, oz + hi, ox + CHUNK, oz + CHUNK, 1, 1)]
    cantina_at = rng.randrange(4)
    for q, (x0, z0, x1, z1, east, south) in enumerate(quarters):
        half_x, half_z = (x0 + x1) / 2, (z0 + z1) / 2
        third = (x1 - x0) / 3
        near_z = (half_z, z1) if south < 0 else (z0, half_z)
        far_z = (z0, half_z) if south < 0 else (half_z, z1)
        near_x = (half_x, x1) if east < 0 else (x0, half_x)
        far_x = (x0, half_x) if east < 0 else (half_x, x1)
        # Three narrow plots face the street that runs east and west; one faces the other
        # street; the far corner is open ground with the tree everybody sits under.
        plots = [(x0 + i * third, near_z[0], x0 + (i + 1) * third, near_z[1], (0, -south)) for i in range(3)]
        plots.append((near_x[0], far_z[0], near_x[1], far_z[1], (-east, 0)))
        for n, (px0, pz0, px1, pz1, front) in enumerate(plots):
            b.at((px0 + px1) / 2, (pz0 + pz1) / 2)
            b.level = kit.BOTH
            kind = rng.choice(["bloco", "bloco", "bloco", "cru", "chapa", "chapa"])
            shop = q == cantina_at and n == 1
            inset = 0.12
            ax0, az0, ax1, az1 = px0 + inset, pz0 + inset, px1 - inset, pz1 - inset
            # Most houses stand on the street itself; some sit back behind their wall.
            on_street = shop or rng.random() < 0.7
            setback = 0.0 if on_street else rng.uniform(1.8, 3.2)
            front_colour = rng.choice(["blockGrey", "paintWhite", "wall0", "wall5", "wall1", "zincRed", "paintMint", "wall6", "wall3", "wall2"])
            if front[0] == 0:
                span = ax1 - ax0
                width, depth = min(rng.uniform(5.6, 7.4), span - 1.6), rng.uniform(5.0, 6.5)
                street_z = az1 if front[1] > 0 else az0
                yaw = 0.0 if front[1] > 0 else math.pi
                hx = (ax0 + width / 2 + 0.15) if rng.random() < 0.5 else (ax1 - width / 2 - 0.15)
                hz = street_z - front[1] * (setback + depth / 2)
                frontage(ax0, ax1, street_z, True, front_colour, (hx - width / 2, hx + width / 2) if on_street else None)
                back_z = az0 if front[1] > 0 else az1
                kit.muro(b, ax0, back_z, ax1, back_z, "blockGrey", height=1.5)
                mark(ax0, back_z - 0.2, ax1, back_z + 0.2, "#")
                kit.muro(b, ax0, az0, ax0, az1, "blockGrey", height=1.7)
                mark(ax0 - 0.2, az0, ax0 + 0.2, az1, "#")
                yard = ((ax0 + ax1) / 2 + rng.uniform(-1.0, 1.0), hz - front[1] * (depth / 2 + 2.6))
                house = (hx - width / 2, hz - depth / 2, hx + width / 2, hz + depth / 2)
            else:
                span = az1 - az0
                width, depth = min(rng.uniform(6.5, 9.0), span - 1.6), rng.uniform(5.0, 6.5)
                street_x = ax1 if front[0] > 0 else ax0
                yaw = math.pi / 2 if front[0] > 0 else -math.pi / 2
                hx = street_x - front[0] * (setback + depth / 2)
                hz = (az0 + width / 2 + 0.15) if rng.random() < 0.5 else (az1 - width / 2 - 0.15)
                frontage(az0, az1, street_x, False, front_colour, (hz - width / 2, hz + width / 2) if on_street else None)
                back_x = ax0 if front[0] > 0 else ax1
                kit.muro(b, back_x, az0, back_x, az1, "blockGrey", height=1.5)
                mark(back_x - 0.2, az0, back_x + 0.2, az1, "#")
                kit.muro(b, ax0, az0, ax1, az0, "blockGrey", height=1.7)
                mark(ax0, az0 - 0.2, ax1, az0 + 0.2, "#")
                yard = (hx - front[0] * (depth / 2 + 2.6), (az0 + az1) / 2 + rng.uniform(-1.0, 1.0))
                house = (hx - depth / 2, hz - width / 2, hx + depth / 2, hz + width / 2)
            kit.casa(b, hx, hz, yaw, rng, kind=kind, width=width, depth=depth, shop=shop)
            mark(house[0] - 0.1, house[1] - 0.1, house[2] + 0.1, house[3] + 0.1, "#")
            # The quintal is the backyard: behind the house.
            block(yard[0], yard[1], kit.quintal(b, yard[0], yard[1], rng))
            drops.append(((hx, 3.2, hz), (cx, cz)))
        # The open corner: a big tree, and a bench under it.
        tx, tz = (far_x[0] + far_x[1]) / 2 + rng.uniform(-2, 2), (far_z[0] + far_z[1]) / 2 + rng.uniform(-2, 2)
        block(tx, tz, kit.acacia(b, tx, tz, rng, 0.0, shade="sandDark"))
        block(tx + 2.4, tz + 1.2, kit.bench(b, tx + 2.4, tz + 1.2, rng.uniform(0, math.pi), 0.0))

    # Poles down the street, off its edge, the wires between them, and a wire to every house.
    tops = []
    at = ox + rng.uniform(3, 8)
    while at < ox + CHUNK - 2:
        if not (lo - 2 < at - ox < hi + 2):
            pz = oz + hi - rng.uniform(0.5, 1.0)
            block(at, pz, 0.25)
            tops.append(kit.poste(b, at, pz, rng, lamp=rng.random() < 0.4))
        at += rng.uniform(15, 21)
    b.at(ox + mid, oz + mid)
    for first, second in zip(tops, tops[1:]):
        for wire in (0, 1):
            kit.fio(b, first[wire], second[wire], sag=rng.uniform(0.5, 1.0))
    for point, owner in drops:
        if owner == (cx, cz) and tops:
            nearest = min(tops, key=lambda top: (top[0][0] - point[0]) ** 2 + (top[0][2] - point[2]) ** 2)
            kit.fio(b, nearest[1], point, sag=rng.uniform(0.3, 0.8), parts=3)


drops = []

for cx in range(ACROSS):
    for cz in range(DOWN):
        ox, oz = cx * CHUNK, cz * CHUNK
        mid = CHUNK / 2
        lo, hi = mid - ROAD / 2, mid + ROAD / 2
        seaside = cz == DOWN - 1
        if cz == 0:
            # The north of the town is a bairro; the middle is its main street; the south is the bay.
            bairro(cx, cz)
            continue
        b.at(ox + mid, oz + mid)
        b.level = kit.BOTH

        # The street running east and west, and the one running north and south.
        flat(ox, oz + lo, ox + CHUNK, oz + hi, 0.0, "tar")
        mark(ox, oz + lo, ox + CHUNK, oz + hi, "=", 0)
        flat(ox + lo, oz, ox + hi, oz + lo, 0.0, "tar")
        mark(ox + lo, oz, ox + hi, oz + lo, "=", 0)
        if not seaside:
            flat(ox + lo, oz + hi, ox + hi, oz + CHUNK, 0.0, "tar")
            mark(ox + lo, oz + hi, ox + hi, oz + CHUNK, "=", 0)

        # The white dashes down the middle, and the crossings at the junction.
        for i in range(11):
            at = 3 + i * 5.8
            if not (lo - 5 < at < hi + 5):
                flat(ox + at - 1.2, oz + mid - 0.08, ox + at + 1.2, oz + mid + 0.08, 0.012, "line")
                if not (seaside and at > hi):
                    flat(ox + mid - 0.08, oz + at - 1.2, ox + mid + 0.08, oz + at + 1.2, 0.012, "line")
        for i in range(5):
            stripe = lo + 0.9 + i * 1.5
            flat(ox + lo - 3.6, oz + stripe, ox + lo - 1.0, oz + stripe + 0.6, 0.012, "line")
            flat(ox + hi + 1.0, oz + stripe, ox + hi + 3.6, oz + stripe + 0.6, 0.012, "line")
            flat(ox + stripe, oz + lo - 3.6, ox + stripe + 0.6, oz + lo - 1.0, 0.012, "line")
            if not seaside:
                flat(ox + stripe, oz + hi + 1.0, ox + stripe + 0.6, oz + hi + 3.6, 0.012, "line")

        # The four pavements, each with its kerbs toward the streets.
        quarters = [(ox, oz, ox + lo, oz + lo, -1, -1), (ox + hi, oz, ox + CHUNK, oz + lo, 1, -1)]
        if not seaside:
            quarters += [(ox, oz + hi, ox + lo, oz + CHUNK, -1, 1), (ox + hi, oz + hi, ox + CHUNK, oz + CHUNK, 1, 1)]
        for x0, z0, x1, z1, east, south in quarters:
            b.at((x0 + x1) / 2, (z0 + z1) / 2)
            b.level = kit.BOTH
            pavement(x0, z0, x1, z1)
            kerb_x(x0, x1, z1 if south < 0 else z0, 1 if south < 0 else -1)
            kerb_z(z0, z1, x1 if east < 0 else x0, 1 if east < 0 else -1)
            # A band of darker paving inside each kerb: the line the trees and the lamps stand on.
            if south < 0:
                flat(x0, z1 - 2.4, x1, z1 - 0.6, KERB + 0.006, "pavementShade")
            else:
                flat(x0, z0 + 0.6, x1, z0 + 2.4, KERB + 0.006, "pavementShade")
            if east < 0:
                flat(x1 - 2.4, z0, x1 - 0.6, z1, KERB + 0.008, "pavementShade")
            else:
                flat(x0 + 0.6, z0, x0 + 2.4, z1, KERB + 0.008, "pavementShade")
            centre_x, centre_z = (x0 + x1) / 2, (z0 + z1) / 2
            # The corner nearest the junction, kept clear: it is where people stand.
            corner_x = x1 - 2.6 if east < 0 else x0 + 2.6
            corner_z = z1 - 2.6 if south < 0 else z0 + 2.6
            places["corners"].append([round(corner_x, 2), KERB, round(corner_z, 2)])
            lamp_x = x1 - 0.9 if east < 0 else x0 + 0.9
            lamp_z = z1 - 0.9 if south < 0 else z0 + 0.9
            block(lamp_x, lamp_z, kit.lamp(b, lamp_x, lamp_z, (-east * 1.0, -south * 1.0), KERB))

            if rng.random() < 0.18:
                # A small square: shade, benches, a seller or two.
                for i in range(rng.randint(3, 4)):
                    tx, tz = centre_x + rng.uniform(-8, 8), centre_z + rng.uniform(-8, 8)
                    block(tx, tz, kit.acacia(b, tx, tz, rng, KERB))
                for i in range(3):
                    bx, bz = centre_x + rng.uniform(-9, 9), centre_z + rng.uniform(-9, 9)
                    block(bx, bz, kit.bench(b, bx, bz, rng.uniform(0, math.pi), KERB))
                for i in range(2):
                    px, pz = centre_x + rng.uniform(-9, 9), centre_z + rng.uniform(-9, 9)
                    block(px, pz, kit.parasol(b, px, pz, rng, KERB))
            else:
                width, depth = rng.uniform(13, 18), rng.uniform(13, 18)
                floors = rng.choice([2, 3, 3, 4, 4, 5, 6, 8])
                bx = centre_x - east * rng.uniform(0.5, 2.0)
                bz = centre_z - south * rng.uniform(0.5, 2.0)
                kit.building(b, bx, bz, width, depth, floors, f"wall{rng.randrange(8)}", rng, KERB)
                mark(bx - width / 2 - 0.2, bz - depth / 2 - 0.2, bx + width / 2 + 0.2, bz + depth / 2 + 0.2, "#")

            # Trees along the two streets, unevenly spaced, none of them alike.
            edge_z = z1 - 1.5 if south < 0 else z0 + 1.5
            edge_x = x1 - 1.5 if east < 0 else x0 + 1.5
            at = x0 + rng.uniform(3, 6)
            while at < x1 - 3:
                if abs(at - corner_x) > 4.5:
                    block(at, edge_z, kit.acacia(b, at, edge_z, rng, KERB, shade_reach=1.4))
                    if rng.random() < 0.35 and at + 3.2 < x1 - 1.0:
                        block(at + 3.2, edge_z - south * 0.6, kit.bench(b, at + 3.2, edge_z - south * 0.6, 0.0, KERB))
                at += rng.uniform(8.5, 13.5)
            at = z0 + rng.uniform(4, 8)
            while at < z1 - 3:
                if abs(at - corner_z) > 4.5 and abs(at - edge_z) > 4:
                    block(edge_x, at, kit.acacia(b, edge_x, at, rng, KERB, shade_reach=1.4))
                at += rng.uniform(9.5, 15.0)
            if rng.random() < 0.3:
                px = corner_x + east * rng.uniform(1.5, 3.0)
                pz = corner_z + south * rng.uniform(3.5, 5.0)
                block(px, pz, kit.parasol(b, px, pz, rng, KERB))

        # A paragem with a van standing at it, on the north side of the street, in every other chunk.
        if cx % 2 == 1 and not seaside:
            stop_x = ox + hi + 14
            kit.paragem(b, stop_x, oz + lo - 1.4, 0.0, KERB)
            # Only the shelter's back wall stops anyone: people stand under the roof, in front of it.
            mark(stop_x - 2.1, oz + lo - 2.4, stop_x + 2.1, oz + lo - 2.0, "#")
            kit.candongueiro(b, stop_x + 1.0, oz + lo + 1.3, 0.0)
            places["paragens"].append([round(stop_x, 2), KERB, round(oz + lo - 0.9, 2)])

        if seaside:
            # The promenade: a wide walk along the bay, a low wall, palms, benches that face the water.
            b.at(ox + mid, oz + hi + 8)
            b.level = kit.BOTH
            wall = oz + hi + 16.5
            pavement(ox, oz + hi, ox + CHUNK, wall)
            # Two bands down its length: one where the palms stand, one where the lamps do.
            flat(ox, wall - 2.9, ox + CHUNK, wall - 0.5, KERB + 0.006, "pavementShade")
            flat(ox, oz + hi + 0.5, ox + CHUNK, oz + hi + 1.6, KERB + 0.006, "pavementShade")
            kerb_x(ox, ox + CHUNK, oz + hi, -1)
            # Low enough to sit on, and to see the bay over from anywhere on the walk.
            b.box((ox + mid, 0.36, wall + 0.25), (CHUNK, 0.72, 0.5), "kerb")
            mark(ox, wall, ox + CHUNK, wall + 0.7, "#")
            # Below the wall, the rocks, and then the bay.
            flat(ox, wall + 0.6, ox + CHUNK, oz + CHUNK, -0.75, "plinth")
            mark(ox, wall + 0.7, ox + CHUNK, oz + CHUNK, "~", -60)
            at = ox + rng.uniform(2, 5)
            while at < ox + CHUNK - 1:
                pz = wall - rng.uniform(1.3, 2.2)
                block(at, pz, kit.palm(b, at, pz, rng, KERB))
                at += rng.uniform(6.5, 10.5)
            for i in range(3):
                bx = ox + 8 + i * 21 + rng.uniform(-3, 3)
                block(bx, wall - 4.2, kit.bench(b, bx, wall - 4.2, math.pi, KERB))
            for i in range(4):
                lx = ox + 6 + i * 16
                block(lx, oz + hi + 1.0, kit.lamp(b, lx, oz + hi + 1.0, (0.0, 1.0), KERB))
            for i in range(rng.randint(1, 2)):
                px, pz = ox + rng.uniform(6, 58), oz + hi + rng.uniform(5, 9)
                block(px, pz, kit.parasol(b, px, pz, rng, KERB))

# Everything must belong to a chunk that exists: a bench one step over the edge once made a thirteenth.
stray = sorted({chunk for (chunk, level) in b.groups if not (0 <= chunk[0] < ACROSS and 0 <= chunk[1] < DOWN)})
if stray:
    raise SystemExit(f"nzila: something was built outside the district, in chunk(s) {stray}")

b.write()

for (cx, cz) in flags:
    grid = {
        "cellMm": int(CELL * 1000),
        "cellX0": cx * CELLS,
        "cellZ0": cz * CELLS,
        "rows": ["".join(row) for row in flags[(cx, cz)]],
        "heightsCm": heights[(cx, cz)],
    }
    with open(os.path.join(out_dir, "chunks", f"c-{cx:02d}-{cz:02d}.walk.json"), "w", encoding="utf-8") as handle:
        json.dump(grid, handle)

sea_wall = (DOWN - 1) * CHUNK + CHUNK / 2 + ROAD / 2 + 16.5
layout = {
    "bounds": {"minX": 0, "minZ": 0, "maxX": ACROSS * CHUNK, "maxZ": DOWN * CHUNK},
    "spawn": places["corners"][3],
    "corners": places["corners"],
    "paragens": places["paragens"],
    "seats": [{"pos": [round(x, 2), round(y, 2), round(z, 2)], "facing": round(math.degrees(yaw) % 360, 1)} for x, y, z, yaw in b.seats],
    # The bay: from the foot of the sea wall out past the edge of what is modelled.
    "water": {"rect": [-300, sea_wall + 0.6, ACROSS * CHUNK + 300, DOWN * CHUNK + 400], "level": -0.45},
    "promenade": {"z": sea_wall - 5.0},
}
with open(os.path.join(out_dir, "layout.json"), "w", encoding="utf-8") as handle:
    json.dump(layout, handle, indent=2)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "district.blend"))
print(f"nzila: development district saved to {out_dir}")
