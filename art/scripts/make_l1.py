# Builds district L1, Marginal e Baixa, at postcard scale: 448 m by 256 m,
# seven chunks by four. The brief is docs/reference/WORLD_ATLAS.md (L1) and
# docs/reference/LUANDA_REFERENCE.md §1 to §6d; the founder's photographs are
# what the promenade is drawn from.
#
# The bay is to the north (smaller Z). The shore is a curve: the promenade,
# its cycle lane, its lawns and the avenue follow it; behind them the Baixa is
# a grid of straight streets. The fortress stands on its hill at the west end.
#
#   blender -b --factory-startup --python art/scripts/make_l1.py -- <out dir> <palette.json> <palette.png>
#
# It writes <out dir>/district.blend, a walk grid for each chunk, the routes'
# splines, the district's words (strings.pt-AO.json) and district.partial.json:
# the manifest but for its chunks, which the build measures.
#
# This is art pass 1: the kit. The six landmarks are stand-ins of the right
# shape and colour, to be remade by hand in pass 2 (stub S-2).

import json
import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import kit_baixa as kb  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
out_dir = os.path.abspath(args[0])
with open(args[1], encoding="utf-8") as handle:
    palette = json.load(handle)
os.makedirs(os.path.join(out_dir, "chunks"), exist_ok=True)

CHUNK = 64
ACROSS, DOWN = 7, 4
WIDE, DEEP = ACROSS * CHUNK, DOWN * CHUNK
CELL = 0.5
CELLS = int(CHUNK / CELL)
G = 0.14  # how far a pavement stands above the road
STEP = 4.0  # the length of one piece of the curved bands
rng = random.Random(1576)

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

# ------------------------------------------------------------------ the plan
HILL_X = 96.0  # west of this the ground is the fortress hill
FORT = (40.0, 132.0)
FORT_TOP = 15.0
CROSS = [(100, 108), (180, 188), (260, 268), (340, 348), (420, 428)]  # the streets that run inland
BLOCKS = [(108, 180), (188, 260), (268, 340), (348, 420), (428, WIDE)]
STREET_A = (150.0, 158.0)
STREET_B = (200.0, 208.0)
BACK = 240.0  # beyond this is skyline only
# Across the promenade, in metres from the water's edge.
EDGE, WALK, CYCLE, LAWN, PAVE, AVENUE, FRONT = 1.0, 9.5, 12.0, 30.0, 33.0, 49.0, 54.0
PIER_X = 226.0


def shore(x):
    """The Z of the water's edge at this X: a crescent, deepest in the middle."""
    u = (x - WIDE / 2) / (WIDE / 2)
    return 62.0 - 38.0 * u * u


# The path up the hill, from the foot of the first inland street to a terrace over the bay. It climbs
# evenly along its length; the hill is cut and banked to carry it.
PATH = [(102.0, 154.0), (84.0, 150.0), (72.0, 136.0), (66.0, 116.0), (56.0, 100.0)]
VIEW = (50.0, 96.0)
PATH_TOP = 12.6
_lengths = [math.hypot(PATH[i + 1][0] - PATH[i][0], PATH[i + 1][1] - PATH[i][1]) for i in range(len(PATH) - 1)]


def path_at(x, z):
    """How far this point is from the path, and how high the path is at its nearest point."""
    best = (1e9, 0.0)
    walked = 0.0
    for i, length in enumerate(_lengths):
        (ax, az), (cx, cz) = PATH[i], PATH[i + 1]
        u = min(1.0, max(0.0, ((x - ax) * (cx - ax) + (z - az) * (cz - az)) / (length * length)))
        d = math.hypot(x - (ax + (cx - ax) * u), z - (az + (cz - az) * u))
        if d < best[0]:
            best = (d, G + (PATH_TOP - G) * (walked + length * u) / sum(_lengths))
        walked += length
    d_view = math.hypot(x - VIEW[0], z - VIEW[1])
    if d_view - 8.0 < best[0]:
        best = (max(0.0, d_view - 8.0), PATH_TOP)
    return best


def raw_hill(x, z):
    d = math.hypot(x - FORT[0], z - FORT[1])
    u = min(1.0, max(0.0, 1 - (d - 24.0) / 46.0))
    edge = min(1.0, max(0.0, (HILL_X - x) / 10.0))
    return FORT_TOP * u * u * (3 - 2 * u) * edge


def hill(x, z):
    """How high the ground of the fortress hill stands here, the path's cutting included."""
    near, height = path_at(x, z)
    w = min(1.0, max(0.0, 1 - (near - 2.6) / 4.5))
    w = w * w * (3 - 2 * w)
    return raw_hill(x, z) * (1 - w) + height * w


# ---------------------------------------------------------------- walk grids
flags = {(cx, cz): [["#"] * CELLS for _ in range(CELLS)] for cx in range(ACROSS) for cz in range(DOWN)}
heights = {(cx, cz): [[0] * CELLS for _ in range(CELLS)] for cx in range(ACROSS) for cz in range(DOWN)}


def set_cell(ix, iz, what, height_cm=None):
    if 0 <= ix < ACROSS * CELLS and 0 <= iz < DOWN * CELLS:
        key = (ix // CELLS, iz // CELLS)
        flags[key][iz % CELLS][ix % CELLS] = what
        if height_cm is not None:
            heights[key][iz % CELLS][ix % CELLS] = height_cm


def mark(x0, z0, x1, z1, what, height_cm=None):
    for iz in range(math.floor(z0 / CELL), math.ceil(z1 / CELL)):
        for ix in range(math.floor(x0 / CELL), math.ceil(x1 / CELL)):
            set_cell(ix, iz, what, height_cm)


def block(x, z, radius):
    mark(x - radius, z - radius, x + radius, z + radius, "#")


# The ground first, cell by cell, from the plan; what is built later blocks its own cells.
for iz in range(DOWN * CELLS):
    for ix in range(ACROSS * CELLS):
        x, z = (ix + 0.5) * CELL, (iz + 0.5) * CELL
        d = z - shore(x)
        if x < HILL_X:
            set_cell(ix, iz, "~" if d < 0 else "#", -60 if d < 0 else round(hill(x, z) * 100))
        elif d < 0:
            set_cell(ix, iz, "~", -60)
        elif z >= BACK:
            set_cell(ix, iz, "#", 0)
        elif d < PAVE:
            set_cell(ix, iz, ".", round(G * 100))
        elif d < AVENUE:
            # The planted strip down the middle stops at each inland street, which is where people cross;
            # between them it is low, and a jump clears it (its trees still stop a body).
            set_cell(ix, iz, "^" if 40.4 < d < 41.6 and not any(lo - 1 <= x < hi + 1 for lo, hi in CROSS) else "=", 0)
        elif any(lo <= x < hi for lo, hi in CROSS) or STREET_A[0] <= z < STREET_A[1] or STREET_B[0] <= z < STREET_B[1]:
            set_cell(ix, iz, "=", 0)
        else:
            set_cell(ix, iz, ".", round(G * 100))

# ------------------------------------------------------------------ helpers
places = {"pois": [], "paragens": [], "police": [], "residences": []}
words = {"world.ao-lua.l1.name": "Marginal e Baixa"}


def flat(x0, z0, x1, z1, y, colour):
    """A flat rectangle of ground, cut along the chunk lines so that each piece belongs to its own chunk."""
    xs = [x0] + [c * CHUNK for c in range(1, ACROSS) if x0 < c * CHUNK < x1] + [x1]
    zs = [z0] + [c * CHUNK for c in range(1, DOWN) if z0 < c * CHUNK < z1] + [z1]
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            b.at((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2)
            b.face([(xs[i], y, zs[j]), (xs[i + 1], y, zs[j]), (xs[i + 1], y, zs[j + 1]), (xs[i], y, zs[j + 1])], colour, toward=(0.0, 1.0, 0.0))


def band(xa, xb, da, db, y, colour):
    """One piece of a band that follows the shore, between two distances from the water."""
    points = [(xa, y, shore(xa) + da), (xb, y, shore(xb) + da), (xb, y, shore(xb) + db), (xa, y, shore(xa) + db)]
    b.at((xa + xb) / 2, (points[0][2] + points[2][2]) / 2)
    b.face(points, colour, toward=(0.0, 1.0, 0.0))


def riser(xa, xb, d, y0, y1, colour):
    """The upright face of a kerb along the shore's curve, seen from the lower side."""
    b.at((xa + xb) / 2, shore((xa + xb) / 2) + d)
    b.face([(xa, y0, shore(xa) + d), (xb, y0, shore(xb) + d), (xb, y1, shore(xb) + d), (xa, y1, shore(xa) + d)], colour, two_sided=True)


def poi(key, x, z, name, line, y=G):
    words[f"l1.poi.{key}.name"] = name
    words[f"l1.poi.{key}.line"] = line
    places["pois"].append({"id": key, "pos": [round(x, 2), y, round(z, 2)], "nameKey": f"l1.poi.{key}.name", "lineKey": f"l1.poi.{key}.line", "positive": True, "stamp": False})


def paragem(key, x, z, name, van_z):
    words[f"l1.paragem.{key}"] = name
    kit.paragem(b, x, z, 0.0, G)
    mark(x - 2.1, z - 1.0, x + 2.1, z - 0.6, "#")
    # No van is parked here: the ones on the linhas come and stand at it (render/traffic.ts).
    places["paragens"].append({"id": key, "pos": [round(x, 2), G, round(z + 0.5, 2)], "nameKey": f"l1.paragem.{key}"})


# ------------------------------------------------------- the promenade's bands
b.level = kit.BOTH
x = HILL_X
n = 0
while x < WIDE:
    xa, xb = x, min(WIDE, x + STEP)
    # The low stone edge people sit on, and its face down to the water.
    band(xa, xb, 0.0, EDGE, G + 0.22, "kerb")
    riser(xa, xb, 0.0, -1.2, G + 0.22, "kerb")
    riser(xa, xb, EDGE, G, G + 0.22, "kerb")
    # The walk, in calçada: two stones laid in a pattern that runs the length of the bay.
    # The walk: pale stone, two darker courses running the length of the bay, a joint across every few
    # metres, and the yellow line along the water as in the founder's photograph.
    band(xa, xb, EDGE, WALK, G, "calcadaLight")
    for course in (3.6, 6.8):
        band(xa, xb, course, course + 0.45, G + 0.004, "calcadaDark")
    if n % 2 == 0:
        band(xa, xa + 0.3, EDGE, WALK, G + 0.005, "calcadaDark")
    band(xa, xb, 1.7, 1.86, G + 0.006, "awningGold")
    band(xa, xb, WALK, CYCLE, G + 0.004, "cycleRed")
    band(xa, xb, LAWN, PAVE, G, "pavement")
    in_street = any(lo <= xa < hi for lo, hi in CROSS)
    # The avenue: two lanes each way and a planted strip between.
    band(xa, xb, PAVE, AVENUE, 0.0, "tar")
    riser(xa, xb, PAVE, 0.0, G, "kerb")
    if not in_street:
        band(xa, xb, 40.4, 41.6, G, "kerb")
        riser(xa, xb, 40.4, 0.0, G, "kerb")
        riser(xa, xb, 41.6, 0.0, G, "kerb")
    if n % 2 == 0:
        for lane in (36.9, 45.1):
            band(xa + 0.6, xb - 0.9, lane - 0.07, lane + 0.07, 0.012, "line")
    if not in_street:
        riser(xa, xb, AVENUE, 0.0, G, "kerb")
    # From the avenue back to the first straight street: pavement, or the tar of a street running inland.
    back_a, back_b = STREET_A[0] - shore(xa), STREET_A[0] - shore(xb)
    points = [(xa, 0.0 if in_street else G, shore(xa) + AVENUE), (xb, 0.0 if in_street else G, shore(xb) + AVENUE), (xb, 0.0 if in_street else G, STREET_A[0]), (xa, 0.0 if in_street else G, STREET_A[0])]
    mid_z = (shore(xa) + AVENUE + STREET_A[0]) / 2
    for z0, z1 in [(points[0][2], min(CHUNK * 2, STREET_A[0])), (CHUNK * 2, STREET_A[0])] if points[0][2] < CHUNK * 2 < STREET_A[0] else [(points[0][2], STREET_A[0])]:
        b.at((xa + xb) / 2, (max(z0, shore((xa + xb) / 2) + AVENUE) + z1) / 2)
        near_a = shore(xa) + AVENUE if z0 == points[0][2] else z0
        near_b = shore(xb) + AVENUE if z0 == points[0][2] else z0
        b.face([(xa, points[0][1], near_a), (xb, points[0][1], near_b), (xb, points[0][1], z1), (xa, points[0][1], z1)], "tar" if in_street else "pavement", toward=(0.0, 1.0, 0.0))
    x += STEP
    n += 1

# The lawn, in longer pieces, with the cycle lane's white edge.
x = HILL_X
while x < WIDE:
    xa, xb = x, min(WIDE, x + STEP)
    band(xa, xb, CYCLE, LAWN, G + 0.03, "lawn")
    band(xa, xb, CYCLE - 0.12, CYCLE, G + 0.008, "line")
    x += STEP

# ------------------------------------------------------- the Baixa's ground
flat(HILL_X, STREET_A[0], WIDE, STREET_A[1], 0.0, "tar")
flat(HILL_X, STREET_B[0], WIDE, STREET_B[1], 0.0, "tar")
for lo, hi in CROSS:
    flat(lo, STREET_A[1], hi, STREET_B[0], 0.0, "tar")
    flat(lo, STREET_B[1], hi, BACK, 0.0, "tar")
edges = [HILL_X] + [v for pair in CROSS for v in pair] + [WIDE]
for i in range(0, len(edges), 2):
    x0, x1 = edges[i], edges[i + 1]
    if x1 - x0 < 1:
        continue
    for z0, z1 in [(STREET_A[1], STREET_B[0]), (STREET_B[1], BACK)]:
        flat(x0, z0, x1, z1, G, "pavement")
        for edge_z, side in [(z0, -1), (z1, 1)]:
            b.at((x0 + x1) / 2, edge_z)
            flat(x0, edge_z - 0.13 if side < 0 else edge_z, x1, edge_z if side < 0 else edge_z + 0.13, G, "kerb")
flat(HILL_X, BACK, WIDE, DEEP, 0.0, "earth")
# Dashes down the two straight streets.
for street in (STREET_A, STREET_B):
    at = HILL_X + 6
    while at < WIDE - 3:
        if not any(lo - 4 < at < hi + 4 for lo, hi in CROSS):
            mid = (street[0] + street[1]) / 2
            flat(at, mid - 0.07, at + 2.4, mid + 0.07, 0.012, "line")
        at += 6
# A crossing where each inland street meets the avenue and the first street.
for lo, hi in CROSS:
    for i in range(5):
        xs = lo + 0.8 + i * 1.5
        flat(xs, STREET_A[0] - 4.0, xs + 0.6, STREET_A[0] - 1.2, 0.012, "line")
        zc = shore(xs) + AVENUE
        flat(xs, zc - 16.0 + 0.5, xs + 0.6, zc - 16.0 + 7.0, 0.012, "line")
        flat(xs, zc - 7.2, xs + 0.6, zc - 0.6, 0.012, "line")

# ------------------------------------------------------- the hill and the fortress
b.level = kit.BOTH
step = 2.0
gx = 0.0
while gx < HILL_X + 8:
    gz = math.floor(min(shore(gx), shore(gx + step)) / step) * step
    while gz < BACK:
        corners = [(gx, gz), (gx + step, gz), (gx + step, gz + step), (gx, gz + step)]
        if all(c[1] <= shore(c[0]) for c in corners):
            gz += step
            continue
        if gx >= HILL_X and all(path_at(c[0], c[1])[0] > 7.5 for c in corners):
            gz += step
            continue
        pts = [(cx, max(hill(cx, cz), G) + (0.02 if gx >= HILL_X else 0.0) if cz >= shore(cx) else -1.0, cz) for cx, cz in corners]
        high = max(p[1] for p in pts)
        b.at(gx + step / 2, gz + step / 2)
        on_path = all(path_at(c[0], c[1])[0] < 2.4 for c in corners)
        colour = "calcadaLight" if on_path else ("hillGrass" if high > 1.0 and (int(gx / 4) + int(gz / 4)) % 3 else ("hillGrassDark" if high > 1.0 else "pavement"))
        b.face([pts[0], pts[1], pts[2]], colour, toward=(0.0, 1.0, 0.0))
        b.face([pts[0], pts[2], pts[3]], colour, toward=(0.0, 1.0, 0.0))
        gz += step
    gx += step
flat(0, BACK, HILL_X, DEEP, 0.0, "earth")
kb.fortaleza(b, FORT[0], FORT[1], FORT_TOP, rng)
# The path's cells, and the terrace's, at the path's own height.
for iz in range(int(80 / CELL), int(170 / CELL)):
    for ix in range(int(30 / CELL), int(110 / CELL)):
        qx, qz = (ix + 0.5) * CELL, (iz + 0.5) * CELL
        near, height = path_at(qx, qz)
        if near < 2.0 and qz > shore(qx) + 2 and qx < HILL_X + 8:
            set_cell(ix, iz, ".", round(height * 100) + 2)
view_y = PATH_TOP - 0.1
b.at(VIEW[0], VIEW[1])
b.tube([(VIEW[0], view_y - 2.5, VIEW[1]), (VIEW[0], view_y + 0.1, VIEW[1])], [8.5, 8.5], 14, "fortStone")
for iz in range(int((VIEW[1] - 9) / CELL), int((VIEW[1] + 9) / CELL)):
    for ix in range(int((VIEW[0] - 9) / CELL), int((VIEW[0] + 9) / CELL)):
        if math.hypot((ix + 0.5) * CELL - VIEW[0], (iz + 0.5) * CELL - VIEW[1]) < 7.6:
            set_cell(ix, iz, ".", round(view_y * 100) + 12)
for k in range(9):
    a = math.radians(160 + k * 25)
    b.box((VIEW[0] + math.cos(a) * 8.0, view_y + 0.6, VIEW[1] + math.sin(a) * 8.0), (0.3, 1.0, 0.3), "fortStone")
kit.bench(b, VIEW[0] + 1.5, VIEW[1] + 3.0, math.pi, view_y + 0.1)
kit.bench(b, VIEW[0] - 3.0, VIEW[1] + 2.0, math.pi, view_y + 0.1)
poi("miradouro", VIEW[0], VIEW[1], "Miradouro da Fortaleza", "Daqui vê-se a baía inteira. Sobe ao fim da tarde.", round(view_y + 0.1, 2))

# The causeway toward the Ilha, closed until the Ilha opens.
flat(HILL_X + 0.0, 0.0, HILL_X + 10.0, shore(HILL_X + 5) + 1.0, G, "tar")
mark(HILL_X, shore(HILL_X + 5) - 14.0, HILL_X + 10.0, shore(HILL_X + 5) + 1.0, ".", round(G * 100))
b.at(HILL_X + 5, shore(HILL_X + 5) - 14)
b.box((HILL_X + 5, G + 0.55, shore(HILL_X + 5) - 14.0), (10.0, 1.1, 0.5), "awningRed", top="paintWhite")
b.box((HILL_X + 5, G + 2.4, shore(HILL_X + 5) - 14.0), (4.2, 1.3, 0.14), "vanBlue")
mark(HILL_X, shore(HILL_X + 5) - 14.6, HILL_X + 10.0, shore(HILL_X + 5) - 13.4, "#")

# ------------------------------------------------------- what stands on the promenade
x = HILL_X + 5
while x < WIDE - 2:
    s = shore(x)
    # A row of royal palms on the lawn's edge, and a lamp between every two.
    if not (PIER_X - 6 < x < PIER_X + 6):
        block(x, s + CYCLE + 1.6, kb.palmeira_real(b, x, s + CYCLE + 1.6, rng, G + 0.03))
    lx = x + 4.5
    block(lx, shore(lx) + WALK - 0.5, kit.lamp(b, lx, shore(lx) + WALK - 0.5, (0.0, -1.0), G, pool=False))
    block(lx, shore(lx) + PAVE - 0.8, kit.lamp(b, lx, shore(lx) + PAVE - 0.8, (0.0, 1.0), G, pool=False))
    if rng.random() < 0.6:
        bx = x + rng.uniform(1.5, 3.0)
        kit.bench(b, bx, shore(bx) + WALK - 1.2, 0.0, G)
        block(bx, shore(bx) + WALK - 1.2, 0.5)
    # Small trees on the avenue's middle strip.
    if int(x) % 2 == 0 and not any(lo - 5 <= x + 2 < hi + 5 for lo, hi in CROSS):
        block(x + 2, shore(x + 2) + 41.0, kit.acacia(b, x + 2, shore(x + 2) + 41.0, rng, G, shade="kerb", shade_reach=0.5))
    x += rng.uniform(8.0, 10.0)

# The lawn's uses, west to east: the stage, the kiosk row, the two courts, the police post.
rect = kb.palco(b, 150.0, shore(150) + 22.0, G + 0.03)
mark(rect[0], rect[1], rect[2], rect[3], "#")
poi("musicos", 150.0, shore(150) + 27.5, "Os músicos do palco", "Ao fim da tarde há sempre alguém a tocar aqui.")
for i in range(6):
    kx = 196.0 + i * 5.2
    block(kx, shore(kx) + 26.5, kb.quiosque(b, kx, shore(kx) + 26.5, rng, G + 0.03))
poi("gelados", 201.0, shore(201) + 23.0, "A esquina dos gelados", "O gelado de múcua acaba cedo. Vem antes das cinco.")
kb.campo(b, 290.0, shore(290) + 21.0, 24.0, 13.0, "basquete", G + 0.03)
kb.campo(b, 322.0, shore(322) + 21.5, 26.0, 14.0, "futebol", G + 0.03)
rect = kb.posto(b, 384.0, shore(384) + 26.0, G + 0.03)
mark(rect[0], rect[1], rect[2], rect[3], "#")
places["police"].append([384.0, G, round(shore(384) + 26.0, 2)])
poi("por-do-sol", 250.0, shore(250) + 5.0, "O pôr do sol na Marginal", "Senta-te no muro e espera. É todos os dias e nunca é igual.")
poi("palmeiras", 170.0, shore(170) + 15.5, "A avenida das palmeiras", "Uma fila de palmeiras a perder de vista, de uma ponta à outra da baía.")

# The fishermen's pier: a deck of wood on posts, out into the bay.
pier_z0, pier_z1 = shore(PIER_X) - 30.0, shore(PIER_X) + 0.5
b.at(PIER_X, (pier_z0 + pier_z1) / 2)
b.box((PIER_X, G + 0.1, (pier_z0 + pier_z1) / 2), (5.0, 0.2, pier_z1 - pier_z0), "wood", skip_bottom=False)
for k in range(6):
    for sx in (-2.2, 2.2):
        pz = pier_z0 + 1 + k * 5.6
        b.tube([(PIER_X + sx, -1.4, pz), (PIER_X + sx, G + 1.1, pz)], [0.12, 0.12], 4, "pole", cap=False)
mark(PIER_X - 2.2, pier_z0 + 0.5, PIER_X + 2.2, pier_z1 + 1.0, ".", round(G * 100) + 20)
kit.bench(b, PIER_X, pier_z0 + 3.0, math.pi, G + 0.2)
poi("pontao", PIER_X, pier_z0 + 8.0, "O pontão dos pescadores", "Quem pesca aqui conhece a baía pelo nome de cada pedra.", round(G + 0.2, 2))

# ------------------------------------------------------- the buildings
def front_z(x0, x1):
    """How near the bay a building between these may come: behind the avenue's pavement all along its width."""
    return max(shore(x0), shore(x1), shore((x0 + x1) / 2)) + FRONT + 0.5


def place(kind, cx, cz, width, depth, face):
    if kind == "sobrado":
        kb.sobrado(b, cx, cz, width, depth, rng, face, G)
    elif kind == "torre":
        kb.torre(b, cx, cz, width, depth, rng.randint(12, 19), rng, G)
    else:
        kb.moderno(b, cx, cz, width, depth, rng.randint(4, 8), rng, face, G)
    mark(cx - width / 2 - 0.2, cz - depth / 2 - 0.2, cx + width / 2 + 0.2, cz + depth / 2 + 0.2, "#")


def row(x0, x1, z0, z1, face, kinds, gap_chance=0.12):
    """A street's worth of buildings side by side between x0 and x1, filling z0 to z1."""
    at = x0 + 1.5
    while at < x1 - 9:
        width = min(rng.uniform(13, 22), x1 - 1.5 - at)
        kind = rng.choice(kinds)
        if width < 10:
            break
        depth = z1 - z0
        if kind == "sobrado":
            depth = min(depth, rng.uniform(11, 14))
        cz = (z0 + depth / 2) if face == 1 else (z1 - depth / 2)
        if rng.random() > gap_chance:
            place(kind, at + width / 2, cz, width - 0.4, depth, face)
        else:
            tx = at + width / 2
            block(tx, cz, kit.acacia(b, tx, cz, rng, G))
        at += width


for index, (x0, x1) in enumerate(BLOCKS):
    wide = x1 - x0
    fz = front_z(x0, x1)
    back = STREET_A[0] - 3.0
    if index == 1:
        # The pink building has the block that faces the middle of the bay.
        keep = kb.edificio_rosa(b, x0 + 4.0, fz + 1.0, x1 - 4.0, back - 2.0, rng, G)
        mark(keep[0], keep[1], keep[2], keep[3], "#")
        mark(x0 + 4.0, fz + 1.0, x0 + 13.0, fz + 9.0, "#")
        poi("livreiro", x0 + 30.0, fz + 3.0, "O livreiro da arcada", "Livros usados à sombra das arcadas. Ele sabe sempre o que procuras.")
        continue
    if back - fz > 40:
        # Room for two rows: low old houses toward the bay, taller blocks and towers behind them.
        row(x0, x1, fz, fz + 14.0, 1, ["sobrado", "sobrado", "moderno"])
        row(x0, x1, fz + 20.0, back, 0, ["moderno", "torre", "moderno"])
    else:
        row(x0, x1, fz, back, 1, ["sobrado", "moderno", "moderno", "torre"], gap_chance=0.0)

# Between the two straight streets.
z0, z1 = STREET_A[1] + 3.0, STREET_B[0] - 3.0
# The small market, with the dim alleys behind it.
mx0, mx1 = BLOCKS[0]
for i in range(5):
    for j in range(2):
        sx, sz = mx0 + 8 + i * 6.5, z0 + 5 + j * 7.5
        block(sx, sz, kb.banca(b, sx, sz, rng, G))
row(mx0 + 44, mx1, z0, z1, 1, ["moderno", "sobrado"])
row(mx0, mx0 + 40, z0 + 22, z1, 0, ["sobrado"])
poi("fruta", mx0 + 14.0, z0 + 9.0, "A fila da fruta", "Manga, maboque, múcua. Prova antes de comprar, ninguém leva a mal.")
# Largo da Mutamba: an open square, trees, chess tables, and the paragem where the linhas meet.
lx0, lx1 = BLOCKS[1]
for i in range(4):
    cx_, cz_ = lx0 + 14 + i * 5.0, z0 + 12.0
    block(cx_, cz_, kb.mesa_de_xadrez(b, cx_, cz_, G))
# The square is paved in calçada, in a pattern of squares, with lamps at its corners and sellers under sunshades.
for i in range(9):
    for j in range(5):
        if (i + j) % 2 == 0:
            flat(lx0 + i * 8.0, z0 - 3.0 + j * 8.0, lx0 + (i + 1) * 8.0, min(z1 + 3.0, z0 - 3.0 + (j + 1) * 8.0), G + 0.004, "calcadaLight")
for sx_, sz_ in [(lx0 + 2, z0 + 1), (lx1 - 2, z0 + 1), (lx0 + 2, z1 - 1), (lx1 - 2, z1 - 1), ((lx0 + lx1) / 2, z1 - 1)]:
    block(sx_, sz_, kit.lamp(b, sx_, sz_, (0.0, 0.0), G))
for i in range(4):
    px_, pz_ = lx0 + 8 + i * 15 + rng.uniform(-2, 2), z1 - 6 + rng.uniform(-2, 1)
    block(px_, pz_, kit.parasol(b, px_, pz_, rng, G))
for i in range(11):
    tx, tz = lx0 + rng.uniform(6, lx1 - lx0 - 6), z0 + rng.uniform(18, z1 - z0 - 4)
    block(tx, tz, kit.acacia(b, tx, tz, rng, G))
    kit.bench(b, tx + 2.5, tz + 0.8, rng.uniform(0, math.pi), G)
    block(tx + 2.5, tz + 0.8, 0.5)
poi("xadrez", lx0 + 21.0, z0 + 14.0, "As mesas de xadrez do Largo", "Os kotas jogam aqui desde manhã. Quem perde paga o café.")
paragem("mutamba", lx0 + 48.0, z0 + 2.0, "Mutamba", STREET_A[1] - 1.4)
poi("cobrador", lx0 + 44.0, z0 + 4.5, "A paragem da Mutamba", "Diz-se que o cobrador daqui se ouve na Ilha.")
# The iron palace, and beside it the old cinema.
fx0, fx1 = BLOCKS[2]
keep = kb.palacio_de_ferro(b, fx0 + 16.0, (z0 + z1) / 2, rng, G)
mark(keep[0], keep[1], keep[2], keep[3], "#")
row(fx0 + 32, fx1, z0, z1, 1, ["moderno"], gap_chance=0.0)
poi("cinema", fx0 + 44.0, z0 - 1.5, "A fachada do cinema velho", "Já não passa filmes, mas a fachada continua a ser a mais bonita da rua.")
for bx0, bx1 in BLOCKS[3:]:
    row(bx0, bx1, z0, z1, 1, ["moderno", "sobrado", "moderno", "torre"])

# Behind the second street: the church and its quiet square, homes, and the skyline.
z0, z1 = STREET_B[1] + 3.0, BACK - 2.0
keep = kb.igreja(b, (BLOCKS[1][0] + BLOCKS[1][1]) / 2, z0 + 7.0, G)
mark(keep[0], keep[1], keep[2], keep[3], "#")
rect = kb.mural(b, BLOCKS[1][0] + 14.0, z0 + 12.0, 20.0, rng, G)
mark(rect[0], rect[1], rect[2], rect[3], "#")
poi("mural", BLOCKS[1][0] + 14.0, z0 + 9.5, "O mural", "Pintado por gente do bairro. Todos os anos ganha mais um bocado.")
for bx0, bx1 in [BLOCKS[0], BLOCKS[2], BLOCKS[3], BLOCKS[4]]:
    row(bx0, bx1, z0, z1, 1, ["moderno", "moderno", "torre", "sobrado"])
for i, bx in enumerate([150.0, 300.0, 380.0, 440.0]):
    words[f"l1.residence.{i}"] = f"Prédio {i + 1}"
    places["residences"].append({"id": f"predio-{i + 1}", "pos": [bx, G, STREET_B[1] + 1.5], "units": 100, "layouts": ["quarto", "t1", "t2"], "rentKey": "rent.l1.standard"})
# Towers on the skyline, out of reach.
for i in range(9):
    tx = 70 + i * 44 + rng.uniform(-8, 8)
    kb.torre(b, tx, BACK + 9.0, rng.uniform(14, 20), 14.0, rng.randint(14, 24), rng, 0.0)

# Two more paragens, on the avenue.
for key, px, name in [("marginal", 300.0, "Marginal"), ("porto", 404.0, "Porto")]:
    paragem(key, px, shore(px) + AVENUE + 2.6, name, shore(px) + AVENUE - 1.4)

# Lamps and trees along the straight streets.
for street in (STREET_A, STREET_B):
    at = HILL_X + 10
    while at < WIDE - 4:
        if not any(lo - 3 < at < hi + 3 for lo, hi in CROSS):
            block(at, street[1] + 0.9, kit.lamp(b, at, street[1] + 0.9, (0.0, -1.0), G))
            tx = at + 7
            if not any(lo - 3 < tx < hi + 3 for lo, hi in CROSS) and tx < WIDE - 3:
                block(tx, street[0] - 1.4, kit.acacia(b, tx, street[0] - 1.4, rng, G, shade_reach=1.3))
        at += rng.uniform(16, 22)

stray = sorted({chunk for (chunk, level) in b.groups if not (0 <= chunk[0] < ACROSS and 0 <= chunk[1] < DOWN)})
if stray:
    raise SystemExit(f"nzila: something was built outside the district, in chunk(s) {stray}")
b.write()

# ------------------------------------------------------------------ the files
for (cx, cz) in flags:
    grid = {"cellMm": int(CELL * 1000), "cellX0": cx * CELLS, "cellZ0": cz * CELLS, "rows": ["".join(r) for r in flags[(cx, cz)]], "heightsCm": heights[(cx, cz)]}
    with open(os.path.join(out_dir, "chunks", f"c-{cx:02d}-{cz:02d}.walk.json"), "w", encoding="utf-8") as handle:
        json.dump(grid, handle)

# The two linhas: along the avenue and back by the first street; and round the Mutamba.
def loop(points):
    return [[round(px, 2), 0.0, round(pz, 2)] for px, pz in points]


# Traffic keeps to the right: east along the town side of the avenue, by the kerb the paragens are on,
# and back west along the near side of the first street.
avenue_out = [(px, shore(px) + 47.4) for px in range(112, 440, 16)]
avenue_back = [(px, STREET_A[0] + 2.0) for px in range(432, 104, -16)]
routes = {
    "linha-marginal": loop(avenue_out + [(424.0, 120.0)] + avenue_back + [(104.0, 130.0)]),
    "linha-mutamba": loop([(184.0, 156.0), (256.0, 156.0), (264.0, 180.0), (256.0, 204.0), (184.0, 204.0), (184.0, 180.0)]),
}
os.makedirs(os.path.join(out_dir, "routes"), exist_ok=True)
for name, points in routes.items():
    with open(os.path.join(out_dir, "routes", f"{name}.json"), "w", encoding="utf-8") as handle:
        json.dump({"closed": True, "points": points}, handle)
with open(os.path.join(out_dir, "strings.pt-AO.json"), "w", encoding="utf-8") as handle:
    json.dump(words, handle, ensure_ascii=False)

spawn_x = 250.0
partial = {
    "id": "ao-lua/l1",
    "province": "ao-lua",
    "version": 1,
    "nameKey": "world.ao-lua.l1.name",
    "artPass": 1,
    "bounds": {"minX": 0, "minZ": 0, "maxX": WIDE, "maxZ": DEEP},
    "ambient": {"set": "l1", "soundBeds": []},
    "spawns": [{"id": "arrival", "pos": [spawn_x, G, round(shore(spawn_x) + 6.0, 2)], "facing": 270, "kind": "first_arrival"}],
    "gateways": [],
    "pois": places["pois"],
    "routes": [
        {"id": "linha-marginal", "kind": "candongueiro", "spline": "routes/linha-marginal.json", "stops": ["marginal", "porto", "mutamba"], "stopPoints": [12, 18, 30], "headwaySeconds": 240, "fareKey": "fares.candongueiroLocal"},
        {"id": "linha-mutamba", "kind": "candongueiro", "spline": "routes/linha-mutamba.json", "stops": ["mutamba"], "stopPoints": [0], "headwaySeconds": 300, "fareKey": "fares.candongueiroLocal"},
    ],
    "paragens": places["paragens"],
    "lots": [],
    "residences": places["residences"],
    "interiors": [],
    "npc": {"crowd": None, "vendors": None, "police": None},
    "heat": {"lighting": None, "policePosts": places["police"], "override": None},
    "adSlots": [],
    "seats": [{"id": f"seat-{n + 1}", "pos": [round(sx, 2), round(sy, 2), round(sz, 2)], "facing": round(math.degrees(yaw) % 360, 1)} for n, (sx, sy, sz, yaw) in enumerate(b.seats)],
    "water": [{"id": "baia", "rect": [-400, -500, WIDE + 400, 70], "level": -0.45}],
    "strings": "strings.pt-AO.json",
}
with open(os.path.join(out_dir, "district.partial.json"), "w", encoding="utf-8") as handle:
    json.dump(partial, handle, indent=2, ensure_ascii=False)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "district.blend"))
print(f"nzila: L1 saved to {out_dir}: {len(places['pois'])} points of interest, {len(b.seats)} seats")
