# Builds Zango, the second bairro (docs/PHASE_11_PLAN.md, D-11.3 and D-11.6): 320 m by 256 m, five chunks by
# four. The brief is docs/reference/BAIRROS.md §3 (Viana and Zango) and the founder's picture of a Zango street by
# day (2026-11-21): a wide street of red earth, zinc stalls on poles, a kiosk painted in three bands, a barbearia,
# mangueiras over the roofs, wires sagging from pole to pole.
#
# One tarred road crosses it from west to east: the only tar. Everything off it is earth: long straight streets to
# the north and the south, and between them rows of resettlement houses, every one the same house on the same
# plot, each added to by its owner in a different way. Where the middle street meets the road is the heart of it:
# the paragem (a mangueira and a corner, no shelter and no sign: D-0.48), the mercado de rua along the verge, the
# cantina, the damas under a tree, the geladaria, and a little way off the campo de terra, the chafariz and the
# igreja (the founder's list).
#
#   blender -b --factory-startup --python art/scripts/make_zango.py -- <out dir> <palette.json> <palette.png>
#
# It writes what make_l1.py writes. Art pass 1: the kit.

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
ACROSS, DOWN = 5, 4
WIDE, DEEP = ACROSS * CHUNK, DOWN * CHUNK
CELL = 0.5
CELLS = int(CHUNK / CELL)
G = 0.0  # no kerbs here: the street and the ground before a door are the same earth
rng = random.Random(8000)

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
ROAD = (118.0, 127.0)  # the tarred road, west to east
STREETS = [(40.0, 47.0), (104.0, 111.0), (168.0, 175.0), (232.0, 239.0), (296.0, 303.0)]  # earth, north to south
LANES = [(56.0, 62.0), (190.0, 196.0)]  # earth, west to east
MID = STREETS[2]
PLOT = 15.0

flags = {(cx, cz): [["."] * CELLS for _ in range(CELLS)] for cx in range(ACROSS) for cz in range(DOWN)}
heights = {(cx, cz): [[0] * CELLS for _ in range(CELLS)] for cx in range(ACROSS) for cz in range(DOWN)}


def set_cell(ix, iz, what):
    if 0 <= ix < ACROSS * CELLS and 0 <= iz < DOWN * CELLS:
        flags[(ix // CELLS, iz // CELLS)][iz % CELLS][ix % CELLS] = what


def mark(x0, z0, x1, z1, what):
    for iz in range(math.floor(z0 / CELL), math.ceil(z1 / CELL)):
        for ix in range(math.floor(x0 / CELL), math.ceil(x1 / CELL)):
            set_cell(ix, iz, what)


def block(x, z, radius):
    mark(x - radius, z - radius, x + radius, z + radius, "#")


def on_street(x, z):
    return ROAD[0] <= z < ROAD[1] or any(lo <= x < hi for lo, hi in STREETS) or any(lo <= z < hi for lo, hi in LANES)


for iz in range(DOWN * CELLS):
    for ix in range(ACROSS * CELLS):
        x, z = (ix + 0.5) * CELL, (iz + 0.5) * CELL
        # The edge of the bairro is closed: beyond it there is more of the same, which is not built.
        if x < 1.0 or x > WIDE - 1.0 or z < 1.0 or z > DEEP - 1.0:
            set_cell(ix, iz, "#")
        elif on_street(x, z):
            set_cell(ix, iz, "=")

places = {"pois": [], "paragens": []}
words = {"world.ao-lua.zango.name": "Zango", "zango.gateway.marginal": "Marginal e Baixa", "zango.gateway.marginal.a": "para a Marginal"}
OUTINGS = {"gelados-zango": ("Os gelados", "aos gelados"), "campo": ("O campo", "ao campo"), "damas": ("As damas", "às damas"), "mercado": ("O mercado", "ao mercado")}
POI_GLYPHS = {"gelados-zango": "gelado", "banca-zango": "flores", "cantina-zango": "cantina", "mercado": "fruta", "damas": "xadrez", "paragem-mangueira": "megafone", "caixa-zango": "banco",
              "biscato-carga-zango": "biscatos", "biscato-zunga-zango": "biscatos"}


def poi(key, x, z, name, line):
    words[f"zango.poi.{key}.name"] = name
    words[f"zango.poi.{key}.line"] = line
    place = {"id": key, "pos": [round(x, 2), G, round(z, 2)], "nameKey": f"zango.poi.{key}.name", "lineKey": f"zango.poi.{key}.line", "positive": True, "stamp": False, "glyph": POI_GLYPHS.get(key, "ponto")}
    if key in OUTINGS:
        place["outing"] = True
        words[f"zango.poi.{key}.sair"], words[f"zango.poi.{key}.a"] = OUTINGS[key]
    places["pois"].append(place)


def flat(x0, z0, x1, z1, y, colour):
    """A flat rectangle of ground, cut along the chunk lines so that each piece belongs to its own chunk."""
    xs = [x0] + [c * CHUNK for c in range(1, ACROSS) if x0 < c * CHUNK < x1] + [x1]
    zs = [z0] + [c * CHUNK for c in range(1, DOWN) if z0 < c * CHUNK < z1] + [z1]
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            b.at((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2)
            b.face([(xs[i], y, zs[j]), (xs[i + 1], y, zs[j]), (xs[i + 1], y, zs[j + 1]), (xs[i], y, zs[j + 1])], colour, toward=(0.0, 1.0, 0.0))


# ------------------------------------------------------------------ the ground
# Laid in pieces that do not overlap: the streets in red earth, the road in tar, the blocks in sand.
b.level = kit.BOTH
x_lines = sorted({0.0, float(WIDE)} | {v for pair in STREETS for v in pair})
z_lines = sorted({0.0, float(DEEP), ROAD[0], ROAD[1]} | {v for pair in LANES for v in pair})
for i in range(len(x_lines) - 1):
    for j in range(len(z_lines) - 1):
        x0, x1, z0, z1 = x_lines[i], x_lines[i + 1], z_lines[j], z_lines[j + 1]
        mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
        colour = "tar" if ROAD[0] <= mz < ROAD[1] else "sand" if on_street(mx, mz) else "sandDark"
        flat(x0, z0, x1, z1, 0.0, colour)
# The road's worn middle line, broken; and where the earth streets have been driven hard, a darker strip.
for k in range(int(WIDE // 9)):
    lx = 4.0 + k * 9.0
    if lx + 3.0 < WIDE and rng.random() < 0.7:
        b.at(lx + 1.5, (ROAD[0] + ROAD[1]) / 2)
        b.face([(lx, 0.012, 122.42), (lx + 3.0, 0.012, 122.42), (lx + 3.0, 0.012, 122.58), (lx, 0.012, 122.58)], "line", toward=(0.0, 1.0, 0.0))
for lo, hi in STREETS:
    for z0, z1 in ((2.0, ROAD[0]), (ROAD[1], DEEP - 2.0)):
        for wx in ((lo + hi) / 2 - 1.4, (lo + hi) / 2 + 1.4):
            flat(wx - 0.35, z0, wx + 0.35, z1, 0.01, "earth")

# Earth is never one colour: paler where feet have beaten it, redder where water stood, tufts of capim where
# nobody walks, a stone here and there. Scattered by the place itself, so it is the same on every build.
ground_rng = random.Random(4242)
for cx in range(ACROSS):
    for cz in range(DOWN):
        for n in range(16):
            gx, gz = cx * CHUNK + ground_rng.uniform(4, CHUNK - 4), cz * CHUNK + ground_rng.uniform(4, CHUNK - 4)
            if ROAD[0] - 5 < gz < ROAD[1] + 5:
                continue
            b.at(gx, gz)
            b.level = kit.BOTH
            b.disc((gx, 0.006 + 0.001 * (n % 3), gz), ground_rng.uniform(1.4, 4.6), 7, ground_rng.choice(["sand", "sand", "earth", "lampPoolSand"]), squash=ground_rng.uniform(0.5, 1.0))
        for n in range(8):
            gx, gz = cx * CHUNK + ground_rng.uniform(2, CHUNK - 2), cz * CHUNK + ground_rng.uniform(2, CHUNK - 2)
            if on_street(gx, gz) or ROAD[0] - 2 < gz < ROAD[1] + 2:
                continue
            b.at(gx, gz)
            b.level = kit.FULL
            if n % 4 == 0:
                b.gem((gx, 0.08, gz), (ground_rng.uniform(0.15, 0.3), 0.1, ground_rng.uniform(0.15, 0.3)), 5, "blockGrey", ground_rng, rough=0.2)
            else:
                for k in range(2):
                    b.gem((gx + ground_rng.uniform(-0.4, 0.4), 0.16, gz + ground_rng.uniform(-0.4, 0.4)), (0.2, 0.26, 0.2), 4, ground_rng.choice(["hillGrass", "hillGrassDark", "acaciaLeafDark"]), ground_rng, rough=0.3)
b.level = kit.BOTH

# ------------------------------------------------------------------ the houses
# The same house on the same plot, row after row (BAIRROS.md: 15 m plots). What differs is what each owner
# has done since: the paint, a second room in bare block or in sheet, a wall begun, a stall at the gate, a yard.
tables = []
houses = 0
shops = 0


def plot(px, pz, face_north, on_corner=False):
    """One plot whose middle is here, its house at the back and its gate to the street it faces."""
    global houses, shops
    sign = -1.0 if face_north else 1.0  # the way to the street, along Z
    yaw = math.pi if face_north else 0.0
    house_z = pz - sign * 3.2
    shop = on_corner and rng.random() < 0.5
    kit.casa(b, px - 1.5, house_z, yaw, rng, kind="bloco", width=8.0, depth=6.0, ground=0.0, shop=shop)
    houses += 1
    shops += 1 if shop else 0
    grown = rng.random()
    if grown < 0.55:
        # A second room, of whatever there was money for.
        kit.casa(b, px + 4.6, house_z + sign * rng.uniform(-0.6, 1.2), yaw, rng, kind=rng.choice(["cru", "cru", "chapa"]), width=4.0, depth=rng.choice([4.0, 5.0]), ground=0.0)
    wall = rng.choice(["blockGrey", "blockGrey", "concrete", "paintWhite", "wall3"])
    front = pz + sign * (PLOT / 2 - 0.3)
    if grown > 0.25:
        # The front wall, with its gate; lower where it is still going up.
        height = rng.choice([1.7, 1.7, 1.1, 0.7])
        gate = px + rng.uniform(-3.0, 3.0)
        kit.muro(b, px - PLOT / 2 + 0.2, front, gate - 0.8, front, wall, height=height)
        kit.muro(b, gate + 0.8, front, px + PLOT / 2 - 0.2, front, wall, height=height)
        if height > 1.5 and rng.random() < 0.7:
            kit.portao(b, gate, front, True, rng)
    # One side wall, shared with the neighbour.
    if rng.random() < 0.8:
        kit.muro(b, px + PLOT / 2, pz - PLOT / 2 + 0.3, px + PLOT / 2, pz + PLOT / 2 - 0.3, wall, height=rng.choice([1.7, 1.4]))
    if rng.random() < 0.75:
        kit.quintal(b, px + rng.uniform(-3.0, 1.0), pz + sign * rng.uniform(1.6, 4.2), rng, 0.0)
    if rng.random() < 0.3:
        kit.tree(b, px - 5.0 + rng.uniform(-1.0, 1.0), pz + sign * rng.uniform(2.0, 5.0), rng, 0.0, shade="sandDark", mix=("mangueira", "acacia", "mangueira"), paved=False)


def keep_clear(x0, z0, x1, z1):
    return (x0, z0, x1, z1)


# What the heart of the bairro keeps clear of houses: the campo and the chafariz, the church and the mercado,
# the largo of the cantina and the damas, the geladaria's side.
# Only what each needs: houses come up close on every side, as they do.
CLEAR = [keep_clear(113, 79, 166, 118), keep_clear(190, 79, 219, 104), keep_clear(175, 99, 232, 118), keep_clear(111, 127, 168, 152), keep_clear(175, 127, 232, 152)]
block_xs = [(0.0, STREETS[0][0])] + [(STREETS[i][1], STREETS[i + 1][0]) for i in range(len(STREETS) - 1)] + [(STREETS[-1][1], float(WIDE))]
block_zs = [(0.0, LANES[0][0]), (LANES[0][1], ROAD[0]), (ROAD[1], LANES[1][0]), (LANES[1][1], float(DEEP))]
for bx0, bx1 in block_xs:
    count = int((bx1 - bx0 - 3.0) // PLOT)
    if count < 1:
        continue
    left = bx0 + ((bx1 - bx0) - count * PLOT) / 2
    for bz0, bz1 in block_zs:
        # Rows: one facing the street to the north, one facing the street to the south, and a third between
        # them on a footpath where the block is deep enough.
        rows = [(bz0 + 1.5 + PLOT / 2, True), (bz1 - 1.5 - PLOT / 2, False)]
        if bz1 - bz0 >= 3 * PLOT + 9.0:
            rows.insert(1, (bz0 + 1.5 + PLOT * 1.5, False))
        for pz, face_north in rows:
            for n in range(count):
                px = left + PLOT / 2 + n * PLOT
                if px - PLOT / 2 < 2.0 or px + PLOT / 2 > WIDE - 2.0 or pz - PLOT / 2 < 2.0 or pz + PLOT / 2 > DEEP - 2.0:
                    continue
                if any(px + PLOT / 2 > cx0 and px - PLOT / 2 < cx1 and pz + PLOT / 2 > cz0 and pz - PLOT / 2 < cz1 for cx0, cz0, cx1, cz1 in CLEAR):
                    continue
                plot(px, pz, face_north, on_corner=n in (0, count - 1))

# ------------------------------------------------------------------ the heart: the paragem and the mercado
# North of the road, east of the middle street. The paragem is a mangueira on the corner: the vans stop on the
# road beside it, two abreast when it is busy, and everything that sells gathers where people get off.
PARAGEM = (MID[1] + 7.0, ROAD[0] - 3.0)
kit.mangueira(b, PARAGEM[0] + 1.5, PARAGEM[1] - 4.5, random.Random(77), 0.0, shade="sandDark")
block(PARAGEM[0] + 1.5, PARAGEM[1] - 4.5, 0.5)
words["zango.paragem.mangueira"] = "Paragem da Mangueira"
words["zango.paragem.mangueira.em"] = "na Mangueira"
places["paragens"].append({"id": "mangueira", "pos": [round(PARAGEM[0], 2), G, round(PARAGEM[1], 2)], "nameKey": "zango.paragem.mangueira"})
poi("paragem-mangueira", PARAGEM[0] + 3.0, PARAGEM[1] - 1.0, "A Mangueira", "Não há placa nem abrigo: é a mangueira. Daqui sai-se para todo o lado, e o cobrador diz para onde.")
# Carts wait where the vans unload (a biscato, Task 4.5).
for k in range(3):
    cx_, cz_ = PARAGEM[0] - 9.5 + k * 1.5, PARAGEM[1] - 11.5
    b.at(cx_, cz_)
    b.level = kit.BOTH
    b.box((cx_, 0.45, cz_), (0.9, 0.5, 1.4), "wood", skip_bottom=False)
    b.level = kit.FULL
    for side in (-0.5, 0.5):
        b.tube([(cx_ + side, 0.26, cz_ + 0.2), (cx_ + side * 1.14, 0.26, cz_ + 0.2)], [0.26, 0.26], 8, "tyre")
        b.tube([(cx_ + side * 0.8, 0.6, cz_ - 0.7), (cx_ + side * 0.8, 0.75, cz_ - 1.5)], [0.025, 0.025], 4, "pole", cap=False)
    b.level = kit.BOTH
poi("biscato-carga-zango", PARAGEM[0] - 8.0, PARAGEM[1] - 9.6, "Os carrinhos da Mangueira", "O que sai das carrinhas vai para as bancas. Leva-se a carrinho, paga-se por cada carga.")

# The kiosk where airtime is sold: block, painted in three bands, a hatch and a little roof of sheet.
SALDO = (PARAGEM[0] + 8.0, PARAGEM[1] - 6.5)
b.at(*SALDO)
b.level = kit.BOTH
for k, colour in enumerate(["awningRed", "awningGold", "awningTeal"]):
    b.box((SALDO[0] - 0.8 + k * 0.8, 1.1, SALDO[1]), (0.8, 2.2, 2.0), colour)
b.rect((SALDO[0], 1.35, SALDO[1] + 1.01), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 1.2, 0.8, "windowLit")
b.face([(SALDO[0] - 1.5, 2.45, SALDO[1] - 1.2), (SALDO[0] + 1.5, 2.45, SALDO[1] - 1.2), (SALDO[0] + 1.5, 2.2, SALDO[1] + 1.9), (SALDO[0] - 1.5, 2.2, SALDO[1] + 1.9)], "roofZinc", toward=(0.0, 1.0, 0.0), two_sided=True)
for dx in (-1.4, 1.4):
    b.tube([(SALDO[0] + dx, 0.0, SALDO[1] + 1.8), (SALDO[0] + dx, 2.22, SALDO[1] + 1.8)], [0.03, 0.03], 4, "pole", cap=False)
words["zango.sign.saldo"] = "SALDO"
signs = [{"id": "saldo", "pos": [round(SALDO[0], 2), 2.0, round(SALDO[1] + 1.02, 2)], "facing": 0.0, "textKey": "zango.sign.saldo"}]

# The mercado de rua: stalls and bacias along the verge of the road, sunshades over them, and at its end the
# banca of things to give (D-10.1).
MERCADO = (PARAGEM[0] + 14.0, ROAD[0] - 4.2)
for k in range(6):
    sx = MERCADO[0] + k * 5.4
    block(sx, MERCADO[1], kb.banca(b, sx, MERCADO[1], rng, 0.0))
    for dz in (2.0, 2.9):
        if rng.random() < 0.7:
            kb.bacia_no_chao(b, sx + rng.uniform(-1.6, 1.6), MERCADO[1] + dz - 5.6, rng, 0.0)
    kb.banquinho(b, sx + 1.5, MERCADO[1] - 0.9, 0.0)
# A second row behind, of zinc on poles: what is sold out of the sun.
for k in range(4):
    sx, sz = MERCADO[0] + 2.0 + k * 7.0, MERCADO[1] - 7.6
    b.at(sx, sz)
    b.level = kit.BOTH
    for dx in (-1.8, 1.8):
        for dz in (-1.2, 1.2):
            b.tube([(sx + dx, 0.0, sz + dz), (sx + dx, 2.3 if dz > 0 else 2.0, sz + dz)], [0.04, 0.04], 4, "pole", cap=False)
    b.face([(sx - 2.1, 2.05, sz - 1.5), (sx + 2.1, 2.05, sz - 1.5), (sx + 2.1, 2.38, sz + 1.5), (sx - 2.1, 2.38, sz + 1.5)], rng.choice(kit.ZINC), toward=(0.0, 1.0, 0.0), two_sided=True)
    b.box((sx, 0.42, sz - 0.3), (3.0, 0.84, 1.0), "wood")
    b.level = kit.FULL
    for i in range(5):
        b.box((sx - 1.2 + i * 0.6, 0.95, sz - 0.3), (0.4, 0.22, 0.5), rng.choice(["awningGold", "awningRed", "paintWhite", "zincBlue", "acaciaLeaf", "sand"]), skip_bottom=False)
    b.level = kit.BOTH
    block(sx, sz - 0.3, 1.2)
poi("mercado", MERCADO[0] + 13.0, MERCADO[1] + 2.4, "O mercado da estrada", "Fruta, peixe seco, fuba, carvão, sabão. Regateia-se a tudo, e ninguém leva a mal.")
poi("biscato-zunga-zango", MERCADO[0] + 3.0, MERCADO[1] + 2.4, "As kitandeiras da estrada", "Há sempre uma bacia a mais. Pega nela e vende a quem passa.")
banca_x, banca_z = MERCADO[0] + 6 * 5.4 + 1.0, MERCADO[1] + 0.2
block(banca_x, banca_z, kb.banca_de_presentes(b, banca_x, banca_z, rng, 0.0))
poi("banca-zango", banca_x, banca_z + 1.7, "Banca da Tia Minga", "Flores, perfume e panos. Para a namorada, para a mãe, ou só porque sim.")

# ------------------------------------------------------------------ the igreja
# A small church of block, painted white and blue, a cross on its gable, a yard swept clean and a low wall.
IGREJA = (204.0, 88.0)
b.at(*IGREJA)
b.level = kit.BOTH
b.box((IGREJA[0], 2.4, IGREJA[1]), (9.0, 4.8, 15.0), "paintWhite", top="tarShade")
b.box((IGREJA[0], 0.5, IGREJA[1]), (9.06, 1.0, 15.06), "zincBlue", top="zincBlue")
for side in (-1, 1):
    b.face([(IGREJA[0], 6.6, IGREJA[1] - 7.9), (IGREJA[0], 6.6, IGREJA[1] + 7.9), (IGREJA[0] + side * 5.1, 4.6, IGREJA[1] + 7.9), (IGREJA[0] + side * 5.1, 4.6, IGREJA[1] - 7.9)], "zincRed", toward=(side * 0.4, 1.0, 0.0), two_sided=True)
    for k in range(3):
        b.rect((IGREJA[0] + side * 4.52, 2.7, IGREJA[1] - 4.0 + k * 4.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 0.9, 1.9, "window")
b.face([(IGREJA[0] - 4.5, 4.8, IGREJA[1] + 7.51), (IGREJA[0] + 4.5, 4.8, IGREJA[1] + 7.51), (IGREJA[0], 6.6, IGREJA[1] + 7.51)], "paintWhite", toward=(0.0, 0.0, 1.0), two_sided=True)
b.rect((IGREJA[0], 1.3, IGREJA[1] + 7.53), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 1.9, 2.6, "wood")
b.box((IGREJA[0], 7.5, IGREJA[1] + 7.4), (0.16, 1.8, 0.16), "paintWhite", skip_bottom=False)
b.box((IGREJA[0], 7.8, IGREJA[1] + 7.4), (0.9, 0.16, 0.16), "paintWhite", skip_bottom=False)
b.box((IGREJA[0], 0.1, IGREJA[1] + 8.6), (3.4, 0.2, 2.0), "concrete")
for wx0, wx1 in ((IGREJA[0] - 12.0, IGREJA[0] - 2.5), (IGREJA[0] + 2.5, IGREJA[0] + 12.0)):
    kit.muro(b, wx0, IGREJA[1] + 11.0, wx1, IGREJA[1] + 11.0, "paintWhite", height=0.9)
kit.tree(b, IGREJA[0] - 9.0, IGREJA[1] + 9.0, rng, 0.0, shade="sandDark", mix=("acacia",), paved=False)
kit.tree(b, IGREJA[0] + 9.5, IGREJA[1] + 6.0, rng, 0.0, shade="sandDark", mix=("mangueira",), paved=False)
for k in range(2):
    kit.bench(b, IGREJA[0] - 6.5 + k * 13.0, IGREJA[1] + 9.6, math.pi, 0.0)
poi("igreja", IGREJA[0], IGREJA[1] + 9.8, "A igreja do bairro", "Ao domingo não cabe ninguém. Durante a semana é a sombra mais sossegada do Zango.")

# ------------------------------------------------------------------ the campo de terra, and the chafariz
# Red earth beaten flat, lines scratched with lime, goals of three poles: where the bairro meets in the afternoon.
CAMPO = (139.0, 92.0)
CW, CD = 40.0, 26.0
flat(CAMPO[0] - CW / 2, CAMPO[1] - CD / 2, CAMPO[0] + CW / 2, CAMPO[1] + CD / 2, 0.012, "earth")
b.at(*CAMPO)
for (ax, az, bx_, bz_) in [(-1, -1, 1, -1), (-1, 1, 1, 1), (-1, -1, -1, 1), (1, -1, 1, 1), (0, -1, 0, 1)]:
    xa, za, xb, zb = CAMPO[0] + ax * CW / 2, CAMPO[1] + az * CD / 2, CAMPO[0] + bx_ * CW / 2, CAMPO[1] + bz_ * CD / 2
    if ax == bx_:
        flat(xa - 0.07, za, xa + 0.07, zb, 0.02, "line")
    else:
        flat(xa, za - 0.07, xb, za + 0.07, 0.02, "line")
for side in (-1, 1):
    gx = CAMPO[0] + side * CW / 2
    b.at(gx, CAMPO[1])
    for gz in (CAMPO[1] - 2.6, CAMPO[1] + 2.6):
        b.tube([(gx, 0.0, gz), (gx + rng.uniform(-0.08, 0.08), 2.1, gz)], [0.06, 0.05], 5, "pole", cap=False)
    b.tube([(gx, 2.08, CAMPO[1] - 2.7), (gx, 2.08, CAMPO[1] + 2.7)], [0.05, 0.05], 5, "pole", cap=False)
# Those who watch sit on a log and on tyres half buried along one side.
for k in range(5):
    tx = CAMPO[0] - 8.0 + k * 4.0
    b.at(tx, CAMPO[1] + CD / 2 + 2.2)
    b.tube([(tx - 0.3, 0.3, CAMPO[1] + CD / 2 + 2.2), (tx + 0.3, 0.3, CAMPO[1] + CD / 2 + 2.2)], [0.42, 0.42], 8, "tyre")
    b.seats.append((tx, 0.62, CAMPO[1] + CD / 2 + 2.2, math.pi))
kit.tree(b, CAMPO[0] + 16.0, CAMPO[1] + CD / 2 + 4.0, rng, 0.0, shade="sandDark", mix=("mangueira",), paved=False)
poi("campo", CAMPO[0], CAMPO[1] + CD / 2 + 4.0, "O campo de terra", "À tarde joga-se aqui até não se ver a bola. Quem perde sai, quem ganha fica.")

# The chafariz: a block of concrete with its taps, a wet patch round it, and the bidons waiting their turn in a row.
CHAF = (120.0, 113.0)
b.at(*CHAF)
b.level = kit.BOTH
flat(CHAF[0] - 2.4, CHAF[1] - 2.0, CHAF[0] + 2.4, CHAF[1] + 2.0, 0.012, "earth")
b.box((CHAF[0], 0.6, CHAF[1]), (2.2, 1.2, 0.7), "concrete")
b.box((CHAF[0], 1.3, CHAF[1]), (2.4, 0.2, 0.9), "blockGrey", skip_bottom=False)
b.level = kit.FULL
for k in range(3):
    b.tube([(CHAF[0] - 0.7 + k * 0.7, 0.85, CHAF[1] + 0.36), (CHAF[0] - 0.7 + k * 0.7, 0.8, CHAF[1] + 0.52)], [0.03, 0.03], 4, "metal")
for k in range(7):
    jx, jz = CHAF[0] + 2.2 + k * 0.62, CHAF[1] + 1.2 + (k % 2) * 0.12
    b.box((jx, 0.24, jz), (0.3, 0.48, 0.24), "awningGold" if k % 3 else "zincBlue", skip_bottom=False)
    b.box((jx, 0.51, jz), (0.08, 0.06, 0.08), "paintWhite", skip_bottom=False)
b.level = kit.BOTH
block(CHAF[0], CHAF[1], 1.2)
poi("chafariz", CHAF[0] + 1.0, CHAF[1] + 2.4, "O chafariz", "A água vem de manhã cedo e ao fim da tarde. A fila de bidões guarda o lugar de cada um.")

# ------------------------------------------------------------------ the largo: cantina, damas, caixa
CANTINA = (146.0, 137.0)
kit.cantina(b, CANTINA[0], CANTINA[1], math.pi, 0.0)
block(CANTINA[0], CANTINA[1], 2.6)
poi("cantina-zango", CANTINA[0] - 0.8, CANTINA[1] - 3.2, "Cantina do Kota Beto", "Pão, gasosa, arroz, sabão, velas. Fia-se a quem é do bairro, e o kota sabe quem é.")
kit.mangueira(b, 128.0, 144.5, random.Random(31), 0.0, shade="sandDark")
block(128.0, 144.5, 0.5)
for kind, tx, yaw in (("damas", 121.5, 0.0), ("damas", 127.0, math.pi / 2), ("ludo", 133.5, 0.0)):
    _, table = (kb.mesa_de_damas if kind == "damas" else kb.mesa_de_ludo)(b, tx, 139.0, yaw, 0.0)
    tables.append(table)
poi("damas", 127.0, 136.2, "As damas da mangueira", "Caricas por pedras, um bidão por mesa. Os kotas não perdem com ninguém de fora.")
kit.caixa(b, 160.0, 131.0, 0.0, 0.0)
words["zango.poi.caixa-zango.name"] = "Caixa do Zango"
words["zango.poi.caixa-zango.line"] = "Guarda aqui o que não queres perder na rua, e levanta quando precisares."
places["pois"].append({"id": "caixa-zango", "pos": [160.0, G, 132.0], "nameKey": "zango.poi.caixa-zango.name", "lineKey": "zango.poi.caixa-zango.line", "positive": True, "stamp": False, "glyph": "banco"})
for bx_ in (138.0, 154.0):
    kit.bench(b, bx_, 147.5, math.pi, 0.0)

# ------------------------------------------------------------------ the geladaria, and the barbearia
GEL = (205.0, 138.0)
rect = kb.geladaria(b, GEL[0], GEL[1], rng, 0.0)
mark(rect[0], rect[1], rect[2], rect[3], "#")
poi("gelados-zango", GEL[0] - 0.5, GEL[1] - 3.3, "Geladaria do Zango", "Gelado de múcua e de ginguba, e sombra para o comer devagar.")
# The barbearia: a house with its front open to the street and its name painted across the wall.
kit.casa(b, 222.0, 140.0, math.pi, rng, kind="bloco", width=7.0, depth=5.0, ground=0.0, shop=True)
flat(217.5, 133.0, 226.5, 137.4, 0.015, "concrete")
words["zango.sign.barbearia"] = "BARBEARIA"
signs.append({"id": "barbearia", "pos": [222.0, 2.55, 137.42], "facing": 180.0, "textKey": "zango.sign.barbearia"})

# ------------------------------------------------------------------ poles, wires and what grows
# A line of poles down one side of every street, wires hanging slack between them, a lamp on a few.
for lo, hi in STREETS:
    previous = None
    for k, pz in enumerate(range(10, DEEP - 6, 26)):
        if ROAD[0] - 4 < pz < ROAD[1] + 4:
            pz = ROAD[0] - 5
        px = hi + 0.9
        tops = kit.poste(b, px, float(pz), rng, lamp=k % 3 == 1)
        block(px, float(pz), 0.3)
        if previous:
            for a, c in zip(previous, tops):
                kit.fio(b, a, c, sag=rng.uniform(0.6, 1.3))
        previous = tops
previous = None
for k, px in enumerate(range(8, WIDE - 4, 28)):
    if any(lo - 2 < px < hi + 2 for lo, hi in STREETS):
        px += 9
    tops = kit.poste(b, float(px), ROAD[1] + 1.2, rng, lamp=k % 2 == 0)
    block(float(px), ROAD[1] + 1.2, 0.3)
    if previous:
        for a, c in zip(previous, tops):
            kit.fio(b, a, c, sag=rng.uniform(0.6, 1.2))
    previous = tops
# Trees where streets meet, and an imbondeiro that was there before the bairro.
for lo, hi in STREETS:
    for zl, zh in LANES:
        if rng.random() < 0.8:
            tx, tz = lo - 2.5, zh + 2.6
            block(tx, tz, kit.tree(b, tx, tz, rng, 0.0, shade="sandDark", mix=("mangueira", "acacia"), paved=False))
block(60.0, 110.0, kit.imbondeiro(b, 60.0, 110.0, random.Random(5), 0.0, shade="sandDark"))
# Shade in the heart of the bairro: mangueiras and acácias where people stop, each with something under it.
for tx, tz in [(116.0, 132.0), (163.0, 146.0), (180.0, 146.0), (228.0, 131.0), (192.0, 131.5), (114.5, 108.0), (164.5, 110.0), (228.5, 96.0), (179.0, 92.0), (150.0, 112.5), (97.0, 131.0), (247.0, 114.0), (60.0, 131.0), (281.0, 131.0)]:
    block(tx, tz, kit.tree(b, tx, tz, rng, 0.0, shade="sandDark", mix=("mangueira", "acacia", "mangueira"), paved=False))
    if rng.random() < 0.6:
        kb.bacia_no_chao(b, tx + rng.uniform(1.2, 2.0), tz + rng.uniform(-1.0, 1.0), rng, 0.0)
        kb.banquinho(b, tx + 1.0, tz + 1.4, 0.0)
# An old car that has not moved in years, half on the verge.
import vehicles  # noqa: E402

vehicles.VEHICLES["carro-cinza"][0](b, MID[1] + 2.2, 100.0, 0.12)
block(MID[1] + 2.2, 100.0, 1.2)

# ------------------------------------------------------------------ solid, and written
def _flag_at(ix, iz):
    if not (0 <= ix < ACROSS * CELLS and 0 <= iz < DOWN * CELLS):
        return None
    return flags[(ix // CELLS, iz // CELLS)][iz % CELLS][ix % CELLS]


def _height_at(ix, iz):
    return heights[(ix // CELLS, iz // CELLS)][iz % CELLS][ix % CELLS] / 100


def _block_cell(ix, iz):
    flags[(ix // CELLS, iz // CELLS)][iz % CELLS][ix % CELLS] = "#"


_blocked = kit.block_solids(b, CELL, _flag_at, _height_at, _block_cell)
_blocked_faces = kit.block_built(b, CELL, _flag_at, _height_at, _block_cell)
with open(os.path.join(out_dir, "solids.txt"), "w", encoding="utf-8") as _handle:
    _handle.write(f"{_blocked} cells blocked by what was built on them, of {len(b.solids)} boxes; {_blocked_faces} more by the {len(b.built)} faces themselves")
stray = sorted({chunk for (chunk, level) in b.groups if not (0 <= chunk[0] < ACROSS and 0 <= chunk[1] < DOWN)})
if stray:
    raise SystemExit(f"nzila: something was built outside the district, in chunk(s) {stray}")
b.write()

for (cx, cz) in flags:
    grid = {"cellMm": int(CELL * 1000), "cellX0": cx * CELLS, "cellZ0": cz * CELLS, "rows": ["".join(r) for r in flags[(cx, cz)]], "heightsCm": heights[(cx, cz)]}
    with open(os.path.join(out_dir, "chunks", f"c-{cx:02d}-{cz:02d}.walk.json"), "w", encoding="utf-8") as handle:
        json.dump(grid, handle)

# The linha: along the road and back, keeping right; it stops at the Mangueira on the side the paragem is on.
SOUTH_LANE, NORTH_LANE = ROAD[1] - 2.2, ROAD[0] + 2.2
line, stop_at = [], 0
for px in range(12, WIDE - 10, 14):
    line.append((float(px), SOUTH_LANE))
line += [(WIDE - 7.0, SOUTH_LANE - 1.0), (WIDE - 5.5, (ROAD[0] + ROAD[1]) / 2), (WIDE - 7.0, NORTH_LANE + 1.0)]
for px in range(WIDE - 14, 10, -14):
    if abs(px - PARAGEM[0]) < 7.0:
        stop_at = len(line)
        line.append((PARAGEM[0], NORTH_LANE - 0.9))
    else:
        line.append((float(px), NORTH_LANE))
line += [(7.0, NORTH_LANE + 1.0), (5.5, (ROAD[0] + ROAD[1]) / 2), (7.0, SOUTH_LANE - 1.0)]
os.makedirs(os.path.join(out_dir, "routes"), exist_ok=True)
with open(os.path.join(out_dir, "routes", "linha-zango.json"), "w", encoding="utf-8") as handle:
    json.dump({"closed": True, "points": [[round(px, 2), 0.0, round(pz, 2)] for px, pz in line]}, handle)
with open(os.path.join(out_dir, "strings.pt-AO.json"), "w", encoding="utf-8") as handle:
    json.dump(words, handle, ensure_ascii=False)

# ------------------------------------------------------------------ the people of the street
crowd_rng = random.Random(41)
actors = []


def timetable(stages):
    """From stages to keys, as make_l1.py does: ("at", x, z), ("go", x, z, metres a second), ("stay", seconds, pose, facing)."""
    keys, clock_s, px, pz, facing = [], 0.0, None, None, 0.0
    for stage in stages:
        if stage[0] == "at":
            px, pz = stage[1], stage[2]
        elif stage[0] == "go":
            _, nx, nz, pace = stage
            far = math.hypot(nx - px, nz - pz)
            if far < 0.05:
                continue
            facing = math.degrees(math.atan2(nx - px, nz - pz)) % 360
            keys.append([round(clock_s, 1), round(px, 2), round(pz, 2), "", round(facing, 1)])
            clock_s += far / pace
            px, pz = nx, nz
        else:
            _, seconds, pose, face = stage
            facing = facing if face is None else face
            keys.append([round(clock_s, 1), round(px, 2), round(pz, 2), pose, round(facing, 1)])
            clock_s += seconds
    keys.append([round(clock_s, 1), keys[0][1], keys[0][2], "", keys[0][4]])
    return keys


def there_and_back(role, points, pace, rests=(), who=None):
    """Along a line of points and back the same way, stopping here and there (index, seconds, pose)."""
    out = [("at", points[0][0], points[0][1])]
    for way in (list(enumerate(points))[1:], list(reversed(list(enumerate(points))))[1:]):
        for index, (px, pz) in way:
            out.append(("go", px, pz, pace))
            for at_index, seconds, pose in rests:
                if at_index == index:
                    out.append(("stay", seconds, pose, 180.0))
        out.append(("stay", crowd_rng.uniform(4, 9), "", 180.0))
    keys = timetable(out)
    actors.append({"role": role, **({"who": who} if who is not None else {}), "offset": round(crowd_rng.uniform(0, keys[-1][0]), 1), "keys": keys})


verge = ROAD[0] - 1.6
# Zungueiras along the verge of the road, who stop where the vans stop; people going about the bairro.
there_and_back("zungueira", [(60.0, verge), (120.0, verge), (PARAGEM[0] - 2.0, verge), (250.0, verge)], 1.0, rests=[(2, 16.0, "chamar"), (1, 10.0, "")])
there_and_back("zungueira", [(290.0, ROAD[1] + 1.8), (215.0, ROAD[1] + 1.8), (150.0, ROAD[1] + 1.8)], 0.95, rests=[(1, 12.0, "chamar")])
for who, points in enumerate([
    [(MID[0] + 2.0, 20.0), (MID[0] + 2.0, 100.0), (PARAGEM[0], PARAGEM[1] - 1.0)],
    [(MID[0] + 5.0, 240.0), (MID[0] + 5.0, 150.0), (CANTINA[0] - 0.8, CANTINA[1] - 4.4)],
    [(106.0, 60.0), (106.0, 112.0), (CHAF[0] + 3.0, CHAF[1] + 2.6)],
    [(236.0, 200.0), (236.0, 130.0), (MERCADO[0] + 14.0, MERCADO[1] + 3.0)],
    [(20.0, 59.0), (100.0, 59.0), (165.0, 59.0)],
    [(300.0, 193.0), (240.0, 193.0), (178.0, 193.0)],
]):
    there_and_back("any", points, crowd_rng.uniform(1.1, 1.4), rests=[(2, crowd_rng.uniform(8, 16), "")], who=who)
# The sellers of the mercado, seated low by their bacias; one of them calls.
for k in range(4):
    sx = MERCADO[0] + 1.5 + k * 5.4 * 1.4
    actors.append({"role": "vendedeira", "who": k, "offset": round(k * 7.3, 1), "keys": timetable([("at", sx, MERCADO[1] - 0.9), ("stay", 24.0 + k * 3, "baixo", 0.0), ("stay", 2.2, "baixo-chamar", 0.0), ("stay", 14.0, "baixo", 0.0)])})
# Whoever keeps each shop, and Tia Minga beside her banca.
actors.append({"role": "any", "who": 3, "offset": 0.0, "keys": timetable([("at", CANTINA[0] - 0.8, CANTINA[1] - 1.2), ("stay", 30.0, "", 0.0), ("stay", 2.2, "chamar", 0.0), ("stay", 24.0, "", 0.0)])})
actors.append({"role": "any", "who": 6, "offset": 5.0, "keys": timetable([("at", GEL[0] - 0.5, GEL[1] - 1.05), ("stay", 24.0, "", 180.0), ("stay", 2.2, "chamar", 180.0), ("stay", 15.0, "", 180.0)])})
actors.append({"role": "vendedeira", "who": 5, "offset": 3.0, "keys": timetable([("at", banca_x + 1.75, banca_z + 0.1), ("stay", 22.0, "", 0.0), ("stay", 2.2, "chamar", 0.0), ("stay", 16.0, "", 0.0)])})
# The children on the campo: after a ball nobody sees, from one end to the other and back.
for who in range(3):
    lane_z = CAMPO[1] - 6.0 + who * 6.0
    run = [("at", CAMPO[0] - 14.0, lane_z), ("go", CAMPO[0] + 2.0 + who * 3.0, lane_z + 3.0, 3.4), ("stay", 1.5, "", 90.0), ("go", CAMPO[0] + 15.0, lane_z - 2.0, 3.0), ("stay", 3.0 + who, "", 270.0),
           ("go", CAMPO[0] - 3.0, lane_z + 2.0, 3.6), ("go", CAMPO[0] - 14.0, lane_z, 2.6), ("stay", 4.0, "", 90.0)]
    actors.append({"role": "crianca", "who": who % 2, "offset": round(who * 3.7, 1), "keys": timetable(run)})
# Someone waiting at the chafariz with their bidon, and two seated on the tyres watching the game.
actors.append({"role": "any", "who": 7, "offset": 0.0, "keys": timetable([("at", CHAF[0] + 1.6, CHAF[1] + 1.9), ("stay", 40.0, "", 270.0), ("go", CHAF[0] + 0.2, CHAF[1] + 1.2, 0.8), ("stay", 18.0, "", 0.0), ("go", CHAF[0] + 1.6, CHAF[1] + 1.9, 0.8)])})

drivers = []


def circuit(model, points, pace, offset):
    stages = [("at", points[0][0], points[0][1])] + [("go", px, pz, pace) for px, pz in points[1:]] + [("go", points[0][0], points[0][1], pace)]
    keys = timetable(stages)
    drivers.append({"model": model, "offset": round(offset * keys[-1][0], 1), "keys": keys})


# Kupapatas and motos go round the blocks by the earth streets, slowly; a car or two keep to the road.
ring_a = [(STREETS[1][1] - 2.2, LANES[0][1] - 2.0), (STREETS[1][1] - 2.2, ROAD[0] + 2.4), (STREETS[3][0] + 2.2, ROAD[0] + 2.4), (STREETS[3][0] + 2.2, LANES[0][0] + 2.0)]
ring_b = [(STREETS[3][1] - 2.2, LANES[1][1] - 2.0), (STREETS[3][1] - 2.2, ROAD[1] - 2.4), (STREETS[1][0] + 2.2, ROAD[1] - 2.4), (STREETS[1][0] + 2.2, LANES[1][0] + 2.0)]
for n, (model, ring, pace) in enumerate([("kupapata-carga", ring_a, 5.2), ("mota", ring_a, 7.5), ("kupapata", ring_b, 5.0), ("mota", ring_b, 8.0)]):
    circuit(model, ring, pace, n / 4 + 0.07)
road_ring = [(12.0, SOUTH_LANE), (WIDE - 12.0, SOUTH_LANE), (WIDE - 8.0, (ROAD[0] + ROAD[1]) / 2), (WIDE - 12.0, NORTH_LANE), (12.0, NORTH_LANE), (8.0, (ROAD[0] + ROAD[1]) / 2)]
for n, (model, pace) in enumerate([("carro-branco", 9.0), ("carro-preto", 8.4)]):
    circuit(model, road_ring, pace, n / 2 + 0.2)
os.makedirs(os.path.join(out_dir, "npc"), exist_ok=True)
with open(os.path.join(out_dir, "npc", "crowd.json"), "w", encoding="utf-8") as handle:
    json.dump({"actors": actors, "vehicles": drivers}, handle, separators=(",", ":"))

MAP_CELL_M = 2.0
every = int(MAP_CELL_M / CELL)
map_rows = []
for iz in range(every // 2, DOWN * CELLS, every):
    map_rows.append("".join(flags[(ix // CELLS, iz // CELLS)][iz % CELLS][ix % CELLS] for ix in range(every // 2, ACROSS * CELLS, every)))
with open(os.path.join(out_dir, "mapa.json"), "w", encoding="utf-8") as handle:
    json.dump({"cellM": MAP_CELL_M, "rows": map_rows}, handle, separators=(",", ":"))

ARRIVAL = [round((MID[0] + MID[1]) / 2, 2), G, 104.0]
partial = {
    "id": "ao-lua/zango",
    "province": "ao-lua",
    "version": 1,
    "nameKey": "world.ao-lua.zango.name",
    "artPass": 1,
    "bounds": {"minX": 0, "minZ": 0, "maxX": WIDE, "maxZ": DEEP},
    "ambient": {"set": "l1", "soundBeds": []},
    "spawns": [{"id": "arrival", "pos": ARRIVAL, "facing": 180, "kind": "first_arrival"}, {"id": "mangueira", "pos": [round(PARAGEM[0], 2), G, round(PARAGEM[1] - 0.5, 2)], "facing": 180, "kind": "gateway"}],
    # The way to the Marginal: the vans at the Mangueira (D-11.2). One arrives at the Mutamba.
    "gateways": [{"id": "para-marginal", "pos": [round(PARAGEM[0], 2), G, round(PARAGEM[1], 2)], "to": "ao-lua/l1", "arrive": "mutamba", "mode": "ride", "openFlag": "world.open", "nameKey": "zango.gateway.marginal"}],
    "pois": places["pois"],
    "routes": [{"id": "linha-zango", "kind": "candongueiro", "spline": "routes/linha-zango.json", "stops": ["mangueira"], "stopPoints": [stop_at], "headwaySeconds": 240, "fareKey": "fares.candongueiroLocal"}],
    "paragens": places["paragens"],
    "lots": [],
    "residences": [],
    "interiors": [],
    "npc": {"crowd": "npc/crowd.json", "vendors": None, "police": None},
    "heat": {"lighting": None, "policePosts": [], "override": None},
    "adSlots": [],
    "signs": signs,
    "map": "mapa.json",
    "seats": [{"id": f"seat-{n + 1}", "pos": [round(sx, 2), round(sy, 2), round(sz, 2)], "facing": round(math.degrees(yaw) % 360, 1)} for n, (sx, sy, sz, yaw) in enumerate(b.seats)],
    "tables": [{"id": f"mesa-{n + 1}", "game": t["game"], "pos": [round(v, 3) for v in t["pos"]], "facing": round(math.degrees(t["facing"]) % 360, 1), "size": t["size"], "seats": [{"pos": [round(sx, 3), round(sy, 3), round(sz, 3)], "facing": round(math.degrees(yaw) % 360, 1)} for sx, sy, sz, yaw in t["seats"]]} for n, t in enumerate(tables)],
    "water": [],
    "strings": "strings.pt-AO.json",
}
with open(os.path.join(out_dir, "district.partial.json"), "w", encoding="utf-8") as handle:
    json.dump(partial, handle, indent=2, ensure_ascii=False)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "district.blend"))
print(f"nzila: Zango saved to {out_dir}: {houses} houses ({shops} with a shop at the front), {len(places['pois'])} points of interest, {len(b.seats)} seats")
