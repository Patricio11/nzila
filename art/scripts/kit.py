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
import random

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
        # For a body: the part being built ("arm.L"), and what turns a part and a point into bone weights.
        self.part = None
        self.weigher = None
        # For the wardrobe: what kind of piece is being built ("body", "hair"), and the one kind to keep, if any.
        self.piece = None
        self.only = None
        # On a smooth body, what is drawn faceted all the same: hair, whose clumps are what make it read as hair.
        self.flat = False
        self.objects = []
        # Where a person can sit: (x, seat height, z, the way they face, as a turn about the vertical).
        self.seats = []
        # Every box built, as it stands on the ground: (x, z, half across, half deep, turn, bottom, top).
        # A district reads these to mark what a person cannot walk through (block_solids), so that
        # nothing built is ever forgotten on the walk grid. `soft` is set while building what is
        # solid in another way (a bench is sat on: the game gives it its own body).
        self.solids = []
        self.soft = False
        # What was planted where: (kind, x, z). Written beside the district, to find a tree by.
        self.planted = []
        # Every face of the world that could stand in a person's way, as its corners: a district
        # reads these to mark what cannot be walked through (block_built). Not the faces of a body
        # or a piece of wardrobe, not what is soft, and each thing once (its full form, not its light one).
        self.built = []

    def at(self, x, z):
        """Whatever is built next belongs to the chunk this point is in, however far it overhangs."""
        self.chunk = (int(x // self.chunk_m), int(z // self.chunk_m))

    def face(self, points, colour, away_from=None, toward=None, two_sided=False):
        """One flat face. It is turned to face away from a point, or toward a direction, when one is given."""
        if self.only is not None and self.piece != self.only:
            return
        points = list(points)
        normal = _cross(_sub(points[1], points[0]), _sub(points[2], points[0]))
        if away_from is not None:
            centre = _mul(tuple(sum(p[i] for p in points) for i in range(3)), 1.0 / len(points))
            if _dot(normal, _sub(centre, away_from)) < 0:
                points.reverse()
        elif toward is not None and _dot(normal, toward) < 0:
            points.reverse()
        group = self.groups.setdefault((self.chunk, self.level), [])
        group.append((points, colour, self.part, self.flat))
        if not self.soft and self.part is None and self.piece is None and self.level != LIGHT:
            self.built.append(points)
        if two_sided:
            group.append((list(reversed(points)), colour, self.part, self.flat))

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
        if not self.soft and self.part is None and self.piece is None:
            self.solids.append((centre[0], centre[2], hx, hz, yaw, centre[1] - hy, centre[1] + hy))
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
            parts = []
            flats = []
            for points, colour, part, flat in faces:
                flats.append(flat)
                parts.extend([part] * len(points))
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
            obj = bpy.data.objects.new(name, mesh)
            self.objects.append(obj)
            if self.weigher:
                # Every corner still belongs to one face here, so it knows its part; merging comes after.
                groups = {}
                for index, part in enumerate(parts):
                    for bone, weight in self.weigher(part, (verts[index][0], verts[index][2], -verts[index][1])):
                        if weight > 0.001:
                            if bone not in groups:
                                groups[bone] = obj.vertex_groups.new(name=bone)
                            groups[bone].add([index], weight, "REPLACE")
            if self.smooth:
                import bmesh
                # Which faces are drawn faceted travels with the faces, through the merging of their corners.
                layer_flat = mesh.attributes.new("nz_flat", "INT", "FACE")
                layer_flat.data.foreach_set("value", [1 if flat else 0 for flat in flats])
                work = bmesh.new()
                work.from_mesh(mesh)
                bmesh.ops.remove_doubles(work, verts=work.verts, dist=0.0004)
                work.to_mesh(mesh)
                work.free()
                kept = [0] * len(mesh.polygons)
                mesh.attributes["nz_flat"].data.foreach_get("value", kept)
                for polygon, flat in zip(mesh.polygons, kept):
                    polygon.use_smooth = not flat
                mesh.attributes.remove(mesh.attributes["nz_flat"])
                mesh.set_sharp_from_angle(angle=math.radians(66))
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


def imbondeiro(b, x, z, rng, ground=0.0, shade="sandDark"):
    """
    An imbondeiro (baobab): the tree of Angola. A trunk like a bottle, wider than a man is tall,
    grey and smooth; a few thick arms at the top that end soon, like roots in the air; little
    leaf, high up; and the múcuas hanging on their long stalks.
    """
    b.at(x, z)
    height = rng.uniform(6.5, 8.5)
    girth = rng.uniform(1.25, 1.6)
    top = (x, ground + height * 0.62, z)
    arms = []
    count = rng.randint(4, 6)
    start = rng.uniform(0, 2 * math.pi)
    for i in range(count):
        a = start + 2 * math.pi * i / count + rng.uniform(-0.3, 0.3)
        reach = rng.uniform(1.9, 2.9)
        elbow = (x + math.cos(a) * reach * 0.55, ground + height * rng.uniform(0.74, 0.82), z + math.sin(a) * reach * 0.55)
        tip = (x + math.cos(a) * reach, ground + height * rng.uniform(0.9, 1.05), z + math.sin(a) * reach)
        arms.append((a, elbow, tip))
    state = rng.getstate()

    def crown(full):
        for (a, elbow, tip) in arms:
            if full:
                # A twig or two off each arm, and the leaf at their ends.
                for k in range(2):
                    t = a + rng.uniform(-0.8, 0.8)
                    twig = (tip[0] + math.cos(t) * 0.8, tip[1] + rng.uniform(0.3, 0.7), tip[2] + math.sin(t) * 0.8)
                    b.tube([tip, twig], [0.12, 0.05], 4, "imbondeiroBarkDark", cap=False)
                    b.gem(_add(twig, (0.0, 0.15, 0.0)), (rng.uniform(0.6, 0.9), 0.38, rng.uniform(0.6, 0.9)), 5, "imbondeiroLeaf", rng)
                if rng.random() < 0.6:
                    # A múcua on its stalk.
                    hang = (tip[0] + rng.uniform(-0.4, 0.4), tip[1] - rng.uniform(0.9, 1.4), tip[2] + rng.uniform(-0.4, 0.4))
                    b.tube([_add(tip, (0.0, -0.05, 0.0)), hang], [0.025, 0.025], 3, "imbondeiroBarkDark", cap=False)
                    b.gem(_add(hang, (0.0, -0.16, 0.0)), (0.13, 0.2, 0.13), 5, "mucua", rng, rough=0.08)
            else:
                b.gem(_add(tip, (0.0, 0.45, 0.0)), (0.95, 0.42, 0.95), 4, "imbondeiroLeaf", rng)

    b.level = FULL
    b.tube([(x, ground, z), (x, ground + height * 0.12, z), (x, ground + height * 0.4, z), top, _add(top, (0.0, height * 0.08, 0.0))], [girth * 1.12, girth, girth * 0.9, girth * 0.62, girth * 0.42], 9, "imbondeiroBark")
    for (a, elbow, tip) in arms:
        root = (x + math.cos(a) * girth * 0.3, top[1] - 0.2, z + math.sin(a) * girth * 0.3)
        b.tube([root, elbow, tip], [0.42, 0.3, 0.13], 5, "imbondeiroBark")
    crown(True)

    b.level = LIGHT
    rng.setstate(state)
    b.tube([(x, ground, z), (x, ground + height * 0.4, z), top], [girth * 1.1, girth * 0.9, girth * 0.55], 6, "imbondeiroBark")
    for (a, elbow, tip) in arms:
        b.tube([top, tip], [0.36, 0.12], 3, "imbondeiroBark", cap=False)
    crown(False)
    b.disc((x, ground + 0.024, z), girth * 2.3, 9, shade, squash=0.8)
    b.level = BOTH
    return girth * 1.1


def mangueira(b, x, z, rng, ground=0.0, shade="sandDark", shade_reach=None):
    """A mangueira: a short stout trunk and a crown as round and dark as a hill, mangos in it. The tree a yard is built round."""
    b.at(x, z)
    height = rng.uniform(2.4, 3.2)
    spread = rng.uniform(3.6, 4.8)
    crown_y = ground + height + spread * 0.42
    in_fruit = rng.random() < 0.7
    state = rng.getstate()

    def crown(lumps, sides, fruit):
        b.gem((x, crown_y, z), (spread * 0.62, spread * 0.5, spread * 0.62), sides, "mangueiraLeaf", rng, colour_low="mangueiraLeafDark")
        for i in range(lumps):
            a = rng.uniform(0, 2 * math.pi)
            r = spread * rng.uniform(0.3, 0.52)
            b.gem((x + math.cos(a) * r, crown_y + rng.uniform(-0.7, 0.5), z + math.sin(a) * r), (spread * rng.uniform(0.32, 0.44), spread * rng.uniform(0.28, 0.38), spread * rng.uniform(0.32, 0.44)), sides, "mangueiraLeaf", rng, colour_low="mangueiraLeafDark")
        if in_fruit:
            for i in range(fruit):
                a = rng.uniform(0, 2 * math.pi)
                r = spread * rng.uniform(0.45, 0.66)
                b.gem((x + math.cos(a) * r, crown_y - spread * rng.uniform(0.22, 0.36), z + math.sin(a) * r), (0.1, 0.14, 0.1), 4, "manga", rng, rough=0.05)

    b.level = FULL
    b.tube([(x, ground, z), (x, ground + height * 0.6, z), (x, ground + height + 0.4, z)], [0.42, 0.34, 0.3], 7, "acaciaTrunk")
    for i in range(3):
        a = rng.uniform(0, 2 * math.pi)
        b.tube([(x, ground + height * 0.8, z), (x + math.cos(a) * spread * 0.3, crown_y - 0.4, z + math.sin(a) * spread * 0.3)], [0.2, 0.1], 4, "acaciaTrunk", cap=False)
    crown(5, 7, 9)

    b.level = LIGHT
    rng.setstate(state)
    b.tube([(x, ground, z), (x, ground + height + 0.4, z)], [0.4, 0.3], 4, "acaciaTrunk")
    for i in range(3):
        rng.uniform(0, 2 * math.pi)
    crown(2, 5, 0)
    b.disc((x, ground + 0.024, z), min(spread * 0.9, shade_reach or 99.0), 9, shade, squash=0.9 if shade_reach is None else 1.0)
    b.level = BOTH
    return 0.5


class _Nothing:
    """Takes everything a tree would build and builds none of it."""
    level = BOTH
    soft = False

    def __getattr__(self, name):
        return lambda *args, **kwargs: None


def tree(b, x, z, rng, ground=0.0, shade="pavementShade", shade_reach=None, mix=("acacia", "acacia", "mangueira"), paved=True):
    """
    One of the trees of a street or a yard. Which one is the luck of the place itself (the same
    spot always grows the same tree), and it takes from `rng` exactly what an acácia would, so
    that planting something else moves nothing that is built after it.
    Returns how much ground its trunk takes.
    """
    planted = random.Random(f"{x:.2f},{z:.2f}")
    kind = planted.choice(mix)
    b.planted.append((kind, round(x, 1), round(z, 1)))
    if kind == "acacia":
        return acacia(b, x, z, rng, ground, shade=shade, shade_reach=shade_reach)
    acacia(_Nothing(), x, z, rng, ground, shade=shade, shade_reach=shade_reach)
    if paved:
        pit(b, x, z, ground, size=3.4 if kind == "imbondeiro" else 1.8)
    if kind == "imbondeiro":
        return imbondeiro(b, x, z, planted, ground, shade=shade)
    return mangueira(b, x, z, planted, ground, shade=shade, shade_reach=shade_reach)


def outdoor(b, x, z, yaw, ground=0.0, wide=6.0, high=3.0):
    """
    An outdoor: the big board for advertising that stands by a road on two legs. The board is a
    named ad slot (the manifest lists it): until someone takes it, it carries the house's own colours.
    Returns the middle of the board's face and its size, for the manifest.
    """
    b.at(x, z)
    foot = ground + 3.2
    middle = (x, foot + high / 2, z)
    b.level = FULL
    for side in (-1, 1):
        b.box(_add((x, ground + (foot + high) / 2 - ground / 2, z), _turn((side * wide * 0.3, 0.0, 0.18), yaw)), (0.22, foot + high - ground, 0.22), "metal", yaw=yaw)
    # The frame and the board. What is on the board is paper: the game pastes it (render/outdoors.ts).
    b.box(middle, (wide + 0.24, high + 0.24, 0.12), "metal", yaw=yaw, skip_bottom=False)
    front = _turn((0.0, 0.0, -0.08), yaw)
    b.box(_add(middle, front), (wide, high, 0.04), "adBoard", yaw=yaw, skip_bottom=False)
    # A walkway under it for whoever pastes the paper, and two lamps to light it at night.
    b.box(_add((x, foot - 0.12, z), _turn((0.0, 0.0, -0.5), yaw)), (wide, 0.06, 0.7), "metal", yaw=yaw, skip_bottom=False)
    b.level = LIGHT
    for side in (-1, 1):
        b.box(_add((x, ground + (foot + high) / 2 - ground / 2, z), _turn((side * wide * 0.3, 0.0, 0.18), yaw)), (0.22, foot + high - ground, 0.22), "metal", yaw=yaw)
    b.box(middle, (wide, high, 0.12), "adBoard", yaw=yaw, skip_bottom=False)
    b.level = BOTH
    return {"pos": [round(middle[0] + front[0], 2), round(middle[1], 2), round(middle[2] + front[2], 2)], "size": [wide, high]}


# ================================================================== buildings


def building(b, x, z, width, depth, floors, wall, rng, ground=0.0, face=None, extras=True):
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
    # `face` chooses the side the door is on: 0 toward +Z, 1 toward -Z, 2 toward +X, 3 toward -X.
    front = rng.randrange(4) if face is None else face
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

    if extras:
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
    if extras:
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
    # The arm too: without it, on the lightest picture, the head would hang in the air beside its pole.
    b.tube([(x, ground + 5.6, z), head], [0.05, 0.05], 3, "metal", cap=False)
    b.level = BOTH
    b.box(head, (0.5, 0.16, 0.5), "lamp", skip_bottom=False)
    if pool:
        # By day this is the colour of the pavement and cannot be seen; at night it glows.
        b.disc((x + out[0] * 0.9, ground + 0.015, z + out[2] * 0.9), 3.4, 12, "lampPool")
    return 0.2


def block_built(b, cell, flag_at, height_at, set_flag, walked=".=", knee=0.3, head=1.7):
    """
    Marks on a walk grid every surface that was built and stands in a person's way: whatever it
    was made of. A wall drawn as one face, the trunk of a tree, a counter, a post, a fence.

    Every face of the world is looked at. One that stands upright (a wall) is in the way of the
    cells it passes over when it reaches above the knee of someone standing there and begins
    below their head. One that lies or slopes (a table top, a low roof) is in the way of the cells
    under it when, over that cell, it is between knee and head; the ground itself is at the
    ground, and is in nobody's way. A step, a kerb, an awning, a bridge overhead: not in the way.

    What is low enough to jump ("^") is left as it is. Returns how many cells it blocked that were open.
    """
    blocked = 0
    reach = cell * 0.5
    for points in b.built:
        normal = _cross(_sub(points[1], points[0]), _sub(points[2], points[0]))
        size = math.sqrt(_dot(normal, normal))
        if size < 1e-9:
            continue
        up = abs(normal[1]) / size
        xs = [p[0] for p in points]
        zs = [p[2] for p in points]
        ys = [p[1] for p in points]
        upright = up < 0.5
        pad = reach if upright else 0.0
        count = len(points)
        for iz in range(math.floor((min(zs) - pad) / cell), math.floor((max(zs) + pad) / cell) + 1):
            for ix in range(math.floor((min(xs) - pad) / cell), math.floor((max(xs) + pad) / cell) + 1):
                flag = flag_at(ix, iz)
                if flag is None or flag not in walked:
                    continue
                cx, cz = (ix + 0.5) * cell, (iz + 0.5) * cell
                ground = height_at(ix, iz)
                if upright:
                    if not (max(ys) > ground + knee and min(ys) < ground + head):
                        continue
                    # How near the middle of the cell is to the wall's line on the ground: to any of its edges.
                    near = 1e9
                    for k in range(count):
                        ax, az = points[k][0], points[k][2]
                        bx, bz = points[(k + 1) % count][0], points[(k + 1) % count][2]
                        ex, ez = bx - ax, bz - az
                        length2 = ex * ex + ez * ez
                        t = 0.0 if length2 < 1e-12 else max(0.0, min(1.0, ((cx - ax) * ex + (cz - az) * ez) / length2))
                        near = min(near, math.hypot(cx - (ax + ex * t), cz - (az + ez * t)))
                    if near > reach:
                        continue
                else:
                    # Is the middle of the cell under the face? (The face is flat and convex, as every face of the kit is.)
                    sign = 0
                    inside = True
                    for k in range(count):
                        ax, az = points[k][0], points[k][2]
                        bx, bz = points[(k + 1) % count][0], points[(k + 1) % count][2]
                        cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
                        if abs(cross) < 1e-9:
                            continue
                        side = 1 if cross > 0 else -1
                        if sign == 0:
                            sign = side
                        elif side != sign:
                            inside = False
                            break
                    if not inside or sign == 0:
                        continue
                    # How high the face is over the middle of the cell, from its plane.
                    y = points[0][1] - (normal[0] * (cx - points[0][0]) + normal[2] * (cz - points[0][2])) / normal[1]
                    if not (ground + knee < y < ground + head):
                        continue
                set_flag(ix, iz)
                blocked += 1
    return blocked


def block_solids(b, cell, flag_at, height_at, set_flag, walked="._=^", knee=0.5, head=1.5):
    """
    Marks on a walk grid everything that was built and stands in a person's way.

    A box stands in the way of a cell when it reaches above the knee of someone standing on that
    cell and begins below their head: a wall, a counter, a pillar, a post. What is under foot (a
    step, a kerb, the ground itself) and what is overhead (an awning, a roof, a bridge) is not.
    `flag_at(ix, iz)` gives a cell's mark or None outside the district, `height_at` its height in
    metres, `set_flag` blocks it. Returns how many cells it blocked that were open before.
    """
    blocked = 0
    for (x, z, hx, hz, yaw, y0, y1) in b.solids:
        if y1 - y0 < 0.25:
            continue
        # A thin thing (a railing, a fence, a post) must still catch the centre of the cells it crosses.
        grow_x = max(0.12, cell / 2 - hx)
        grow_z = max(0.12, cell / 2 - hz)
        ex, ez = hx + grow_x, hz + grow_z
        reach = math.hypot(ex, ez)
        c, s = math.cos(yaw), math.sin(yaw)
        for iz in range(math.floor((z - reach) / cell), math.ceil((z + reach) / cell)):
            for ix in range(math.floor((x - reach) / cell), math.ceil((x + reach) / cell)):
                flag = flag_at(ix, iz)
                if flag is None or flag not in walked:
                    continue
                dx, dz = (ix + 0.5) * cell - x, (iz + 0.5) * cell - z
                # Into the box's own axes (the turn is about the vertical, as _turn makes it).
                local_x, local_z = dx * c - dz * s, dx * s + dz * c
                if abs(local_x) > ex or abs(local_z) > ez:
                    continue
                ground = height_at(ix, iz)
                if y1 > ground + knee and y0 < ground + head:
                    set_flag(ix, iz)
                    blocked += 1
    return blocked


def bench(b, x, z, yaw, ground=0.14):
    """A bench of wooden slats on metal legs."""
    b.at(x, z)
    b.soft = True
    b.seats.append((x, ground + 0.46, z, yaw))
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
    b.soft = False
    return 0.9


def caixa(b, x, z, yaw, ground=0.14):
    """A caixa: a cash machine in its own small kiosk on the pavement, facing `yaw`. The blue is the bank's, the screen glows."""
    b.at(x, z)
    b.level = FULL
    # The body, a plinth under it, and a roof that reaches out over whoever is using it.
    b.box((x, ground + 0.06, z), (1.0, 0.12, 0.8), "kerb", yaw=yaw, skip_bottom=False)
    b.box((x, ground + 1.1, z), (0.86, 1.96, 0.62), "vanBlue", yaw=yaw)
    b.box(_add((x, ground + 2.16, z), _turn((0.0, 0.0, 0.22), yaw)), (1.1, 0.1, 1.1), "vanWhite", yaw=yaw, skip_bottom=False)
    # The face: a white panel, the screen in it, the keys under it, the slot where the notes come out.
    b.box(_add((x, ground + 1.28, z), _turn((0.0, 0.0, 0.315), yaw)), (0.66, 0.92, 0.02), "vanWhite", yaw=yaw)
    b.box(_add((x, ground + 1.46, z), _turn((0.0, 0.0, 0.33), yaw)), (0.44, 0.34, 0.02), "lamp", yaw=yaw)
    b.box(_add((x, ground + 1.08, z), _turn((0.0, 0.0, 0.36), yaw)), (0.4, 0.05, 0.14), "metal", yaw=yaw, skip_bottom=False)
    b.box(_add((x, ground + 0.92, z), _turn((0.0, 0.0, 0.33), yaw)), (0.3, 0.04, 0.02), "tarShade", yaw=yaw)
    b.level = LIGHT
    b.box((x, ground + 1.1, z), (0.86, 2.1, 0.62), "vanBlue", yaw=yaw)
    b.level = BOTH
    return 0.6


def cantina(b, x, z, yaw, ground=0.14):
    """
    The bairro's cantina (LUANDA_REFERENCE.md, the founder's photographs): a small block shop whose whole front is
    painted yellow, its name band lettered in red and blue along the top, a window behind a white iron grille that
    things are sold through, a barred door standing open, a band of pierced blocks under the roof for air, and the
    popcorn machine on a wooden table outside. Its front faces local +Z, turned by `yaw`. Whoever buys stands at
    the grille. Returns how far it reaches from its middle.
    """
    b.at(x, z)
    wide, deep, high = 4.6, 3.6, 2.9

    def at(lx, ly, lz):
        return _add((x, ground, z), _turn((lx, ly, lz), yaw))

    right = _turn((1.0, 0.0, 0.0), yaw)
    up = (0.0, 1.0, 0.0)
    front = deep / 2
    b.level = BOTH
    # The block itself, yellow all round, and the lower strip darker where feet and rain reach it.
    b.box(at(0.0, high / 2, 0.0), (wide, high, deep), "muralYellow", yaw=yaw, top="roofZinc")
    b.box(at(0.0, 0.3, 0.0), (wide + 0.04, 0.6, deep + 0.04), "awningGold", yaw=yaw, top="awningGold")
    # The name band: red lettering on a white board, underlined in blue (the letters themselves are the board's paint).
    b.rect(at(0.0, high - 0.32, front + 0.03), right, up, wide - 0.2, 0.42, "paintWhite")
    for n in range(5):
        b.rect(at(-wide / 2 + 0.55 + n * 0.82, high - 0.3, front + 0.04), right, up, 0.5, 0.24, "awningRed" if n % 2 == 0 else "signBlue")
    b.rect(at(0.0, high - 0.56, front + 0.04), right, up, wide - 0.4, 0.06, "signBlue")
    # The pierced blocks under the roof: a row of dark holes.
    for n in range(7):
        b.rect(at(-wide / 2 + 0.4 + n * 0.63, high - 0.82, front + 0.03), right, up, 0.36, 0.16, "tarShade")
    # The window things are sold through, lit from inside, and its white grille.
    wx = 0.8
    b.rect(at(wx, 1.45, front + 0.03), right, up, 1.8, 1.05, "windowLit")
    b.level = FULL
    for n in range(7):
        b.box(at(wx - 0.81 + n * 0.27, 1.45, front + 0.07), (0.035, 1.05, 0.035), "paintWhite", yaw=yaw)
    for ly in (1.0, 1.45, 1.9):
        b.box(at(wx, ly, front + 0.07), (1.8, 0.035, 0.035), "paintWhite", yaw=yaw)
    # The sill people lean on to pay, and a few things on show on it.
    b.box(at(wx, 0.95, front + 0.16), (1.9, 0.07, 0.3), "concrete", yaw=yaw, skip_bottom=False)
    for n, colour in enumerate(["awningRed", "signBlue", "paintMint", "awningGold"]):
        b.box(at(wx - 0.6 + n * 0.38, 1.08, front + 0.12), (0.12, 0.2, 0.12), colour, yaw=yaw)
    b.level = BOTH
    # The door, dark inside, and its barred iron gate standing open against the wall.
    dx = -1.35
    b.rect(at(dx, 1.05, front + 0.03), right, up, 0.95, 2.1, "tarShade")
    b.level = FULL
    hinge = at(dx - 0.48, 0.0, front + 0.05)
    out = _turn((0.0, 0.0, 1.0), yaw)
    for n in range(5):
        foot = _add(hinge, _mul(out, 0.08 + n * 0.2))
        b.box(_add(foot, (0.0, 1.05, 0.0)), (0.035, 2.1, 0.035), "metal", yaw=yaw)
    for ly in (0.15, 1.05, 1.95):
        b.box(_add(_add(hinge, _mul(out, 0.48)), (0.0, ly, 0.0)), (0.035, 0.035, 0.9), "metal", yaw=yaw)
    # A step at the door; crates of empties beside it.
    b.box(at(dx, 0.08, front + 0.32), (1.2, 0.16, 0.5), "concrete", yaw=yaw)
    for n in range(3):
        b.box(at(dx - 0.95, 0.18 + n * 0.32, front + 0.5), (0.5, 0.3, 0.36), "awningRed" if n != 1 else "signBlue", yaw=yaw + 0.1 * n, skip_bottom=False)
    # The popcorn machine on its wooden table, on the other side of the window: a glass box on legs, a red roof.
    px = wide / 2 + 0.55
    b.box(at(px, 0.42, front + 0.55), (0.75, 0.06, 0.55), "wood", yaw=yaw, skip_bottom=False)
    for sx in (-0.32, 0.32):
        for sz in (-0.22, 0.22):
            b.box(at(px + sx, 0.2, front + 0.55 + sz), (0.05, 0.4, 0.05), "wood", yaw=yaw)
    b.box(at(px, 0.72, front + 0.55), (0.42, 0.5, 0.36), "windowLit", yaw=yaw, skip_bottom=False)
    b.box(at(px, 1.0, front + 0.55), (0.48, 0.08, 0.42), "awningRed", yaw=yaw, skip_bottom=False)
    b.level = BOTH
    return 2.6


def balcao(b, x, z, yaw, ground=0.14):
    """
    A bank's counter that gives onto the street: three walls and a roof in the bank's blue, a white counter across
    the open side, a lit band over it (no glass: whoever serves is seen from the waist up). Whoever serves stands inside, behind the counter; whoever is served stands
    in the street. Faces `yaw`. Returns how far it reaches from its middle.
    """
    b.at(x, z)
    wide, deep, high = 3.4, 1.9, 2.7
    b.level = FULL
    b.box((x, ground + 0.05, z), (wide + 0.3, 0.1, deep + 0.3), "kerb", yaw=yaw, skip_bottom=False)
    # The back and the two sides.
    b.box(_add((x, ground + high / 2, z), _turn((0.0, 0.0, -deep / 2 + 0.08), yaw)), (wide, high, 0.16), "vanBlue", yaw=yaw)
    for side in (-1.0, 1.0):
        b.box(_add((x, ground + high / 2, z), _turn((side * (wide / 2 - 0.08), 0.0, 0.0), yaw)), (0.16, high, deep), "vanBlue", yaw=yaw)
    # The roof, reaching out over whoever waits; and the band with the bank's light under its edge.
    b.box(_add((x, ground + high + 0.07, z), _turn((0.0, 0.0, 0.35), yaw)), (wide + 0.4, 0.14, deep + 1.0), "vanWhite", yaw=yaw, skip_bottom=False)
    b.box(_add((x, ground + high - 0.28, z), _turn((0.0, 0.0, deep / 2 + 0.02), yaw)), (wide, 0.42, 0.06), "lamp", yaw=yaw)
    # The counter: a white top on a blue front.
    b.box(_add((x, ground + 0.5, z), _turn((0.0, 0.0, deep / 2 - 0.12), yaw)), (wide - 0.32, 1.0, 0.24), "vanBlue", yaw=yaw)
    b.box(_add((x, ground + 1.04, z), _turn((0.0, 0.0, deep / 2 - 0.02), yaw)), (wide - 0.2, 0.08, 0.5), "vanWhite", yaw=yaw, skip_bottom=False)
    b.level = LIGHT
    b.box((x, ground + high / 2, z), (wide, high, deep), "vanBlue", yaw=yaw)
    b.level = BOTH
    return 2.0


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
    """The blue and white van, standing at the kerb with its length along X when yaw is 0 (art/scripts/vehicles.py)."""
    import vehicles
    return vehicles.carrinha(b, x, z, yaw + math.pi / 2, ground)


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


# The paint a street of resettlement houses was delivered in: pale, the skirt a shade deeper. One pair to a row.
REALOJAMENTO = [("wall0", "wall3"), ("wall4", "paintWhite"), ("wall1", "wall3"), ("paintMint", "paintWhite"), ("wall3", "paintWhite"), ("wall2", "wall3")]


def casa_de_realojamento(b, x, z, yaw, rng, ground=0.0, paint=("wall0", "wall3"), width=8.0, depth=6.0, shop=False):
    """
    The house of a resettlement bairro (Zango, and any bairro the State built in rows): one model, the same down the
    whole street. Its front faces local +Z, turned by yaw. A roof of two slopes, its ridge along the street, the
    front slope coming down over a veranda on two columns; a door between two framed windows; the walls in the
    pale paint the row was delivered in (`paint`: the skirt, the wall). What makes each one somebody's is what
    the owner did since: the skirt painted over in a colour of their own, a water tank on its stand, blocks
    stacked for the room to come, a dish, pots on the veranda. `shop`: one window is a hatch with its awning.
    """
    b.at(x, z)
    height = 2.6

    def at(lx, ly, lz):
        return _add((x, ground, z), _turn((lx, ly, lz), yaw))

    right = _turn((1.0, 0.0, 0.0), yaw)
    front = _turn((0.0, 0.0, 1.0), yaw)
    low, high = paint
    if rng.random() < 0.3:
        # Painted over since: every third house or so has a skirt nobody else in the row has.
        low = rng.choice(["zincBlue", "awningTeal", "cloth", "muralPink", "paintMint", "wall2", "awningRed"])
    roof = rng.choice(["roofZinc", "roofZinc", "roofZinc", "zincRust"])
    ridge, eave_f, eave_b, ex = height + 1.15, depth / 2 + 1.3, -depth / 2 - 0.35, width / 2 + 0.3

    b.level = BOTH
    b.box(at(0.0, height / 2, 0.0), (width, height, depth), high, yaw=yaw, top="tarShade")
    b.box(at(0.0, 0.45, 0.0), (width + 0.05, 0.9, depth + 0.05), low, yaw=yaw, top=low)
    # The roof: two slopes from a ridge along the street; the front one reaches out over the veranda.
    b.face([at(-ex, ridge, 0.0), at(ex, ridge, 0.0), at(ex, height + 0.12, eave_f), at(-ex, height + 0.12, eave_f)], roof, toward=(0.0, 1.0, 0.0), two_sided=True)
    b.face([at(-ex, ridge, 0.0), at(ex, ridge, 0.0), at(ex, height + 0.25, eave_b), at(-ex, height + 0.25, eave_b)], roof, toward=(0.0, 1.0, 0.0), two_sided=True)
    # The gables, and the strips of wall under the slopes.
    for side in (-1, 1):
        b.face([at(side * width / 2, height, depth / 2), at(side * width / 2, height, -depth / 2), at(side * width / 2, ridge - 0.04, 0.0)], high, toward=_mul(right, side), two_sided=True)
    b.rect(at(0.0, height + 0.2, depth / 2 + 0.01), right, (0.0, 1.0, 0.0), width, 0.42, high)
    b.rect(at(0.0, height + 0.16, -depth / 2 - 0.01), _mul(right, -1.0), (0.0, 1.0, 0.0), width, 0.34, high)
    # The veranda: a step of concrete the width of the house, and the two columns that hold the roof over it.
    b.box(at(0.0, 0.08, depth / 2 + 0.6), (width, 0.16, 1.2), "concrete", yaw=yaw)
    for side in (-1, 1):
        b.box(at(side * (width / 2 - 0.15), (height + 0.3) / 2, depth / 2 + 1.05), (0.18, height + 0.3, 0.18), high, yaw=yaw)
    # The door, and a framed window either side of it.
    door = rng.choice(["zincBlue", "wood", "metal", "zincRed", "awningTeal"])
    b.rect(at(0.0, 1.21, depth / 2 + 0.035), right, (0.0, 1.0, 0.0), 0.95, 2.1, door)
    for side in (-1, 1):
        wx = side * 2.45
        if shop and side == 1:
            b.rect(at(wx, 1.5, depth / 2 + 0.035), right, (0.0, 1.0, 0.0), 1.9, 1.1, "windowLit")
            b.box(at(wx, 0.98, depth / 2 + 0.2), (2.0, 0.06, 0.34), "wood", yaw=yaw, skip_bottom=False)
            b.box(at(wx, 2.3, depth / 2 + 0.06), (2.1, 0.42, 0.06), "cloth", yaw=yaw)
        else:
            b.rect(at(wx, 1.6, depth / 2 + 0.03), right, (0.0, 1.0, 0.0), 1.24, 1.24, "paintWhite")
            b.rect(at(wx, 1.6, depth / 2 + 0.045), right, (0.0, 1.0, 0.0), 1.0, 1.0, "windowLit" if rng.random() < 0.45 else "window")
    side_x = rng.choice([-1, 1])
    b.rect(at(side_x * (width / 2 + 0.035), 1.6, rng.uniform(-1.0, 1.0)), _mul(front, -side_x), (0.0, 1.0, 0.0), 0.9, 0.9, "window")
    # The water tank on its stand of block, at the side of one house in three: seen from the end of the street.
    if rng.random() < 0.34:
        tx = -side_x * (width / 2 + 0.85)
        b.box(at(tx, 0.7, -depth * 0.25), (1.1, 1.4, 1.1), "blockGrey", yaw=yaw)
        foot = at(tx, 1.4, -depth * 0.25)
        b.tube([foot, _add(foot, (0.0, 1.05, 0.0))], [0.52, 0.5], 8, "zincBlue")
    b.level = FULL
    # Pots on the veranda, blocks stacked for the room to come, the dish.
    for i in range(rng.randint(0, 3)):
        pot = at(rng.choice([-1, 1]) * rng.uniform(0.9, 3.4), 0.16, depth / 2 + rng.uniform(0.5, 1.0))
        b.tube([pot, _add(pot, (0.0, 0.32, 0.0))], [0.14, 0.19], 5, "roof")
        b.gem(_add(pot, (0.0, 0.62, 0.0)), (0.3, 0.36, 0.3), 4, "palmLeaf", rng)
    if rng.random() < 0.35:
        sx = side_x * (width / 2 + 0.7)
        for i in range(rng.randint(2, 4)):
            b.box(at(sx + rng.uniform(-0.1, 0.1), 0.1 + i * 0.2, depth / 2 - 0.6), (0.8, 0.2, 0.4), "blockGrey", yaw=yaw + rng.uniform(-0.1, 0.1), skip_bottom=False)
    if rng.random() < 0.5:
        foot = at(rng.uniform(-width * 0.35, width * 0.35), height + 0.72, -depth * 0.25)
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
        # Held out on an arm from the pole, never hanging in the air beside it.
        b.tube([_add(top, (-lean[0] / 6.0, -1.2, -lean[2] / 6.0)), _add(head, (0.0, 0.05, 0.0))], [0.04, 0.04], 3, "pole", cap=False)
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

