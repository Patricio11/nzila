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
            # Pass 2, on the face the bay sees: each window in a white surround under a small pediment
            # (round on the first floor, pointed on the second), with a sill.
            b.level = FULL
            front = (0.0, 0.0, -1.0)
            b.face([(wx - 1.0, y - 1.35, z0 - 0.02), (wx + 1.0, y - 1.35, z0 - 0.02), (wx + 1.0, y + 1.4, z0 - 0.02), (wx - 1.0, y + 1.4, z0 - 0.02)], "bankWhite", toward=front)
            if floor == 1:
                head = [(wx + math.cos(math.pi * k / 5) * 1.05, y + 1.4 + math.sin(math.pi * k / 5) * 0.55, z0 - 0.03) for k in range(6)]
            else:
                head = [(wx + 1.15, y + 1.4, z0 - 0.03), (wx, y + 2.0, z0 - 0.03), (wx - 1.15, y + 1.4, z0 - 0.03)]
            b.face(head, "bankWhite", toward=front)
            b.box((wx, y - 1.42, z0 - 0.14), (2.3, 0.14, 0.3), "bankWhite", skip_bottom=False)
            b.level = BOTH
        for i in range(int(depth // 4.2)):
            wz = z0 + 2.1 + i * 4.2
            b.rect((x0 - 0.04, y, wz), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 1.5, 2.4, "window")
            b.rect((x1 + 0.04, y, wz), (0.0, 0.0, -1.0), (0.0, 1.0, 0.0), 1.5, 2.4, "window")
    # Pass 2: the arcade's bays are arches, not gaps: over each, the wall comes down in a round head.
    b.level = FULL
    front_spots = [s for s in spots if abs(s[1] - (z0 + 0.5)) < 0.01]
    for (ax, az), (bx, _) in zip(front_spots, front_spots[1:]):
        left, right, spring, top = ax + 0.4, bx - 0.4, ground + floor_h - 1.55, ground + floor_h - 0.25
        mid, half = (left + right) / 2, (right - left) / 2
        arc = [(mid + math.cos(math.pi * k / 6) * half, spring + math.sin(math.pi * k / 6) * (top - spring - 0.2), az - 0.36) for k in range(7)]
        # The two spandrels, each a fan from its upper corner down to the arc.
        b.face([(right, top, az - 0.36)] + arc[:4], "bankPink", toward=(0.0, 0.0, -1.0))
        b.face([(left, top, az - 0.36)] + arc[3:], "bankPink", toward=(0.0, 0.0, -1.0))
        b.box((ax, spring - 0.12, az), (1.0, 0.24, 1.0), "bankWhite")
    # White pilasters up the corners, and a parapet round the roof with a raised piece over the middle.
    for px in (x0, x1):
        b.box((px, ground + floor_h + (height - floor_h) / 2, z0), (0.9, height - floor_h, 0.9), "bankWhite")
    b.level = BOTH
    b.box((cx, ground + height + 0.45, z0 + 0.25), (width, 0.9, 0.5), "bankWhite")
    b.box((cx, ground + height + 1.25, z0 + 0.25), (9.0, 1.7, 0.5), "bankWhite")
    b.level = FULL
    crest = [(cx - 4.5, ground + height + 2.1, z0 + 0.25), (cx + 4.5, ground + height + 2.1, z0 + 0.25), (cx, ground + height + 3.3, z0 + 0.25)]
    b.face(crest, "bankWhite", toward=(0.0, 0.0, -1.0), two_sided=True)
    # The great door, under the arcade in the middle, in its white frame.
    door_z = z0 + arcade - 0.04
    b.face([(cx - 2.1, ground, door_z), (cx + 2.1, ground, door_z), (cx + 2.1, ground + 3.8, door_z), (cx - 2.1, ground + 3.8, door_z)], "bankWhite", toward=(0.0, 0.0, -1.0))
    b.face([(cx - 1.6, ground, door_z - 0.02), (cx + 1.6, ground, door_z - 0.02), (cx + 1.6, ground + 3.4, door_z - 0.02), (cx - 1.6, ground + 3.4, door_z - 0.02)], "wood", toward=(0.0, 0.0, -1.0))
    # The dome, on the corner toward the middle of the bay: on a drum with windows, ribbed in white.
    b.level = BOTH
    dome_x, dome_z, dome_r = x0 + 7.5, z0 + 7.5, 6.2
    _cupula(b, dome_x, ground + height, dome_z, dome_r, "bankPink", "bankWhite")
    b.level = FULL
    base_y = ground + height + dome_r * 0.55
    for k in range(12):
        angle = 2 * math.pi * (k + 0.5) / 12
        # A window in each face of the drum.
        wx, wz = dome_x + math.cos(angle) * dome_r * 1.03, dome_z + math.sin(angle) * dome_r * 1.03
        b.rect((wx, ground + height + dome_r * 0.28, wz), (-math.sin(angle), 0.0, math.cos(angle)), (0.0, 1.0, 0.0), 1.0, dome_r * 0.34, "window", two_sided=True)
        # A rib up the dome at each corner of the drum.
        rib_a = 2 * math.pi * k / 12
        points = []
        for i in range(5):
            up = (math.pi / 2) * i / 4.6
            points.append((dome_x + math.cos(rib_a) * dome_r * 1.02 * math.cos(up), base_y + dome_r * 0.95 * math.sin(up) + 0.04, dome_z + math.sin(rib_a) * dome_r * 1.02 * math.cos(up)))
        b.tube(points, [0.13, 0.12, 0.11, 0.1, 0.08], 3, "bankWhite", cap=False)
    b.level = BOTH
    # Benches under the arcade.
    for i in range(3):
        kit.bench(b, x0 + width * (0.25 + 0.25 * i), z0 + arcade - 0.5, math.pi, ground)
    b.at(cx, cz)
    return (x0 + arcade, z0 + arcade, x1 - arcade, z1)


def palacio_de_ferro(b, x, z, rng, ground=0.14):
    """
    The iron palace (art pass 2): bright yellow, two storeys, a gallery all the way round on slender
    columns. Between the columns the iron is worked: an arch of lace under each beam with brackets at its
    ends, a balustrade of crossed bars with a rosette at each crossing, a crest of points along the roof,
    and a wide stair up to the door.
    """
    b.at(x, z)
    width, depth, storey = 20.0, 14.0, 4.0
    b.level = BOTH
    b.box((x, ground + storey, z), (width - 4.4, storey * 2, depth - 4.4), "ferroYellow", top="roofZinc")

    def bay(level_y, ax, az, bx, bz, facing):
        """The ironwork of one bay of the gallery, between two columns at (ax, az) and (bx, bz)."""
        ux, uz = bx - ax, bz - az

        def at(u, v, out=0.0):
            return (ax + ux * u + facing[0] * out, level_y + v, az + uz * u + facing[2] * out)

        def bar(u0, v0, u1, v1, thick=0.045, colour="ferroDark"):
            # A flat bar seen from both sides of the gallery.
            du, dv = u1 - u0, v1 - v0
            long = math.hypot(du * math.hypot(ux, uz), dv) or 1.0
            nu, nv = -dv / long * thick / math.hypot(ux, uz), du * math.hypot(ux, uz) / long * thick
            # One face, toward the street: the lace is looked at from outside, and the phone has a budget.
            b.face([at(u0 - nu, v0 - nv), at(u1 - nu, v1 - nv), at(u1 + nu, v1 + nv), at(u0 + nu, v0 + nv)], colour, toward=facing)

        # The balustrade: a rail, a foot rail, crossed bars, and a rosette where they cross.
        bar(0.0, 1.02, 1.0, 1.02, 0.05)
        bar(0.0, 0.14, 1.0, 0.14, 0.04)
        for k in range(2):
            u0, u1 = k / 2, (k + 1) / 2
            bar(u0, 0.14, u1, 1.02, 0.03)
            bar(u0, 1.02, u1, 0.14, 0.03)
            um = (u0 + u1) / 2
            b.face([at(um - 0.045, 0.58, 0.01), at(um, 0.46, 0.01), at(um + 0.045, 0.58, 0.01), at(um, 0.70, 0.01)], "ferroYellow", toward=facing)
        # Under the beam: a flat arch of lace, its spandrels filled with rays, and a drop at its crown.
        arch = [(u, storey - 0.22 - 0.62 * (1 - math.sin(math.pi * u))) for u in [k / 4 for k in range(5)]]
        for (u0, v0), (u1, v1) in zip(arch, arch[1:]):
            bar(u0, v0, u1, v1, 0.04)
        bar(0.0, storey - 0.2, 1.0, storey - 0.2, 0.05)
        for k in range(1, 4):
            u, v = arch[k]
            bar(u, v, u, storey - 0.2, 0.022)
        bar(0.5, storey - 0.86, 0.5, storey - 1.12, 0.03)
        b.face([at(0.5 - 0.05, storey - 1.16, 0.01), at(0.5, storey - 1.3, 0.01), at(0.5 + 0.05, storey - 1.16, 0.01), at(0.5, storey - 1.06, 0.01)], "ferroDark", toward=facing)

    for level in (0, 1):
        y = ground + level * storey
        b.level = BOTH
        b.box((x, y + 0.1, z), (width, 0.2, depth), "ferroDark", skip_bottom=False)
        # The columns: slender, with a foot and a head, and the ironwork between each pair.
        front = [(x - width / 2 + 0.2 + i * (width - 0.4) / 8) for i in range(9)]
        side = [(z - depth / 2 + 0.2 + i * (depth - 0.4) / 6) for i in range(7)]
        columns = [(px, z + sz * (depth / 2 - 0.2)) for sz in (-1, 1) for px in front] + [(x + sx * (width / 2 - 0.2), pz) for sx in (-1, 1) for pz in side[1:-1]]
        for px, pz in columns:
            b.box((px, y + storey / 2, pz), (0.16, storey, 0.16), "ferroYellow")
            b.level = FULL
            b.box((px, y + storey - 0.36, pz), (0.32, 0.16, 0.32), "ferroDark")
            b.level = BOTH
        b.level = FULL
        for sz in (-1, 1):
            pz = z + sz * (depth / 2 - 0.2)
            for i in range(8):
                # The middle bay of the ground floor, toward the street, is the way in: no balustrade there.
                if level == 0 and sz < 0 and i in (3, 4):
                    continue
                bay(y + 0.2, front[i], pz, front[i + 1], pz, (0.0, 0.0, float(sz)))
        for sx in (-1, 1):
            px = x + sx * (width / 2 - 0.2)
            for i in range(6):
                bay(y + 0.2, px, side[i], px, side[i + 1], (float(sx), 0.0, 0.0))
        b.level = BOTH
        for i in range(5):
            wx = x - 6 + i * 3
            # Tall windows with a round head, shuttered in green as iron houses are.
            for wz, facing, lit in ((z - (depth - 4.4) / 2 - 0.04, (0.0, 0.0, -1.0), False), (z + (depth - 4.4) / 2 + 0.04, (0.0, 0.0, 1.0), i % 2 == 1)):
                head = [(wx + math.cos(math.pi * k / 6) * 0.65, y + 3.0 + math.sin(math.pi * k / 6) * 0.5, wz) for k in range(7)]
                b.face([(wx - 0.65, y + 0.7, wz), (wx + 0.65, y + 0.7, wz)] + head, "windowLit" if lit else "window", toward=facing)
                b.level = FULL
                for shutter in (-1, 1):
                    b.face([(wx + shutter * 0.68, y + 0.7, wz + facing[2] * 0.02), (wx + shutter * 1.1, y + 0.7, wz + facing[2] * 0.02), (wx + shutter * 1.1, y + 3.0, wz + facing[2] * 0.02), (wx + shutter * 0.68, y + 3.0, wz + facing[2] * 0.02)], "awningTeal", toward=facing)
                b.level = BOTH
    # The roof's edge, and along it a crest of iron points.
    roof = ground + 2 * storey
    b.box((x, roof + 0.15, z), (width + 0.6, 0.3, depth + 0.6), "ferroDark", skip_bottom=False)
    b.level = FULL
    for sz in (-1, 1):
        pz = z + sz * (depth / 2 + 0.3)
        for k in range(28):
            px = x - width / 2 - 0.3 + (width + 0.6) * (k + 0.5) / 28
            tall = 0.5 if k % 4 == 2 else 0.28
            b.face([(px - 0.22, roof + 0.3, pz), (px + 0.22, roof + 0.3, pz), (px, roof + 0.3 + tall, pz)], "ferroDark", toward=(0.0, 0.0, float(sz)), two_sided=True)
    # The stair to the door, as wide as two bays.
    for step in range(3):
        b.box((x, ground + 0.035 + step * 0.07, z - depth / 2 - 0.9 + step * 0.3), (5.0, 0.07, 1.8 - step * 0.6), "fortStone")
    b.rect((x, ground + 1.75, z - (depth - 4.4) / 2 - 0.06), (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 1.9, 3.1, "wood")
    b.level = BOTH
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
    # Cannons on the wall that faces the bay.
    b.level = FULL
    for i in range(5):
        px = cx - half + 5 + i * 6
        b.tube([(px, top + wall_h + 0.5, cz - half + 0.4), (px, top + wall_h + 0.7, cz - half - 2.2)], [0.22, 0.16], 6, "metal")
        b.box((px, top + wall_h + 0.25, cz - half + 0.6), (0.9, 0.5, 1.2), "wood")
    # Pass 2. A white cord of stone runs round the walls below the parapet, and the parapet is cut with
    # embrasures; at each bastion's point stands a guarita, the round sentry box under its little dome.
    crown = top + wall_h + 1.5
    for sx, sz, w, d in [(0, -1, 2 * half, thick + 0.3), (0, 1, 2 * half, thick + 0.3), (-1, 0, thick + 0.3, 2 * half), (1, 0, thick + 0.3, 2 * half)]:
        b.box((cx + sx * half, crown - 1.25, cz + sz * half), (w, 0.3, d), "bankWhite", skip_bottom=False)
    for side in (-1, 1):
        for i in range(7):
            along = -half + 4.5 + i * (2 * half - 9.0) / 6
            # Dark notches in the parapet: toward the bay and the land, and toward east and west.
            b.rect((cx + along, crown - 0.5, cz + side * (half + thick / 2 + 0.03)), (-float(side), 0.0, 0.0), (0.0, 1.0, 0.0), 1.1, 0.9, "fortStoneDark")
            b.rect((cx + side * (half + thick / 2 + 0.03), crown - 0.5, cz + along), (0.0, 0.0, float(side)), (0.0, 1.0, 0.0), 1.1, 0.9, "fortStoneDark")
    for sx in (-1, 1):
        for sz in (-1, 1):
            gx, gz = cx + sx * (half + 4.6), cz + sz * (half + 4.6)
            deck = top + wall_h / 2 - 1.5 + (wall_h + 3.6) / 2
            b.tube([(gx, deck - 1.4, gz), (gx, deck + 2.3, gz)], [0.75, 1.0], 8, "fortStone", cap=False)
            b.tube([(gx, deck + 2.3, gz), (gx, deck + 2.6, gz), (gx, deck + 3.3, gz)], [1.15, 0.9, 0.12], 8, "bankWhite")
            outward = math.atan2(sz, sx)
            b.rect((gx + math.cos(outward) * 1.0, deck + 1.4, gz + math.sin(outward) * 1.0), (-math.sin(outward), 0.0, math.cos(outward)), (0.0, 1.0, 0.0), 0.3, 0.8, "fortStoneDark", two_sided=True)
    # The gate, in the wall that faces the town: an arch of white stone under a pediment, and its two leaves.
    gate_x = cx + half + thick / 2 + 0.06
    east = (1.0, 0.0, 0.0)
    b.face([(gate_x, top - 0.2, cz - 3.0), (gate_x, top - 0.2, cz + 3.0), (gate_x, top + 5.2, cz + 3.0), (gate_x, top + 5.2, cz - 3.0)], "bankWhite", toward=east)
    b.face([(gate_x, top + 5.2, cz - 3.4), (gate_x, top + 5.2, cz + 3.4), (gate_x, top + 6.6, cz)], "bankWhite", toward=east)
    arch = [(gate_x + 0.02, top + 3.0 + math.sin(math.pi * k / 6) * 1.5, cz + math.cos(math.pi * k / 6) * 1.9) for k in range(7)]
    b.face([(gate_x + 0.02, top - 0.2, cz + 1.9), (gate_x + 0.02, top - 0.2, cz - 1.9)] + list(reversed(arch)), "wood", toward=east)
    b.face([(gate_x + 0.03, top - 0.2, cz - 0.05), (gate_x + 0.03, top - 0.2, cz + 0.05), (gate_x + 0.03, top + 4.5, cz + 0.05), (gate_x + 0.03, top + 4.5, cz - 0.05)], "fortStoneDark", toward=east)
    # The house in the yard gets an arcade along its front and a door.
    for i in range(6):
        ax = cx - 7.0 + i * 2.8
        b.box((ax, top + 1.7, cz - 0.9), (0.4, 2.6, 0.4), "bankWhite")
    b.box((cx, top + 3.15, cz - 0.9), (16.0, 0.3, 0.6), "bankWhite", skip_bottom=False)
    # Weather on the stone: a few darker courses low on the walls that face the bay and the town.
    for i in range(6):
        along = -half + 3.0 + i * 5.6 + rng.uniform(-0.8, 0.8)
        b.rect((cx + along, top - 0.2 + rng.uniform(0.0, 1.6), cz - half - thick / 2 - 0.03), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), rng.uniform(2.0, 4.0), rng.uniform(0.5, 1.1), "fortStoneDark")
        b.rect((cx + half + thick / 2 + 0.03, top - 0.2 + rng.uniform(0.0, 1.6), cz + along if abs(along) > 4.0 else cz + 9.0), (0.0, 0.0, -1.0), (0.0, 1.0, 0.0), rng.uniform(2.0, 4.0), rng.uniform(0.5, 1.1), "fortStoneDark")
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


def geladaria(b, x, z, rng, ground=0.14):
    """
    The geladaria of the Marginal (founder, 2026-11-20: "tem que ter mesa e cadeiras"), its front to -Z: a small white
    house with a pink band along its top, an awning in blue and white stripes over the open counter, the cold box
    behind the glass, and before it an esplanada of round tables with plastic chairs under sunshades. The chairs
    are seats: whoever buys a gelado sits down to eat it.
    """
    b.at(x, z)
    b.level = BOTH
    b.box((x, ground + 1.35, z), (4.4, 2.7, 2.8), "paintWhite")
    b.box((x, ground + 2.95, z), (4.7, 0.55, 3.1), "muralPink", skip_bottom=False)
    # The counter's opening, lit, the cold box under it, and the door at the side.
    b.rect((x - 0.5, ground + 1.75, z - 1.41), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 2.6, 1.0, "windowLit")
    b.box((x - 0.5, ground + 0.6, z - 1.55), (2.8, 1.2, 0.5), "paintMint", skip_bottom=False)
    b.box((x - 0.5, ground + 1.22, z - 1.6), (2.9, 0.06, 0.62), "paintWhite", skip_bottom=False)
    b.rect((x + 1.55, ground + 1.05, z - 1.41), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 0.8, 2.0, "wood")
    # The awning: stripes of blue and white, sloping out over whoever is served; high, so that it is over the head
    # of whoever stands at the counter and not across what they see (the camera is above and behind them).
    for k in range(8):
        x0, x1 = x - 2.3 + k * 0.575, x - 2.3 + (k + 1) * 0.575
        b.face([(x0, ground + 2.9, z - 1.4), (x1, ground + 2.9, z - 1.4), (x1, ground + 2.58, z - 2.5), (x0, ground + 2.58, z - 2.5)], "signBlue" if k % 2 == 0 else "paintWhite", toward=(0.0, 1.0, -0.3), two_sided=True)
    # Held from the wall by two stays, not by poles: the way along the counter is clear (a pole stood between it and
    # the chairs, and whoever walked along the front was caught there: found by the browser test, 2026-11-21).
    b.soft = True
    for dx in (-2.25, 2.25):
        b.tube([(x + dx, ground + 2.05, z - 1.42), (x + dx, ground + 2.56, z - 2.45)], [0.025, 0.025], 4, "metal")
    b.soft = False
    b.level = FULL
    # A cone on the roof, to be seen from the promenade: the wafer, and two scoops.
    b.tube([(x, ground + 3.25, z - 1.2), (x, ground + 4.0, z - 1.2)], [0.03, 0.3], 7, "awningGold", cap=False)
    b.gem((x, ground + 4.15, z - 1.2), (0.33, 0.28, 0.33), 6, "muralPink", rng, rough=0.06)
    b.gem((x, ground + 4.5, z - 1.2), (0.26, 0.22, 0.26), 6, "paintWhite", rng, rough=0.06)
    # The tubs in the cold box, each its flavour.
    for k, colour in enumerate(["paintWhite", "muralPink", "awningGold", "wood", "paintMint"]):
        b.box((x - 1.5 + k * 0.5, ground + 1.27, z - 1.6), (0.36, 0.06, 0.4), colour, skip_bottom=False)
    b.level = BOTH
    # The deck of the esplanada: boards laid on the lawn, a step up from it.
    b.box((x + 0.1, ground + 0.03, z - 4.3), (8.6, 0.06, 5.6), "wood", skip_bottom=False)
    for k in range(1, 9):
        zz = z - 7.1 + k * 0.62
        b.face([(x - 4.2, ground + 0.062, zz), (x + 4.4, ground + 0.062, zz), (x + 4.4, ground + 0.062, zz + 0.04), (x - 4.2, ground + 0.062, zz + 0.04)], "tarShade", toward=(0.0, 1.0, 0.0))
    ground = ground + 0.06
    # The esplanada: three round tables, each with its chairs and a sunshade through its middle.
    b.soft = True
    for k, (tx, tz, chairs) in enumerate([(x - 2.6, z - 4.6, ("muralPink", "paintWhite", "muralPink")), (x + 0.2, z - 5.2, ("paintWhite", "signBlue", "paintWhite", "signBlue")), (x + 2.9, z - 4.5, ("signBlue", "muralPink", "paintWhite"))]):
        b.at(tx, tz)
        b.level = BOTH
        b.tube([(tx, ground + 0.7, tz), (tx, ground + 0.74, tz)], [0.48, 0.48], 10, "paintWhite")
        b.tube([(tx, ground, tz), (tx, ground + 0.7, tz)], [0.2, 0.05], 6, "metal")
        for n, colour in enumerate(chairs):
            angle = 2 * math.pi * n / len(chairs) + k * 0.7
            sx, sz = tx + math.sin(angle) * 0.82, tz + math.cos(angle) * 0.82
            facing = angle + math.pi
            _cadeira(b, sx, sz, facing, ground, colour)
            b.seats.append((sx, ground + 0.45, sz, facing))
    b.soft = False
    # A sunshade through the middle of each of the outer tables: a pole and a wide cone, pink and white.
    for tx, tz, colour in ((x - 2.6, z - 4.6, "muralPink"), (x + 2.9, z - 4.5, "paintWhite")):
        b.at(tx, tz)
        b.tube([(tx, ground + 0.74, tz), (tx, ground + 2.5, tz)], [0.025, 0.025], 5, "metal")
        b.tube([(tx, ground + 2.12, tz), (tx, ground + 2.5, tz)], [1.35, 0.03], 8, colour, cap=False)
        b.tube([(tx, ground + 2.06, tz), (tx, ground + 2.12, tz)], [1.35, 1.35], 8, "signBlue", cap=False)
    ground = ground - 0.06
    b.at(x, z)
    return (x - 2.4, z - 1.5, x + 2.4, z + 1.5)


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


def bacia_no_chao(b, x, z, rng, ground=0.14, colour=None, goods=None):
    """A wide plastic bacia on the ground, heaped with what is for sale: how the sellers lay out their place."""
    b.at(x, z)
    b.level = FULL
    colour = colour or rng.choice(["zincBlue", "awningRed", "awningTeal", "paintMint"])
    b.tube([(x, ground, z), (x, ground + 0.09, z), (x, ground + 0.2, z)], [0.2, 0.3, 0.34], 9, colour, cap=False)
    heap = goods or rng.choice([["awningGold"], ["awningRed", "acaciaLeaf"], ["sand", "paintWhite"], ["awningGold", "acaciaLeaf"], ["roofTile"]])
    for k in range(6):
        angle = 2 * math.pi * k / 6 + rng.uniform(0, 0.6)
        reach = 0.17 if k else 0.0
        b.gem((x + math.cos(angle) * reach, ground + 0.23, z + math.sin(angle) * reach), (0.1, 0.075, 0.1), 5, heap[k % len(heap)], rng, rough=0.1)
    b.level = BOTH
    return 0.36


def banquinho(b, x, z, ground=0.14):
    """The low wooden bench a seller sits on all day."""
    b.at(x, z)
    b.level = FULL
    b.box((x, ground + 0.2, z), (0.36, 0.04, 0.26), "wood", skip_bottom=False)
    for dx in (-0.14, 0.14):
        b.box((x + dx, ground + 0.09, z), (0.04, 0.18, 0.22), "wood")
    b.level = BOTH
    return 0.2


def placa(b, x, z, ground=0.14):
    """
    The post of a street's name plates, at a corner. The plates themselves are drawn by the game, which
    has the names (render/signs.ts): this returns the height of their middle, for the manifest.
    """
    b.at(x, z)
    b.level = BOTH
    b.tube([(x, ground, z), (x, ground + 2.95, z)], [0.04, 0.04], 5, "metal")
    return ground + 2.7


def passadeira(b, x, z, facing, ground=0.14):
    """The sign of a crossing: a blue square on a post with the white triangle and the walker in it. `facing` in radians, 0 toward +Z."""
    b.at(x, z)
    b.level = BOTH
    b.tube([(x, ground, z), (x, ground + 2.5, z)], [0.035, 0.035], 5, "metal")
    b.level = FULL
    fx, fz = math.sin(facing), math.cos(facing)
    rx, rz = fz, -fx

    def at(across, up, out=0.0):
        return (x + rx * across + fx * (0.04 + out), ground + 2.2 + up, z + rz * across + fz * (0.04 + out))

    b.face([at(-0.3, -0.3), at(0.3, -0.3), at(0.3, 0.3), at(-0.3, 0.3)], "signBlue", toward=(fx, 0.0, fz), two_sided=True)
    b.face([at(-0.22, -0.2, 0.006), at(0.22, -0.2, 0.006), at(0.0, 0.22, 0.006)], "paintWhite", toward=(fx, 0.0, fz))
    # The walker: a body, two legs striding.
    b.face([at(-0.02, -0.02, 0.012), at(0.03, -0.02, 0.012), at(0.02, 0.1, 0.012), at(-0.01, 0.1, 0.012)], "clothBlack", toward=(fx, 0.0, fz))
    b.face([at(-0.02, -0.02, 0.012), at(0.01, -0.02, 0.012), at(-0.07, -0.16, 0.012), at(-0.1, -0.16, 0.012)], "clothBlack", toward=(fx, 0.0, fz))
    b.face([at(0.0, -0.02, 0.012), at(0.03, -0.02, 0.012), at(0.1, -0.16, 0.012), at(0.07, -0.16, 0.012)], "clothBlack", toward=(fx, 0.0, fz))
    b.level = BOTH
    return 0.2


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


def banca_de_presentes(b, x, z, rng, ground=0.14):
    """
    The banca of things to give (D-10.1), its front to -Z: a table under a pano, buckets of flowers, panos
    folded in a pile, small bottles of perfume in a row, and behind it a pano hung out between two poles to be seen
    from across the street. A sunshade over it all.
    """
    b.at(x, z)
    b.level = BOTH
    b.box((x, ground + 0.4, z), (2.3, 0.8, 1.0), "wood")
    # The pano over the table's front, its border in gold.
    b.face([(x - 1.17, ground + 0.02, z - 0.51), (x + 1.17, ground + 0.02, z - 0.51), (x + 1.17, ground + 0.82, z - 0.51), (x - 1.17, ground + 0.82, z - 0.51)], "awningRed", toward=(0.0, 0.0, -1.0))
    b.face([(x - 1.17, ground + 0.5, z - 0.515), (x + 1.17, ground + 0.5, z - 0.515), (x + 1.17, ground + 0.62, z - 0.515), (x - 1.17, ground + 0.62, z - 0.515)], "awningGold", toward=(0.0, 0.0, -1.0))
    # The poles and the pano hung between them: three bands, as panos are printed.
    for dx in (-1.1, 1.1):
        b.tube([(x + dx, ground, z + 0.62), (x + dx, ground + 2.25, z + 0.62)], [0.035, 0.03], 5, "wood")
    b.tube([(x - 1.1, ground + 2.2, z + 0.62), (x + 1.1, ground + 2.2, z + 0.62)], [0.02, 0.02], 4, "wood")
    for k, (lo, hi, colour) in enumerate([(1.05, 1.4, "awningGold"), (1.4, 1.85, "zincBlue"), (1.85, 2.2, "awningGold")]):
        b.face([(x - 1.0, ground + lo, z + 0.62), (x + 1.0, ground + lo, z + 0.62), (x + 1.0, ground + hi, z + 0.62), (x - 1.0, ground + hi, z + 0.62)], colour, toward=(0.0, 0.0, -1.0), two_sided=True)
    b.level = FULL
    # The flowers: two buckets on the table's left, stems and heads.
    for i, heads in enumerate((["awningRed", "awningRed", "paintWhite"], ["awningGold", "paintWhite", "awningRed"])):
        bx, bz = x - 0.85 + i * 0.42, z - 0.1 + i * 0.12
        b.tube([(bx, ground + 0.8, bz), (bx, ground + 1.02, bz)], [0.11, 0.14], 7, "zincBlue" if i == 0 else "paintMint", cap=False)
        for k in range(5):
            angle = 2 * math.pi * k / 5 + i
            hx, hz = bx + math.cos(angle) * 0.1, bz + math.sin(angle) * 0.1
            b.gem((hx, ground + 1.12, hz), (0.05, 0.1, 0.05), 4, "acaciaLeaf", rng, rough=0.05)
            b.gem((hx + math.cos(angle) * 0.03, ground + 1.26 + (k % 2) * 0.05, hz + math.sin(angle) * 0.03), (0.075, 0.07, 0.075), 5, heads[k % len(heads)], rng, rough=0.1)
    # The panos, folded and piled, no two alike.
    for k, colour in enumerate(["awningRed", "awningGold", "awningTeal", "zincBlue", "awningRed"]):
        b.box((x + 0.62 + (k % 2) * 0.03, ground + 0.835 + k * 0.07, z - 0.05), (0.56, 0.07, 0.4), colour, skip_bottom=False)
    b.box((x + 0.62, ground + 0.835 + 5 * 0.07 - 0.03, z - 0.05), (0.57, 0.012, 0.12), "paintWhite", skip_bottom=False)
    # The perfumes, in a row at the front: small bottles with gold stoppers.
    for k in range(5):
        px = x - 0.2 + k * 0.13
        b.box((px, ground + 0.86, z - 0.3), (0.07, 0.12, 0.05), "paintWhite" if k % 2 else "paintMint", skip_bottom=False)
        b.box((px, ground + 0.94, z - 0.3), (0.035, 0.04, 0.035), "awningGold", skip_bottom=False)
    b.level = BOTH
    # The sunshade stands behind the table, between it and the hung pano, and leans over both.
    kit.parasol(b, x + 0.2, z + 0.56, rng, ground)
    b.at(x, z)
    return 1.4


# ---------------------------------------------------------------- the tables of the Largo (Task 4B.1)
#
# Each kind of table looks like itself. The board and the pieces are not built here: they are a game being
# played, and the game draws them as the zone says they stand (apps/client/src/mesas). What is built is the
# table, its top left bare where the board goes, and the seats. Each returns what the manifest says of it:
# the middle of the board's top, the way seat 0 faces, the board's side, and its seats in order.
#
# The seats go round the table: seat 0 at the near side (facing `yaw`), then to its left, across, to its right.
# Local +Z is the way seat 0 faces, local +X its left (kit._turn).


def _mesa(game, x, top, z, yaw, size, seats):
    return {"game": game, "pos": (x, top, z), "facing": yaw, "size": size, "seats": seats}


def _lugar(x, z, yaw, side, far, height):
    """Seat `side` (0 near, 1 left, 2 across, 3 right) of a table at (x, z) facing `yaw`, `far` from its middle."""
    turns = [0.0, -math.pi / 2, math.pi, math.pi / 2]
    facing = yaw + turns[side]
    at = kit._turn((0.0, 0.0, -far), facing)
    return (x + at[0], height, z + at[2], facing)


def mesa_de_xadrez(b, x, z, yaw=0.0, ground=0.14):
    """
    A stone table of the Largo, as old as the square: a thick top on a pillar, its edge bevelled by elbows, and a
    stone stool either side, worn smooth. The board is laid into the top by the game.
    """
    b.at(x, z)
    # Solid by its own body in the game (packages/world: tableObstacles), not by the walk grid: a camera passes over it.
    b.soft = True
    b.level = BOTH
    b.box((x, ground + 0.36, z), (0.32, 0.72, 0.32), "concrete", yaw=yaw)
    b.box((x, ground + 0.04, z), (0.56, 0.08, 0.56), "kerb", yaw=yaw)
    b.box((x, ground + 0.755, z), (0.86, 0.07, 0.86), "kerb", yaw=yaw, skip_bottom=False)
    b.level = FULL
    # A lip under the top, a little in, and the bevel on its edge.
    b.box((x, ground + 0.705, z), (0.74, 0.03, 0.74), "concrete", yaw=yaw)
    b.box((x, ground + 0.795, z), (0.8, 0.012, 0.8), "fortStone", yaw=yaw)
    seats = []
    for side in (0, 2):
        sx, sy, sz, facing = _lugar(x, z, yaw, side, 0.78, ground + 0.46)
        b.level = BOTH
        b.box((sx, ground + 0.22, sz), (0.36, 0.44, 0.36), "concrete", yaw=facing)
        b.level = FULL
        b.box((sx, ground + 0.45, sz), (0.4, 0.03, 0.4), "fortStone", yaw=facing, skip_bottom=False)
        seats.append((sx, sy, sz, facing))
    b.level = BOTH
    b.soft = False
    return 1.15, _mesa("xadrez", x, ground + 0.802, z, yaw, 0.6, seats)


def _grade(b, x, z, yaw, ground, colour):
    """A plastic crate stood on end for a seat: ribs on its sides, a slot for the hand, a piece of cardboard on top."""
    b.level = BOTH
    b.box((x, ground + 0.22, z), (0.34, 0.44, 0.3), colour, yaw=yaw)
    b.level = FULL
    for k in range(3):
        b.box(_add((x, ground + 0.08 + k * 0.13, z), (0.0, 0.0, 0.0)), (0.36, 0.025, 0.32), colour, yaw=yaw, skip_bottom=False)
    for side in (-1, 1):
        b.box(_add((x, ground + 0.36, z), kit._turn((side * 0.172, 0.0, 0.0), yaw)), (0.01, 0.04, 0.12), "tarShade", yaw=yaw)
    b.box((x, ground + 0.445, z), (0.3, 0.01, 0.27), "sand", yaw=yaw + 0.12, skip_bottom=False)
    b.level = BOTH


def mesa_de_damas(b, x, z, yaw=0.0, ground=0.14):
    """
    Damas as it is played on a pavement: a drum cut down for a table, a square of plank on it for the board (painted
    by the game, with bottle caps for pieces), and a crate on end either side to sit on.
    """
    b.at(x, z)
    # Solid by its own body in the game (packages/world: tableObstacles), not by the walk grid: a camera passes over it.
    b.soft = True
    b.level = BOTH
    b.tube([(x, ground, z), (x, ground + 0.66, z)], [0.29, 0.29], 10, "drum")
    b.level = FULL
    # The drum's ribs and its rolled rim, and rust where the paint has gone.
    for h in (0.2, 0.44):
        b.tube([(x, ground + h, z), (x, ground + h + 0.025, z)], [0.3, 0.3], 10, "drum", cap=False)
    b.tube([(x, ground + 0.655, z), (x, ground + 0.675, z)], [0.3, 0.3], 10, "zincRust", cap=False)
    for a0, a1, h0, h1 in ((0.3, 0.62, 0.04, 0.19), (2.4, 2.6, 0.47, 0.6)):
        rim = [(a0, h0), (a1, h0), (a1, h1), (a0, h1)]
        b.face([(x + 0.293 * math.cos(a), ground + h, z + 0.293 * math.sin(a)) for a, h in rim], "zincRust", away_from=(x, ground + h0, z))
    b.level = BOTH
    # The plank: wider than the drum, its board a little in from its edge.
    b.box((x, ground + 0.7, z), (0.74, 0.04, 0.74), "wood", yaw=yaw, skip_bottom=False)
    b.level = FULL
    b.box((x, ground + 0.6, z), (0.06, 0.18, 0.62), "wood", yaw=yaw)
    seats = []
    for side, colour in ((0, "awningGold"), (2, "awningRed")):
        sx, sy, sz, facing = _lugar(x, z, yaw, side, 0.66, ground + 0.45)
        _grade(b, sx, sz, facing, ground, colour)
        seats.append((sx, sy, sz, facing))
    b.level = BOTH
    b.soft = False
    return 1.0, _mesa("damas", x, ground + 0.722, z, yaw, 0.6, seats)


def _cadeira(b, x, z, yaw, ground, colour):
    """The plastic chair of every esplanada and every party in Luanda: legs splayed, arms, a back of curved slats."""
    def at(lx, ly, lz):
        return _add((x, ground + ly, z), kit._turn((lx, 0.0, lz), yaw))

    b.level = BOTH
    b.box(at(0.0, 0.43, 0.02), (0.44, 0.035, 0.42), colour, yaw=yaw, skip_bottom=False)
    b.box(at(0.0, 0.66, -0.2), (0.44, 0.4, 0.035), colour, yaw=yaw - 0.0)
    b.level = FULL
    for lx, lz in ((-0.19, 0.19), (0.19, 0.19), (-0.19, -0.17), (0.19, -0.17)):
        top = at(lx, 0.42, lz)
        foot = at(lx * 1.22, 0.0, lz * 1.25)
        b.tube([foot, top], [0.022, 0.018], 4, colour, cap=False)
    for lx in (-0.22, 0.22):
        b.box(at(lx, 0.6, 0.0), (0.04, 0.03, 0.4), colour, yaw=yaw, skip_bottom=False)
        b.tube([at(lx, 0.44, 0.17), at(lx, 0.6, 0.17)], [0.016, 0.016], 4, colour, cap=False)
    # The gaps between the slats of the back.
    for k in range(3):
        b.box(at(-0.1 + k * 0.1, 0.68, -0.2), (0.025, 0.24, 0.04), "tarShade", yaw=yaw)
    b.level = BOTH


def mesa_de_ludo(b, x, z, yaw=0.0, ground=0.14):
    """
    Não te irrites under a tree: a square wooden table, a little uneven, with the board painted on its top by the game,
    and four plastic chairs round it, no two the same colour, borrowed from four houses.
    """
    b.at(x, z)
    # Solid by its own body in the game (packages/world: tableObstacles), not by the walk grid: a camera passes over it.
    b.soft = True
    b.level = BOTH
    b.box((x, ground + 0.72, z), (0.92, 0.04, 0.92), "wood", yaw=yaw, skip_bottom=False)
    for lx in (-0.4, 0.4):
        for lz in (-0.4, 0.4):
            b.box(_add((x, ground + 0.35, z), kit._turn((lx, 0.0, lz), yaw)), (0.05, 0.7, 0.05), "wood", yaw=yaw)
    b.level = FULL
    # The frame under the top, and a brick under one leg where the ground dips.
    b.box((x, ground + 0.665, z), (0.84, 0.07, 0.84), "wood", yaw=yaw)
    b.box(_add((x, ground + 0.03, z), kit._turn((0.4, 0.0, 0.4), yaw)), (0.11, 0.06, 0.2), "zincRed", yaw=yaw + 0.3)
    seats = []
    for side, colour in enumerate(("paintWhite", "awningRed", "paintWhite", "signBlue")):
        sx, sy, sz, facing = _lugar(x, z, yaw, side, 0.72, ground + 0.45)
        _cadeira(b, sx, sz, facing, ground, colour)
        seats.append((sx, sy, sz, facing))
    b.level = BOTH
    b.soft = False
    return 1.2, _mesa("ludo", x, ground + 0.742, z, yaw, 0.7, seats)


def mural(b, x, z, length, rng, ground=0.14, high=4.2, side_on=False):
    """
    A long wall painted from end to end, as walls under Luanda's roads are: panels of loud colour, and
    on them a sun, flowers, a wheel, waves and zigzags. No word and no mark of anybody's on it.
    Faces the side of smaller z; `side_on` turns it to run along z and face the side of smaller x, and
    then it is paint alone, on a wall that is already there.
    """
    b.at(x, z)
    b.level = BOTH
    x0 = x - length / 2
    if side_on:
        z0 = z - length / 2
        facing = (-1.0, 0.0, 0.0)

        def at(px, py, out=1):
            return (x - 0.012 * out, ground + py, z0 + length - px)
    else:
        b.box((x, ground + high / 2, z + 0.15), (length, high, 0.3), "paintWhite")
        facing = (0.0, 0.0, -1.0)

        def at(px, py, out=1):
            return (x0 + px, ground + py, z - 0.012 * out)

    def patch(points, colour, out=2):
        b.face([at(px, py, out) for px, py in points], colour, toward=facing)

    def disc(cx, cy, r, colour, out=2, sides=10, squash=1.0):
        patch([(cx + math.cos(2 * math.pi * k / sides) * r, cy + math.sin(2 * math.pi * k / sides) * r * squash) for k in range(sides)], colour, out)

    # The panels, their edges leaning, so that one colour runs into the next.
    paints = ["muralPink", "muralYellow", "muralBlue", "muralPink", "muralGreen", "muralPurple", "muralYellow", "muralBlue"]
    count = max(3, int(length / 5.5))
    edges = [0.0] + [length * k / count + rng.uniform(-0.5, 0.5) for k in range(1, count)] + [length]
    for k in range(count):
        lean0 = 0.0 if k == 0 else 0.7
        lean1 = 0.0 if k == count - 1 else 0.7
        patch([(edges[k] - lean0, 0.12), (edges[k + 1] - lean1, 0.12), (edges[k + 1] + lean1, high - 0.08), (edges[k] + lean0, high - 0.08)], paints[k % len(paints)], 1)
    b.level = FULL
    for k in range(count):
        mid = (edges[k] + edges[k + 1]) / 2
        wide = edges[k + 1] - edges[k]
        ground_paint = paints[k % len(paints)]
        ink = [p for p in ("muralYellow", "paintWhite", "muralPink", "muralBlue", "muralGreen", "clothBlack") if p != ground_paint]
        kind = k % 4
        if kind == 0:
            # A sun with its rays, low on the wall.
            for r in range(9):
                a0, a1 = math.pi * (r - 0.18) / 8, math.pi * (r + 0.18) / 8
                patch([(mid + math.cos(a0) * 0.95, 1.1 + math.sin(a0) * 0.95), (mid + math.cos(a1) * 0.95, 1.1 + math.sin(a1) * 0.95), (mid + math.cos((a0 + a1) / 2) * 1.75, 1.1 + math.sin((a0 + a1) / 2) * 1.75)], ink[0])
            disc(mid, 1.1, 0.8, ink[0], 2, 12)
            disc(mid, 1.1, 0.5, ink[1], 3, 10)
        elif kind == 1:
            # Flowers: petals round a middle, large and small.
            for fx, fy, size, petal, heart in [(mid - wide * 0.2, 2.5, 0.62, ink[0], ink[1]), (mid + wide * 0.22, 1.5, 0.82, ink[1], ink[2]), (mid - wide * 0.05, 0.85, 0.4, ink[2], ink[0])]:
                for pk in range(7):
                    a = 2 * math.pi * pk / 7
                    disc(fx + math.cos(a) * size * 0.62, fy + math.sin(a) * size * 0.62, size * 0.36, petal, 2, 7)
                disc(fx, fy, size * 0.34, heart, 3, 8)
        elif kind == 2:
            # A wheel: its tyre, its rim, its spokes.
            cy, r = 1.9, min(1.45, wide * 0.36)
            for s in range(16):
                a0, a1 = 2 * math.pi * s / 16, 2 * math.pi * (s + 1) / 16
                patch([(mid + math.cos(a0) * r, cy + math.sin(a0) * r), (mid + math.cos(a1) * r, cy + math.sin(a1) * r), (mid + math.cos(a1) * r * 0.76, cy + math.sin(a1) * r * 0.76), (mid + math.cos(a0) * r * 0.76, cy + math.sin(a0) * r * 0.76)], "clothBlack")
            for s in range(8):
                a = 2 * math.pi * s / 8
                patch([(mid + math.cos(a - 0.06) * r * 0.74, cy + math.sin(a - 0.06) * r * 0.74), (mid + math.cos(a + 0.06) * r * 0.74, cy + math.sin(a + 0.06) * r * 0.74), (mid + math.cos(a + 0.3) * r * 0.16, cy + math.sin(a + 0.3) * r * 0.16), (mid + math.cos(a - 0.3) * r * 0.16, cy + math.sin(a - 0.3) * r * 0.16)], ink[1])
            disc(mid, cy, r * 0.2, ink[0], 3, 8)
        else:
            # Zigzags and dots, in bands.
            for band, (by, paint) in enumerate([(0.7, ink[0]), (1.7, ink[1]), (2.7, ink[2])]):
                teeth = max(3, int(wide / 1.1))
                for tk in range(teeth):
                    tx0 = edges[k] + 0.4 + (wide - 0.8) * tk / teeth
                    tx1 = edges[k] + 0.4 + (wide - 0.8) * (tk + 1) / teeth
                    patch([(tx0, by), (tx1, by), ((tx0 + tx1) / 2, by + 0.55)], paint)
                    if band == 1:
                        disc((tx0 + tx1) / 2, by + 0.72, 0.1, ink[3 % len(ink)], 3, 6)
    b.level = BOTH
    return (x - length / 2, z, x + length / 2, z + 0.4)


def viaduto(b, x0, x1, parts, ground=0.14):
    """
    A road on pillars (founder's picture, 2026-11-15): the deck with its barriers and its line, and under
    it whatever each stretch stands on. `parts` run along z, each (z from, z to, deck height at the first,
    at the second, what is under it): "pilares" leaves the ground open in its shade, "muro" and "rampa"
    are walled and filled. Returns the rectangles nobody can walk into, as (x0, z0, x1, z1).
    """
    THICK, RAIL = 0.6, 0.85
    solid = []
    up, down, west, east = (0.0, 1.0, 0.0), (0.0, -1.0, 0.0), (-1.0, 0.0, 0.0), (1.0, 0.0, 0.0)
    for za, zb, ya, yb, kind in parts:
        steps = max(1, int(abs(zb - za) / 16.0 + 0.999))
        for n in range(steps):
            z0, z1 = za + (zb - za) * n / steps, za + (zb - za) * (n + 1) / steps
            y0, y1 = ya + (yb - ya) * n / steps, ya + (yb - ya) * (n + 1) / steps
            b.at((x0 + x1) / 2, (z0 + z1) / 2)
            b.level = BOTH
            # The deck: its top of tar, its underside in shadow, its two edges.
            b.face([(x0, y0, z0), (x1, y0, z0), (x1, y1, z1), (x0, y1, z1)], "tar", toward=up)
            b.face([(x0, y0 - THICK, z0), (x1, y0 - THICK, z0), (x1, y1 - THICK, z1), (x0, y1 - THICK, z1)], "tarShade", toward=down)
            for px, out in ((x0, west), (x1, east)):
                inner = px + (0.3 if out is west else -0.3)
                b.face([(px, y0 - THICK, z0), (px, y0 + RAIL, z0), (px, y1 + RAIL, z1), (px, y1 - THICK, z1)], "kerb", toward=out)
                b.face([(inner, y0, z0), (inner, y0 + RAIL, z0), (inner, y1 + RAIL, z1), (inner, y1, z1)], "pavementShade", toward=(-out[0], 0.0, 0.0))
                b.face([(px, y0 + RAIL, z0), (inner, y0 + RAIL, z0), (inner, y1 + RAIL, z1), (px, y1 + RAIL, z1)], "kerb", toward=up)
            b.level = FULL
            mid = (x0 + x1) / 2
            dashes = max(1, int(abs(z1 - z0) / 6.0))
            for d in range(dashes):
                t0, t1 = (d + 0.2) / dashes, (d + 0.6) / dashes
                b.face([(mid - 0.07, y0 + (y1 - y0) * t0 + 0.02, z0 + (z1 - z0) * t0), (mid + 0.07, y0 + (y1 - y0) * t0 + 0.02, z0 + (z1 - z0) * t0), (mid + 0.07, y0 + (y1 - y0) * t1 + 0.02, z0 + (z1 - z0) * t1), (mid - 0.07, y0 + (y1 - y0) * t1 + 0.02, z0 + (z1 - z0) * t1)], "line", toward=up)
            b.level = BOTH
            if kind == "pilares":
                # A pair of columns under a beam, one pair to each stretch.
                zc, top = (z0 + z1) / 2, (y0 + y1) / 2 - THICK
                b.box(((x0 + x1) / 2, top - 0.35, zc), (x1 - x0 - 0.5, 0.7, 1.1), "plinth")
                for px in (x0 + 1.3, x1 - 1.3):
                    b.box((px, (ground + top - 0.7) / 2, zc), (0.95, top - 0.7 - ground, 0.95), "plinth")
                    solid.append((px - 0.6, zc - 0.6, px + 0.6, zc + 0.6))
            else:
                # Walled and filled: a wall each side from the ground to the deck.
                for px, out in ((x0 + 0.05, west), (x1 - 0.05, east)):
                    b.face([(px, ground, z0), (px, y0 - THICK, z0), (px, y1 - THICK, z1), (px, ground, z1)], "plinth", toward=out)
                solid.append((x0, min(z0, z1), x1, max(z0, z1)))
        if kind != "pilares":
            # The ends of a walled stretch, where the next one is open.
            for zend, yend, toward in ((za, ya, (0.0, 0.0, -1.0 if zb > za else 1.0)), (zb, yb, (0.0, 0.0, 1.0 if zb > za else -1.0))):
                if yend - THICK > ground + 0.05:
                    b.at((x0 + x1) / 2, zend)
                    b.face([(x0, ground, zend), (x1, ground, zend), (x1, yend - THICK, zend), (x0, yend - THICK, zend)], "plinth", toward=toward)
    b.level = BOTH
    return solid


def quiosque_bar(b, x, z, rng, ground=0.14, mesas=((3.6, 0.9), (5.9, -0.7))):
    """
    A kiosk bar (the founder, 2026-11-21: "a kiosk bar where they sell burger, and drinks and should have some
    chairs to sit"), its hatch to +Z: a box of block painted in three bands, a lit hatch with its shelf, a roof of
    sheet that leans out over whoever is served, the chapa on a cut drum at its side, crates of empties, and
    plastic tables with their chairs at `mesas` (each an offset from the kiosk). The chairs are seats. Any bairro
    may stand one at a paragem or a corner. Returns the rectangle the kiosk and its chapa stand on.
    """
    b.at(x, z)
    b.level = BOTH
    for k, colour in enumerate(["awningRed", "awningGold", "awningTeal"]):
        b.box((x - 1.0 + k * 1.0, ground + 1.15, z), (1.0, 2.3, 2.2), colour)
    b.rect((x, ground + 1.45, z + 1.11), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 2.0, 0.9, "windowLit")
    b.box((x, ground + 0.98, z + 1.28), (2.3, 0.07, 0.36), "wood", skip_bottom=False)
    b.face([(x - 1.9, ground + 2.6, z - 1.3), (x + 1.9, ground + 2.6, z - 1.3), (x + 1.9, ground + 2.3, z + 2.3), (x - 1.9, ground + 2.3, z + 2.3)], "roofZinc", toward=(0.0, 1.0, 0.0), two_sided=True)
    b.soft = True
    for dx in (-1.8, 1.8):
        b.tube([(x + dx, ground + 1.7, z + 1.12), (x + dx, ground + 2.31, z + 2.2)], [0.025, 0.025], 4, "metal")
    b.soft = False
    # The chapa: half an oil drum on legs, coals in it, and what is on it.
    gx, gz = x - 2.3, z + 0.5
    b.tube([(gx - 0.45, ground + 0.8, gz), (gx + 0.45, ground + 0.8, gz)], [0.3, 0.3], 8, "tarShade")
    for dx in (-0.4, 0.4):
        for dz in (-0.2, 0.2):
            b.tube([(gx + dx, ground, gz + dz * 1.4), (gx + dx, ground + 0.7, gz + dz)], [0.02, 0.02], 4, "metal", cap=False)
    b.level = FULL
    b.box((gx, ground + 1.0, gz), (0.8, 0.03, 0.5), "metal", skip_bottom=False)
    for k in range(3):
        b.tube([(gx - 0.25 + k * 0.25, ground + 1.02, gz), (gx - 0.25 + k * 0.25, ground + 1.06, gz)], [0.09, 0.09], 7, "wood")
    # Crates of empties against the wall, and bottles on the shelf.
    for k in range(3):
        b.box((x + 1.85, ground + 0.16 + k * 0.32, z - 0.5), (0.5, 0.3, 0.38), ["awningRed", "awningGold", "awningRed"][k], skip_bottom=False)
    for k in range(5):
        b.tube([(x - 0.8 + k * 0.4, ground + 1.02, z + 1.3), (x - 0.8 + k * 0.4, ground + 1.3, z + 1.3)], [0.045, 0.03], 5, ["awningGold", "acaciaLeaf", "awningRed", "paintWhite", "awningGold"][k])
    # The esplanada: plastic tables on the earth, three chairs at each.
    b.soft = True
    for k, (ox, oz) in enumerate(mesas):
        tx, tz = x + ox, z + oz
        b.at(tx, tz)
        b.level = BOTH
        b.tube([(tx, ground + 0.7, tz), (tx, ground + 0.74, tz)], [0.46, 0.46], 10, "paintWhite")
        b.tube([(tx, ground, tz), (tx, ground + 0.7, tz)], [0.2, 0.05], 6, "metal")
        for n in range(3):
            angle = 2 * math.pi * n / 3 + 0.5 + k * 0.9
            sx, sz = tx + math.sin(angle) * 0.82, tz + math.cos(angle) * 0.82
            _cadeira(b, sx, sz, angle + math.pi, ground, ["awningRed", "paintWhite", "awningGold"][(n + k) % 3])
            b.seats.append((sx, ground + 0.45, sz, angle + math.pi))
        b.level = FULL
        b.tube([(tx + 0.12, ground + 0.74, tz - 0.08), (tx + 0.12, ground + 0.98, tz - 0.08)], [0.04, 0.028], 5, "awningGold")
    b.soft = False
    b.level = BOTH
    b.at(x, z)
    return (x - 2.9, z - 1.2, x + 2.2, z + 1.2)


def frente_de_barbearia(b, x, z, rng, ground=0.14):
    """
    What makes a house a barbearia, set before its front wall at (x, z), the street to -Z: the pole of red, white and
    blue at the corner, a mirror on the wall, two barber's chairs on the apron before it, and a bench against the
    wall for whoever waits. The chairs and the bench are seats. For any bairro.
    """
    b.at(x, z)
    b.level = BOTH
    # The mirror in its white frame, and the shelf of combs and machines under it; clear of the door.
    b.rect((x + 1.2, ground + 1.6, z - 0.20), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 2.9, 1.1, "paintWhite")
    b.rect((x + 1.2, ground + 1.6, z - 0.22), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 2.7, 0.9, "glassBlue")
    b.box((x + 1.2, ground + 1.0, z - 0.32), (2.8, 0.05, 0.24), "wood", skip_bottom=False)
    # The pole: bands of the three colours.
    for k in range(6):
        b.tube([(x + 3.2, ground + 0.9 + k * 0.2, z - 0.12), (x + 3.2, ground + 1.1 + k * 0.2, z - 0.12)], [0.09, 0.09], 6, ["awningRed", "paintWhite", "signBlue"][k % 3], cap=False)
    b.tube([(x + 3.2, ground + 2.1, z - 0.12), (x + 3.2, ground + 2.18, z - 0.12)], [0.12, 0.12], 6, "metal")
    b.tube([(x + 3.2, ground + 0.82, z - 0.12), (x + 3.2, ground + 0.9, z - 0.12)], [0.12, 0.12], 6, "metal")
    # Two chairs, their backs to the street, facing the mirror: a seat on a post, arms, a headrest.
    b.soft = True
    for dx in (0.5, 1.9):
        cx, cz = x + dx, z - 1.25
        b.tube([(cx, ground, cz), (cx, ground + 0.42, cz)], [0.2, 0.06], 6, "metal")
        b.box((cx, ground + 0.5, cz), (0.52, 0.12, 0.5), "awningRed", skip_bottom=False)
        b.box((cx, ground + 0.86, cz - 0.27), (0.5, 0.62, 0.08), "awningRed")
        b.level = FULL
        b.box((cx, ground + 1.24, cz - 0.27), (0.26, 0.14, 0.08), "tarShade", skip_bottom=False)
        for side in (-0.29, 0.29):
            b.box((cx + side, ground + 0.7, cz), (0.05, 0.05, 0.44), "metal", skip_bottom=False)
        b.level = BOTH
        b.seats.append((cx, ground + 0.58, cz, 0.0))
    b.soft = False
    kit.bench(b, x - 2.9, z - 1.5, math.pi, ground)
    b.at(x, z)


def igreja_de_bairro(b, x, z, rng, ground=0.14):
    """
    A small church of a bairro, its door to +Z: block painted white with a blue skirt, a roof of red sheet, a cross
    on its gable, a step before the door, a low white wall along the street, two trees in the yard and benches in
    their shade (they are seats: the quietest place to rest). For any bairro. Returns the rectangle it stands on.
    """
    b.at(x, z)
    b.level = BOTH
    b.box((x, ground + 2.4, z), (9.0, 4.8, 15.0), "paintWhite", top="tarShade")
    b.box((x, ground + 0.5, z), (9.06, 1.0, 15.06), "zincBlue", top="zincBlue")
    for side in (-1, 1):
        b.face([(x, ground + 6.6, z - 7.9), (x, ground + 6.6, z + 7.9), (x + side * 5.1, ground + 4.6, z + 7.9), (x + side * 5.1, ground + 4.6, z - 7.9)], "zincRed", toward=(side * 0.4, 1.0, 0.0), two_sided=True)
        for k in range(3):
            b.rect((x + side * 4.52, ground + 2.7, z - 4.0 + k * 4.0), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 0.9, 1.9, "window")
    b.face([(x - 4.5, ground + 4.8, z + 7.51), (x + 4.5, ground + 4.8, z + 7.51), (x, ground + 6.6, z + 7.51)], "paintWhite", toward=(0.0, 0.0, 1.0), two_sided=True)
    b.rect((x, ground + 1.3, z + 7.53), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 1.9, 2.6, "wood")
    b.box((x, ground + 7.5, z + 7.4), (0.16, 1.8, 0.16), "paintWhite", skip_bottom=False)
    b.box((x, ground + 7.8, z + 7.4), (0.9, 0.16, 0.16), "paintWhite", skip_bottom=False)
    b.box((x, ground + 0.1, z + 8.6), (3.4, 0.2, 2.0), "concrete")
    for wx0, wx1 in ((x - 12.0, x - 2.5), (x + 2.5, x + 12.0)):
        kit.muro(b, wx0, z + 11.0, wx1, z + 11.0, "paintWhite", height=0.9)
    kit.tree(b, x - 9.0, z + 9.0, rng, ground, shade="sandDark", mix=("acacia",), paved=False)
    kit.tree(b, x + 9.5, z + 6.0, rng, ground, shade="sandDark", mix=("mangueira",), paved=False)
    # Benches before the door, and in the shade of each tree.
    for k in range(2):
        kit.bench(b, x - 6.5 + k * 13.0, z + 9.6, math.pi, ground)
    kit.bench(b, x - 9.0, z + 6.6, 0.0, ground)
    kit.bench(b, x + 9.5, z + 3.6, 0.0, ground)
    b.at(x, z)
    return (x - 4.6, z - 7.6, x + 4.6, z + 7.6)
