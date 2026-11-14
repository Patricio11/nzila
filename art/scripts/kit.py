# The kit: how the plain things of a street are shaped. Palms, acacias,
# buildings, kerbs, lamps, benches, a paragem, a blue and white van.
#
# It is a stand-in drawn by code so that the game can be built, walked and
# measured before a person models the real district (D-0.23). The shapes are
# decisions written down, not accidents: a palm leans and its fronds droop, an
# acacia is wide and flat-topped and in flower, a building has a plinth, a
# door, windows, a parapet and a water tank on the roof. Nothing here ships
# without the founder's eye, and the first real district replaces it.
#
# Every piece is coloured from the world's palette (a square per face) and is
# made twice: in full, and lighter for the reference phone, which only ever
# draws the lighter one. The lighter version is made on purpose, by leaving
# out what cannot be seen from across the street, never by a tool that
# "simplifies" a shape and may wreck it.
#
# Coordinates in this file are the game's: X east, Y up, Z south, in metres.

import math

import bpy

FULL, LIGHT, BOTH = "l0", "l1", "both"


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _unit(a):
    length = math.sqrt(_dot(a, a)) or 1.0
    return (a[0] / length, a[1] / length, a[2] / length)


def _turn(v, yaw):
    """Turns a vector about the vertical by yaw radians."""
    c, s = math.cos(yaw), math.sin(yaw)
    return (v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c)


class Builder:
    """Collects faces by chunk and by level of detail, and turns them into Blender objects."""

    def __init__(self, palette, material, chunk_m=64.0, smooth=False):
        # Smooth is for bodies: corners are shared and light rolls round a limb. The world stays faceted.
        self.smooth = smooth
        self.cells = palette["cells"]
        self.squares = palette["squares"]
        self.material = material
        self.chunk_m = chunk_m
        self.groups = {}
        self.chunk = (0, 0)
        self.level = BOTH

    def at(self, x, z):
        """Whatever is built next belongs to the chunk this point is in, however far it overhangs."""
        self.chunk = (int(x // self.chunk_m), int(z // self.chunk_m))

    def face(self, points, colour, away_from=None, toward=None, two_sided=False):
        """One flat face. It is turned to face away from a point, or toward a direction, when one is given."""
        points = list(points)
        normal = _cross(_sub(points[1], points[0]), _sub(points[2], points[0]))
        if away_from is not None:
            centre = _mul(tuple(sum(p[i] for p in points) for i in range(3)), 1.0 / len(points))
            if _dot(normal, _sub(centre, away_from)) < 0:
                points.reverse()
        elif toward is not None and _dot(normal, toward) < 0:
            points.reverse()
        group = self.groups.setdefault((self.chunk, self.level), [])
        group.append((points, colour))
        if two_sided:
            group.append((list(reversed(points)), colour))

    # ------------------------------------------------------------ shapes

    def rect(self, centre, right, up, width, height, colour, two_sided=False):
        """A flat rectangle facing the direction right x up."""
        r = _mul(_unit(right), width / 2)
        u = _mul(_unit(up), height / 2)
        points = [_sub(_sub(centre, r), u), _sub(_add(centre, r), u), _add(_add(centre, r), u), _add(_sub(centre, r), u)]
        self.face(points, colour, toward=_cross(right, up), two_sided=two_sided)

    def box(self, centre, size, colour, yaw=0.0, top=None, skip_bottom=True):
        """A box. `size` is (across X, up, across Z) before turning. `top` gives the top its own colour."""
        hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
        corners = {}
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    corners[(sx, sy, sz)] = _add(centre, _turn((sx * hx, sy * hy, sz * hz), yaw))
        sides = [
            ([(1, -1, -1), (1, -1, 1), (1, 1, 1), (1, 1, -1)], colour),
            ([(-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)], colour),
            ([(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)], colour),
            ([(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1)], colour),
            ([(-1, 1, -1), (1, 1, -1), (1, 1, 1), (-1, 1, 1)], top or colour),
        ]
        if not skip_bottom:
            sides.append(([(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)], colour))
        for keys, face_colour in sides:
            self.face([corners[k] for k in keys], face_colour, away_from=centre)

    def tube(self, path, radii, sides, colour, cap=True):
        """A round bar along a path of points, with a radius at each. Used for trunks, poles, wheels, tanks."""
        rings = []
        for i, centre in enumerate(path):
            before = path[max(0, i - 1)]
            after = path[min(len(path) - 1, i + 1)]
            along = _unit(_sub(after, before))
            side = _unit(_cross(along, (0.0, 0.0, 1.0) if abs(along[2]) < 0.9 else (1.0, 0.0, 0.0)))
            other = _cross(along, side)
            ring = []
            for k in range(sides):
                a = 2 * math.pi * k / sides
                ring.append(_add(centre, _add(_mul(side, math.cos(a) * radii[i]), _mul(other, math.sin(a) * radii[i]))))
            rings.append(ring)
        for i in range(len(rings) - 1):
            middle = _mul(_add(path[i], path[i + 1]), 0.5)
            for k in range(sides):
                n = (k + 1) % sides
                self.face([rings[i][k], rings[i][n], rings[i + 1][n], rings[i + 1][k]], colour, away_from=middle)
        if cap:
            self.face(rings[-1], colour, away_from=path[-2])
            self.face(rings[0], colour, away_from=path[1])

    def disc(self, centre, radius, sides, colour, squash=1.0):
        """A flat patch on the ground, facing up."""
        points = [_add(centre, (math.cos(2 * math.pi * k / sides) * radius, 0.0, math.sin(2 * math.pi * k / sides) * radius * squash)) for k in range(sides)]
        self.face(points, colour, toward=(0.0, 1.0, 0.0))

    def gem(self, centre, radius, sides, colour, rng, rough=0.18, colour_low=None):
        """A faceted lump, a little irregular: a canopy of leaves, a coconut. `radius` is (X, up, Z)."""
        def wobble():
            return 1.0 + rng.uniform(-rough, rough)

        top = _add(centre, (0.0, radius[1] * wobble(), 0.0))
        bottom = _add(centre, (0.0, -radius[1] * 0.75 * wobble(), 0.0))
        upper, lower = [], []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            b = a + math.pi / sides
            upper.append(_add(centre, (math.cos(a) * radius[0] * 0.78 * wobble(), radius[1] * 0.42, math.sin(a) * radius[2] * 0.78 * wobble())))
            lower.append(_add(centre, (math.cos(b) * radius[0] * wobble(), -radius[1] * 0.18, math.sin(b) * radius[2] * wobble())))
        low = colour_low or colour
        for k in range(sides):
            n = (k + 1) % sides
            self.face([top, upper[k], upper[n]], colour, away_from=centre)
            self.face([upper[k], lower[k], upper[n]], colour, away_from=centre)
            self.face([upper[n], lower[k], lower[n]], low, away_from=centre)
            self.face([bottom, lower[n], lower[k]], low, away_from=centre)

    # ------------------------------------------------------------ output

    def write(self):
        """Makes one Blender object for each chunk and level of detail."""
        for ((cx, cz), level), faces in sorted(self.groups.items()):
            verts, polys, uvs = [], [], []
            for points, colour in faces:
                index = self.squares[colour]
                u = (index % self.cells + 0.5) / self.cells
                v = 1 - (index // self.cells + 0.5) / self.cells
                start = len(verts)
                # The game's (x, y, z) is Blender's (x, -z, y).
                verts.extend((p[0], -p[2], p[1]) for p in points)
                polys.append(tuple(range(start, start + len(points))))
                uvs.extend((u, v) * len(points))
            name = f"chunk-{cx:02d}-{cz:02d}-{level}"
            mesh = bpy.data.meshes.new(name)
            mesh.from_pydata(verts, [], polys)
            mesh.update()
            layer = mesh.uv_layers.new(name="UVMap")
            layer.data.foreach_set("uv", uvs)
            mesh.materials.append(self.material)
            if self.smooth:
                import bmesh
                work = bmesh.new()
                work.from_mesh(mesh)
                bmesh.ops.remove_doubles(work, verts=work.verts, dist=0.0004)
                work.to_mesh(mesh)
                work.free()
                for polygon in mesh.polygons:
                    polygon.use_smooth = True
                mesh.set_sharp_from_angle(angle=math.radians(66))
            obj = bpy.data.objects.new(name, mesh)
            # What the export script reads: which chunk, which level, and that the shape is final.
            obj["nzila_chunk"] = f"{cx},{cz}"
            obj["lod_exact"] = True
            if level == FULL:
                obj["lod0_only"] = True
            elif level == LIGHT:
                obj["lod1_only"] = True
            bpy.context.scene.collection.objects.link(obj)


# ====================================================================== trees


def pit(b, x, z, ground, size=1.5):
    """The square of bare earth a street tree stands in."""
    b.level = BOTH
    h = size / 2
    b.face([(x - h, ground + 0.012, z - h), (x + h, ground + 0.012, z - h), (x + h, ground + 0.012, z + h), (x - h, ground + 0.012, z + h)], "palmTrunkDark", toward=(0.0, 1.0, 0.0))


def palm(b, x, z, rng, ground=0.0, shade="pavementShade"):
    """A coconut palm: a trunk that leans and curves, a crown of drooping fronds, a few coconuts."""
    b.at(x, z)
    pit(b, x, z, ground, 1.3)
    height = rng.uniform(6.5, 10.0)
    lean = rng.uniform(0.4, 1.6)
    bearing = rng.uniform(0, 2 * math.pi)
    lx, lz = math.cos(bearing) * lean, math.sin(bearing) * lean
    turn = rng.uniform(0, 2 * math.pi)

    def trunk(t):
        # It leaves the ground leaning and straightens as it climbs.
        return (x + lx * (2 * t - t * t), ground + height * t, z + lz * (2 * t - t * t))

    crown = trunk(1.0)

    def frond(angle, length, segments, halves):
        out = (math.cos(angle), 0.0, math.sin(angle))
        side = (-out[2], 0.0, out[0])
        rise = rng.uniform(0.9, 1.5)
        sag = rng.uniform(2.6, 3.6)
        colour = "palmLeaf" if rng.random() < 0.6 else "palmLeafDark"
        spine, widths = [], []
        for i in range(segments + 1):
            t = i / segments
            spine.append(_add(crown, _add(_mul(out, length * t), (0.0, rise * t - sag * t * t, 0.0))))
            widths.append(0.62 * (1 - t ** 1.6) + 0.05)
        for i in range(segments):
            a, c = spine[i], spine[i + 1]
            wa, wc = widths[i], widths[i + 1]
            if halves:
                # Two blades hanging from the spine, as a real frond folds.
                for sign in (-1, 1):
                    ea = _add(a, _add(_mul(side, sign * wa), (0.0, -wa * 0.45, 0.0)))
                    ec = _add(c, _add(_mul(side, sign * wc), (0.0, -wc * 0.45, 0.0)))
                    b.face([a, c, ec, ea], colour, two_sided=True)
            else:
                b.face([_add(a, _mul(side, -wa)), _add(a, _mul(side, wa)), _add(c, _mul(side, wc)), _add(c, _mul(side, -wc))], colour, two_sided=True)

    b.level = FULL
    steps = 5
    b.tube([trunk(i / steps) for i in range(steps + 1)], [0.26 - 0.11 * (i / steps) for i in range(steps + 1)], 5, "palmTrunk", cap=False)
    for i in (1, 2, 3, 4):
        ring = trunk(i / steps - 0.02)
        b.tube([ring, _add(ring, (0.0, 0.07, 0.0))], [0.29 - 0.11 * (i / steps)] * 2, 5, "palmTrunkDark", cap=False)
    count = rng.randint(8, 10)
    state = rng.getstate()
    for k in range(count):
        frond(turn + 2 * math.pi * k / count + rng.uniform(-0.15, 0.15), rng.uniform(2.9, 3.9), 3, True)
    for k in range(rng.randint(2, 4)):
        a = rng.uniform(0, 2 * math.pi)
        b.gem(_add(crown, (math.cos(a) * 0.28, -0.3, math.sin(a) * 0.28)), (0.17, 0.2, 0.17), 4, "coconut", rng)

    # Lighter: a four-sided trunk in three lengths, seven flat fronds, no coconuts.
    b.level = LIGHT
    rng.setstate(state)
    b.tube([trunk(i / 3) for i in range(4)], [0.26 - 0.11 * (i / 3) for i in range(4)], 4, "palmTrunk")
    for k in range(7):
        frond(turn + 2 * math.pi * k / 7 + rng.uniform(-0.15, 0.15), rng.uniform(2.9, 3.9), 2, False)
    # The patch of shade under it, for phones that draw no shadows.
    b.disc((x + lx * 0.6, ground + 0.024, z + lz * 0.6), 1.9, 8, shade, squash=0.8)
    b.level = BOTH
    return 0.35


def acacia(b, x, z, rng, ground=0.0, shade="pavementShade", shade_reach=None):
    """An acácia rubra: a short forked trunk and a wide, flat-topped canopy, in flower."""
    b.at(x, z)
    pit(b, x, z, ground)
    height = rng.uniform(3.4, 4.6)
    spread = rng.uniform(3.2, 4.6)
    bearing = rng.uniform(0, 2 * math.pi)
    fork = (x + math.cos(bearing) * 0.25, ground + height * 0.55, z + math.sin(bearing) * 0.25)
    tips = []
    for sign in (-1, 1):
        a = bearing + sign * rng.uniform(0.7, 1.2)
        tips.append((x + math.cos(a) * spread * 0.42, ground + height, z + math.sin(a) * spread * 0.42))
    in_flower = rng.random() < 0.7
    state = rng.getstate()

    def canopy(lumps, sides, flowers):
        for i in range(lumps):
            a = rng.uniform(0, 2 * math.pi)
            r = rng.uniform(0.0, spread * 0.45)
            centre = (x + math.cos(a) * r, ground + height + rng.uniform(0.35, 0.9), z + math.sin(a) * r)
            b.gem(centre, (spread * rng.uniform(0.5, 0.7), rng.uniform(0.85, 1.25), spread * rng.uniform(0.5, 0.7)), sides, "acaciaLeaf", rng, colour_low="acaciaLeafDark")
        if in_flower:
            for i in range(flowers):
                a = rng.uniform(0, 2 * math.pi)
                r = rng.uniform(0.3, spread * 0.62)
                b.gem((x + math.cos(a) * r, ground + height + rng.uniform(0.95, 1.3), z + math.sin(a) * r), (rng.uniform(0.45, 0.8), 0.36, rng.uniform(0.45, 0.8)), 4, "acaciaFlower", rng)

    b.level = FULL
    b.tube([(x, ground, z), (x, ground + height * 0.3, z), fork], [0.3, 0.24, 0.2], 6, "acaciaTrunk")
    for tip in tips:
        b.tube([fork, _mul(_add(fork, tip), 0.5), tip], [0.17, 0.13, 0.09], 5, "acaciaTrunk")
    canopy(4, 7, 6)

    b.level = LIGHT
    rng.setstate(state)
    b.tube([(x, ground, z), fork], [0.3, 0.2], 4, "acaciaTrunk")
    for tip in tips:
        b.tube([fork, tip], [0.16, 0.09], 3, "acaciaTrunk", cap=False)
    canopy(2, 5, 3)
    # `shade_reach` keeps the baked shade on the pavement when the tree stands at a kerb.
    b.disc((x, ground + 0.024, z), min(spread * 0.95, shade_reach or 99.0), 9, shade, squash=0.85 if shade_reach is None else 1.0)
    b.level = BOTH
    return 0.4


# ================================================================== buildings


def building(b, x, z, width, depth, floors, wall, rng, ground=0.0):
    """
    A block of flats or offices: a plinth, a ground floor with a door and
    shop windows under an awning, rows of windows above, some lit at night, a
    parapet, and on the roof a water tank and what else collects there.
    """
    b.at(x, z)
    storey = 3.1
    plinth = 0.5
    height = plinth + floors * storey
    top = ground + height
    sides = [
        # (centre offset, right vector, outward normal, length)
        ((0.0, 0.0, depth / 2), (1.0, 0.0, 0.0), (0.0, 0.0, 1.0), width),
        ((0.0, 0.0, -depth / 2), (-1.0, 0.0, 0.0), (0.0, 0.0, -1.0), width),
        ((width / 2, 0.0, 0.0), (0.0, 0.0, -1.0), (1.0, 0.0, 0.0), depth),
        ((-width / 2, 0.0, 0.0), (0.0, 0.0, 1.0), (-1.0, 0.0, 0.0), depth),
    ]
    front = rng.randrange(4)
    shop = rng.random() < 0.6
    awning = rng.choice(["awningRed", "awningGold", "awningTeal"])
    roof = rng.choice(["roofZinc", "roofZinc", "roof", "plinth"])

    # The body, on both levels: it is the building.
    b.level = BOTH
    b.box((x, ground + plinth / 2, z), (width + 0.16, plinth, depth + 0.16), "plinth")
    b.box((x, ground + plinth + floors * storey / 2, z), (width, floors * storey, depth), wall, top=roof)

    for index, (offset, right, out, length) in enumerate(sides):
        columns = max(2, int(length // 3.0))
        gap = length / columns
        face_centre = _add((x, ground, z), offset)
        for floor in range(floors):
            base = ground + plinth + floor * storey
            for c in range(columns):
                along = (c + 0.5) * gap - length / 2
                at = _add(_add(face_centre, _mul(right, along)), _mul(out, 0.035))
                is_door = floor == 0 and index == front and c == columns // 2
                is_shop = floor == 0 and index == front and shop and not is_door
                b.level = BOTH
                if is_door:
                    b.rect(_add(at, (0.0, base - ground + 1.1, 0.0)), right, (0.0, 1.0, 0.0), 1.25, 2.2, "wood")
                elif is_shop:
                    b.rect(_add(at, (0.0, base - ground + 1.3, 0.0)), right, (0.0, 1.0, 0.0), gap * 0.78, 1.9, "windowLit")
                else:
                    lit = rng.random() < 0.32
                    b.rect(_add(at, (0.0, base - ground + 1.75, 0.0)), right, (0.0, 1.0, 0.0), 1.25, 1.45, "windowLit" if lit else "window")
                    # A sill under each window, up close only.
                    b.level = FULL
                    sill = _add(at, (0.0, base - ground + 0.97, 0.0))
                    b.rect(_add(sill, _mul(out, 0.14)), right, (0.0, 1.0, 0.0), 1.45, 0.09, "kerb")
                    b.rect(_add(sill, _add(_mul(out, 0.07), (0.0, 0.045, 0.0))), right, _mul(out, -1.0), 1.45, 0.14, "kerb")
        if index == front and shop:
            # The awning: a cloth roof over the shop windows, with a hanging edge.
            b.level = BOTH
            high = _add(_add(face_centre, _mul(out, 0.05)), (0.0, plinth + 2.75, 0.0))
            low = _add(_add(face_centre, _mul(out, 1.35)), (0.0, plinth + 2.3, 0.0))
            r = _mul(right, length * 0.46)
            b.face([_sub(high, r), _add(high, r), _add(low, r), _sub(low, r)], awning, two_sided=True)
            b.level = FULL
            drop = (0.0, -0.28, 0.0)
            b.face([_sub(low, r), _add(low, r), _add(_add(low, r), drop), _add(_sub(low, r), drop)], "line", two_sided=True)

    # A band at each floor, and the parapet round the roof: up close only.
    b.level = FULL
    for floor in range(1, floors):
        b.box((x, ground + plinth + floor * storey, z), (width + 0.12, 0.12, depth + 0.12), "kerb", skip_bottom=False)
    for offset, right, out, length in sides:
        b.box(_add((x, top + 0.25, z), _mul(out, (depth if abs(out[2]) > 0.5 else width) / 2 - 0.1)), (length if abs(right[0]) > 0.5 else 0.2, 0.5, 0.2 if abs(right[0]) > 0.5 else length), wall)

    # On the roof: the water tank, always; the rest up close.
    tank_x = x + rng.uniform(-width * 0.25, width * 0.25)
    tank_z = z + rng.uniform(-depth * 0.25, depth * 0.25)
    b.level = FULL
    for sx in (-0.5, 0.5):
        for sz in (-0.5, 0.5):
            b.box((tank_x + sx, top + 0.5, tank_z + sz), (0.1, 1.0, 0.1), "metal")
    b.tube([(tank_x, top + 1.0, tank_z), (tank_x, top + 2.3, tank_z)], [0.85, 0.85], 10, "tank")
    for i in range(rng.randint(1, 3)):
        b.box((x + rng.uniform(-width * 0.38, width * 0.38), top + 0.3, z + rng.uniform(-depth * 0.38, depth * 0.38)), (0.9, 0.6, 0.6), "metal")
    if rng.random() < 0.7:
        dish = (x + rng.uniform(-width * 0.3, width * 0.3), top + 0.9, z + rng.uniform(-depth * 0.3, depth * 0.3))
        b.box((dish[0], top + 0.45, dish[2]), (0.08, 0.9, 0.08), "metal")
        tilt = _unit((rng.uniform(-1, 1), 0.9, rng.uniform(-1, 1)))
        side = _unit(_cross(tilt, (0.0, 1.0, 0.0)))
        up = _cross(side, tilt)
        b.face([_add(dish, _add(_mul(side, math.cos(a) * 0.55), _mul(up, math.sin(a) * 0.55))) for a in [2 * math.pi * k / 8 for k in range(8)]], "line", two_sided=True)
    # Balconies down one side of some of them.
    if floors >= 3 and rng.random() < 0.55:
        offset, right, out, length = sides[(front + 1) % 4]
        for floor in range(1, floors):
            centre = _add(_add((x, ground + plinth + floor * storey + 0.06, z), offset), _mul(out, 0.55))
            b.box(centre, (length * 0.6 if abs(right[0]) > 0.5 else 1.1, 0.12, 1.1 if abs(right[0]) > 0.5 else length * 0.6), "plinth", skip_bottom=False)
            b.box(_add(centre, _add(_mul(out, 0.52), (0.0, 0.5, 0.0))), (length * 0.6 if abs(right[0]) > 0.5 else 0.06, 0.9, 0.06 if abs(right[0]) > 0.5 else length * 0.6), "metal", skip_bottom=False)
    b.level = LIGHT
    b.tube([(tank_x, top, tank_z), (tank_x, top + 2.3, tank_z)], [0.85, 0.85], 6, "tank")
    b.level = BOTH


# ==================================================================== streets


def lamp(b, x, z, toward, ground=0.14, pool=True):
    """A street lamp: a pole, an arm over the street, a head that glows at night, and its pool of light."""
    b.at(x, z)
    out = _unit((toward[0], 0.0, toward[1]))
    head = _add((x, ground + 5.6, z), _mul(out, 1.3))
    b.level = FULL
    b.tube([(x, ground, z), (x, ground + 5.6, z)], [0.09, 0.06], 6, "metal")
    b.tube([(x, ground + 5.6, z), head], [0.05, 0.05], 4, "metal")
    b.level = LIGHT
    b.tube([(x, ground, z), (x, ground + 5.6, z)], [0.09, 0.06], 3, "metal", cap=False)
    b.level = BOTH
    b.box(head, (0.5, 0.16, 0.5), "lamp", skip_bottom=False)
    if pool:
        # By day this is the colour of the pavement and cannot be seen; at night it glows.
        b.disc((x + out[0] * 0.9, ground + 0.015, z + out[2] * 0.9), 3.4, 12, "lampPool")
    return 0.2


def bench(b, x, z, yaw, ground=0.14):
    """A bench of wooden slats on metal legs."""
    b.at(x, z)
    b.level = FULL
    for i in range(3):
        b.box(_add((x, ground + 0.46, z), _turn((0.0, 0.0, -0.17 + i * 0.17), yaw)), (1.7, 0.05, 0.13), "wood", yaw=yaw, skip_bottom=False)
    for i in range(2):
        b.box(_add((x, ground + 0.72 + i * 0.17, z), _turn((0.0, 0.0, -0.27), yaw)), (1.7, 0.12, 0.05), "wood", yaw=yaw, skip_bottom=False)
    for sx in (-0.7, 0.7):
        b.box(_add((x, ground + 0.23, z), _turn((sx, 0.0, 0.0), yaw)), (0.07, 0.46, 0.5), "metal", yaw=yaw)
    b.level = LIGHT
    b.box((x, ground + 0.43, z), (1.7, 0.1, 0.5), "wood", yaw=yaw, skip_bottom=False)
    b.box(_add((x, ground + 0.72, z), _turn((0.0, 0.0, -0.27), yaw)), (1.7, 0.34, 0.06), "wood", yaw=yaw)
    b.level = BOTH
    return 0.9


def parasol(b, x, z, rng, ground=0.14):
    """A seller's sunshade in two colours, with crates under it."""
    b.at(x, z)
    colours = rng.sample(["awningRed", "awningGold", "awningTeal", "vanWhite"], 2)
    tip = (x, ground + 2.5, z)
    b.level = BOTH
    for k in range(8):
        a, c = 2 * math.pi * k / 8, 2 * math.pi * (k + 1) / 8
        b.face([tip, (x + math.cos(a) * 1.5, ground + 2.0, z + math.sin(a) * 1.5), (x + math.cos(c) * 1.5, ground + 2.0, z + math.sin(c) * 1.5)], colours[k % 2], two_sided=True)
    b.tube([(x, ground, z), tip], [0.035, 0.035], 3, "metal", cap=False)
    for i in range(rng.randint(2, 3)):
        a = rng.uniform(0, 2 * math.pi)
        b.box((x + math.cos(a) * 0.7, ground + 0.2, z + math.sin(a) * 0.7), (0.55, 0.4, 0.4), "wood", yaw=rng.uniform(0, 3))
    return 1.0


def paragem(b, x, z, yaw, ground=0.14):
    """A bus shelter in the blue of the candongueiros: four posts, a roof, a bench, a sign."""
    b.at(x, z)
    b.level = BOTH
    b.box(_add((x, ground + 2.5, z), _turn((0.0, 0.0, 0.0), yaw)), (4.2, 0.12, 1.7), "vanBlue", yaw=yaw, top="vanWhite", skip_bottom=False)
    b.box(_add((x, ground + 1.25, z), _turn((0.0, 0.0, -0.8), yaw)), (4.0, 1.5, 0.05), "window", yaw=yaw)
    b.level = FULL
    for sx in (-2.0, 2.0):
        for sz in (-0.75, 0.75):
            b.tube([_add((x, ground, z), _turn((sx, 0.0, sz), yaw)), _add((x, ground + 2.45, z), _turn((sx, 0.0, sz), yaw))], [0.05, 0.05], 4, "metal", cap=False)
    b.box(_add((x, ground + 0.45, z), _turn((0.0, 0.0, -0.5), yaw)), (3.2, 0.08, 0.4), "wood", yaw=yaw, skip_bottom=False)
    b.tube([_add((x, ground, z), _turn((2.6, 0.0, 0.6), yaw)), _add((x, ground + 2.9, z), _turn((2.6, 0.0, 0.6), yaw))], [0.04, 0.04], 4, "metal", cap=False)
    b.box(_add((x, ground + 2.7, z), _turn((2.6, 0.0, 0.6), yaw)), (0.6, 0.6, 0.05), "vanBlue", yaw=yaw)
    b.level = LIGHT
    for sx in (-2.0, 2.0):
        b.box(_add((x, ground + 1.25, z), _turn((sx, 0.0, 0.0), yaw)), (0.08, 2.5, 1.5), "metal", yaw=yaw)
    b.level = BOTH
    return 2.2


def candongueiro(b, x, z, yaw, ground=0.0):
    """The blue and white van: white above, blue below, standing at the kerb."""
    b.at(x, z)

    def part(offset, size, colour, top=None):
        b.box(_add((x, ground, z), _turn(offset, yaw)), size, colour, yaw=yaw, top=top, skip_bottom=False)

    b.level = BOTH
    part((0.0, 0.72, 0.0), (4.9, 0.74, 1.85), "vanBlue")
    part((-0.15, 1.52, 0.0), (4.3, 0.86, 1.78), "vanWhite")
    part((0.0, 1.5, 0.0), (3.4, 0.5, 1.82), "window")
    part((2.05, 1.42, 0.0), (0.25, 0.56, 1.6), "window")
    b.level = FULL
    part((2.5, 0.5, 0.0), (0.12, 0.25, 1.8), "metal")
    part((-2.5, 0.5, 0.0), (0.12, 0.25, 1.8), "metal")
    for sx in (-1.55, 1.55):
        for sz in (-0.86, 0.86):
            hub = _add((x, ground + 0.36, z), _turn((sx, 0.0, sz), yaw))
            axle = _turn((0.0, 0.0, 0.14), yaw)
            b.tube([_sub(hub, axle), _add(hub, axle)], [0.36, 0.36], 8, "tarShade")
    b.level = LIGHT
    for sx in (-1.55, 1.55):
        part((sx, 0.36, 0.0), (0.7, 0.72, 1.9), "tarShade")
    b.level = BOTH
    return 2.6


# ==================================================================== the bairro
# Built from the founder's photographs (docs/reference/LUANDA_REFERENCE.md §6d):
# single-storey houses of block or of sheet metal under a zinc roof, each on
# its plot behind a wall with a gate, the quintal behind the house; wooden
# poles that lean, and the wires between them.

ZINC = ["roofZinc", "zincRust", "zincRed", "zincBlue", "roofZinc", "zincRust"]
PAINT = [("paintMint", "paintWhite"), ("wall5", "paintWhite"), ("wall6", "wall3"), ("zincBlue", "paintWhite"), ("wall1", "wall3"), ("paintWhite", "paintWhite"), ("wall2", "wall0")]


def casa(b, x, z, yaw, rng, kind="bloco", width=8.0, depth=6.0, ground=0.0, shop=False):
    """
    A house of one storey. Its front faces local +Z, turned by yaw.
    `kind`: "bloco" (plastered and painted in two colours), "cru" (bare
    block, still being finished), "chapa" (sheet metal throughout).
    `shop` gives it a serving hatch, an awning and a board: a cantina.
    """
    b.at(x, z)
    height = rng.uniform(2.6, 3.0)

    def at(lx, ly, lz):
        return _add((x, ground, z), _turn((lx, ly, lz), yaw))

    right = _turn((1.0, 0.0, 0.0), yaw)
    front = _turn((0.0, 0.0, 1.0), yaw)
    if shop:
        # A cantina is painted to be seen from the end of the street.
        low = high = rng.choice(["cloth", "cloth", "zincBlue", "awningTeal"])
    elif kind == "bloco":
        low, high = rng.choice(PAINT)
    elif kind == "cru":
        low = high = "blockGrey"
    else:
        low = high = rng.choice(["zincRed", "zincRust", "zincBlue", "roofZinc"])
    roof = rng.choice(ZINC)

    b.level = BOTH
    b.box(at(0.0, height / 2, 0.0), (width, height, depth), high, yaw=yaw, top="tarShade")
    if low != high:
        # The lower third in a second colour, as houses are painted.
        b.box(at(0.0, 0.5, 0.0), (width + 0.05, 1.0, depth + 0.05), low, yaw=yaw, top=low)
    # The roof: one slope of zinc, higher at the front, hanging well over the walls.
    over = 0.55
    fx, bx = width / 2 + 0.35, -(width / 2 + 0.35)
    slab = [at(bx, height + 0.62, depth / 2 + over), at(fx, height + 0.62, depth / 2 + over), at(fx, height + 0.1, -depth / 2 - 0.3), at(bx, height + 0.1, -depth / 2 - 0.3)]
    b.face(slab, roof, toward=(0.0, 1.0, 0.0), two_sided=True)
    # Under the high edge, the strip of wall that closes the gap.
    b.rect(at(0.0, height + 0.3, depth / 2 + 0.01), right, (0.0, 1.0, 0.0), width, 0.6, high)

    door_x = rng.uniform(-width * 0.25, width * 0.25)
    door = rng.choice(["zincBlue", "wood", "metal", "zincRed"])
    b.rect(at(door_x, 1.05, depth / 2 + 0.035), right, (0.0, 1.0, 0.0), 0.95, 2.1, door)
    for side in (-1, 1):
        wx = door_x + side * rng.uniform(1.9, 2.6)
        if abs(wx) < width / 2 - 0.8:
            if shop and side == 1:
                # The hatch a cantina sells through, its awning, and the board with its name.
                b.rect(at(wx, 1.45, depth / 2 + 0.035), right, (0.0, 1.0, 0.0), 1.9, 1.1, "windowLit")
                high_edge, low_edge = at(wx, 2.25, depth / 2 + 0.05), at(wx, 1.95, depth / 2 + 1.2)
                r = _mul(right, 1.2)
                b.face([_sub(high_edge, r), _add(high_edge, r), _add(low_edge, r), _sub(low_edge, r)], rng.choice(["awningRed", "awningTeal", "zincBlue"]), two_sided=True)
                b.box(at(wx, 2.62, depth / 2 + 0.08), (2.2, 0.5, 0.06), "cloth", yaw=yaw)
            else:
                b.rect(at(wx, 1.6, depth / 2 + 0.035), right, (0.0, 1.0, 0.0), 1.0, 1.0, "windowLit" if rng.random() < 0.45 else "window")
    side_x = rng.choice([-1, 1])
    b.rect(at(side_x * (width / 2 + 0.035), 1.6, rng.uniform(-1.0, 1.0)), _mul(front, -side_x), (0.0, 1.0, 0.0), 0.9, 0.9, "window")

    if shop:
        # The band its name is lettered on, and what will not fit inside, stacked at the door.
        b.rect(at(0.0, height - 0.28, depth / 2 + 0.03), right, (0.0, 1.0, 0.0), width, 0.5, "awningRed" if high != "awningRed" else "paintWhite")
        b.level = FULL
        for i in range(rng.randint(4, 7)):
            cx_, layer = door_x - rng.uniform(1.0, 2.6), rng.randint(0, 1)
            b.box(at(cx_, 0.2 + layer * 0.4, depth / 2 + rng.uniform(0.5, 1.1)), (0.55, 0.4, 0.42), rng.choice(["wood", "paintWhite", "zincBlue", "awningRed", "concrete"]), yaw=yaw + rng.uniform(-0.2, 0.2), skip_bottom=False)
        b.level = BOTH
    b.level = FULL
    if kind == "chapa":
        # Sheets of another colour where it was patched.
        for i in range(rng.randint(2, 3)):
            b.rect(at(rng.uniform(-width * 0.4, width * 0.4), rng.uniform(1.0, 2.0), depth / 2 + 0.02), right, (0.0, 1.0, 0.0), 0.9, rng.uniform(1.2, 2.0), rng.choice(ZINC))
    # A step at the door, and plants in pots beside it.
    b.box(at(door_x, 0.08, depth / 2 + 0.35), (1.3, 0.16, 0.6), "concrete", yaw=yaw)
    for i in range(rng.randint(0, 3)):
        pot = at(door_x + rng.choice([-1, 1]) * rng.uniform(0.8, 1.3), 0.0, depth / 2 + rng.uniform(0.3, 0.6))
        b.tube([pot, _add(pot, (0.0, 0.32, 0.0))], [0.14, 0.19], 5, "roof")
        b.gem(_add(pot, (0.0, 0.62, 0.0)), (0.3, 0.36, 0.3), 4, "palmLeaf", rng)
    # What holds a zinc roof down, a patch on it, and the dish.
    for i in range(rng.randint(2, 4)):
        t_ = rng.uniform(0.15, 0.85)
        b.gem(at(rng.uniform(-width * 0.4, width * 0.4), height + 0.14 + 0.52 * t_ + 0.1, -depth / 2 - 0.3 + (depth + 0.85) * t_), (0.2, 0.13, 0.2), 4, "blockGrey", rng)
    if rng.random() < 0.6:
        t_ = rng.uniform(0.2, 0.7)
        centre = at(rng.uniform(-width * 0.3, width * 0.3), height + 0.115 + 0.52 * t_, -depth / 2 - 0.3 + (depth + 0.85) * t_)
        tilt = math.atan2(0.52, depth + 0.85)
        b.rect(centre, right, _turn((0.0, math.sin(tilt), math.cos(tilt)), yaw), 1.6, 1.3, rng.choice(ZINC))
    if rng.random() < 0.55:
        foot = at(rng.uniform(-width * 0.35, width * 0.35), height + 0.3, -depth * 0.2)
        b.tube([foot, _add(foot, (0.0, 0.5, 0.0))], [0.03, 0.03], 3, "metal", cap=False)
        aim = _unit((rng.uniform(-1, 1), 0.8, rng.uniform(-1, 1)))
        side = _unit(_cross(aim, (0.0, 1.0, 0.0)))
        up = _cross(side, aim)
        centre = _add(foot, (0.0, 0.6, 0.0))
        b.face([_add(centre, _add(_mul(side, math.cos(a) * 0.4), _mul(up, math.sin(a) * 0.4))) for a in [2 * math.pi * k / 7 for k in range(7)]], "paintWhite", two_sided=True)
    b.level = BOTH
    return max(width, depth) / 2


def muro(b, x0, z0, x1, z1, colour, height=1.7, thick=0.2):
    """A wall along a straight line that runs along X or along Z."""
    if abs(x1 - x0) >= abs(z1 - z0):
        b.box(((x0 + x1) / 2, height / 2, z0), (abs(x1 - x0), height, thick), colour)
    else:
        b.box((x0, height / 2, (z0 + z1) / 2), (thick, height, abs(z1 - z0)), colour)


def portao(b, x, z, along_x, rng, height=1.8):
    """A metal gate, standing open: one leaf swung into the plot."""
    colour = rng.choice(["zincBlue", "zincRust", "metal", "zincRed", "awningTeal"])
    yaw = (0.0 if along_x else math.pi / 2) + rng.choice([-1, 1]) * rng.uniform(1.0, 1.4)
    hinge = (x + (0.7 if along_x else 0.0), 0.0, z + (0.0 if along_x else 0.7))
    centre = _add(hinge, _turn((-0.65, height / 2, 0.0), yaw))
    b.level = BOTH
    b.box(centre, (1.3, height, 0.06), colour, yaw=yaw)


def poste(b, x, z, rng, lamp=False):
    """A wooden pole that leans a little, with its crossbar. Returns the points the wires hang from."""
    b.at(x, z)
    lean = (rng.uniform(-0.35, 0.35), 0.0, rng.uniform(-0.35, 0.35))
    top = (x + lean[0], 7.2, z + lean[2])
    b.level = FULL
    b.tube([(x, 0.0, z), top], [0.11, 0.08], 5, "pole", cap=False)
    b.level = LIGHT
    b.tube([(x, 0.0, z), top], [0.11, 0.08], 3, "pole", cap=False)
    b.level = BOTH
    b.box(_add(top, (0.0, -0.5, 0.0)), (1.5, 0.1, 0.1), "pole", yaw=rng.uniform(0, math.pi), skip_bottom=False)
    if lamp:
        head = _add(top, (0.9, -1.2, 0.3))
        b.box(head, (0.45, 0.14, 0.3), "lamp", skip_bottom=False)
        b.disc((x + 0.9, 0.02, z + 0.3), 3.0, 10, "lampPoolSand")
    return [_add(top, (0.0, -0.45, 0.0)), _add(top, (0.0, -0.9, 0.0))]


def fio(b, a, c, sag=0.7, parts=4):
    """A wire between two points, hanging slack. Up close only."""
    b.level = FULL
    previous = a
    for i in range(1, parts + 1):
        t_ = i / parts
        point = (a[0] + (c[0] - a[0]) * t_, a[1] + (c[1] - a[1]) * t_ - sag * 4 * t_ * (1 - t_), a[2] + (c[2] - a[2]) * t_)
        b.face([previous, point, _add(point, (0.0, 0.045, 0.0)), _add(previous, (0.0, 0.045, 0.0))], "pole", two_sided=True)
        previous = point
    b.level = BOTH


def quintal(b, x, z, rng, ground=0.0, kind=None):
    """
    What stands in a backyard. Every one has the water drum; beyond that no two
    are alike (founder, 2026-11-14): "horta" is a kitchen garden in beds, "plantas"
    is pots and a banana plant, "estar" is a place to sit under a parasol, "roupa"
    is the washing line and little else.
    """
    b.at(x, z)
    kind = kind or rng.choice(["horta", "horta", "plantas", "estar", "roupa"])
    b.level = BOTH
    b.tube([(x, ground, z), (x, ground + 0.95, z)], [0.3, 0.3], 7, "drum")
    if kind == "horta":
        for row in range(rng.randint(2, 3)):
            bx, bz = x - 1.6 - row * 1.0, z + rng.uniform(-0.4, 0.4)
            b.level = BOTH
            b.box((bx, ground + 0.07, bz), (0.7, 0.14, 3.0), "palmTrunkDark")
            b.level = FULL
            crop = rng.choice(["acaciaLeaf", "palmLeaf", "palmLeafDark"])
            for i in range(5):
                b.gem((bx, ground + 0.3, bz - 1.2 + i * 0.6), (0.2, 0.2, 0.2), 4, crop, rng)
                if crop == "acaciaLeaf" and rng.random() < 0.4:
                    b.gem((bx + 0.12, ground + 0.36, bz - 1.2 + i * 0.6), (0.07, 0.07, 0.07), 4, "awningRed", rng)
    elif kind == "plantas":
        b.level = FULL
        for i in range(rng.randint(3, 5)):
            px, pz = x + rng.uniform(-2.4, -0.7), z + rng.uniform(-1.6, 1.6)
            b.tube([(px, ground, pz), (px, ground + 0.34, pz)], [0.15, 0.2], 5, "roof")
            b.gem((px, ground + 0.7, pz), (0.34, 0.42, 0.34), 4, rng.choice(["palmLeaf", "acaciaLeaf"]), rng)
        # A banana plant: a thick green stem and a few great leaves.
        px, pz = x - 2.6, z + rng.uniform(-1.0, 1.0)
        b.tube([(px, ground, pz), (px, ground + 1.7, pz)], [0.16, 0.1], 5, "palmLeafDark", cap=False)
        for k in range(5):
            a_ = 2 * math.pi * k / 5 + rng.uniform(-0.3, 0.3)
            out = (math.cos(a_), 0.0, math.sin(a_))
            side = (-out[2] * 0.38, 0.0, out[0] * 0.38)
            root, tip = (px, ground + 1.65, pz), (px + out[0] * 1.5, ground + 1.9 - rng.uniform(0.2, 0.9), pz + out[2] * 1.5)
            middle = (px + out[0] * 0.8, ground + 2.2, pz + out[2] * 0.8)
            b.face([root, _add(middle, side), tip, _sub(middle, side)], "palmLeaf", two_sided=True)
    elif kind == "estar":
        parasol(b, x - 2.0, z + rng.uniform(-0.8, 0.8), rng, ground)
        b.at(x, z)
    b.level = FULL
    lx, lz = x + rng.uniform(1.2, 2.2), z + rng.uniform(-1.5, 1.5)
    a, c = (lx, ground + 1.8, lz - 1.6), (lx, ground + 1.8, lz + 1.6)
    for post in (a, c):
        b.tube([(post[0], ground, post[2]), post], [0.035, 0.035], 3, "pole", cap=False)
    fio(b, a, c, sag=0.12, parts=2)
    b.level = FULL
    for i in range(rng.randint(2, 4)):
        t_ = 0.15 + 0.7 * rng.random()
        b.rect((lx, ground + 1.35, a[2] + (c[2] - a[2]) * t_), (0.0, 0.0, 1.0), (0.0, 1.0, 0.0), 0.5, 0.75, rng.choice(["cloth", "paintWhite", "awningRed", "zincBlue", "awningTeal"]), two_sided=True)
    for i in range(rng.randint(1, 3)):
        cx, cz = x + rng.uniform(-2.2, -0.8), z + rng.uniform(-1.6, 1.6)
        b.box((cx, ground + 0.22, cz), (0.42, 0.44, 0.42), rng.choice(["paintWhite", "zincBlue", "awningRed"]), yaw=rng.uniform(0, 3))
    b.level = BOTH
    return 0.4

