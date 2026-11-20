# Vehicles, made by us (D-0.40). Each is drawn with the kit's Builder at a
# place and a heading, so the same shape stands parked in a district and is
# written alone, at the origin, as the model the game drives.
#
# A vehicle is drawn in its own axes: x to its left, y up, z the way it goes.
# `yaw` turns it about the vertical: 0 faces +Z, as a person does.

import math

from kit import BOTH, FULL, LIGHT


def _place(x, ground, z, yaw):
    c, s = math.cos(yaw), math.sin(yaw)

    def at(lx, ly, lz):
        # Turned about y so that local +Z goes to (sin yaw, cos yaw), the way the game turns a body.
        return (x + lx * c + lz * s, ground + ly, z - lx * s + lz * c)

    return at


def _wheel(b, at, lx, ly, lz, radius, width, sides=12):
    """A tyre with its rim, its axle along the vehicle's x. `lx` is the middle of the tyre."""
    def ring(px, r):
        return [at(px, ly + math.sin(2 * math.pi * k / sides) * r, lz + math.cos(2 * math.pi * k / sides) * r) for k in range(sides)]

    out = 1 if lx > 0 else -1
    inner, outer = ring(lx - out * width / 2, radius), ring(lx + out * width / 2, radius)
    middle = at(lx, ly, lz)
    for k in range(sides):
        n = (k + 1) % sides
        b.face([inner[k], inner[n], outer[n], outer[k]], "tyre", away_from=middle)
    # The wall of the tyre, the rim set into it, and the hub.
    rim, hub = ring(lx + out * width / 2, radius * 0.62), ring(lx + out * (width / 2 - 0.03), radius * 0.6)
    cap = ring(lx + out * (width / 2 - 0.01), radius * 0.2)
    far = at(lx - out * 2.0, ly, lz)
    for k in range(sides):
        n = (k + 1) % sides
        b.face([outer[k], outer[n], rim[n], rim[k]], "tyre", away_from=far)
        b.face([rim[k], rim[n], hub[n], hub[k]], "tyre", away_from=far)
    b.face(hub, "rim", away_from=far)
    b.face(cap, "metal", away_from=at(lx - out * 2.0, ly, lz))
    b.face(inner, "tyre", away_from=at(lx + out * 2.0, ly, lz))


def carrinha(b, x, z, yaw, ground=0.0, lower="vanBlue", upper="vanWhite"):
    """
    The candongueiro: a cab-over van of fifteen seats, blue below and white above, as
    in the founder's photographs. 4.7 m long, 1.7 m wide, a little under 2 m high. The
    sliding door is on its right, the kerb side where traffic keeps to the right.
    """
    b.at(x, z)
    at = _place(x, ground, z, yaw)
    HALF = 0.85
    SILL, SPLIT, GLASS_LOW, GLASS_TOP, ROOF = 0.34, 0.98, 1.14, 1.70, 1.96

    def ring(lz, roof=ROOF, squeeze=1.0, lift=0.0):
        """The body's outline at one place along it: six points up the left side, then down the right."""
        low = min(GLASS_LOW, roof - 0.03)
        top = min(GLASS_TOP, roof - 0.02)
        left = [
            (HALF * 0.93 * squeeze, SILL + lift),
            (HALF * squeeze, min(SPLIT, roof - 0.06)),
            (HALF * squeeze, low),
            (HALF * 0.95 * squeeze, top),
            (HALF * 0.88 * squeeze, roof - 0.07 if roof > GLASS_TOP else roof - 0.01),
            (HALF * 0.62 * squeeze, roof),
        ]
        return [at(px, py, lz) for px, py in left] + [at(-px, py, lz) for px, py in reversed(left)]

    # Along the body, back to front. Between two stations the band of glass is glass or a pillar.
    stations = [
        (-2.33, {"roof": ROOF - 0.05, "squeeze": 0.97, "lift": 0.05}, "pillar"),
        (-2.24, {}, "pillar"),
        (-2.12, {}, "glass"),
        (-1.20, {}, "pillar"),
        (-1.12, {}, "glass"),
        (-0.16, {}, "pillar"),
        (-0.08, {}, "glass"),
        (0.84, {}, "pillar"),
        (0.94, {}, "glass"),
        (1.62, {}, "screen"),
        (2.24, {"roof": 1.12, "squeeze": 0.97}, "nose"),
        (2.35, {"roof": 1.02, "squeeze": 0.93, "lift": 0.06}, None),
    ]
    rings = [ring(lz, **shape) for lz, shape, _ in stations]
    inside = at(0.0, 1.0, 0.0)

    def block(lx, ly, lz, sx, sy, sz, colour):
        corners = [at(lx + dx * sx / 2, ly + dy * sy / 2, lz + dz * sz / 2) for dx in (-1, 1) for dy in (-1, 1) for dz in (-1, 1)]
        centre = at(lx, ly, lz)
        for quad in ((0, 1, 3, 2), (4, 5, 7, 6), (0, 1, 5, 4), (2, 3, 7, 6), (0, 2, 6, 4), (1, 3, 7, 5)):
            b.face([corners[q] for q in quad], colour, away_from=centre)

    # From far off, where a parked van is a few pixels: its two colours, its glass and its wheels, as boxes.
    b.level = LIGHT
    block(0.0, 0.68, 0.0, 1.7, 0.66, 4.66, lower)
    block(0.0, 1.5, -0.3, 1.64, 0.92, 4.0, upper)
    block(0.0, 1.42, -0.25, 1.68, 0.52, 3.6, "vanGlass")
    for lz in (1.52, -1.3):
        block(0.0, 0.33, lz, 1.72, 0.66, 0.66, "tyre")
    b.level = FULL
    for i in range(len(rings) - 1):
        kind = stations[i][2]
        a, c = rings[i], rings[i + 1]
        for k in range(12):
            n = (k + 1) % 12
            # Which band this is, counted up one side: 0 sill to split, 1 split to glass, 2 the glass,
            # 3 glass to the roof's corner, 4 the roof's shoulder, 5 the roof; 11 is the floor.
            band = k if k < 6 else 10 - k if k < 11 else 11
            if band == 11:
                colour = "tarShade"
            elif band == 0:
                colour = lower
            elif band == 2:
                colour = "vanGlass" if kind in ("glass", "screen") else lower if kind == "nose" else upper
            elif kind == "screen" and band in (4, 5):
                colour = "vanGlass"
            elif kind == "nose":
                colour = lower if band < 3 else upper
            else:
                colour = upper
            b.face([a[k], a[n], c[n], c[k]], colour, away_from=inside)

    def cap(points, bands, facing):
        """An end of the body, closed in level strips, each its own colour."""
        for j, colour in enumerate(bands):
            b.face([points[j], points[11 - j], points[10 - j], points[j + 1]], colour, toward=facing)

    ahead = _sub_points(at(0.0, 0.0, 1.0), at(0.0, 0.0, 0.0))
    behind = (-ahead[0], -ahead[1], -ahead[2])
    cap(rings[-1], [lower, lower, lower, lower, lower], ahead)
    cap(rings[0], [lower, upper, "vanGlass", upper, upper], behind)

    def plate(lx, ly, lz, wide, high, colour, facing_z):
        """A small flat piece on the front (facing_z 1) or the back (-1), standing just off the body."""
        b.face([at(lx - wide / 2, ly - high / 2, lz), at(lx + wide / 2, ly - high / 2, lz), at(lx + wide / 2, ly + high / 2, lz), at(lx - wide / 2, ly + high / 2, lz)], colour, toward=ahead if facing_z > 0 else behind)

    # The bumpers, and under the floor between the wheels.
    block(0.0, 0.42, 2.37, 1.62, 0.2, 0.12, "metal")
    block(0.0, 0.42, -2.36, 1.62, 0.2, 0.1, "metal")
    block(0.0, 0.3, 0.0, 1.3, 0.14, 3.0, "tarShade")
    for side in (1, -1):
        # The wheels: a little inside the body's sides, under arches cut dark into it.
        for lz in (1.52, -1.3):
            _wheel(b, at, side * 0.74, 0.33, lz, 0.33, 0.21, 12)
    b.level = FULL
    for side in (1, -1):
        for lz in (1.52, -1.3):
            # The arch: a dark band over the wheel, on the body's side.
            def arc(r, k):
                return at(side * (HALF + 0.004), 0.33 + math.sin(math.pi * k / 6) * r, lz + math.cos(math.pi * k / 6) * r)

            for k in range(6):
                b.face([arc(0.36, k), arc(0.36, k + 1), arc(0.46, k + 1), arc(0.46, k)], "tarShade", toward=_sub_points(at(side, 0.0, 0.0), at(0.0, 0.0, 0.0)))
        # Headlights with their indicators, and the tail lights.
        plate(side * 0.6, 0.78, 2.36, 0.3, 0.17, "lamp", 1)
        plate(side * 0.6, 0.62, 2.36, 0.3, 0.07, "indicator", 1)
        plate(side * 0.7, 0.86, -2.345, 0.16, 0.34, "tailLight", -1)
        # The mirrors, out on their arms.
        block(side * 0.97, 1.3, 2.02, 0.07, 0.24, 0.12, "metal")
        block(side * 0.9, 1.22, 2.06, 0.12, 0.03, 0.03, "metal")
    # The grille, the plates, the wipers' line under the screen.
    plate(0.0, 0.8, 2.36, 0.74, 0.1, "metal", 1)
    plate(0.0, 0.5, 2.44, 0.42, 0.11, "vanWhite", 1)
    plate(0.0, 0.6, -2.42, 0.42, 0.11, "vanWhite", -1)
    plate(0.0, 1.08, -2.345, 0.5, 0.05, "metal", -1)
    # The inside, for whoever rides: a floor, the lining under the windows and overhead, the pillars from
    # within, seats in rows with an aisle by the sliding door, and the driver's place on the left.
    FLOOR, SEAT = 0.44, 0.80
    up, down = (0.0, 1.0, 0.0), (0.0, -1.0, 0.0)
    b.face([at(-0.8, FLOOR, -2.22), at(0.8, FLOOR, -2.22), at(0.8, FLOOR, 2.1), at(-0.8, FLOOR, 2.1)], "tarShade", toward=up)
    b.face([at(-0.62, ROOF - 0.07, -2.22), at(0.62, ROOF - 0.07, -2.22), at(0.62, ROOF - 0.07, 1.6), at(-0.62, ROOF - 0.07, 1.6)], "vanInside", toward=down)
    # The lamp in the ceiling: after dark it is lit, and everyone inside can see everyone else.
    b.face([at(-0.16, ROOF - 0.075, -0.75), at(0.16, ROOF - 0.075, -0.75), at(0.16, ROOF - 0.075, -0.25), at(-0.16, ROOF - 0.075, -0.25)], "lamp", toward=down)
    for side in (1, -1):
        inward = _sub_points(at(-side, 0.0, 0.0), at(0.0, 0.0, 0.0))
        px = side * 0.815
        b.face([at(px, FLOOR, -2.22), at(px, FLOOR, 2.15), at(px, GLASS_LOW, 2.15), at(px, GLASS_LOW, -2.22)], "vanInside", toward=inward)
        for z0, z1 in [(-2.26, -2.12), (-1.20, -1.12), (-0.16, -0.08), (0.84, 0.94)]:
            b.face([at(px, GLASS_LOW, z0), at(px, GLASS_LOW, z1), at(px * 0.96, GLASS_TOP, z1), at(px * 0.96, GLASS_TOP, z0)], "vanInside", toward=inward)
        # Over the windows: on the left, where everyone seated looks, a strip for advertising.
        b.face([at(px * 0.95, GLASS_TOP, -2.2), at(px * 0.95, GLASS_TOP, 1.6), at(side * 0.64, ROOF - 0.08, 1.6), at(side * 0.64, ROOF - 0.08, -2.2)], "adBoard" if side > 0 else "vanInside", toward=inward)
    b.face([at(-0.8, FLOOR, -2.24), at(0.8, FLOOR, -2.24), at(0.8, GLASS_LOW, -2.24), at(-0.8, GLASS_LOW, -2.24)], "vanInside", toward=ahead)
    # Three rows for passengers and the long seat across the back; the aisle is on the right, by the door.
    for lz, lx, wide in [(0.25, 0.22, 1.1), (-0.55, 0.22, 1.1), (-1.3, 0.22, 1.1), (-1.98, 0.0, 1.56)]:
        block(lx, SEAT - 0.06, lz, wide, 0.12, 0.42, "vanSeat")
        block(lx, SEAT + 0.24, lz - 0.24, wide, 0.44, 0.08, "vanSeat")
        block(lx, (FLOOR + SEAT) / 2 - 0.06, lz, wide - 0.2, SEAT - FLOOR - 0.12, 0.3, "metal")
    # The folding seat by the door, where the cobrador rides, and the two seats in front.
    block(-0.55, SEAT - 0.06, -0.55, 0.36, 0.12, 0.4, "vanSeat")
    block(-0.55, SEAT + 0.3, -0.79, 0.36, 0.56, 0.08, "vanSeat")
    for lx in (0.42, -0.42):
        block(lx, SEAT - 0.06, 1.18, 0.5, 0.12, 0.44, "vanSeat")
        block(lx, SEAT + 0.34, 0.93, 0.5, 0.64, 0.08, "vanSeat")
    block(0.0, 0.98, 1.92, 1.56, 0.2, 0.3, "tarShade")
    block(0.42, 1.14, 1.7, 0.34, 0.04, 0.34, "tarShade")
    block(0.42, 1.0, 1.82, 0.05, 0.3, 0.05, "metal")

    # The sliding door on the right: its two edges and the rail it runs on.
    right = _sub_points(at(-1.0, 0.0, 0.0), at(0.0, 0.0, 0.0))
    for lz in (-0.14, 0.9):
        b.face([at(-HALF - 0.004, 0.42, lz - 0.012), at(-HALF - 0.004, 0.42, lz + 0.012), at(-HALF - 0.004, 1.12, lz + 0.012), at(-HALF - 0.004, 1.12, lz - 0.012)], "vanLine", toward=right)
    b.face([at(-HALF - 0.004, 1.02, -1.9), at(-HALF - 0.004, 1.02, -0.14), at(-HALF - 0.004, 1.045, -0.14), at(-HALF - 0.004, 1.045, -1.9)], "vanLine", toward=right)
    for side in (1, -1):
        # The driver's and the front passenger's doors, and a handle on each.
        out = _sub_points(at(side, 0.0, 0.0), at(0.0, 0.0, 0.0))
        px = side * (HALF + 0.004)
        b.face([at(px, 0.5, 0.9 - 0.012), at(px, 0.5, 0.9 + 0.012), at(px, 1.12, 0.9 + 0.012), at(px, 1.12, 0.9 - 0.012)], "vanLine", toward=out)
        b.face([at(px, 1.0, 1.0), at(px, 1.0, 1.14), at(px, 1.035, 1.14), at(px, 1.035, 1.0)], "metal", toward=out)
    b.level = BOTH
    return 2.6


def _box(b, at, lx, ly, lz, sx, sy, sz, colour):
    """A box in the vehicle's own axes."""
    corners = [at(lx + dx * sx / 2, ly + dy * sy / 2, lz + dz * sz / 2) for dx in (-1, 1) for dy in (-1, 1) for dz in (-1, 1)]
    centre = at(lx, ly, lz)
    for quad in ((0, 1, 3, 2), (4, 5, 7, 6), (0, 1, 5, 4), (2, 3, 7, 6), (0, 2, 6, 4), (1, 3, 7, 5)):
        b.face([corners[q] for q in quad], colour, away_from=centre)


def _bar(b, at, a, c, radius, colour, sides=5):
    """A round bar between two points given in the vehicle's own axes."""
    b.tube([at(*a), at(*c)], [radius, radius], sides, colour)


def carro(b, x, z, yaw, ground=0.0, paint="carWhite"):
    """
    A small family car of five doors, the kind half of Luanda drives: 4.05 m long, 1.68 m wide,
    1.45 m high, in whatever colour `paint` is. Drawn as the van is, in stations along its length.
    """
    b.at(x, z)
    at = _place(x, ground, z, yaw)
    HALF = 0.84
    SILL, SPLIT, GLASS_LOW, GLASS_TOP, ROOF = 0.27, 0.62, 0.93, 1.33, 1.45

    def ring(lz, roof=ROOF, squeeze=1.0, lift=0.0):
        low = min(GLASS_LOW, roof - 0.03)
        top = min(GLASS_TOP, roof - 0.02)
        left = [
            (HALF * 0.94 * squeeze, SILL + lift),
            (HALF * squeeze, min(SPLIT, roof - 0.08)),
            (HALF * squeeze, low),
            (HALF * 0.88 * squeeze, top),
            (HALF * 0.82 * squeeze, roof - 0.06 if roof > GLASS_TOP else roof - 0.01),
            (HALF * 0.58 * squeeze, roof),
        ]
        return [at(px, py, lz) for px, py in left] + [at(-px, py, lz) for px, py in reversed(left)]

    stations = [
        (-2.02, {"roof": 0.80, "squeeze": 0.93, "lift": 0.08}, "body"),
        (-1.93, {"roof": 1.00, "squeeze": 0.98}, "screen"),
        (-1.28, {}, "pillar"),
        (-1.16, {}, "glass"),
        (-0.24, {}, "pillar"),
        (-0.16, {}, "glass"),
        (0.60, {}, "screen"),
        (1.20, {"roof": 0.99, "squeeze": 0.98}, "body"),
        (1.90, {"roof": 0.86, "squeeze": 0.95}, "body"),
        (2.03, {"roof": 0.70, "squeeze": 0.90, "lift": 0.08}, None),
    ]
    rings = [ring(lz, **shape) for lz, shape, _ in stations]
    inside = at(0.0, 0.8, 0.0)

    # From far off: its colour, its glass and its wheels, as boxes.
    b.level = LIGHT
    _box(b, at, 0.0, 0.6, 0.0, 1.66, 0.66, 4.0, paint)
    _box(b, at, 0.0, 1.18, -0.35, 1.5, 0.54, 2.3, "vanGlass")
    for lz in (1.3, -1.25):
        _box(b, at, 0.0, 0.3, lz, 1.7, 0.6, 0.6, "tyre")
    b.level = FULL
    for i in range(len(rings) - 1):
        kind = stations[i][2]
        a, c = rings[i], rings[i + 1]
        for k in range(12):
            n = (k + 1) % 12
            band = k if k < 6 else 10 - k if k < 11 else 11
            if band == 11:
                colour = "tarShade"
            elif band == 2 and kind in ("glass", "screen"):
                colour = "vanGlass"
            elif kind == "screen" and band in (4, 5):
                colour = "vanGlass"
            else:
                colour = paint
            b.face([a[k], a[n], c[n], c[k]], colour, away_from=inside)

    ahead = _sub_points(at(0.0, 0.0, 1.0), at(0.0, 0.0, 0.0))
    behind = (-ahead[0], -ahead[1], -ahead[2])
    for points, facing in ((rings[-1], ahead), (rings[0], behind)):
        for j in range(5):
            b.face([points[j], points[11 - j], points[10 - j], points[j + 1]], paint, toward=facing)

    def plate(lx, ly, lz, wide, high, colour, forward):
        b.face([at(lx - wide / 2, ly - high / 2, lz), at(lx + wide / 2, ly - high / 2, lz), at(lx + wide / 2, ly + high / 2, lz), at(lx - wide / 2, ly + high / 2, lz)], colour, toward=ahead if forward else behind)

    _box(b, at, 0.0, 0.36, 2.03, 1.5, 0.18, 0.1, "metal")
    _box(b, at, 0.0, 0.36, -2.02, 1.5, 0.18, 0.1, "metal")
    _box(b, at, 0.0, 0.24, 0.0, 1.2, 0.12, 2.5, "tarShade")
    for side in (1, -1):
        out = _sub_points(at(side, 0.0, 0.0), at(0.0, 0.0, 0.0))
        for lz in (1.3, -1.25):
            _wheel(b, at, side * 0.74, 0.3, lz, 0.3, 0.19, 12)

            def arc(r, k):
                return at(side * (HALF + 0.004), 0.3 + math.sin(math.pi * k / 6) * r, lz + math.cos(math.pi * k / 6) * r)

            for k in range(6):
                b.face([arc(0.33, k), arc(0.33, k + 1), arc(0.41, k + 1), arc(0.41, k)], "tarShade", toward=out)
        plate(side * 0.56, 0.62, 2.036, 0.34, 0.13, "lamp", True)
        plate(side * 0.6, 0.72, -2.026, 0.3, 0.14, "tailLight", False)
        _box(b, at, side * 0.93, 0.98, 0.72, 0.1, 0.08, 0.14, paint)
        # The two doors' edges and their handles.
        px = side * (HALF + 0.004)
        for lz in (-0.2, 0.62):
            b.face([at(px, 0.34, lz - 0.01), at(px, 0.34, lz + 0.01), at(px, 0.92, lz + 0.01), at(px, 0.92, lz - 0.01)], "metal", toward=out)
        for lz in (-0.95, -0.02):
            b.face([at(px, 0.82, lz), at(px, 0.82, lz + 0.13), at(px, 0.85, lz + 0.13), at(px, 0.85, lz)], "metal", toward=out)
    plate(0.0, 0.56, 2.036, 0.6, 0.1, "metal", True)
    plate(0.0, 0.4, 2.085, 0.4, 0.1, "vanWhite", True)
    plate(0.0, 0.52, -2.075, 0.4, 0.1, "vanWhite", False)
    b.level = BOTH
    return 2.3


def mota(b, x, z, yaw, ground=0.0, paint="awningRed"):
    """The moto-táxi: a light motorcycle of 125 cc with a long seat for the passenger behind the rider."""
    b.at(x, z)
    at = _place(x, ground, z, yaw)
    b.level = LIGHT
    _box(b, at, 0.0, 0.55, 0.0, 0.3, 0.6, 1.7, paint)
    b.level = FULL
    for lz in (0.68, -0.62):
        _wheel(b, at, 0.045, 0.3, lz, 0.3, 0.09, 12)
    # The frame, the fork up to the bars, the swing arm.
    for side in (0.07, -0.07):
        _bar(b, at, (side, 0.3, 0.68), (side * 0.9, 0.98, 0.42), 0.022, "rim")
        _bar(b, at, (side, 0.3, -0.62), (side, 0.5, -0.1), 0.02, "metal")
    _bar(b, at, (0.0, 0.5, -0.1), (0.0, 0.86, 0.36), 0.03, "metal")
    _bar(b, at, (0.0, 0.5, -0.1), (0.0, 0.42, 0.3), 0.03, "metal")
    _bar(b, at, (-0.3, 1.02, 0.4), (0.3, 1.02, 0.4), 0.018, "metal")
    for side in (0.3, -0.3):
        _bar(b, at, (side, 1.02, 0.4), (side, 1.0, 0.3), 0.024, "tyre")
    # Engine, tank, the long seat, the lamp, the mudguards, the exhaust, the plate.
    _box(b, at, 0.0, 0.42, 0.08, 0.26, 0.26, 0.36, "metal")
    tank = [at(px, py, pz) for px, py, pz in [(-0.13, 0.72, -0.02), (0.13, 0.72, -0.02), (0.13, 0.72, 0.38), (-0.13, 0.72, 0.38)]]
    crown = [at(px, py, pz) for px, py, pz in [(-0.09, 0.9, 0.02), (0.09, 0.9, 0.02), (0.08, 0.86, 0.36), (-0.08, 0.86, 0.36)]]
    middle = at(0.0, 0.8, 0.18)
    for k in range(4):
        n = (k + 1) % 4
        b.face([tank[k], tank[n], crown[n], crown[k]], paint, away_from=middle)
    b.face(crown, paint, away_from=middle)
    _box(b, at, 0.0, 0.78, -0.4, 0.26, 0.09, 0.8, "vanSeat")
    _box(b, at, 0.0, 0.92, 0.5, 0.16, 0.16, 0.08, "lamp")
    _box(b, at, 0.0, 0.63, 0.72, 0.12, 0.03, 0.42, paint)
    _box(b, at, 0.0, 0.64, -0.66, 0.14, 0.03, 0.5, paint)
    _bar(b, at, (-0.12, 0.32, 0.0), (-0.14, 0.42, -0.7), 0.04, "rim")
    _box(b, at, 0.0, 0.66, -0.93, 0.18, 0.1, 0.02, "tailLight")
    _bar(b, at, (0.0, 0.64, -0.8), (0.0, 0.8, -0.82), 0.012, "metal")
    b.level = BOTH
    return 1.0


def kupapata(b, x, z, yaw, ground=0.0, paint="zincBlue"):
    """
    The kupapata: a motorcycle in front and a load bed on two wheels behind, with benches along its
    sides and a sheet roof on four posts for whoever rides in the back. 3.2 m long, 1.3 m wide.
    """
    b.at(x, z)
    at = _place(x, ground, z, yaw)
    b.level = LIGHT
    _box(b, at, 0.0, 0.75, -0.6, 1.26, 0.7, 1.9, paint)
    _box(b, at, 0.0, 0.6, 1.0, 0.3, 0.7, 1.0, "metal")
    _box(b, at, 0.0, 1.82, -0.45, 1.3, 0.05, 2.3, "roofZinc")
    b.level = FULL
    _wheel(b, at, 0.045, 0.28, 1.28, 0.28, 0.09, 12)
    for side in (1, -1):
        _wheel(b, at, side * 0.56, 0.28, -0.85, 0.28, 0.13, 12)
        _bar(b, at, (side * 0.07, 0.28, 1.28), (side * 0.06, 1.0, 1.0), 0.022, "rim")
    _bar(b, at, (-0.3, 1.04, 0.98), (0.3, 1.04, 0.98), 0.018, "metal")
    for side in (0.3, -0.3):
        _bar(b, at, (side, 1.04, 0.98), (side, 1.02, 0.88), 0.024, "tyre")
    _box(b, at, 0.0, 0.94, 1.08, 0.16, 0.16, 0.08, "lamp")
    _box(b, at, 0.0, 0.62, 1.3, 0.12, 0.03, 0.4, paint)
    # The frame under it all, the engine, the tank and the rider's seat.
    _box(b, at, 0.0, 0.34, 0.1, 0.16, 0.08, 2.2, "metal")
    _box(b, at, 0.0, 0.44, 0.62, 0.28, 0.26, 0.34, "metal")
    _box(b, at, 0.0, 0.78, 0.74, 0.26, 0.16, 0.36, paint)
    _box(b, at, 0.0, 0.78, 0.36, 0.3, 0.09, 0.4, "vanSeat")
    # The bed: a floor, low sides and a front board, a tailgate; benches along the sides.
    _box(b, at, 0.0, 0.52, -0.6, 1.26, 0.06, 1.9, "metal")
    for side in (1, -1):
        _box(b, at, side * 0.615, 0.74, -0.6, 0.03, 0.4, 1.9, paint)
        _box(b, at, side * 0.44, 0.78, -0.62, 0.3, 0.06, 1.7, "wood")
    _box(b, at, 0.0, 0.8, 0.345, 1.26, 0.52, 0.03, paint)
    _box(b, at, 0.0, 0.7, -1.545, 1.26, 0.32, 0.03, paint)
    _box(b, at, 0.0, 0.72, -1.565, 0.3, 0.1, 0.01, "vanWhite")
    for side in (1, -1):
        _box(b, at, side * 0.5, 0.68, -1.565, 0.12, 0.12, 0.01, "tailLight")
        for lz in (0.33, -1.53):
            _bar(b, at, (side * 0.6, 0.94, lz), (side * 0.6, 1.8, lz), 0.02, "metal", 4)
    # The roof: a sheet, a little longer than the bed, reaching forward over the rider.
    _box(b, at, 0.0, 1.82, -0.45, 1.34, 0.04, 2.5, "roofZinc")
    b.level = BOTH
    return 1.8


def _sub_points(a, c):
    return (a[0] - c[0], a[1] - c[1], a[2] - c[2])


# Where a vehicle carries advertising: the slot's name, and its size in metres (wide, high).
# In Angola it is the back window: the van's own phrase is written across it, or an advert covers it.
# The game letters it (render/traffic.ts); `pos` is the middle of the glass in the van's own axes.
VEHICLE_ADS = {
    "candongueiro": [{"id": "vidro-traseiro", "size": [1.36, 0.5], "pos": [0.0, 1.42, -2.336]}],
}

# Where people sit in a vehicle, in its own axes: who, and x, the height of the seat, z.
VEHICLE_SEATS = {
    "candongueiro": [
        {"who": "motorista", "pos": [0.42, 0.80, 1.18]},
        {"who": "cobrador", "pos": [-0.55, 0.80, -0.55]},
        {"who": "passageiro", "pos": [0.52, 0.80, 0.25]},
        {"who": "passageiro", "pos": [0.05, 0.80, -1.3]},
        {"who": "passageiro", "pos": [-0.5, 0.80, -1.98]},
        {"who": "passageiro", "pos": [0.5, 0.80, -1.98]},
        {"who": "jogador", "pos": [-0.1, 0.80, -0.55]},
    ],
}

def _painted(draw, paint):
    return lambda b, x, z, yaw, ground=0.0: draw(b, x, z, yaw, ground, paint)


# A moto-táxi carries one behind the rider, on the long seat; a kupapata carries them on the bench along the side of
# its bed (Task 6.2). The táxi is driven from the left, as Angola drives on the right; whoever hires it sits behind on
# the right.
VEHICLE_SEATS["mota"] = [{"who": "condutor", "pos": [0.0, 0.83, -0.12]}, {"who": "passageiro", "pos": [0.0, 0.84, -0.55]}]
VEHICLE_SEATS["kupapata"] = [{"who": "condutor", "pos": [0.0, 0.83, 0.36]}, {"who": "passageiro", "pos": [0.44, 0.83, -0.5]}]
VEHICLE_SEATS["taxi"] = [{"who": "condutor", "pos": [0.38, 0.52, 0.15]}, {"who": "passageiro", "pos": [-0.38, 0.52, -0.7]}]


def taxi(b, x, z, yaw, ground=0.0):
    """
    A táxi asked for from the Telemóvel (Task 6.2): a white car like any other, with a yellow sign on its roof so that
    whoever called it knows it when it comes.
    """
    carro(b, x, z, yaw, ground, "carWhite")
    at = _place(x, ground, z, yaw)
    _box(b, at, 0.0, 1.5, -0.3, 0.5, 0.12, 0.22, "muralYellow")

VEHICLES = {
    # name: (what draws it, half its width, half its length), in metres
    "candongueiro": (carrinha, 0.85, 2.35),
    "carro-branco": (_painted(carro, "carWhite"), 0.84, 2.03),
    "carro-cinza": (_painted(carro, "carSilver"), 0.84, 2.03),
    "carro-preto": (_painted(carro, "carBlack"), 0.84, 2.03),
    "carro-vermelho": (_painted(carro, "carRed"), 0.84, 2.03),
    "mota": (_painted(mota, "awningRed"), 0.3, 0.95),
    "kupapata": (_painted(kupapata, "zincBlue"), 0.65, 1.6),
    "taxi": (taxi, 0.84, 2.03),
}

__all__ = ["VEHICLES", "carrinha", "BOTH", "FULL", "LIGHT"]
