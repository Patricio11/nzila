# The parts of the Marginal and the Baixa (district L1), beside the general
# kit: the royal palm, the sobrado, the modernist block with its galleries,
# the glass tower, the pink building with the dome, the fortress, the iron
# palace, the church front, and what stands on the promenade. Built from the
# founder's photographs and docs/reference/LUANDA_REFERENCE.md §1 to §4.
#
# Architecture only (Rule 8): no names, no emblems, no flags of institutions.

import math
import random

import kit
from kit import BOTH, FULL, LIGHT, _add, _mul


def palmeira_real(b, x, z, rng, ground=0.14):
    """A royal palm: a tall pale trunk that swells in the middle, a green shaft, long arching fronds."""
    b.at(x, z)
    height = rng.uniform(9.0, 11.5)
    turn = rng.uniform(0, 2 * math.pi)
    top = (x, ground + height, z)

    def frond(angle, length, parts):
        out = (math.cos(angle), 0.0, math.sin(angle))
        side = (-out[2], 0.0, out[0])
        rise, sag = rng.uniform(1.2, 1.9), rng.uniform(2.6, 3.4)
        colour = "palmLeaf" if rng.random() < 0.6 else "palmLeafDark"
        spine = [_add(top, _add(_mul(out, length * i / parts), (0.0, 1.1 + rise * (i / parts) - sag * (i / parts) ** 2, 0.0))) for i in range(parts + 1)]
        for i in range(parts):
            wa, wc = 0.7 * (1 - (i / parts) ** 1.5) + 0.06, 0.7 * (1 - ((i + 1) / parts) ** 1.5) + 0.06
            for sign in (-1, 1):
                ea = _add(spine[i], _add(_mul(side, sign * wa), (0.0, -wa * 0.5, 0.0)))
                ec = _add(spine[i + 1], _add(_mul(side, sign * wc), (0.0, -wc * 0.5, 0.0)))
                b.face([spine[i], spine[i + 1], ec, ea], colour, two_sided=True)

    b.level = FULL
    b.tube([(x, ground, z), (x, ground + height * 0.35, z), (x, ground + height * 0.7, z), top], [0.27, 0.34, 0.28, 0.2], 6, "royalTrunk", cap=False)
    b.tube([top, _add(top, (0.0, 1.2, 0.0))], [0.2, 0.13], 6, "palmLeaf", cap=False)
    state = rng.getstate()
    count = rng.randint(9, 11)
    for k in range(count):
        frond(turn + 2 * math.pi * k / count + rng.uniform(-0.15, 0.15), rng.uniform(3.4, 4.3), 3)
    b.level = LIGHT
    rng.setstate(state)
    b.tube([(x, ground, z), (x, ground + height * 0.5, z), _add(top, (0.0, 1.2, 0.0))], [0.27, 0.33, 0.15], 4, "royalTrunk", cap=False)
    for k in range(6):
        frond(turn + 2 * math.pi * k / 6, 3.8, 1)
    b.level = BOTH
    return 0.4


def telhado(b, x, z, width, depth, y, rise, colour="roofTile", over=0.45):
    """A hipped roof of clay tile over a rectangle."""
    hx, hz = width / 2 + over, depth / 2 + over
    ridge = max(0.0, max(hx, hz) - min(hx, hz))
    if hx >= hz:
        r0, r1 = (x - ridge, y + rise, z), (x + ridge, y + rise, z)
    else:
        r0, r1 = (x, y + rise, z - ridge), (x, y + rise, z + ridge)
    c = [(x - hx, y, z - hz), (x + hx, y, z - hz), (x + hx, y, z + hz), (x - hx, y, z + hz)]
    inside = (x, y - 1.0, z)
    if hx >= hz:
        faces = [[c[0], c[1], r1, r0], [c[2], c[3], r0, r1], [c[1], c[2], r1], [c[3], c[0], r0]]
    else:
        faces = [[c[1], c[2], r1, r0], [c[3], c[0], r0, r1], [c[0], c[1], r0], [c[2], c[3], r1]]
    for face in faces:
        b.face(face, colour, away_from=inside)


def sobrado(b, x, z, width, depth, rng, face, ground=0.14):
    """An old two-storey town house: painted walls, tall windows, a tiled roof."""
    wall = rng.choice(["wall0", "wall3", "wall1", "paintWhite", "wall5", "wall6", "paintMint", "wall2"])
    kit.building(b, x, z, width, depth, 2, wall, rng, ground, face=face, extras=False)
    b.at(x, z)
    b.level = BOTH
    telhado(b, x, z, width, depth, ground + 0.5 + 2 * 3.1, rng.uniform(1.6, 2.2))


def moderno(b, x, z, width, depth, floors, rng, face, ground=0.14):
    """A late-colonial modern block: a gallery along every floor of its front, and fins against the sun."""
    wall = rng.choice(["wall0", "wall4", "wall7", "paintWhite", "wall3", "concrete"])
    kit.building(b, x, z, width, depth, floors, wall, rng, ground, face=face)
    b.at(x, z)
    sx, sz = {0: (0, 1), 1: (0, -1), 2: (1, 0), 3: (-1, 0)}[face]
    along = width if sx == 0 else depth
    half = (depth if sx == 0 else width) / 2
    for floor in range(1, floors):
        y = ground + 0.5 + floor * 3.1
        cx, cz = x + sx * (half + 0.6), z + sz * (half + 0.6)
        size = (along, 0.14, 1.2) if sx == 0 else (1.2, 0.14, along)
        b.level = BOTH
        b.box((cx, y, cz), size, "kerb", skip_bottom=False)
        b.level = FULL
        rail = (along, 0.9, 0.06) if sx == 0 else (0.06, 0.9, along)
        b.box((x + sx * (half + 1.17), y + 0.5, z + sz * (half + 1.17)), rail, wall)
    b.level = FULL
    top = ground + 0.5 + floors * 3.1
    for i in range(int(along // 4.5) + 1):
        offset = -along / 2 + i * (along / max(1, int(along // 4.5)))
        fx, fz = (x + offset, z + sz * (half + 0.6)) if sx == 0 else (x + sx * (half + 0.6), z + offset)
        fin = (0.16, top - ground - 3.6, 1.2) if sx == 0 else (1.2, top - ground - 3.6, 0.16)
        b.box((fx, ground + 3.6 + (top - ground - 3.6) / 2, fz), fin, "kerb")
    b.level = BOTH


def torre(b, x, z, width, depth, floors, rng, ground=0.14):
    """A new tower of glass, as on the skyline behind the Marginal."""
    b.at(x, z)
    storey = 3.3
    height = floors * storey
    frame = rng.choice(["glassFrame", "concrete", "paintWhite"])
    b.level = BOTH
    b.box((x, ground + height / 2, z), (width, height, depth), frame, top="roofZinc")
    b.box((x, ground + height + 0.9, z), (width * 0.5, 1.8, depth * 0.5), "roofZinc")
    sides = [((0.0, 0.0, depth / 2 + 0.03), (1.0, 0.0, 0.0), width), ((0.0, 0.0, -depth / 2 - 0.03), (-1.0, 0.0, 0.0), width), ((width / 2 + 0.03, 0.0, 0.0), (0.0, 0.0, -1.0), depth), ((-width / 2 - 0.03, 0.0, 0.0), (0.0, 0.0, 1.0), depth)]
    for offset, right, length in sides:
        b.level = FULL
        for floor in range(floors):
            lit = rng.random() < 0.3
            b.rect(_add((x, ground + floor * storey + 1.75, z), offset), right, (0.0, 1.0, 0.0), length * 0.94, 2.5, "windowLit" if lit else "glassBlue")
        b.level = LIGHT
        b.rect(_add((x, ground + height / 2 + 0.2, z), offset), right, (0.0, 1.0, 0.0), length * 0.94, height - 1.6, "glassBlue")
    b.level = BOTH


def _cupula(b, x, y, z, radius, colour, rib):
    """A dome on a drum, with a small lantern."""
    b.tube([(x, y, z), (x, y + radius * 0.55, z)], [radius * 1.02, radius * 1.02], 12, rib, cap=False)
    rings = []
    for i in range(5):
        a = (math.pi / 2) * i / 5
        rings.append([(x + math.cos(2 * math.pi * k / 12) * radius * math.cos(a), y + radius * 0.55 + radius * 0.95 * math.sin(a), z + math.sin(2 * math.pi * k / 12) * radius * math.cos(a)) for k in range(12)])
    inside = (x, y, z)
    for i in range(4):
        for k in range(12):
            j = (k + 1) % 12
            b.face([rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]], colour, away_from=inside)
    tip = (x, y + radius * 0.55 + radius * 0.95, z)
    for k in range(12):
        b.face([rings[4][k], rings[4][(k + 1) % 12], tip], colour, away_from=inside)
    b.tube([tip, _add(tip, (0.0, radius * 0.4, 0.0))], [radius * 0.16, radius * 0.1], 6, rib)


def edificio_rosa(b, x0, z0, x1, z1, rng, ground=0.14):
    """
    The pink building of the Marginal: a whole block in pink and white, arcades
    deep enough to walk under along the bay, and a dome on the corner, made a
    little larger than life so that it reads from the far end of the crescent.
    Its front is the side of z0. Returns the rectangle people cannot walk into.
    """
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    b.at(cx, cz)
    width, depth = x1 - x0, z1 - z0
    arcade = 3.6
    floor_h = 4.4
    height = 3 * floor_h
    b.level = BOTH
    # Above the arcade the building comes forward to the street line; at the ground it stands back.
    b.box((cx, ground + floor_h + (height - floor_h) / 2, cz), (width, height - floor_h, depth), "bankPink", top="roofTile")
    b.box((cx, ground + floor_h / 2, cz + arcade / 2), (width - 2 * arcade, floor_h, depth - arcade), "bankPink")
    # The columns of the arcade, on the bay side and round both corners.
    spots = [(x0 + 0.5 + i * ((width - 1.0) / max(1, round(width / 4.2))), z0 + 0.5) for i in range(round(width / 4.2) + 1)]
    for side_x in (x0 + 0.5, x1 - 0.5):
        spots += [(side_x, z0 + 0.5 + i * 4.4) for i in range(1, int(depth // 4.4))]
    for px, pz in spots:
        b.box((px, ground + floor_h / 2, pz), (0.8, floor_h, 0.8), "bankWhite")
    # White bands: over the arcade, under the roof.
    for y in (ground + floor_h, ground + height - 0.25):
        b.box((cx, y, cz), (width + 0.5, 0.5, depth + 0.5), "bankWhite", skip_bottom=False)
    # Windows on the two upper floors, all round.
    for floor in (1, 2):
        y = ground + floor * floor_h + 2.3
        for i in range(int(width // 4.2)):
            wx = x0 + 2.1 + i * 4.2
            lit = rng.random() < 0.3
            b.rect((wx, y, z0 - 0.04), (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 1.5, 2.4, "windowLit" if lit else "window")
            b.rect((wx, y, z1 + 0.04), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 1.5, 2.4, "window")
        for i in range(int(depth // 4.2)):
            wz = z0 + 2.1 + i * 4.2
            b.rect((x0 - 0.04, y, wz), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 1.5, 2.4, "window")
            b.rect((x1 + 0.04, y, wz), (0.0, 0.0, -1.0), (0.0, 1.0, 0.0), 1.5, 2.4, "window")
    # The dome, on the corner toward the middle of the bay.
    b.level = BOTH
    _cupula(b, x0 + 7.5, ground + height, z0 + 7.5, 6.2, "bankPink", "bankWhite")
    # Benches under the arcade.
    for i in range(3):
        kit.bench(b, x0 + width * (0.25 + 0.25 * i), z0 + arcade - 0.5, math.pi, ground)
    b.at(cx, cz)
    return (x0 + arcade, z0 + arcade, x1 - arcade, z1)


def palacio_de_ferro(b, x, z, rng, ground=0.14):
    """The iron palace: bright yellow, two storeys, a gallery all the way round behind bold cut-out panels."""
    b.at(x, z)
    width, depth, storey = 20.0, 14.0, 4.0
    b.level = BOTH
    b.box((x, ground + storey, z), (width - 4.4, storey * 2, depth - 4.4), "ferroYellow", top="roofZinc")
    for level in (0, 1):
        y = ground + level * storey
        b.box((x, y + 0.1, z), (width, 0.2, depth), "ferroDark", skip_bottom=False)
        # The posts of the gallery, and between them the panels of iron lace.
        for i in range(9):
            for sz in (-1, 1):
                px = x - width / 2 + 0.2 + i * (width - 0.4) / 8
                b.box((px, y + storey / 2, z + sz * (depth / 2 - 0.2)), (0.22, storey, 0.22), "ferroYellow")
                if i < 8:
                    b.level = FULL
                    b.rect((px + (width - 0.4) / 16, y + storey - 0.55, z + sz * (depth / 2 - 0.2)), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (width - 0.4) / 8 - 0.3, 0.8, "ferroDark", two_sided=True)
                    b.rect((px + (width - 0.4) / 16, y + 0.55, z + sz * (depth / 2 - 0.2)), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (width - 0.4) / 8 - 0.3, 0.75, "ferroYellow", two_sided=True)
                    b.level = BOTH
        for i in range(1, 6):
            for sx in (-1, 1):
                pz = z - depth / 2 + 0.2 + i * (depth - 0.4) / 6
                b.box((x + sx * (width / 2 - 0.2), y + storey / 2, pz), (0.22, storey, 0.22), "ferroYellow")
        for i in range(5):
            wx = x - 6 + i * 3
            b.rect((wx, y + 2.0, z - (depth - 4.4) / 2 - 0.04), (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 1.3, 2.6, "window")
            b.rect((wx, y + 2.0, z + (depth - 4.4) / 2 + 0.04), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 1.3, 2.6, "windowLit" if i % 2 else "window")
    b.box((x, ground + 2 * storey + 0.15, z), (width + 0.6, 0.3, depth + 0.6), "ferroDark", skip_bottom=False)
    return (x - (width - 4.4) / 2, z - (depth - 4.4) / 2, x + (width - 4.4) / 2, z + (depth - 4.4) / 2)


def igreja(b, x, z, ground=0.14):
    """An old church front: white, two towers, a door between them. Architecture and a quiet square; nothing more."""
    b.at(x, z)
    b.level = BOTH
    b.box((x, ground + 5.0, z + 8), (13.0, 10.0, 22.0), "paintWhite", top="roofTile")
    telhado(b, x, z + 8, 13.0, 22.0, ground + 10.0, 2.6)
    for sx in (-1, 1):
        b.box((x + sx * 5.2, ground + 8.0, z - 2.0), (4.2, 16.0, 4.2), "paintWhite")
        b.box((x + sx * 5.2, ground + 16.2, z - 2.0), (4.8, 0.4, 4.8), "kerb", skip_bottom=False)
        tip = (x + sx * 5.2, ground + 19.6, z - 2.0)
        for a, c in [((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))]:
            b.face([(tip[0] + a[0] * 2.1, ground + 16.4, tip[2] + a[1] * 2.1), (tip[0] + c[0] * 2.1, ground + 16.4, tip[2] + c[1] * 2.1), tip], "roofTile", away_from=(tip[0], ground + 16.0, tip[2]))
        b.rect((x + sx * 5.2, ground + 13.0, z - 4.14), (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 1.0, 2.2, "window")
    b.rect((x, ground + 2.0, z - 3.04), (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 2.4, 4.0, "wood")
    b.rect((x, ground + 7.6, z - 3.04), (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 1.6, 1.6, "window")
    b.face([(x - 3.1, ground + 10.0, z - 3.0), (x + 3.1, ground + 10.0, z - 3.0), (x, ground + 12.6, z - 3.0)], "paintWhite", toward=(0.0, 0.0, -1.0), two_sided=True)
    return (x - 7.4, z - 4.2, x + 7.4, z + 19.2)


def fortaleza(b, cx, cz, top, rng):
    """The fortress on its hill: thick pale walls, bastions at the corners, cannons toward the bay, a closed gate."""
    b.at(cx, cz)
    half, wall_h, thick = 17.0, 6.5, 2.4
    b.level = BOTH
    for sx, sz, w, d in [(0, -1, 2 * half, thick), (0, 1, 2 * half, thick), (-1, 0, thick, 2 * half), (1, 0, thick, 2 * half)]:
        b.box((cx + sx * half, top + wall_h / 2 - 1.5, cz + sz * half), (w, wall_h + 3.0, d), "fortStone", top="fortStoneDark")
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box((cx + sx * (half + 1.2), top + wall_h / 2 - 1.5, cz + sz * (half + 1.2)), (7.5, wall_h + 3.6, 7.5), "fortStone", top="fortStoneDark")
    # The yard inside, and a low building in it.
    b.face([(cx - half, top + 0.4, cz - half), (cx + half, top + 0.4, cz - half), (cx + half, top + 0.4, cz + half), (cx - half, top + 0.4, cz + half)], "fortStoneDark", toward=(0.0, 1.0, 0.0))
    b.box((cx, top + 2.4, cz + 4), (16.0, 4.0, 9.0), "paintWhite", top="roofTile")
    # The gate, closed, in the wall that faces the town.
    b.rect((cx + half + thick / 2 + 0.04, top + 2.0, cz), (0.0, 0.0, -1.0), (0.0, 1.0, 0.0), 3.4, 4.2, "wood")
    # Cannons on the wall that faces the bay.
    b.level = FULL
    for i in range(5):
        px = cx - half + 5 + i * 6
        b.tube([(px, top + wall_h + 0.5, cz - half + 0.4), (px, top + wall_h + 0.7, cz - half - 2.2)], [0.22, 0.16], 6, "metal")
        b.box((px, top + wall_h + 0.25, cz - half + 0.6), (0.9, 0.5, 1.2), "wood")
    b.level = BOTH


def quiosque(b, x, z, rng, ground=0.14, face=-1):
    """A kiosk on the promenade: a counter under a flat roof that hangs over it."""
    b.at(x, z)
    colour = rng.choice(["awningRed", "awningTeal", "awningGold", "zincBlue"])
    b.level = BOTH
    b.box((x, ground + 1.3, z), (3.2, 2.6, 2.6), "paintWhite")
    b.box((x, ground + 2.75, z + face * 0.5), (4.0, 0.2, 3.9), colour, skip_bottom=False)
    b.rect((x, ground + 1.7, z + face * 1.34), (-face * 1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 2.4, 1.1, "windowLit")
    b.box((x, ground + 1.0, z + face * 1.5), (2.8, 0.1, 0.4), "wood", skip_bottom=False)
    return 1.7


def campo(b, x, z, width, depth, kind, ground=0.14):
    """A court on the promenade: painted ground, white lines, and its goals or hoops."""
    b.at(x, z)
    b.level = BOTH
    y = ground + 0.012
    surface, zone = ("courtBlue", "courtGreen") if kind == "basquete" else ("courtGreen", "courtBlue")
    b.face([(x - width / 2, y, z - depth / 2), (x + width / 2, y, z - depth / 2), (x + width / 2, y, z + depth / 2), (x - width / 2, y, z + depth / 2)], surface, toward=(0.0, 1.0, 0.0))
    line = y + 0.006
    for (ax, az, bx, bz) in [(-1, -1, 1, -1), (-1, 1, 1, 1), (-1, -1, -1, 1), (1, -1, 1, 1), (0, -1, 0, 1)]:
        x_a, z_a, x_b, z_b = x + ax * width / 2, z + az * depth / 2, x + bx * width / 2, z + bz * depth / 2
        if ax == bx:
            b.face([(x_a - 0.07, line, z_a), (x_a + 0.07, line, z_a), (x_b + 0.07, line, z_b), (x_b - 0.07, line, z_b)], "line", toward=(0.0, 1.0, 0.0))
        else:
            b.face([(x_a, line, z_a - 0.07), (x_b, line, z_b - 0.07), (x_b, line, z_b + 0.07), (x_a, line, z_a + 0.07)], "line", toward=(0.0, 1.0, 0.0))
    for sx in (-1, 1):
        ex = x + sx * (width / 2 - 0.3)
        b.face([(ex - sx * 0.0, y + 0.004, z - 2.2), (ex - sx * 3.6, y + 0.004, z - 2.2), (ex - sx * 3.6, y + 0.004, z + 2.2), (ex, y + 0.004, z + 2.2)], zone, toward=(0.0, 1.0, 0.0))
        if kind == "basquete":
            b.tube([(ex, ground, z), (ex, ground + 3.2, z)], [0.08, 0.08], 4, "metal", cap=False)
            b.rect((ex - sx * 0.6, ground + 3.3, z), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 1.6, 1.0, "paintWhite", two_sided=True)
            b.tube([(ex, ground + 3.2, z), (ex - sx * 0.6, ground + 3.2, z)], [0.04, 0.04], 3, "metal", cap=False)
        else:
            for sz in (-1.5, 1.5):
                b.tube([(ex, ground, z + sz), (ex, ground + 2.0, z + sz)], [0.05, 0.05], 4, "paintWhite", cap=False)
            b.tube([(ex, ground + 2.0, z - 1.5), (ex, ground + 2.0, z + 1.5)], [0.05, 0.05], 4, "paintWhite", cap=False)


def palco(b, x, z, ground=0.14):
    """A small stage, its back to the bay."""
    b.at(x, z)
    b.level = BOTH
    b.box((x, ground + 0.45, z), (9.0, 0.9, 6.0), "wood", top="concrete")
    for sx in (-1, 1):
        b.tube([(x + sx * 4.2, ground + 0.9, z - 2.7), (x + sx * 4.2, ground + 4.6, z - 2.7)], [0.1, 0.1], 4, "metal", cap=False)
    b.box((x, ground + 4.7, z - 1.2), (9.4, 0.2, 3.6), "awningRed", skip_bottom=False)
    return (x - 4.5, z - 3.0, x + 4.5, z + 3.0)


def posto(b, x, z, ground=0.14):
    """The police post. The force, its colours and its sign are the game's own (WORLD_ATLAS.md §7)."""
    b.at(x, z)
    b.level = BOTH
    b.box((x, ground + 1.5, z), (5.0, 3.0, 3.6), "paintWhite", top="roofZinc")
    b.box((x, ground + 0.5, z), (5.06, 1.0, 3.66), "policeNavy")
    b.rect((x - 0.9, ground + 1.1, z - 1.84), (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 1.0, 2.1, "wood")
    b.rect((x + 1.2, ground + 1.8, z - 1.84), (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 1.4, 1.0, "windowLit")
    b.box((x, ground + 3.3, z - 1.9), (2.4, 0.5, 0.08), "policeNavy")
    return (x - 2.5, z - 1.8, x + 2.5, z + 1.8)


def bandeira(b, x, z, ground=0.14, mast=9.0, wide=2.7):
    """
    The national flag on its mast, where it flies in life: before a public building. Red over
    black, and in the middle in yellow the arc of a cogwheel, the machete across it and the star.
    It hangs out toward -X with a fold or two in it, so that someone looking at it from the north (the
    bay's side in Luanda) sees its right face, the mast at their left; from behind it is reversed, as cloth is.
    """
    b.at(x, z)
    b.level = BOTH
    b.tube([(x, ground, z), (x, ground + mast, z)], [0.07, 0.045], 6, "rim")
    b.gem((x, ground + mast + 0.08, z), (0.09, 0.09, 0.09), 5, "flagYellow", random.Random(1), rough=0.0)
    high = wide * 2 / 3
    top = ground + mast - 0.15
    folds = [0.0, 0.10, -0.06, 0.08, 0.0]

    def at(u, v, off=0.0):
        """A point on the cloth: u along it from the mast (0 to 1), v down it (0 to 1)."""
        k = min(len(folds) - 2, int(u * (len(folds) - 1)))
        part = u * (len(folds) - 1) - k
        return (x - 0.05 - u * wide, top - v * high - 0.05 * u * u, z + folds[k] + (folds[k + 1] - folds[k]) * part + off)

    for k in range(len(folds) - 1):
        u0, u1 = k / (len(folds) - 1), (k + 1) / (len(folds) - 1)
        b.face([at(u0, 0.0), at(u1, 0.0), at(u1, 0.5), at(u0, 0.5)], "flagRed", toward=(0.0, 0.0, 1.0), two_sided=True)
        b.face([at(u0, 0.5), at(u1, 0.5), at(u1, 1.0), at(u0, 1.0)], "flagBlack", toward=(0.0, 0.0, 1.0), two_sided=True)
    b.level = FULL
    for side in (0.012, -0.012):
        facing = (0.0, 0.0, 1.0 if side > 0 else -1.0)
        def spot(cu, cv, angle, r):
            """A point at an angle (degrees, anticlockwise from the right) and a distance from a centre, on the cloth."""
            return at(cu + math.cos(math.radians(angle)) * r * 2 / 3, cv - math.sin(math.radians(angle)) * r, side)

        # The cogwheel: an arc from the top, round the right, to the lower left, with its teeth outside.
        WHEEL = (0.50, 0.47)
        steps = 18
        for k in range(steps):
            a0, a1 = 93 - 232 * k / steps, 93 - 232 * (k + 1) / steps
            b.face([spot(*WHEEL, a0, 0.185), spot(*WHEEL, a1, 0.185), spot(*WHEEL, a1, 0.228), spot(*WHEEL, a0, 0.228)], "flagYellow", toward=facing)
            if k % 2 == 0:
                b.face([spot(*WHEEL, a0 - 1.5, 0.226), spot(*WHEEL, a1 + 1.5, 0.226), spot(*WHEEL, a1 + 2.5, 0.268), spot(*WHEEL, a0 - 2.5, 0.268)], "flagYellow", toward=facing)
        # The machete: its curved point up at the left, the blade down across the wheel, the handle beyond it.
        upper = [(0.404, 0.452), (0.425, 0.500), (0.470, 0.560), (0.535, 0.630), (0.612, 0.706)]
        lower = [(0.404, 0.452), (0.408, 0.535), (0.452, 0.598), (0.520, 0.662), (0.600, 0.728)]
        for k in range(len(upper) - 1):
            b.face([at(*upper[k], side), at(*upper[k + 1], side), at(*lower[k + 1], side), at(*lower[k], side)], "flagYellow", toward=facing)
        b.face([at(0.612, 0.706, side), at(0.668, 0.770, side), at(0.676, 0.800, side), at(0.656, 0.806, side), at(0.600, 0.728, side)], "flagYellow", toward=facing)
        # The star, inside the wheel's curve, up and to the left.
        STAR = (0.483, 0.372)
        for k in range(0, 10, 2):
            b.face([spot(*STAR, 90 + k * 36, 0.085), spot(*STAR, 90 + (k + 1) * 36, 0.034), at(*STAR, side), spot(*STAR, 90 + (k - 1) * 36, 0.034)], "flagYellow", toward=facing)
    b.level = BOTH
    return 0.3


def banca(b, x, z, rng, ground=0.14):
    """A market stall: a table heaped with bacias of fruit and grain under a sunshade."""
    b.at(x, z)
    b.level = BOTH
    b.box((x, ground + 0.4, z), (2.2, 0.8, 1.1), "wood")
    b.level = FULL
    for i in range(4):
        bx, bz = x - 0.75 + i * 0.5, z + rng.uniform(-0.2, 0.2)
        b.tube([(bx, ground + 0.8, bz), (bx, ground + 0.95, bz)], [0.17, 0.22], 6, rng.choice(["zincBlue", "awningRed", "awningTeal", "cloth", "paintMint"]), cap=False)
        b.gem((bx, ground + 0.98, bz), (0.19, 0.1, 0.19), 5, rng.choice(["awningGold", "awningRed", "acaciaLeaf", "sand", "paintWhite", "roofTile"]), rng, rough=0.08)
    b.level = BOTH
    kit.parasol(b, x + 0.2, z + 0.9, rng, ground)
    b.at(x, z)
    return 1.3


def mesa_de_xadrez(b, x, z, ground=0.14):
    """A stone table with a board cut into it, and a stool either side."""
    b.at(x, z)
    b.level = BOTH
    b.box((x, ground + 0.36, z), (0.3, 0.72, 0.3), "concrete")
    b.box((x, ground + 0.76, z), (0.9, 0.08, 0.9), "kerb", skip_bottom=False)
    b.level = FULL
    for i in range(4):
        for j in range(4):
            if (i + j) % 2 == 0:
                px, pz = x - 0.3 + i * 0.2, z - 0.3 + j * 0.2
                b.face([(px - 0.1, ground + 0.805, pz - 0.1), (px + 0.1, ground + 0.805, pz - 0.1), (px + 0.1, ground + 0.805, pz + 0.1), (px - 0.1, ground + 0.805, pz + 0.1)], "tarShade", toward=(0.0, 1.0, 0.0))
    b.level = BOTH
    for sx in (-1, 1):
        b.box((x + sx * 0.85, ground + 0.23, z), (0.4, 0.46, 0.4), "concrete")
        b.seats.append((x + sx * 0.85, ground + 0.46, z, math.pi / 2 * -sx))
    return 1.1


def mural(b, x, z, length, rng, ground=0.14):
    """A long wall painted in blocks of colour: the mural. Faces the side of smaller z."""
    b.at(x, z)
    b.level = BOTH
    b.box((x, ground + 1.6, z + 0.15), (length, 3.2, 0.3), "paintWhite")
    at = x - length / 2
    while at < x + length / 2 - 0.5:
        w = min(rng.uniform(1.2, 3.2), x + length / 2 - at)
        h = rng.uniform(1.6, 3.0)
        b.rect((at + w / 2, ground + h / 2 + 0.1, z - 0.02), (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0), w, h, rng.choice(["awningRed", "awningGold", "awningTeal", "zincBlue", "bankPink", "acaciaLeaf", "cloth", "ferroYellow"]))
        at += w
    return (x - length / 2, z, x + length / 2, z + 0.4)
