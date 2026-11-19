# People, made by this project (decision D-0.40): a body with human
# proportions, a face, hands, hair and clothes, written as code so that it
# belongs to the game outright. Not a toy: never a ball for a head.
#
# A person is built standing, arms a little out from the sides (the pose a
# skeleton is fitted to), facing the game's +Z, from rings of points lofted
# into a body and coloured from the world's palette. What makes two people
# different is a `spec`: see `SPECS` in make_people.py.
#
# The head and the neck are one surface (2026-11-19, the founder: "the neck feels like it is not even connected
# with the head"): a grid round the head, denser across the face, whose shape is a measured profile with the brow,
# the eye sockets, the cheekbones, the nose, the lips and the chin raised out of it, and whose lowest row is the
# top of the torso itself. The eyes, brows and lips are laid on that surface, following it.
#
# Measurements are in metres for someone 1.70 m tall and are scaled to the
# person's own height.

import math

from kit import BOTH, _add, _cross, _dot, _mul, _sub, _turn, _unit


def _pow(v, p):
    """A coordinate of a superellipse: p 2 is an ellipse, more is squarer, less is pointier."""
    return math.copysign(abs(v) ** (2.0 / p), v)


def _pchip(xs, ys, x):
    """A smooth curve through the points that never swings past them (monotone cubic)."""
    n = len(xs)
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    i = 0
    while xs[i + 1] < x:
        i += 1
    h = [xs[k + 1] - xs[k] for k in range(n - 1)]
    d = [(ys[k + 1] - ys[k]) / h[k] for k in range(n - 1)]

    def slope(k):
        if k == 0 or k == n - 1:
            return 0.0
        if d[k - 1] * d[k] <= 0:
            return 0.0
        w1, w2 = 2 * h[k] + h[k - 1], h[k] + 2 * h[k - 1]
        return (w1 + w2) / (w1 / d[k - 1] + w2 / d[k])

    m0, m1 = slope(i), slope(i + 1)
    t = (x - xs[i]) / h[i]
    t2, t3 = t * t, t * t * t
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m0 + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m1


def _gauss(*terms):
    return math.exp(-sum(t * t for t in terms))


def _angle_between(a, b):
    """The difference of two bearings in degrees, from -180 to 180."""
    return (a - b + 180.0) % 360.0 - 180.0


def pessoa(b, x, z, yaw, spec, rng, ground=0.0):
    """Builds one person. Returns their height."""
    height = spec.get("height", 1.70)
    s = height / 1.70
    female = spec.get("sex", "f") == "f"
    male = not female
    child = height < 1.45
    build = spec.get("build", 1.0)  # how broad: 0.9 slight, 1.15 heavy
    # A wardrobe piece names its own paints (markers the game repaints); a whole person takes a skin by number.
    skin = spec.get("skin_colour") or f"skin{spec.get('skin', 0)}"
    lip = spec.get("lip_colour") or f"lip{spec.get('skin', 0)}"
    lip_dark = spec.get("lip_dark") or f"lipDark{spec.get('skin', 0)}"
    b.piece = "body"
    hair_colour = spec.get("hair_colour", "hairBlack")
    top, top_colour = spec.get("top", "tshirt"), spec.get("top_colour", "person0")
    bottom, bottom_colour = spec.get("bottom", "trousers"), spec.get("bottom_colour", "jeans")
    bands = spec.get("bands")  # a second colour for a pano's stripes
    shoe = spec.get("shoe", "shoe")
    b.level = BOTH
    # The head and everything on it are made a little larger than life, so that a face reads across a street. The
    # growing fades in up the neck, so the neck stays one with the shoulders below and the head above.
    head_scale = spec.get("head_scale", 1.05)
    pivot = (0.0, 1.536, 0.014)
    growing = [False]

    def T(p):
        if growing[0]:
            f = 1.0 + (head_scale - 1.0) * _blend(p[1], 1.47, 1.53)
            p = (pivot[0] + (p[0] - pivot[0]) * f, pivot[1] + (p[1] - pivot[1]) * f, pivot[2] + (p[2] - pivot[2]) * f)
        return _add((x, ground, z), _turn((p[0] * s, p[1] * s, p[2] * s), yaw))

    def ring(cx, y, cz, rx, rz, n, p=2.0):
        return [T((cx + rx * _pow(math.cos(2 * math.pi * k / n), p), y, cz + rz * _pow(math.sin(2 * math.pi * k / n), p))) for k in range(n)]

    def centre(points):
        return _mul(tuple(sum(p[i] for p in points) for i in range(3)), 1.0 / len(points))

    def loft(rings, colours, two_sided=False):
        for i in range(len(rings) - 1):
            if colours[i] is None:
                continue
            low, high = rings[i], rings[i + 1]
            middle = centre(low + high)
            n = len(low)
            for k in range(n):
                j = (k + 1) % n
                b.face([low[k], low[j], high[j], high[k]], colours[i], away_from=middle, two_sided=two_sided)

    def cap(points, colour, inside):
        b.face(points, colour, away_from=inside)

    def refine(rows, extra=1):
        """
        Puts `extra` rows between each pair, on a curve through them, so a limb swells and
        narrows as a body does and not as a stack of cones. Rows are (height, numbers...,
        colour or nothing); two rows at one height are a step on purpose and are kept.
        """
        def numbers(row):
            return [v for v in row if isinstance(v, (int, float))]

        def rest(row):
            return tuple(v for v in row if not isinstance(v, (int, float)))

        out = []
        for i, row in enumerate(rows):
            out.append(row)
            if i == len(rows) - 1 or rows[i + 1][0] == row[0]:
                continue
            before = rows[i - 1] if i > 0 and rows[i - 1][0] != row[0] else row
            after = rows[i + 1]
            beyond = rows[i + 2] if i + 2 < len(rows) and rows[i + 2][0] != after[0] else after
            p0, p1, p2, p3 = numbers(before), numbers(row), numbers(after), numbers(beyond)
            for step in range(1, extra + 1):
                u = step / (extra + 1)
                between = []
                for a0, a1, a2, a3 in zip(p0, p1, p2, p3):
                    value = 0.5 * ((2 * a1) + (-a0 + a2) * u + (2 * a0 - 5 * a1 + 4 * a2 - a3) * u * u + (-a0 + 3 * a1 - 3 * a2 + a3) * u ** 3)
                    # A curve may swing wide of its points; a body does not swell past them by much.
                    between.append(min(max(value, min(a1, a2) - abs(a2 - a1) * 0.15), max(a1, a2) + abs(a2 - a1) * 0.15))
                out.append(tuple(between) + rest(row))
        return out

    def box(c, size, colour):
        b.box(T(c), (size[0] * s, size[1] * s, size[2] * s), colour, yaw=yaw, skip_bottom=False)

    def limb(rows, place, sides, part_colour_hem):
        """
        Lofts a limb from rows (height, rx, rz, z offset, colour) given from the top down. Two rows at one height
        are a hem: the band between them faces down, the cloth's edge standing off the skin.
        """
        rings = [ring(place(y), y, off, rx, rz, sides) for (y, rx, rz, off, _) in rows]
        for i in range(len(rows) - 1):
            low, high = rings[i + 1], rings[i]
            colour = rows[i][4]
            n = len(low)
            if rows[i][0] == rows[i + 1][0]:
                for k in range(n):
                    j = (k + 1) % n
                    b.face([low[k], low[j], high[j], high[k]], part_colour_hem or colour, toward=(0.0, -1.0, 0.0))
                continue
            middle = centre(low + high)
            for k in range(n):
                j = (k + 1) % n
                b.face([low[k], low[j], high[j], high[k]], colour, away_from=middle)
        return rings

    # ------------------------------------------------------------------ torso
    b.part = "torso"
    if female:
        shoulder, chest, chest_z, waist, waist_z, hip, hip_z = 0.172, 0.150, 0.116, 0.120, 0.090, 0.176, 0.116
        chest_off, hip_off = 0.010, -0.012
    else:
        shoulder, chest, chest_z, waist, waist_z, hip, hip_z = 0.205, 0.180, 0.122, 0.146, 0.104, 0.158, 0.106
        chest_off, hip_off = 0.006, -0.004
    shoulder, chest, waist, hip = shoulder * build, chest * build, waist * build, hip * build
    chest_z, waist_z, hip_z = chest_z * build, waist_z * build, hip_z * build
    # The neck: a man's thick, set behind the jaw; the torso ends at its foot and the head's surface begins there.
    thick = 0.85 + 0.15 * build
    neck_rx, neck_rz, neck_off = (0.054 * thick, 0.050 * thick, -0.008) if female else (0.064 * thick, 0.058 * thick, -0.010)
    neck_y = 1.462
    n = 16
    covered = top != "none"
    long_top = top in ("dress", "vestido", "bata")
    if top == "alcas":
        hem = 0.93 if female else 0.90
    else:
        hem = 0.93 if top in ("tshirt", "shirt", "blusa", "camisa") else 0.86 if top == "camisola" else 0.80
    puff = 1.05 if covered else 1.0
    torso_colour = top_colour if covered else skin
    low_colour = top_colour if top == "bata" else bottom_colour if bottom in ("trousers", "shorts") else (top_colour if long_top else bottom_colour)
    neckline = skin if top in ("alcas", "blusa", "none") else torso_colour
    stations = [
        (0.80, hip * 0.86, hip_z * 0.94, hip_off, 1.0, 2.0, low_colour),
        (0.90, hip, hip_z, hip_off, 1.0, 2.1, low_colour),
        (hem, hip * 0.985, hip_z * 0.99, hip_off * 0.6, 1.0, 2.1, None),
        (hem, hip * 0.985, hip_z * 0.99, hip_off * 0.6, puff + 0.07, 2.1, torso_colour),
        (1.07, waist, waist_z, 0.0, puff, 2.1, torso_colour),
        (1.17, (waist + chest) * 0.5, (waist_z + chest_z) * 0.5, chest_off * 0.5, puff, 2.2 if male else 2.0, torso_colour),
        (1.27, chest, chest_z, chest_off, puff, 2.4 if male else 2.0, torso_colour),
        (1.375, shoulder * 0.93, chest_z * 0.86, 0.004, puff, 2.3 if male else 2.1, torso_colour),
        (1.425, shoulder * 0.70, (0.082 if male else 0.072) * build, -0.006, puff, 2.0, neckline),
        (neck_y, neck_rx, neck_rz, neck_off, 1.0, 2.0, None),
    ]
    stations = refine(stations, 1)

    def chest_shape(y):
        # A woman's bust, a man's chest: forward of the ribs at the front, in two.
        if child:
            return 0.0
        return (0.020 * build * _gauss((y - 1.255) / 0.048)) if female else (0.007 * build * _gauss((y - 1.29) / 0.05))

    def seat_shape(y):
        if child:
            return 0.003 * _gauss((y - 0.87) / 0.06)
        return (0.016 if female else 0.008) * build * _gauss((y - 0.87) / 0.06)

    def body_ring(y, rx, rz, off, grow, p):
        points = []
        for k in range(n):
            a = 2 * math.pi * k / n
            c, sn = math.cos(a), math.sin(a)
            px, pz = rx * grow * _pow(c, p), rz * grow * _pow(sn, p)
            bearing = math.degrees(a)
            if sn > 0:
                pz += chest_shape(y) * (_gauss(_angle_between(bearing, 70) / 22) + _gauss(_angle_between(bearing, 110) / 22))
            else:
                pz -= seat_shape(y) * (_gauss(_angle_between(bearing, 250) / 24) + _gauss(_angle_between(bearing, 290) / 24))
            points.append(T((px, y, off + pz)))
        return points

    torso_rings = [body_ring(*row[:6]) for row in stations]

    def torso_at(y):
        """How wide and deep the body is at a height (its cloth's standing off left out), from its rows."""
        rows = sorted({row[0]: row for row in stations}.values(), key=lambda row: row[0])
        if y <= rows[0][0]:
            return rows[0][1], rows[0][2]
        for low, high in zip(rows, rows[1:]):
            if low[0] <= y <= high[0]:
                u = (y - low[0]) / (high[0] - low[0])
                return low[1] + (high[1] - low[1]) * u, low[2] + (high[2] - low[2]) * u
        return rows[-1][1], rows[-1][2]
    # Straps: a vest's (a man's regata) or a top's, over the shoulders front and back.
    straps = (56.25, 123.75, 236.25, 303.75)
    for i in range(len(stations) - 1):
        colour = stations[i][6]
        low, high = torso_rings[i], torso_rings[i + 1]
        if stations[i][0] == stations[i + 1][0]:
            # A top's hem standing off the body: the cloth's edge, seen from below, closed so nothing shows through.
            for k in range(n):
                j = (k + 1) % n
                b.face([low[k], low[j], high[j], high[k]], torso_colour, toward=(0.0, -1.0, 0.0))
            continue
        if colour is None:
            continue
        middle = centre(low + high)
        y_mid = (stations[i][0] + stations[i + 1][0]) / 2
        for k in range(n):
            j = (k + 1) % n
            paint = colour
            if top == "alcas" and y_mid > 1.355:
                bearing = 360.0 * (k + 0.5) / n
                if female:
                    paint = top_colour if any(abs(_angle_between(bearing, strap)) < 1.0 for strap in straps) else skin
                else:
                    # A man's regata: broad over the shoulders, cut in a scoop at the front and the back.
                    scoop = abs(_angle_between(bearing, 90)) < 24 or abs(_angle_between(bearing, 270)) < 24
                    paint = skin if scoop and y_mid > 1.40 else top_colour
            if i == len(stations) - 2:
                # The last band meets the foot of the neck, which has a corner between each two of the torso's:
                # it is cut to meet every one, so the two are one surface with one seam and no crack.
                between = _mul(_add(high[k], high[j]), 0.5)
                b.face([low[k], between, high[k]], paint, away_from=middle)
                b.face([low[k], low[j], between], paint, away_from=middle)
                b.face([low[j], high[j], between], paint, away_from=middle)
                continue
            b.face([low[k], low[j], high[j], high[k]], paint, away_from=middle)
    cap(torso_rings[0], low_colour, T((0.0, 0.9, 0.0)))

    # A skirt, a pano or a dress hangs from the waist over the legs.
    b.part = "skirt"
    if bottom in ("skirt", "pano") or long_top:
        colour = top_colour if long_top else bottom_colour
        length = 0.50 if bottom == "skirt" or top == "bata" or (long_top and spec.get("short")) else 0.30
        flare = 1.16 if bottom == "pano" else 1.30
        levels = 5
        skirt = []
        for i in range(levels + 1):
            t_ = i / levels
            y = 0.99 - (0.99 - length) * t_
            wide = 1.06 + (flare - 1.06) * min(1.0, t_ * 1.6)
            # It follows the hips, then falls straight.
            rx = (waist + (hip - waist) * min(1.0, t_ * 3.2)) * wide
            rz = (waist_z + (hip_z - waist_z) * min(1.0, t_ * 3.2)) * wide
            # Never inside the body it hangs on: cut clear of the hips and the seat, or the cloth and the body cross
            # each other in teeth where they meet.
            # The widest the body is anywhere within a band of here, so the cloth stays clear between its rows too.
            near = [torso_at(y + d) for d in (-0.14, -0.10, -0.06, -0.03, 0.0, 0.03, 0.06, 0.10, 0.14) if length <= y + d <= 0.99]
            body_rx, body_rz = max(v[0] for v in near), max(v[1] for v in near)
            # Under the top's hem it stays slim, so the hem hangs over it.
            clear = 1.06 if y < hem - 0.01 else 1.015
            rx = max(rx, body_rx * clear)
            rz = max(rz, body_rz * clear)
            # Shaped as the body is, the seat behind included, a little larger all round.
            skirt.append(body_ring(y, rx, rz, hip_off * min(1.0, t_ * 3), 1.0, 2.0))
        skirt.reverse()
        if spec.get("pattern") == "losangos" and bands:
            # Each band of the cloth is cut along its diagonals, the halves in the two colours, the diagonals turning
            # from one band to the next: zigzags that close into diamonds.
            for i in range(len(skirt) - 1):
                low, high = skirt[i], skirt[i + 1]
                middle = centre(low + high)
                for k in range(n):
                    j = (k + 1) % n
                    if (k + i) % 2 == 0:
                        b.face([low[k], low[j], high[j]], colour, away_from=middle, two_sided=True)
                        b.face([low[k], high[j], high[k]], bands, away_from=middle, two_sided=True)
                    else:
                        b.face([low[k], low[j], high[k]], bands, away_from=middle, two_sided=True)
                        b.face([low[j], high[j], high[k]], colour, away_from=middle, two_sided=True)
        else:
            stripes = [colour if (bands is None or i % 2 == 0) else bands for i in range(levels)]
            loft(skirt, stripes, two_sided=True)

    # ------------------------------------------------------------------- legs
    trousers = bottom == "trousers"
    shorts = bottom == "shorts"
    if female:
        leg_rows = [(0.86, 0.084, 0.092, 0.0), (0.70, 0.066, 0.072, 0.004), (0.50, 0.046, 0.050, 0.006), (0.39, 0.050, 0.056, -0.010), (0.25, 0.038, 0.042, -0.006), (0.11, 0.032, 0.037, -0.004), (0.06, 0.034, 0.040, 0.0)]
    else:
        leg_rows = [(0.86, 0.080, 0.090, 0.0), (0.70, 0.068, 0.075, 0.004), (0.50, 0.050, 0.054, 0.006), (0.39, 0.056, 0.062, -0.012), (0.25, 0.043, 0.047, -0.006), (0.11, 0.036, 0.040, -0.004), (0.06, 0.037, 0.042, 0.0)]
    legs_thick = 0.5 + 0.5 * build
    leg_rows = [(y, rx * (build if y > 0.6 else legs_thick), rz * (build if y > 0.6 else legs_thick), off) for (y, rx, rz, off) in leg_rows]
    leg_rows = refine(leg_rows, 1)
    cloth_to = 0.105 if trousers else (0.53 if male else 0.58) if shorts else None

    def trouser(y):
        # Trousers fall nearly straight from the seat to the shoe, and do not follow the calf.
        u = (0.86 - y) / (0.86 - 0.105)
        return (0.086 * build + (0.054 - 0.086 * build) * u) * 1.0, (0.095 * build + (0.058 - 0.095 * build) * u) * 1.0

    for side in (-1, 1):
        b.part = "leg.L" if side > 0 else "leg.R"
        lx = side * hip * 0.50
        rows = []
        for i, (y, rx, rz, off) in enumerate(leg_rows):
            if cloth_to is not None and y > cloth_to:
                if trousers:
                    trx, trz = trouser(y)
                    rows.append((y, max(rx * 1.05, trx), max(rz * 1.05, trz), off * 0.3, bottom_colour))
                else:
                    flare = 1.06 + 0.04 * _blend(y, cloth_to + 0.12, cloth_to)
                    rows.append((y, rx * flare, rz * flare, off, bottom_colour))
            else:
                rows.append((y, rx, rz, off, skin))
            if cloth_to is not None and i + 1 < len(leg_rows) and y > cloth_to >= leg_rows[i + 1][0]:
                ny, nrx, nrz, noff = leg_rows[i + 1]
                t_ = (y - cloth_to) / (y - ny)
                srx, srz, soff = rx + (nrx - rx) * t_, rz + (nrz - rz) * t_, off + (noff - off) * t_
                if trousers:
                    hrx, hrz = trouser(cloth_to)
                    rows.append((cloth_to, max(srx * 1.05, hrx), max(srz * 1.05, hrz), soff * 0.3, bottom_colour))
                else:
                    rows.append((cloth_to, srx * 1.10, srz * 1.10, soff, bottom_colour))
                rows.append((cloth_to, srx, srz, soff, skin))
        limb(rows, lambda y, lx=lx: lx, 10, None)
        # The shoe: a heel and a toe that is lower and longer.
        b.part = "foot.L" if side > 0 else "foot.R"
        if shoe == "chinelo":
            box((lx, 0.012, 0.035), (0.092, 0.024, 0.25), "shoe")
            box((lx, 0.04, 0.03), (0.08, 0.035, 0.21), skin)
            box((lx, 0.062, 0.075), (0.088, 0.014, 0.03), top_colour if top_colour != skin else "person1")
        else:
            box((lx, 0.045, -0.012), (0.094, 0.09, 0.13), shoe)
            box((lx, 0.032, 0.105), (0.098, 0.064, 0.14), shoe)
            box((lx, 0.008, 0.045), (0.102, 0.016, 0.27), "shoeSole")

    # ------------------------------------------------------------------- arms
    sleeve = {"tshirt": 1.25, "shirt": 1.25, "blusa": 1.33, "dress": 1.31, "vestido": 1.31, "long": 0.90, "camisa": 0.95, "camisola": 0.90, "fato": 0.90, "bata": 1.25, "alcas": 9.0, "none": 9.0}[top]
    sleeved = covered and sleeve < 2.0
    if female:
        arm_rows = [(1.425, 0.026, 0.036), (1.385, 0.044, 0.046), (1.31, 0.041, 0.043), (1.225, 0.037, 0.040), (1.145, 0.031, 0.033), (1.075, 0.035, 0.035), (0.985, 0.029, 0.028), (0.895, 0.023, 0.028)]
    else:
        arm_rows = [(1.425, 0.030, 0.040), (1.385, 0.053, 0.055), (1.31, 0.049, 0.051), (1.225, 0.044, 0.047), (1.145, 0.036, 0.038), (1.075, 0.042, 0.041), (0.985, 0.033, 0.031), (0.895, 0.025, 0.030)]
    arm_rows = refine([(y, rx * (build if y > 1.15 else legs_thick), rz * (build if y > 1.15 else legs_thick)) for (y, rx, rz) in arm_rows], 1)
    hand_k = 1.0 if child else (0.96 if female else 1.08)
    for side in (-1, 1):
        b.part = "arm.L" if side > 0 else "arm.R"
        joints = [(side * shoulder * 0.93, 1.405), (side * (shoulder * 0.93 + 0.070), 1.145), (side * (shoulder * 0.93 + 0.118), 0.895)]

        def arm_x(y, joints=joints, side=side):
            (x0, y0), (x1, y1), (x2, y2) = joints
            yy = min(y, 1.405)
            at = x1 + (x0 - x1) * (yy - y1) / (y0 - y1) if yy >= y1 else x2 + (x1 - x2) * (yy - y2) / (y1 - y2)
            # The top of the arm sits inside the shoulder, so cloth runs from one to the other.
            return at - side * 0.03 * max(0.0, (y - 1.36) / 0.065)

        rows = []
        for i, (y, rx, rz) in enumerate(arm_rows):
            if sleeved and y > sleeve:
                # A sleeve stands off the arm, more toward its hem.
                g = 1.07 + 0.12 * _blend(y, sleeve + 0.10, sleeve) if sleeve > 1.0 else 1.07
                rows.append((y, rx * g, rz * g, 0.0, top_colour))
            else:
                rows.append((y, rx, rz, 0.0, skin))
            if sleeved and i + 1 < len(arm_rows) and y > sleeve >= arm_rows[i + 1][0]:
                ny, nrx, nrz = arm_rows[i + 1]
                t_ = (y - sleeve) / (y - ny)
                srx, srz = rx + (nrx - rx) * t_, rz + (nrz - rz) * t_
                hem_grow = 1.20 if sleeve > 1.0 else 1.10
                rows.append((sleeve, srx * hem_grow, srz * hem_grow, 0.0, top_colour))
                rows.append((sleeve, srx, srz, 0.0, skin))
        rings = limb(rows, arm_x, 10, None)
        cap(rings[0], rows[0][4], T((arm_x(1.3), 1.3, 0.0)))
        cap(rings[-1], skin, T((arm_x(1.0), 1.0, 0.0)))
        # The hand: a palm, the fingers together, and a thumb forward of them.
        wx = arm_x(0.895) + side * 0.012
        b.part = "hand.L" if side > 0 else "hand.R"
        hand = refine([(0.895, 0.025, 0.032, 0.0), (0.862, 0.019, 0.045, 0.004), (0.810, 0.017, 0.047, 0.006), (0.758, 0.014, 0.040, 0.004), (0.725, 0.008, 0.025, 0.002)], 1)
        hand.reverse()
        hand_rings = [ring(wx + side * (0.895 - y) * 0.10, 0.895 - (0.895 - y) * hand_k, off * hand_k, rx * hand_k, rz * hand_k, 8) for (y, rx, rz, off) in hand]
        loft(hand_rings, [skin] * (len(hand_rings) - 1))
        cap(hand_rings[0], skin, T((wx, 0.8, 0.0)))
        # The thumb, forward of the fingers and a little apart.
        thumb = [ring(wx - side * 0.004, 0.895 - (0.895 - y) * hand_k, zt * hand_k, 0.010 * hand_k, 0.011 * hand_k, 5) for (y, zt) in [(0.795, 0.058), (0.835, 0.050), (0.865, 0.034)]]
        loft(thumb, [skin, skin])
        cap(thumb[0], skin, T((wx, 0.84, 0.03)))

    # ------------------------------------------------------------- what is worn on the body
    clothes(b, T, ring, loft, top, top_colour, spec, chest, chest_z, waist, waist_z, puff, yaw, neck_rx, neck_rz, neck_off, neck_y)

    # ------------------------------------------------------------------- head
    b.part = "head"
    growing[0] = True
    yc, zc = 1.640, 0.014
    style = spec.get("hair", "baixo")
    hairline = style != "careca"
    # The head from the foot of the neck to the crown, a row at a time: half its width, how far forward of the
    # middle the face is, how far back the skull goes, and how square the front is. A man's jaw is wider.
    jaw = 0.97 if female else 1.05
    wide = 0.965 if female else 1.0
    deep = 0.98 if female else 1.0
    nw, nf1, nf2, nk = (0.049, 0.032, 0.036, 0.068) if female else (0.058, 0.036, 0.040, 0.078)
    nw, nf1, nf2, nk = nw * thick, nf1 * thick, nf2 * thick, nk * thick
    base_f = neck_off + neck_rz - zc
    base_k = neck_rz - neck_off + zc
    chin_n = 1.6 if female else 1.85
    PROFILE = [
        (-0.178, neck_rx, base_f, base_k, 2.0),
        (-0.150, nw, nf1, nk, 2.0),
        (-0.125, nw, nf2, nk, 2.0),
        (-0.118, nw * 1.01, nf2 + 0.002, nk, 2.0),
        (-0.110, 0.060 * wide, 0.048 * deep, nk, 2.0),
        (-0.104, 0.061 * wide * jaw, 0.068 * deep, nk, chin_n),
        (-0.098, 0.062 * wide * jaw, 0.076 * deep, nk, chin_n),
        (-0.090, 0.064 * wide * jaw, 0.080 * deep, nk, chin_n),
        (-0.076, 0.067 * wide * jaw, 0.082 * deep, nk, chin_n + 0.1),
        (-0.058, 0.070 * wide * jaw, 0.084 * deep, 0.081 * deep, 2.0),
        (-0.040, 0.075 * wide, 0.085 * deep, 0.087 * deep, 2.2),
        (-0.021, 0.079 * wide, 0.086 * deep, 0.095 * deep, 2.4),
        (-0.005, 0.080 * wide, 0.087 * deep, 0.100 * deep, 2.4),
        (0.017, 0.081 * wide, 0.088 * deep, 0.102 * deep, 2.4),
        (0.040, 0.081 * wide, 0.088 * deep, 0.102 * deep, 2.4),
        (0.062, 0.077 * wide, 0.085 * deep, 0.098 * deep, 2.2),
        (0.082, 0.069 * wide, 0.077 * deep, 0.090 * deep, 2.1),
        (0.100, 0.055 * wide, 0.062 * deep, 0.074 * deep, 2.0),
        (0.114, 0.030 * wide, 0.034 * deep, 0.044 * deep, 2.0),
    ]
    p_dy = [row[0] for row in PROFILE]
    p_cols = [[row[c] for row in PROFILE] for c in range(1, 5)]
    profiles = {}

    def prof(dy):
        found = profiles.get(dy)
        if found is None:
            found = profiles[dy] = tuple(_pchip(p_dy, col, dy) for col in p_cols)
        return found

    # The nose: low at the root, broad at the wings, its tip round.
    NOSE_H = [(-0.048, 0.0), (-0.044, 0.003), (-0.039, 0.013), (-0.033, 0.023 if male else 0.020), (-0.026, 0.021 if male else 0.018), (-0.014, 0.013), (0.0, 0.008), (0.012, 0.004), (0.024, 0.0)]
    NOSE_W = [(-0.048, 0.012), (-0.040, 0.012), (-0.026, 0.0105), (0.0, 0.0075), (0.024, 0.006)]
    nose_hy, nose_hv = [p[0] for p in NOSE_H], [p[1] for p in NOSE_H]
    nose_wy, nose_wv = [p[0] for p in NOSE_W], [p[1] for p in NOSE_W]
    wing = 0.0175 if female else 0.0188
    brow_h = 0.0028 if female else 0.0052
    lip_u, lip_l = (0.0068, 0.0080) if female else (0.0060, 0.0072)
    chin_h, chin_w = (0.0040, 0.016) if female else (0.0052, 0.022)

    def relief(fx, dy):
        """How far the face stands out of the plain head at this point: brow, sockets, cheeks, nose, lips, chin."""
        ax = abs(fx)
        d = brow_h * _gauss((dy - 0.029) / 0.007) * math.exp(-((fx / 0.052) ** 4))
        d -= 0.0075 * _gauss((ax - 0.031) / 0.016, (dy - 0.011) / 0.0105)
        d += 0.0042 * _gauss((ax - 0.031) / 0.0085, (dy - 0.0105) / 0.0055)
        d += 0.0045 * _gauss((ax - 0.053) / 0.014, (dy + 0.010) / 0.012)
        if -0.05 < dy < 0.03:
            w = _pchip(nose_wy, nose_wv, dy)
            d += _pchip(nose_hy, nose_hv, dy) * _gauss(fx / w)
            d += 0.0100 * _gauss((ax - wing) / 0.0072, (dy + 0.0365) / 0.0068)
        d += 0.0055 * _gauss(fx / 0.034, (dy + 0.060) / 0.020)
        d += lip_u * math.exp(-((fx / 0.022) ** 4)) * _gauss((dy + 0.0535) / 0.0048)
        d -= 0.0018 * math.exp(-((fx / 0.024) ** 4)) * _gauss((dy + 0.0605) / 0.0022)
        d += lip_l * math.exp(-((fx / 0.0195) ** 4)) * _gauss((dy + 0.0675) / 0.0055)
        d -= 0.0022 * _gauss(fx / 0.020, (dy + 0.078) / 0.004)
        d += chin_h * _gauss(fx / chin_w, (dy + 0.091) / 0.008)
        if male and not child:
            d += 0.0035 * _gauss(fx / 0.011, (dy + 0.146) / 0.010)  # the Adam's apple
        return d

    def surf(theta, dy, extra=0.0):
        """A point of the head's surface (local, unscaled) at a bearing (90 degrees is the front) and height."""
        w, f, k, nf = prof(dy)
        c, sn = math.cos(theta), math.sin(theta)
        bx = w * _pow(c, nf if sn >= 0 else 2.0)
        bz = (f * _pow(sn, nf)) if sn >= 0 else (k * _pow(sn, 2.0))
        d = extra
        if sn > 0:
            d += relief(bx, dy) * _blend(sn, 0.0, 0.45)
        r = math.hypot(bx, bz)
        if r > 1e-9:
            bx, bz = bx + bx / r * d, bz + bz / r * d
        return (bx, yc + dy, zc + bz)

    def bearing_at(fx, dy):
        """The bearing on the front of the head where the surface is `fx` across."""
        lo, hi = 0.12, math.pi - 0.12
        for _ in range(40):
            mid = (lo + hi) / 2
            if surf(mid, dy)[0] > fx:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    def on_face(fx, dy, out):
        """The point of the face this far across and this high, standing `out` off it along its normal."""
        return lift(bearing_at(fx, dy), dy, out)

    def lift(th, dy, out):
        """The point of the head at this bearing and height, standing `out` off it along its normal."""
        p = surf(th, dy)
        e = 0.002
        along = _sub(surf(th - e, dy), surf(th + e, dy))
        up = _sub(surf(th, dy + e), surf(th, dy - e))
        normal = _unit(_cross(along, up))
        if _dot(normal, (p[0], 0.0, p[2] - zc)) < 0:
            normal = _mul(normal, -1.0)
        return _add(p, _mul(normal, out))

    # The grid. Its lowest row is the torso's top ring (with a point between each two of it); the columns gather
    # toward the face as the rows rise, where the nose and the mouth need them.
    ROWS = [-0.178, -0.152, -0.130, -0.118, -0.110, -0.104, -0.098, -0.086, -0.078, -0.071, -0.066, -0.0605, -0.055, -0.050, -0.045, -0.040, -0.034, -0.027, -0.019, -0.011, -0.003, 0.005, 0.013, 0.021, 0.030, 0.039, 0.050, 0.066, 0.084, 0.100, 0.114]
    C = 2 * n
    base = []
    for k in range(n):
        a = 2 * math.pi * k / n
        base.append((neck_rx * math.cos(a), neck_y, neck_off + neck_rz * math.sin(a)))
    grid = []
    for r, dy in enumerate(ROWS):
        if r == 0:
            row = []
            for j in range(C):
                one, two = base[(j // 2) % n], base[((j + 1) // 2) % n]
                row.append(one if j % 2 == 0 else _mul(_add(one, two), 0.5))
            grid.append(row)
            continue
        gather = _blend(dy, -0.178, -0.12)
        row = []
        for j in range(C):
            a = 2 * math.pi * j / C
            phi = (a - math.pi / 2 + math.pi) % (2 * math.pi) - math.pi
            phi_w = phi - 0.55 * math.sin(phi)
            row.append(surf(math.pi / 2 + phi + (phi_w - phi) * gather, dy))
        grid.append(row)

    # The hair of the head, cut close: its line along the brow, back at the temples, a sideburn in front of the ear,
    # over the ear and down to the nape.
    if female:
        # A woman's runs round above the ear, with no sideburn.
        HAIRLINE = [(0, 0.062), (30, 0.060), (52, 0.052), (66, 0.040), (78, 0.028), (92, 0.025), (110, 0.025), (121, 0.004), (140, -0.040), (180, -0.054)]
    else:
        HAIRLINE = [(0, 0.060), (30, 0.058), (52, 0.050), (66, 0.034), (75, 0.014), (80, -0.004), (85, -0.004), (89, 0.022), (110, 0.026), (121, 0.004), (140, -0.040), (180, -0.054)]
    hl_at, hl_dy = [h[0] for h in HAIRLINE], [h[1] for h in HAIRLINE]

    def under_hair(points):
        # Wholly above the hairline, where the hair covers it: painted as hair, so nothing of it can show through.
        if not hairline:
            return False
        for p in points:
            bearing = math.degrees(math.atan2(abs(p[0]), p[2] - zc))
            if p[1] - yc < _pchip(hl_at, hl_dy, bearing) + 0.004:
                return False
        return True

    for r in range(len(grid) - 1):
        for j in range(C):
            k = (j + 1) % C
            quad = (grid[r][j], grid[r + 1][j], grid[r + 1][k], grid[r][k])
            b.face([T(p) for p in quad], hair_colour if under_hair(quad) else skin)
    crown = (0.0, yc + 0.121, zc - 0.004)
    for j in range(C):
        k = (j + 1) % C
        b.face([T(grid[-1][j]), T(grid[-1][k]), T(crown)], hair_colour if hairline else skin, away_from=T((0.0, yc, zc)))

    def shell(bearings, low, high, rows, out, colour, close=False, crown_point=None, bumpy=False):
        """
        A skin of hair over the head between two lines (each a height for every bearing, in degrees from the
        front), standing `out` off it: its edge follows the line exactly, as a cut hairline or a trimmed beard does.
        """
        lines = []
        for r in range(rows + 1):
            t_ = r / rows
            line = []
            for phi in bearings:
                dy = low(abs(phi)) + (high(abs(phi)) - low(abs(phi))) * t_
                if bumpy:
                    # Hair is thick in the middle and thin to its edges, and uneven: it is grown, not painted.
                    edge_in = min(1.0, min(t_, 1 - t_) * 4.0, (abs(abs(phi) - bearings[-1]) if not close else 90.0) / 12.0)
                    a = math.radians(phi)
                    here = out * (0.35 + 0.65 * edge_in) * (1 + 0.35 * math.sin(11 * a + 9 * t_) * math.sin(5.0 * math.pi * t_ + 3 * a) + 0.30 * math.sin(29 * a + 17 * t_) * math.sin(23 * t_ - 7 * a))
                else:
                    here = out
                line.append(lift(math.pi / 2 + math.radians(phi), dy, here))
            lines.append(line)
        count = len(bearings) if close else len(bearings) - 1
        for r in range(rows):
            for j in range(count):
                k = (j + 1) % len(bearings)
                b.face([T(p) for p in (lines[r][j], lines[r + 1][j], lines[r + 1][k], lines[r][k])], colour)
        if crown_point is not None:
            top_line = lines[-1]
            for j in range(len(top_line)):
                k = (j + 1) % len(top_line)
                b.face([T(top_line[j]), T(top_line[k]), T(crown_point)], colour, away_from=T((0.0, yc, zc)))

    if hairline:
        around = []
        for j in range(C):
            a = 2 * math.pi * j / C
            phi = (a - math.pi / 2 + math.pi) % (2 * math.pi) - math.pi
            around.append(math.degrees(phi - 0.55 * math.sin(phi)))
        shell(around, lambda at: _pchip(hl_at, hl_dy, at), lambda at: 0.114, 7, 0.0026, hair_colour, close=True, crown_point=(0.0, yc + 0.1236, zc - 0.004))

    # The face's paint, laid on its surface: eyes, brows, lips.
    forward = _turn((0.0, 0.0, 1.0), yaw)

    def fan(outline, colour, out, flat=False):
        points = [on_face(fx, fy, out) for fx, fy in outline]
        middle = on_face(sum(o[0] for o in outline) / len(outline), sum(o[1] for o in outline) / len(outline), out)
        if flat:
            front_z = max(p[2] for p in points + [middle])
            points = [(p[0], p[1], front_z) for p in points]
            middle = (middle[0], middle[1], front_z)
        for i in range(len(points)):
            b.face([T(middle), T(points[i]), T(points[(i + 1) % len(points)])], colour, toward=forward)

    def strip(lower, upper, colour, out, rows=1):
        # Laid in rows across its width as well, so that paint on a curved lip follows it and is not swallowed by it.
        lines = []
        for r in range(rows + 1):
            t_ = r / rows
            lines.append([on_face(lo[0] + (hi[0] - lo[0]) * t_, lo[1] + (hi[1] - lo[1]) * t_, out) for lo, hi in zip(lower, upper)])
        for r in range(rows):
            low, high = lines[r], lines[r + 1]
            for i in range(len(low) - 1):
                b.face([T(low[i]), T(low[i + 1]), T(high[i + 1]), T(high[i])], colour, toward=forward)

    iris = spec.get("eye", "eyeBrown")
    for side in (-1, 1):
        ex, ey, ew = side * 0.031, 0.0110, 0.0122

        def lid_top(u):
            t_ = max(-1.0, min(1.0, u / ew))
            return 0.0047 * (1 - t_ * t_) ** 0.7 + 0.0009 * t_

        def lid_low(u):
            t_ = max(-1.0, min(1.0, u / ew))
            return -0.0037 * (1 - t_ * t_) ** 0.85 + 0.0009 * t_

        def at(u, v):
            # Eye-local to face: u runs from the inner corner (negative) to the outer one.
            return (ex + side * u, ey + v)

        steps = [-ew + 2 * ew * i / 9 for i in range(10)]
        white = [at(u, lid_top(u)) for u in steps] + [at(u, lid_low(u)) for u in reversed(steps[1:-1])]
        fan(white, "eyeWhite", 0.0010)
        # The iris and the pupil, cut by the lids: a dark eye shows little white.
        for radius, paint, out in ((0.0060, iris, 0.0016), (0.0026, "eyeDark", 0.0021)):
            ring_points = []
            for i in range(14):
                a = 2 * math.pi * i / 14
                u = -0.0004 + radius * math.cos(a)
                v = 0.0004 + radius * math.sin(a)
                v = min(max(v, lid_low(u) + 0.0002), lid_top(u) - 0.0002)
                ring_points.append(at(u, v))
            fan(ring_points, paint, out)
        # The upper lid's dark line, thicker at the outer corner and out past it a little.
        line = [-ew * 0.92 + (ew * 2.08) * i / 9 for i in range(10)]

        def lid_edge(u):
            return lid_top(u) if u <= ew else lid_top(ew) + (u - ew) * 0.35

        strip([at(u, lid_edge(u) - 0.0003) for u in line], [at(u, lid_edge(u) + 0.0010 + 0.0008 * max(0.0, u / ew)) for u in line], "eyeDark", 0.0026)
        # The brow: an arch over the eye, heavier toward the nose.
        bx0, by0 = side * 0.032, (0.0300 if female else 0.0280)
        arch = [-0.016 + 0.033 * i / 8 for i in range(9)]
        heavy = 0.0040 if male else 0.0030

        def brow_mid(u):
            return 0.0040 * (1 - ((u - 0.002) / 0.019) ** 2)

        strip([(bx0 + side * u, by0 + brow_mid(u) - heavy * (0.9 - 0.55 * (u + 0.016) / 0.033) / 2) for u in arch], [(bx0 + side * u, by0 + brow_mid(u) + heavy * (0.9 - 0.55 * (u + 0.016) / 0.033) / 2) for u in arch], spec.get("brow_colour", hair_colour), 0.0016)

    # The ears: a rim standing off the head behind the cheek, the bowl inside it, the lobe below.
    for side in (-1, 1):
        w_ear = prof(-0.008)[0] * 0.985
        tilt = math.radians(14)
        rim, root = [], []
        for i in range(12):
            a = 2 * math.pi * i / 12
            oz, oy = 0.0145 * math.cos(a), 0.0285 * math.sin(a) - 0.002 * max(0.0, -math.sin(a))
            rz_, ry_ = oz * math.cos(tilt) + oy * math.sin(tilt), -oz * math.sin(tilt) + oy * math.cos(tilt)
            stand = 0.003 + 0.007 * max(0.0, -math.cos(a)) + 0.003 * max(0.0, math.sin(a))
            root.append((side * (w_ear - 0.004), yc - 0.008 + ry_ * 0.92, zc - 0.016 + rz_ * 0.92))
            rim.append((side * (w_ear + stand), yc - 0.008 + ry_, zc - 0.016 + rz_ * 1.04))
        inside_head = T((side * (w_ear - 0.03), yc - 0.008, zc - 0.016))
        for i in range(12):
            j = (i + 1) % 12
            b.face([T(root[i]), T(root[j]), T(rim[j]), T(rim[i])], skin, away_from=inside_head)
        bowl = T((side * (w_ear - 0.002), yc - 0.010, zc - 0.012))
        for i in range(12):
            j = (i + 1) % 12
            b.face([T(rim[i]), T(rim[j]), bowl], skin, away_from=inside_head)

    # The lips, painted over their shape: the upper darker, with its bow; the lower full. A smile lifts the corners.
    rise = 0.0035 if spec.get("smile") else 0.0006
    mw = 0.0245 if spec.get("smile") else 0.0225
    across = [-mw + 2 * mw * i / 12 for i in range(13)]

    def mouth(u):
        return -0.0605 + rise * (u / mw) ** 4

    def upper_edge(u):
        t_ = min(1.0, abs(u) / mw)
        return -0.0605 + 0.0098 * (1 - t_ * t_) ** 0.6 - 0.0014 * _gauss(u / 0.0042) + rise * t_ ** 4 * (1 - t_)

    def lower_edge(u):
        t_ = min(1.0, abs(u) / mw)
        return -0.0605 - 0.0118 * (1 - t_ * t_) ** 0.75 + rise * t_ ** 4

    strip([(u, mouth(u)) for u in across], [(u, upper_edge(u)) for u in across], lip_dark, 0.0011, rows=4)
    strip([(u, lower_edge(u)) for u in across], [(u, mouth(u)) for u in across], lip, 0.0011, rows=4)
    # The nostrils, under the tip and between the wings.
    for side in (-1, 1):
        fan([(side * (0.0090 + 0.0030 * math.cos(2 * math.pi * i / 8)), -0.0420 + 0.0012 * math.sin(2 * math.pi * i / 8)) for i in range(8)], lip_dark, 0.0008)

    # What is worn on the face and the ears. Each is a piece of its own, so that the wardrobe can offer it apart.
    face_hair = spec.get("beard_colour", hair_colour)
    if spec.get("beard"):
        # A short beard: a skin of hair over the chin, the jaw and the cheeks up to the hair, the lips left open.
        b.piece = "barba"

        BEARD_TOP = [(0, -0.0795), (12, -0.0795), (20, -0.071), (30, -0.067), (50, -0.068), (70, -0.073), (84, -0.082)]
        BEARD_LOW = [(0, -0.121), (40, -0.119), (70, -0.108), (84, -0.094)]
        bt_at, bt_dy = [p[0] for p in BEARD_TOP], [p[1] for p in BEARD_TOP]
        bl_at, bl_dy = [p[0] for p in BEARD_LOW], [p[1] for p in BEARD_LOW]
        b.flat = True
        shell([-84 + 168 * i / 27 for i in range(28)], lambda at: _pchip(bl_at, bl_dy, at), lambda at: _pchip(bt_at, bt_dy, at), 8, 0.0042, face_hair, bumpy=True)
        b.flat = False
    if spec.get("beard") or spec.get("bigode"):
        # The moustache: over the upper lip, full in the middle, its ends down to the corners of the mouth.
        b.piece = "bigode"
        span = [-0.027 + 0.054 * i / 12 for i in range(13)]
        strip([(u, -0.0498 - 0.0075 * (abs(u) / 0.027) ** 3) for u in span], [(u, -0.0420 - 0.0040 * (abs(u) / 0.027) ** 2) for u in span], face_hair, 0.0022, rows=2)
    if spec.get("brincos"):
        # A hoop in each ear.
        b.piece = "brincos"
        for side in (-1, 1):
            w_ear = prof(-0.008)[0] * 0.985
            hoop = [T((side * (w_ear + 0.006), yc - 0.044 + math.sin(2 * math.pi * k / 7) * 0.012, zc - 0.012 + math.cos(2 * math.pi * k / 7) * 0.012)) for k in range(8)]
            b.tube(hoop, [0.0032 * s] * 8, 4, spec["brincos"], cap=False)
    if spec.get("oculos"):
        # Dark glasses: two lenses in their frames, flat across the eyes, the bridge, and the arms back to the ears.
        b.piece = "oculos"
        frame, lens = spec["oculos"], "vanGlass"
        for side in (-1, 1):
            ex = side * 0.032
            fan([(ex - 0.021, -0.002), (ex + 0.021, -0.002), (ex + 0.022, 0.024), (ex - 0.022, 0.024)], frame, 0.0125, flat=True)
            fan([(ex - 0.0175, 0.0015), (ex + 0.0175, 0.0015), (ex + 0.0185, 0.0205), (ex - 0.0185, 0.0205)], lens, 0.0138, flat=True)
            hinge = on_face(side * 0.054, 0.02, 0.012)
            b.tube([T(hinge), T((side * (prof(0.014)[0] + 0.002), yc + 0.014, zc - 0.006))], [0.003 * s, 0.003 * s], 4, frame)
        fan([(-0.011, 0.015), (0.011, 0.015), (0.011, 0.021), (-0.011, 0.021)], frame, 0.0135, flat=True)
    b.piece = "body"

    # ------------------------------------------------------------------- hair
    b.piece = "hair"

    def scalp(angle, dy, grow=1.03):
        """A point on the head at this bearing (0 is the person's left, 90 the front) and height."""
        p = surf(angle, dy)
        return (p[0] * grow, p[1], zc + (p[2] - zc) * grow)
    def hair_volume(edge, depth, cols=32, rows=8, lumps=0.0, lump_n=7):
        """
        Hair standing off the head as a mass: from its edge (a height for every bearing, in degrees from the front)
        up over the crown, `depth` thick (by bearing, and by how far up it is, 0 at the edge and 1 at the crown),
        and lumpy where the hair curls. Its edge is closed down to the scalp, so it has a thickness all round.
        """
        bearings = [-180 + 360 * i / cols for i in range(cols)]
        lines = [[lift(math.pi / 2 + math.radians(phi), edge(abs(phi)), 0.0006) for phi in bearings]]
        for r in range(rows + 1):
            t_ = r / rows
            line = []
            for phi in bearings:
                e = edge(abs(phi))
                out = depth(abs(phi), t_)
                if lumps:
                    a = math.radians(phi)
                    out *= 1 + lumps * math.sin(lump_n * a + 7.0 * t_ + 1.3) * math.sin(5.0 * math.pi * t_ + lump_n * 0.5 * a)
                line.append(lift(math.pi / 2 + math.radians(phi), e + (0.114 - e) * t_, out))
            lines.append(line)
        for r in range(len(lines) - 1):
            for j in range(cols):
                k = (j + 1) % cols
                b.face([T(p) for p in (lines[r][j], lines[r + 1][j], lines[r + 1][k], lines[r][k])], hair_colour)
        top_point = (0.0, yc + 0.121 + depth(0.0, 1.0) * 0.95, zc - 0.006)
        for j in range(cols):
            k = (j + 1) % cols
            b.face([T(lines[-1][j]), T(lines[-1][k]), T(top_point)], hair_colour, away_from=T((0.0, yc, zc)))

    def ease(u):
        u = min(1.0, max(0.0, u))
        return u * u * (3 - 2 * u)

    b.flat = style in ("baixo", "afro", "cachos", "galo")
    if style == "baixo":
        # Hair cut short, the way most men and many women in Luanda wear it: a mass of tight curls a finger thick
        # over the crown, thinner to its lined-up edge, and clumps of curls standing out of it so it reads as hair.
        def short_depth(at, t_):
            return 0.0022 + 0.0080 * ease(t_ / 0.3) + 0.0025 * t_

        hair_volume(lambda at: _pchip(hl_at, hl_dy, at), short_depth, cols=34, rows=7, lumps=0.40, lump_n=15)
        for t_, count in ((0.16, 17), (0.34, 16), (0.52, 14), (0.70, 11), (0.88, 6)):
            for i in range(count):
                phi = -180 + 360 * (i + 0.5 * (count % 2) + rng.uniform(-0.25, 0.25)) / count
                e = _pchip(hl_at, hl_dy, abs(phi))
                dy = e + (0.114 - e) * min(0.97, t_ + rng.uniform(-0.05, 0.05))
                th = math.pi / 2 + math.radians(phi)
                depth_here = short_depth(abs(phi), t_)
                base = lift(th, dy, depth_here * 0.45)
                normal = _unit(_sub(lift(th, dy, depth_here + 0.01), base))
                crownward = _unit(_sub(lift(th, min(0.118, dy + 0.012), depth_here), lift(th, dy, depth_here)))
                sideways = _unit(_cross(normal, crownward))
                twist = rng.uniform(-0.5, 0.5)
                way = _unit(_add(_add(_mul(normal, 0.85), _mul(crownward, 0.35)), _mul(sideways, twist * 0.3)))
                # A knot of coils: short and round, not a spike.
                radius = 0.0098 + rng.uniform(-0.0015, 0.0015)
                length = radius * rng.uniform(0.8, 1.05)
                swell = _add(base, _mul(way, length * 0.5))
                tip = _add(base, _mul(way, length))
                b.tube([T(base), T(swell), T(tip)], [radius * 0.9 * s, radius * s, radius * 0.45 * s], 5, hair_colour, cap=True)
    elif style == "afro":
        # An afro: a round mass of tight curls, a ball larger than the head and higher than it, rising from a soft
        # edge round the face; lumpy where the curls gather.
        size = spec.get("afro", 1.0)
        AFRO_EDGE = [(0, 0.058), (40, 0.052), (62, 0.040), (78, 0.030), (92, 0.028), (110, 0.025), (125, 0.0), (150, -0.035), (180, -0.048)]
        ae_at, ae_dy = [p[0] for p in AFRO_EDGE], [p[1] for p in AFRO_EDGE]
        ball = (0.0, yc + 0.030 + 0.012 * size, zc - 0.016)
        radii = (0.120 * size, 0.118 * size, 0.128 * size)
        cols, rows = 34, 10
        lines = []
        for r in range(rows + 1):
            t_ = r / rows
            line = []
            for i in range(cols):
                phi = -180 + 360 * i / cols
                e = _pchip(ae_at, ae_dy, abs(phi))
                dy = e + (0.118 - e) * t_
                th = math.pi / 2 + math.radians(phi)
                on_head = lift(th, dy, 0.003)
                way = _unit(_sub(on_head, ball))
                reach = 1.0 / math.sqrt((way[0] / radii[0]) ** 2 + (way[1] / radii[1]) ** 2 + (way[2] / radii[2]) ** 2)
                a = math.radians(phi)
                reach *= 1 + 0.10 * math.sin(9 * a + 11 * t_) * math.sin(6.0 * math.pi * t_ + 4.5 * a) + 0.05 * math.sin(19 * a - 23 * t_) * math.sin(13.0 * t_ + 2.0 * a)
                outer = _add(ball, _mul(way, reach))
                gap = _dot(_sub(outer, on_head), way)
                if gap < 0.006:
                    outer = _add(on_head, _mul(way, 0.006))
                rise = ease(t_ / 0.38)
                line.append(_add(on_head, _mul(_sub(outer, on_head), 0.18 + 0.82 * rise)))
            lines.append(line)
        edge_line = [lift(math.pi / 2 + math.radians(-180 + 360 * i / cols), _pchip(ae_at, ae_dy, abs(-180 + 360 * i / cols)), 0.0006) for i in range(cols)]
        lines.insert(0, edge_line)
        for r in range(len(lines) - 1):
            for j in range(cols):
                k = (j + 1) % cols
                b.face([T(p) for p in (lines[r][j], lines[r + 1][j], lines[r + 1][k], lines[r][k])], hair_colour)
        top_point = _add(ball, (0.0, radii[1], 0.0))
        for j in range(cols):
            k = (j + 1) % cols
            b.face([T(lines[-1][j]), T(lines[-1][k]), T(top_point)], hair_colour, away_from=T(ball))
    elif style in ("trancas", "dreads"):
        b.part = "hairfall"
        strand = 0.0085 if style == "trancas" else 0.0115
        count = 24 if style == "trancas" else 22
        reach = spec.get("hair_length", 1.20 if style == "trancas" else 1.38)
        for i in range(count):
            # Round the back of the head from one temple to the other.
            angle = math.radians(152) + math.radians(236) * i / (count - 1)
            forward = abs(math.cos(angle)) > 0.82  # the ones at the temples fall in front of the shoulder
            start = scalp(angle, 0.05 + 0.03 * rng.random(), 1.02)
            middle = scalp(angle, -0.075, 1.12)
            sway = rng.uniform(-0.012, 0.012)
            if reach >= 1.44:
                # Short locs, a man's: they hang round the head to the nape and the jaw, and stop there.
                end = (middle[0] * 1.08 + sway, reach + rng.uniform(-0.02, 0.02), zc + (middle[2] - zc) * 1.06)
                b.tube([T(start), T(middle), T(end)], [strand * s, strand * 1.05 * s, strand * 0.8 * s], 6, hair_colour, cap=True)
                continue
            end_y = reach + rng.uniform(-0.07, 0.05)
            shoulder_z = 0.05 if forward else -0.085
            rest = (start[0] * 1.55 + sway, 1.43, shoulder_z + rng.uniform(-0.01, 0.01))
            fall = (rest[0] + sway, end_y, shoulder_z + (0.03 if forward else -0.02))
            b.tube([T(start), T(middle), T(rest), T(fall)], [strand * s, strand * 1.05 * s, strand * s, strand * 0.75 * s], 6, hair_colour, cap=True)
        if style == "dreads" and reach < 1.44:
            for i in range(5):
                angle = math.radians(20 + 140 * i / 4)
                start, fall = scalp(angle, 0.085, 1.0), scalp(angle, 0.03 - 0.03 * rng.random(), 1.1)
                b.tube([T(start), T(fall)], [strand * s, strand * 0.85 * s], 6, hair_colour, cap=True)
    elif style == "puxinho":
        b.gem(T((0.0, yc + 0.105, zc - 0.062)), (0.05 * s, 0.05 * s, 0.05 * s), 6, hair_colour, rng, rough=0.08)
    elif style == "lenco":
        cloth = spec.get("lenco", "cloth")
        # Tied high on the forehead, clear of the brows.
        shell = [(0.040, 0.088, 0.106), (0.072, 0.091, 0.106), (0.110, 0.074, 0.086), (0.142, 0.040, 0.046)]
        wrap = [ring(0.0, yc + dy, zc - 0.008, rx, rz, 14) for (dy, rx, rz) in shell]
        loft(wrap, [cloth] * 3)
        cap(wrap[-1], cloth, T((0.0, yc, zc)))
        b.gem(T((0.0, yc + 0.135, zc + 0.03)), (0.045 * s, 0.035 * s, 0.04 * s), 5, cloth, rng, rough=0.1)
    elif style == "galo":
        # The crest: the sides cut down to the skin, and along the top from the brow to the nape a ridge
        # of curls standing up, often dyed (founder's photograph, 2026-11-15).
        ridge = [(0.092, 0.082, 0.9), (0.135, 0.052, 1.05), (0.158, 0.012, 1.12), (0.158, -0.032, 1.1), (0.138, -0.072, 1.0), (0.1, -0.102, 0.9), (0.052, -0.116, 0.78), (0.004, -0.112, 0.62)]
        # Its body: a mass along the top of the head, and knots of coils standing out of it, up and to each side.
        spine = [(0.0, yc + dy - 0.018 * size, zc + dz * 0.9) for dy, dz, size in ridge]
        b.tube([T(p) for p in spine], [0.034 * size * s for _, _, size in ridge], 8, hair_colour, cap=True)
        for (dy, dz, size), at in zip(ridge, spine):
            out_way = _unit(_sub(at, (0.0, yc, zc)))
            for lean in (-1.0, 0.0, 1.0):
                way = _unit(_add(_add(_mul(out_way, 0.85), (lean * 0.55, 0.0, 0.0)), (rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1))))
                radius = 0.017 * size * rng.uniform(0.85, 1.1)
                base = _add(at, _mul(way, 0.022 * size))
                b.tube([T(base), T(_add(base, _mul(way, radius * 0.5))), T(_add(base, _mul(way, radius * 0.95)))], [radius * 0.9 * s, radius * s, radius * 0.45 * s], 5, hair_colour, cap=True)
    elif style == "cachos":
        # A full head of loose curls, out past the ears and down to the jaw, the face left open.
        CURLS_EDGE = [(0, 0.058), (45, 0.050), (62, 0.036), (76, 0.010), (86, -0.040), (100, -0.090), (180, -0.100)]
        ce_at, ce_dy = [p[0] for p in CURLS_EDGE], [p[1] for p in CURLS_EDGE]
        hair_volume(lambda at: _pchip(ce_at, ce_dy, at), lambda at, t_: (0.012 + 0.040 * ease(t_ / 0.35)) * (1 + 0.15 * at / 180), cols=34, rows=11, lumps=0.22, lump_n=11)
    elif style == "bob":
        # Thin braids cut level at the jaw all round, and a fringe of them over the brow.
        thick = 0.0085
        for i in range(26):
            angle = math.radians(148) + math.radians(244) * i / 25
            start = scalp(angle, 0.06 + 0.03 * rng.random(), 1.02)
            middle = scalp(angle, -0.05, 1.13)
            end = (middle[0] * 1.06, 1.492 + rng.uniform(-0.008, 0.008), middle[2] * 1.04 - 0.004)
            b.tube([T(start), T(middle), T(end)], [thick * s, thick * s, thick * 0.8 * s], 6, hair_colour, cap=False)
        for i in range(10):
            angle = math.radians(42 + 96 * i / 9)
            start = scalp(angle, 0.1, 1.0)
            end = scalp(angle, 0.024 + rng.uniform(-0.004, 0.004), 1.09)
            b.tube([T(start), T(scalp(angle, 0.07, 1.08)), T(end)], [thick * s, thick * s, thick * 0.8 * s], 6, hair_colour, cap=False)
    elif style == "bone":
        # A peaked cap: the crown, and the peak out over the eyes.
        cloth = spec.get("cap", "awningTeal")
        # Worn on the forehead above the brows, the peak out over the eyes.
        shell = [(0.046, 0.088, 0.104), (0.082, 0.091, 0.105), (0.120, 0.078, 0.091), (0.142, 0.048, 0.056)]
        crown = [ring(0.0, yc + dy, zc - 0.006, rx, rz, 14) for (dy, rx, rz) in shell]
        loft(crown, [cloth] * 3)
        cap(crown[-1], cloth, T((0.0, yc, zc)))
        peak = [T((px, yc + 0.048 + rise_, zc + pz)) for px, pz, rise_ in [(-0.074, 0.062, 0.006), (0.074, 0.062, 0.006), (0.058, 0.165, -0.004), (-0.058, 0.165, -0.004)]]
        b.face(peak, "clothBlack", toward=(0.0, 1.0, 0.0), two_sided=True)

    b.flat = False
    if spec.get("belt"):
        # A belt over the uniform, with its buckle.
        b.part = "torso"
        band = [ring(0.0, y, 0.0, waist * 1.09, waist_z * 1.12, 12) for y in (0.985, 1.03)]
        loft(band, [spec["belt"]])
        b.face([T((-0.02, 0.992, waist_z * 1.14)), T((0.02, 0.992, waist_z * 1.14)), T((0.02, 1.024, waist_z * 1.14)), T((-0.02, 1.024, waist_z * 1.14))], "rim", toward=_turn((0.0, 0.0, 1.0), yaw))

    growing[0] = False
    # ------------------------------------------------------------ what is carried
    b.piece = "body"
    if spec.get("bebe"):
        # A baby on the back, tied on with a pano: the cloth round the chest and under the child, the
        # small head against the mother's shoulders, a foot out at each side.
        b.part = "torso"
        cloth = spec["bebe"]
        # Shaped as the body is under it, the bust included, and clear of the top.
        wrap = [body_ring(y, chest, chest_z, chest_off - 0.004, 1.14 * grow, 2.0) for y, grow in [(1.10, 1.0), (1.18, 1.02), (1.255, 1.03), (1.31, 1.0)]]
        loft(wrap, [cloth, cloth, cloth])
        bundle = [ring(0.0, y, -chest_z - 0.045, rx, rz, 8) for y, rx, rz in [(1.04, 0.07, 0.05), (1.12, 0.115, 0.085), (1.24, 0.12, 0.09), (1.33, 0.085, 0.07)]]
        loft(bundle, [cloth] * 3)
        cap(bundle[0], cloth, T((0.0, 1.2, -chest_z)))
        cap(bundle[-1], cloth, T((0.0, 1.2, -chest_z)))
        b.gem(T((0.0, 1.385, -chest_z - 0.05)), (0.062 * s, 0.066 * s, 0.066 * s), 7, skin, rng, rough=0.03)
        b.gem(T((0.0, 1.425, -chest_z - 0.062)), (0.055 * s, 0.03 * s, 0.055 * s), 6, "hairBlack", rng, rough=0.05)
        for side in (1, -1):
            b.tube([T((side * 0.11, 1.1, -chest_z - 0.03)), T((side * 0.165, 1.04, -chest_z + 0.03))], [0.024 * s, 0.02 * s], 5, skin)
    if spec.get("mochila_costas"):
        # A school bag on the back, its two straps over the shoulders.
        b.part = "torso"
        bag = spec["mochila_costas"]
        box((0.0, 1.2, -chest_z - 0.06), (0.24, 0.3, 0.12), bag)
        box((0.0, 1.08, -chest_z - 0.128), (0.18, 0.1, 0.03), "tarShade")
        for side in (-1, 1):
            b.tube([T((side * 0.07, 1.36, -chest_z - 0.01)), T((side * 0.085, 1.43, 0.0)), T((side * 0.08, 1.33, chest_z + 0.02)), T((side * 0.075, 1.18, chest_z + 0.01))], [0.011 * s] * 4, 4, bag, cap=False)
    if spec.get("bacia"):
        # The zungueira's bacia, on a rolled cloth on the head, heaped with what she sells.
        b.part = "head"
        growing[0] = True
        base = yc + (0.165 if style == "lenco" else 0.145)
        b.tube([T((0.0, base, zc)), T((0.0, base + 0.035, zc))], [0.07 * s, 0.075 * s], 8, "cloth", cap=False)
        basin = [ring(0.0, base + dy, zc, r, r, 10) for dy, r in [(0.03, 0.15), (0.075, 0.215), (0.13, 0.25)]]
        loft(basin, [spec["bacia"]] * 2, two_sided=True)
        cap(basin[0], spec["bacia"], T((0.0, base + 0.3, zc)))
        for k in range(6):
            angle = 2 * math.pi * k / 6 + 0.4
            reach = 0.12 if k else 0.0
            b.gem(T((reach * math.cos(angle), base + 0.14, zc + reach * math.sin(angle))), (0.075 * s, 0.06 * s, 0.075 * s), 5, spec.get("goods", ["awningGold", "acaciaFlower", "awningGold", "acaciaLeaf", "awningGold", "roofTile"])[k], rng, rough=0.1)
        growing[0] = False
    if spec.get("cana"):
        # A fishing rod in the right hand. The arm hangs as the body is made, so the rod is made pointing
        # down and forward: with the forearm brought up to hold it, it points out over the water.
        b.part = "hand.R"
        hx_, hy_ = -(shoulder * 0.93 + 0.13), 0.80
        along = (0.0, -0.67, 0.74)
        butt = (hx_, hy_ - along[1] * 0.22, 0.03 - along[2] * 0.22)
        grip = (hx_, hy_, 0.03)
        middle = (hx_, hy_ + along[1] * 1.1, 0.03 + along[2] * 1.1)
        tip = (hx_, hy_ + along[1] * 2.3, 0.03 + along[2] * 2.3)
        b.tube([T(butt), T(grip), T(middle), T(tip)], [0.014 * s, 0.013 * s, 0.009 * s, 0.004 * s], 4, "wood")
    b.part = None
    b.piece = None
    return height


def clothes(b, T, ring, loft, top, colour, spec, chest, chest_z, waist, waist_z, puff, yaw, neck_rx=0.06, neck_rz=0.055, neck_off=-0.01, neck_y=1.462):
    """
    What makes a top more than a colour: a T-shirt's ribbed neck, a shirt's collar and buttons, a camisola's hood,
    pocket and cords, a jacket's lapels with the shirt and the tie between them. Laid on the torso as it was made.
    """
    forward = _turn((0.0, 0.0, 1.0), yaw)
    right = _turn((1.0, 0.0, 0.0), yaw)
    up = (0.0, 1.0, 0.0)

    def on_front(px, py, depth, w, h, paint, out=0.006):
        """A flat piece on the front of the chest at this height, `depth` being how far forward the chest is there."""
        b.rect(T((px, py, depth + out)), right, up, w, h, paint)

    def chest_at(y):
        # How far forward the front of the clothed chest is at a height, between the waist and the chest.
        u = min(1.0, max(0.0, (y - 1.07) / 0.2))
        return (waist_z + (chest_z - waist_z) * u) * puff

    b.part = "torso"
    if top in ("tshirt", "shirt", "long", "camisola", "dress", "vestido"):
        # The ribbed neck of a T-shirt, round the foot of the neck where the cloth ends.
        rib = [ring(0.0, y, neck_off, neck_rx * grow, neck_rz * grow, 16) for y, grow in [(neck_y - 0.032, 1.20), (neck_y + 0.008, 1.07)]]
        loft(rib, [colour])
    if top in ("camisa", "fato", "bata"):
        # The collar: a band round the neck, and its two points lying on the chest.
        band = [ring(0.0, y, neck_off + 0.004, neck_rx * grow, neck_rz * grow, 16) for y, grow in [(1.445, 1.16), (1.50, 1.08)]]
        loft(band, ["paintWhite" if top == "fato" else colour])
        for side in (-1, 1):
            tip = T((side * 0.032, 1.405, chest_at(1.40) + 0.012))
            b.face([T((side * 0.004, 1.455, 0.068)), T((side * 0.06, 1.462, 0.04)), tip], "paintWhite" if top == "fato" else colour, two_sided=True)
    if top in ("camisa", "bata"):
        # The placket down the front, and its buttons.
        on_front(0.0, 1.17, chest_at(1.17), 0.016, 0.42, colour, out=0.004)
        for k in range(5):
            y = 1.38 - k * 0.085
            on_front(0.0, y, chest_at(y), 0.009, 0.009, "paintWhite", out=0.007)
    elif top == "camisola":
        # The hood lying on the upper back, open toward the neck.
        hood = [ring(0.0, y, cz, rx, rz, 10) for y, cz, rx, rz in [(1.40, -0.06, 0.11, 0.07), (1.455, -0.072, 0.118, 0.08), (1.49, -0.09, 0.09, 0.06)]]
        for i in range(len(hood) - 1):
            low, high = hood[i], hood[i + 1]
            middle = T((0.0, 1.47, -0.06))
            for k in range(10):
                j = (k + 1) % 10
                # Only the half behind the neck, lying on the back, open toward the head.
                if k < 5:
                    continue
                b.face([low[k], low[j], high[j], high[k]], colour, away_from=middle, two_sided=True)
        # The pocket across the belly, its edge in a darker thread, and the two cords from the neck.
        on_front(0.0, 1.03, chest_at(1.03), 0.2, 0.11, "tarShade", out=0.005)
        on_front(0.0, 1.03, chest_at(1.03), 0.19, 0.10, colour, out=0.0065)
        for side in (-1, 1):
            on_front(side * 0.03, 1.36, chest_at(1.36), 0.006, 0.12, "paintWhite", out=0.008)
        # A band at the hem.
        hem = [ring(0.0, y, -0.004, waist * 1.12 * puff, waist_z * 1.12 * puff, 14) for y in (0.855, 0.895)]
        loft(hem, ["tarShade"])
    elif top == "fato":
        # Between the lapels, the shirt and the tie; the lapels themselves a shade darker; two buttons.
        b.face([T((-0.05, 1.44, chest_at(1.40) + 0.009)), T((0.05, 1.44, chest_at(1.40) + 0.009)), T((0.0, 1.17, chest_at(1.17) + 0.009))], "paintWhite", toward=forward)
        tie = spec.get("bands") or "clothBlack"
        b.face([T((-0.012, 1.425, chest_at(1.40) + 0.012)), T((0.012, 1.425, chest_at(1.40) + 0.012)), T((0.016, 1.22, chest_at(1.22) + 0.012)), T((0.0, 1.19, chest_at(1.19) + 0.012)), T((-0.016, 1.22, chest_at(1.22) + 0.012))], tie, toward=forward)
        for side in (-1, 1):
            b.face([T((side * 0.05, 1.44, chest_at(1.40) + 0.01)), T((side * 0.085, 1.40, chest_at(1.38) + 0.01)), T((side * 0.02, 1.15, chest_at(1.15) + 0.01)), T((side * 0.004, 1.17, chest_at(1.17) + 0.01))], "tarShade", toward=forward)
        for k in range(2):
            y = 1.1 - k * 0.07
            on_front(0.0, y, chest_at(y), 0.012, 0.012, "clothBlack", out=0.008)
    b.part = None


# ==================================================================== the dog
# A rafeiro: the dog of every Luandan street and quintal. Short coat, tan, often with a darker saddle and a
# pale chest; ears that stand; a tail carried in a curl. Made in real metres (about 0.5 m at the shoulder),
# facing +Z, from rings across the body the way a person is made from rings along it.

def cao(b, x, z, yaw, spec, rng, ground=0.0):
    """Builds one dog standing. Returns its height at the head."""
    coat = spec.get("coat", "shoeTan")
    saddle = spec.get("saddle", coat)
    pale = spec.get("pale", "sand")
    b.level = BOTH

    def T(p):
        return _add((x, ground, z), _turn(p, yaw))

    def across(cx, cy, cz, rx, ry, n=8):
        """A ring standing across the body at `cz`: x to the side, y up."""
        return [T((cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n), cz)) for k in range(n)]

    def centre(points):
        return _mul(tuple(sum(p[i] for p in points) for i in range(3)), 1.0 / len(points))

    def loft(rings, paints):
        for i in range(len(rings) - 1):
            low, high = rings[i], rings[i + 1]
            middle = centre(low + high)
            n = len(low)
            for k in range(n):
                j = (k + 1) % n
                # The upper half of a ring is the coat's saddle where there is one; the lower half its paler belly.
                top = (math.sin(2 * math.pi * (k + 0.5) / n) > 0.35)
                under = (math.sin(2 * math.pi * (k + 0.5) / n) < -0.5)
                b.face([low[k], low[j], high[j], high[k]], saddle if top and paints[i] == coat else (pale if under and paints[i] == coat else paints[i]), away_from=middle)

    # The body: from the haunch to the chest, deepest at the chest, a tuck at the belly.
    b.part = "torso"
    body = [(-0.27, 0.41, 0.066, 0.075), (-0.22, 0.41, 0.09, 0.105), (-0.12, 0.40, 0.084, 0.094), (0.0, 0.41, 0.09, 0.105), (0.12, 0.42, 0.1, 0.125), (0.21, 0.43, 0.095, 0.115), (0.26, 0.46, 0.072, 0.085)]
    rings = [across(0.0, y, cz, rx, ry) for cz, y, rx, ry in body]
    loft(rings, [coat] * (len(rings) - 1))
    b.face(rings[0], coat, away_from=T((0.0, 0.41, 0.0)))
    # The neck up and forward to the head.
    b.part = "neck"
    neck = [across(0.0, 0.46, 0.25, 0.07, 0.08), across(0.0, 0.54, 0.29, 0.062, 0.068), across(0.0, 0.6, 0.32, 0.056, 0.06)]
    loft(neck, [coat, coat])
    # The head: the skull, the stop, the muzzle narrowing to the nose.
    b.part = "head"
    head = [(0.30, 0.625, 0.06, 0.062), (0.355, 0.638, 0.071, 0.07), (0.405, 0.627, 0.06, 0.06), (0.437, 0.602, 0.04, 0.04), (0.497, 0.595, 0.03, 0.031), (0.525, 0.597, 0.021, 0.022)]
    hr = [across(0.0, y, cz, rx, ry) for cz, y, rx, ry in head]
    loft(hr, [coat, coat, coat, pale, pale])
    b.face(hr[0], coat, away_from=T((0.0, 0.62, 0.4)))
    b.face(hr[-1], "clothBlack", away_from=T((0.0, 0.6, 0.45)))
    # The ears, standing; the eyes; the nose.
    for side in (-1, 1):
        b.face([T((side * 0.025, 0.685, 0.335)), T((side * 0.064, 0.672, 0.352)), T((side * 0.056, 0.765, 0.33))], saddle, two_sided=True)
        b.face([T((side * 0.034, 0.648, 0.405)), T((side * 0.05, 0.648, 0.398)), T((side * 0.049, 0.661, 0.398)), T((side * 0.035, 0.662, 0.405))], "eyeDark", toward=_turn((side * 0.6, 0.0, 0.8), yaw))
    b.gem(T((0.0, 0.607, 0.53)), (0.016, 0.013, 0.013), 5, "clothBlack", rng, rough=0.05)
    # The legs, each in two: the upper with the coat's colour, the lower paler; and the paws.
    for tag, lx, lz, top_y in [("FL", 0.05, 0.19, 0.40), ("FR", -0.05, 0.19, 0.40), ("BL", 0.055, -0.2, 0.40), ("BR", -0.055, -0.2, 0.40)]:
        back = tag[0] == "B"
        knee = (lx, 0.22, lz - (0.025 if back else -0.005))
        b.part = f"leg.{tag}"
        b.tube([T((lx, top_y, lz)), T(knee)], [0.042 if back else 0.034, 0.025], 6, coat, cap=False)
        b.part = f"paw.{tag}"
        b.tube([T(knee), T((lx, 0.035, lz + 0.005))], [0.024, 0.019], 6, pale if back else coat, cap=False)
        b.box(T((lx, 0.019, lz + 0.024)), (0.042, 0.038, 0.058), pale, yaw=yaw, skip_bottom=False)
    # The tail, carried up in a curl over the back.
    b.part = "tail"
    b.tube([T((0.0, 0.46, -0.27)), T((0.0, 0.54, -0.32)), T((0.0, 0.63, -0.3)), T((0.0, 0.66, -0.24))], [0.022, 0.02, 0.016, 0.01], 5, coat, cap=True)
    b.part = None
    return 0.73


def ossos_cao(spec):
    """The dog's bones as (name, parent, head, tail), in metres, in the game's axes."""
    bones = [
        ("body", None, (0.0, 0.41, -0.22), (0.0, 0.42, 0.2)),
        ("neck", "body", (0.0, 0.46, 0.22), (0.0, 0.6, 0.31)),
        ("head", "neck", (0.0, 0.6, 0.31), (0.0, 0.6, 0.5)),
        ("tail", "body", (0.0, 0.46, -0.27), (0.0, 0.62, -0.31)),
    ]
    for tag, lx, lz in [("FL", 0.05, 0.19), ("FR", -0.05, 0.19), ("BL", 0.055, -0.2), ("BR", -0.055, -0.2)]:
        back = tag[0] == "B"
        knee = (lx, 0.22, lz - (0.025 if back else -0.005))
        bones += [(f"leg.{tag}", "body", (lx, 0.40, lz), knee), (f"paw.{tag}", f"leg.{tag}", knee, (lx, 0.02, lz + 0.01))]
    return bones


def pesos_cao(spec, x=0.0, z=0.0, ground=0.0):
    """Which bones move a point of the dog."""
    def weigh(part, point):
        if part is None or part == "torso":
            return [("body", 1.0)]
        if part in ("neck", "head", "tail"):
            return [(part, 1.0)]
        return [(part, 1.0)]
    return weigh


# ==================================================================== the skeleton
# Seventeen bones, the same names in every body. Positions are for someone
# 1.70 m tall and follow the same measurements the body was built from, so a
# joint is where the limb was made to bend.

def shoulder_width(spec):
    female = spec.get("sex", "f") == "f"
    return (0.172 if female else 0.205) * spec.get("build", 1.0)


def hip_width(spec):
    female = spec.get("sex", "f") == "f"
    return (0.176 if female else 0.164) * spec.get("build", 1.0)


def ossos(spec):
    """The bones as (name, parent, head, tail), in metres at 1.70 m, in the game's axes (x left, y up, z forward)."""
    sx = shoulder_width(spec) * 0.93
    hx = hip_width(spec) * 0.50
    bones = [
        ("hips", None, (0.0, 0.95, 0.0), (0.0, 1.07, 0.0)),
        ("spine", "hips", (0.0, 1.07, 0.0), (0.0, 1.25, 0.0)),
        ("chest", "spine", (0.0, 1.25, 0.0), (0.0, 1.46, 0.0)),
        ("neck", "chest", (0.0, 1.46, 0.0), (0.0, 1.535, 0.008)),
        ("head", "neck", (0.0, 1.535, 0.008), (0.0, 1.76, 0.008)),
    ]
    for side, tag in ((1, "L"), (-1, "R")):
        bones += [
            (f"upperArm.{tag}", "chest", (side * sx, 1.405, 0.0), (side * (sx + 0.070), 1.145, 0.0)),
            (f"lowerArm.{tag}", f"upperArm.{tag}", (side * (sx + 0.070), 1.145, 0.0), (side * (sx + 0.118), 0.895, 0.0)),
            (f"hand.{tag}", f"lowerArm.{tag}", (side * (sx + 0.118), 0.895, 0.0), (side * (sx + 0.135), 0.74, 0.0)),
            (f"thigh.{tag}", "hips", (side * hx, 0.90, 0.0), (side * hx, 0.50, 0.004)),
            (f"shin.{tag}", f"thigh.{tag}", (side * hx, 0.50, 0.004), (side * hx, 0.09, -0.004)),
            (f"foot.{tag}", f"shin.{tag}", (side * hx, 0.09, -0.004), (side * hx, 0.02, 0.16)),
        ]
    return bones


def _blend(value, low, high):
    """0 at or under low, 1 at or over high, eased between."""
    u = min(1.0, max(0.0, (value - low) / (high - low)))
    return u * u * (3 - 2 * u)


def pesos(spec, x=0.0, z=0.0, ground=0.0):
    """
    Returns the function that says which bones move a point of the body, and how much.
    The body must have been built facing forward (yaw 0) at (x, z).
    """
    s = spec.get("height", 1.70) / 1.70

    def weigh(part, point):
        if part is None:
            return [("hips", 1.0)]
        lx, y = (point[0] - x) / s, (point[1] - ground) / s
        side = part[-1] if part[-2:] in (".L", ".R") else ("L" if lx > 0 else "R")
        if part == "torso":
            if y > 1.44:
                u = _blend(y, 1.44, 1.52)
                return [("chest", 1 - u), ("neck", u)]
            if y > 1.16:
                u = _blend(y, 1.16, 1.32)
                return [("spine", 1 - u), ("chest", u)]
            u = _blend(y, 0.96, 1.14)
            if y < 0.9:
                # The seat follows the thighs a little, so a step does not tear it.
                v = _blend(y, 0.9, 0.8) * 0.45 * _blend(abs(lx), 0.0, 0.05)
                return [("hips", 1 - v), (f"thigh.{side}", v)]
            return [("hips", 1 - u), ("spine", u)]
        if part == "skirt":
            # Cloth hangs from the hips and is carried by the leg under it, more toward the hem.
            v = _blend(y, 0.95, 0.45) * 0.62 * _blend(abs(lx), 0.0, 0.06)
            return [("hips", 1 - v), (f"thigh.{side}", v)]
        if part.startswith("leg"):
            if y > 0.50:
                u = _blend(y, 0.57, 0.43)
                top = _blend(y, 0.80, 0.90) * 0.35
                return [(f"thigh.{side}", (1 - u) * (1 - top)), (f"shin.{side}", u), ("hips", (1 - u) * top)]
            u = _blend(y, 0.57, 0.43)
            v = _blend(y, 0.13, 0.07)
            return [(f"thigh.{side}", 1 - u), (f"shin.{side}", u * (1 - v)), (f"foot.{side}", u * v)]
        if part.startswith("foot"):
            return [(f"foot.{side}", 1.0)]
        if part.startswith("arm"):
            u = _blend(y, 1.20, 1.09)
            top = _blend(y, 1.36, 1.43) * 0.5
            return [(f"upperArm.{side}", (1 - u) * (1 - top)), (f"lowerArm.{side}", u), ("chest", (1 - u) * top)]
        if part.startswith("hand"):
            u = _blend(y, 0.90, 0.86)
            return [(f"lowerArm.{side}", 1 - u), (f"hand.{side}", u)]
        if part == "hairfall":
            u = _blend(y, 1.52, 1.40)
            return [("head", 1 - u), ("chest", u)]
        if part == "head" and y < 1.536:
            # The neck is part of the head's surface: from the torso's foot of it (weighed as the torso there is,
            # so the two meet in one seam) to the jaw, it passes from the chest to the neck to the head.
            if y <= 1.52:
                u = _blend(y, 1.44, 1.52)
                return [("chest", 1 - u), ("neck", u)]
            u = _blend(y, 1.52, 1.536)
            return [("neck", 1 - u), ("head", u)]
        return [("head", 1.0)]

    return weigh

