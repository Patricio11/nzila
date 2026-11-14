# People, made by this project (decision D-0.40): a body with human
# proportions, a face, hands, hair and clothes, written as code so that it
# belongs to the game outright. Not a toy: never a ball for a head.
#
# A person is built standing, arms a little out from the sides (the pose a
# skeleton is fitted to), facing the game's +Z, from rings of points lofted
# into a body and coloured from the world's palette. What makes two people
# different is a `spec`: see `SPECS` in make_people.py.
#
# Measurements are in metres for someone 1.70 m tall and are scaled to the
# person's own height.

import math

from kit import BOTH, _add, _mul, _turn


def pessoa(b, x, z, yaw, spec, rng, ground=0.0):
    """Builds one person. Returns their height."""
    height = spec.get("height", 1.70)
    s = height / 1.70
    female = spec.get("sex", "f") == "f"
    build = spec.get("build", 1.0)  # how broad: 0.9 slight, 1.15 heavy
    skin = f"skin{spec.get('skin', 0)}"
    lip = f"lip{spec.get('skin', 0)}"
    hair_colour = spec.get("hair_colour", "hairBlack")
    top, top_colour = spec.get("top", "tshirt"), spec.get("top_colour", "person0")
    bottom, bottom_colour = spec.get("bottom", "trousers"), spec.get("bottom_colour", "jeans")
    bands = spec.get("bands")  # a second colour for a pano's stripes
    shoe = spec.get("shoe", "shoe")
    b.level = BOTH

    def T(p):
        return _add((x, ground, z), _turn((p[0] * s, p[1] * s, p[2] * s), yaw))

    def ring(cx, y, cz, rx, rz, n):
        return [T((cx + rx * math.cos(2 * math.pi * k / n), y, cz + rz * math.sin(2 * math.pi * k / n))) for k in range(n)]

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

    # ------------------------------------------------------------------ torso
    if female:
        shoulder, chest, chest_z, waist, waist_z, hip, hip_z = 0.172, 0.150, 0.118, 0.122, 0.092, 0.176, 0.116
        chest_off, hip_off = 0.014, -0.010
    else:
        shoulder, chest, chest_z, waist, waist_z, hip, hip_z = 0.205, 0.176, 0.118, 0.150, 0.104, 0.164, 0.108
        chest_off, hip_off = 0.004, -0.004
    shoulder, chest, waist, hip = shoulder * build, chest * build, waist * build, hip * build
    chest_z, waist_z, hip_z = chest_z * build, waist_z * build, hip_z * build
    n = 14
    covered = top != "none"
    long_top = top in ("dress", "vestido")
    hem = 0.93 if top in ("tshirt", "shirt", "blusa") else 0.80
    puff = 1.05 if covered else 1.0
    torso_colour = top_colour if covered else skin
    low_colour = bottom_colour if bottom in ("trousers", "shorts") else (top_colour if long_top else bottom_colour)
    stations = [
        (0.80, hip * 0.86, hip_z * 0.94, hip_off, 1.0, low_colour),
        (0.90, hip, hip_z, hip_off, 1.0, low_colour),
        (hem, hip * 0.985, hip_z * 0.99, hip_off * 0.6, 1.0, None),
        (hem, hip * 0.985, hip_z * 0.99, hip_off * 0.6, puff + 0.07, torso_colour),
        (1.07, waist, waist_z, 0.0, puff, torso_colour),
        (1.27, chest, chest_z, chest_off, puff, torso_colour),
        (1.375, shoulder * 0.93, chest_z * 0.86, 0.004, puff, torso_colour),
        (1.44, shoulder * 0.66, 0.074, 0.0, puff, skin if top in ("alcas", "blusa") else torso_colour),
        (1.475, 0.060, 0.058, 0.004, 1.0, skin),
        (1.535, 0.052, 0.053, 0.010, 1.0, skin),
    ]
    stations = refine(stations, 1)
    rings = [ring(0.0, y, off, rx * grow, rz * grow, n) for (y, rx, rz, off, grow, _) in stations]
    loft(rings, [stations[i][5] for i in range(len(stations) - 1)])
    cap(rings[0], low_colour, T((0.0, 0.9, 0.0)))

    # A skirt, a pano or a dress hangs from the waist over the legs.
    if bottom in ("skirt", "pano") or long_top:
        colour = top_colour if long_top else bottom_colour
        length = 0.50 if bottom == "skirt" or (long_top and spec.get("short")) else 0.30
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
            skirt.append(ring(0.0, y, hip_off * min(1.0, t_ * 3), rx, rz, n))
        skirt.reverse()
        stripes = [colour if (bands is None or i % 2 == 0) else bands for i in range(levels)]
        loft(skirt, stripes, two_sided=True)

    # ------------------------------------------------------------------- legs
    for side in (-1, 1):
        lx = side * hip * 0.50
        trousers = bottom == "trousers"
        shorts = bottom == "shorts"
        # Trousers stand a little off the leg; a bare leg under a skirt stays inside the hips.
        wide = 1.04 if trousers or shorts else 0.9
        cloth = bottom_colour if (trousers or shorts) else skin
        leg = [
            (0.86, 0.078 * build, 0.090 * build, 0.0, wide, cloth),
            (0.52, 0.054 * build, 0.060 * build, 0.004, wide, cloth),
            (0.52, 0.054 * build, 0.060 * build, 0.004, wide if trousers else 1.0, cloth if trousers else skin),
            (0.33, 0.052 * build, 0.058 * build, -0.010, wide if trousers else 1.0, cloth if trousers else skin),
            (0.11, 0.037, 0.042, -0.004, wide * 1.04 if trousers else 1.0, cloth if trousers else skin),
            (0.11, 0.037, 0.042, -0.004, 1.0, skin),
            (0.06, 0.036, 0.042, 0.0, 1.0, skin),
        ]
        leg = refine(leg, 1)
        leg.reverse()
        leg_rings = [ring(lx, y, off, rx * grow, rz * grow, 10) for (y, rx, rz, off, grow, _) in leg]
        loft(leg_rings, [leg[i + 1][5] if leg[i][0] != leg[i + 1][0] else leg[i][5] for i in range(len(leg) - 1)])
        # The shoe: a heel and a toe that is lower and longer.
        if shoe == "chinelo":
            box((lx, 0.012, 0.035), (0.092, 0.024, 0.25), "shoe")
            box((lx, 0.04, 0.03), (0.08, 0.035, 0.21), skin)
            box((lx, 0.062, 0.075), (0.088, 0.014, 0.03), top_colour if top_colour != skin else "person1")
        else:
            box((lx, 0.045, -0.012), (0.094, 0.09, 0.13), shoe)
            box((lx, 0.032, 0.105), (0.098, 0.064, 0.14), shoe)
            box((lx, 0.008, 0.045), (0.102, 0.016, 0.27), "shoeSole")

    # ------------------------------------------------------------------- arms
    sleeve = {"tshirt": 1.25, "shirt": 1.25, "blusa": 1.33, "dress": 1.31, "vestido": 1.31, "long": 0.90, "alcas": 9.0, "none": 9.0}[top]
    for side in (-1, 1):
        joints = [(side * shoulder * 0.93, 1.405), (side * (shoulder * 0.93 + 0.070), 1.145), (side * (shoulder * 0.93 + 0.118), 0.895)]

        def arm_x(y):
            (x0, y0), (x1, y1), (x2, y2) = joints
            if y >= y1:
                return x1 + (x0 - x1) * (y - y1) / (y0 - y1)
            return x2 + (x1 - x2) * (y - y2) / (y1 - y2)

        arm = [(1.425, 0.026 * build, 0.036 * build), (1.385, 0.046 * build, 0.050 * build), (1.28, 0.043 * build, 0.046 * build), (1.145, 0.035, 0.038), (1.06, 0.037, 0.039), (0.895, 0.026, 0.031)]
        arm = refine(arm, 1)
        arm_rings, arm_colours = [], []
        for i, (y, rx, rz) in enumerate(arm):
            clothed = y > sleeve - 0.001
            grow = 1.07 if clothed else 1.0
            # The top of the arm sits inside the shoulder, so cloth runs from one to the other.
            arm_rings.append(ring(arm_x(min(y, 1.405)) - side * 0.03 * max(0.0, (y - 1.36) / 0.065), y, 0.0, rx * grow, rz * grow, 10))
            if i < len(arm) - 1:
                next_y = arm[i + 1][0]
                arm_colours.append(top_colour if (next_y > sleeve - 0.001 or (y > sleeve and next_y <= sleeve)) and covered and top not in ("alcas",) else skin)
        arm_rings.reverse()
        arm_colours.reverse()
        loft(arm_rings, arm_colours)
        cap(arm_rings[-1], arm_colours[-1], T((arm_x(1.3), 1.3, 0.0)))
        # The hand: a palm, the fingers together, and a thumb forward of them.
        wx = arm_x(0.895) + side * 0.012
        hand = refine([(0.895, 0.024, 0.030, 0.0), (0.862, 0.017, 0.040, 0.004), (0.815, 0.015, 0.042, 0.006), (0.765, 0.012, 0.036, 0.004), (0.735, 0.007, 0.022, 0.002)], 1)
        hand.reverse()
        hand_rings = [ring(wx + side * (0.895 - y) * 0.10, y, off, rx, rz, 8) for (y, rx, rz, off) in hand]
        loft(hand_rings, [skin] * (len(hand_rings) - 1))
        cap(hand_rings[0], skin, T((wx, 0.8, 0.0)))
        # The thumb, forward of the fingers and a little apart.
        thumb = [ring(wx - side * 0.004, y, zt, 0.010, 0.011, 5) for (y, zt) in [(0.795, 0.058), (0.835, 0.050), (0.865, 0.034)]]
        loft(thumb, [skin, skin])
        cap(thumb[0], skin, T((wx, 0.84, 0.03)))

    # ------------------------------------------------------------------- head
    yc, zc = 1.640, 0.014
    jaw = 1.0 if female else 1.12
    head = [
        (0.116, 0.022, 0.026, 0.0),
        (0.100, 0.052, 0.060, 0.0),
        (0.068, 0.076, 0.088, 0.0),
        (0.028, 0.084, 0.098, 0.0),
        (-0.012, 0.083, 0.097, 0.002),
        (-0.048, 0.074 * jaw, 0.088, 0.005),
        (-0.080, 0.058 * jaw, 0.072, 0.010),
        (-0.104, 0.034 * jaw, 0.045, 0.018),
    ]
    head = list(reversed(refine(list(reversed(head)), 1)))
    hairline = spec.get("hair", "baixo") != "careca"

    def is_hair(points):
        c = centre(points)
        # Undo the placing, to ask where on the head this face is.
        local = _turn(_mul((c[0] - x, c[1] - ground, c[2] - z), 1.0 / s), -yaw)
        dy, lz, lx = local[1] - yc, local[2] - zc, abs(local[0])
        return hairline and (dy > 0.062 or (lz < -0.015 and dy > -0.055) or (lx > 0.055 and dy > 0.02 and lz < 0.045))

    HEAD = 16
    head_rings = [ring(0.0, yc + dy, zc + off, rx, rz, HEAD) for (dy, rx, rz, off) in reversed(head)]
    for i in range(len(head_rings) - 1):
        low, high = head_rings[i], head_rings[i + 1]
        middle = centre(low + high)
        for k in range(HEAD):
            j = (k + 1) % HEAD
            quad = [low[k], low[j], high[j], high[k]]
            b.face(quad, hair_colour if is_hair(quad) else skin, away_from=middle)
    crown = T((0.0, yc + 0.121, zc))
    top_ring = head_rings[-1]
    for k in range(HEAD):
        b.face([top_ring[k], top_ring[(k + 1) % HEAD], crown], hair_colour if hairline else skin, away_from=T((0.0, yc, zc)))
    cap(head_rings[0], skin, T((0.0, yc, zc)))

    def front(dy, fx):
        """How far forward the face is at this height and this far from its middle."""
        rows = list(reversed(head))
        for i in range(len(rows) - 1):
            (d0, rx0, rz0, o0), (d1, rx1, rz1, o1) = rows[i], rows[i + 1]
            if d0 <= dy <= d1:
                t_ = (dy - d0) / (d1 - d0)
                rx, rz, off = rx0 + (rx1 - rx0) * t_, rz0 + (rz1 - rz0) * t_, o0 + (o1 - o0) * t_
                return zc + off + rz * math.sqrt(max(0.0, 1 - (fx / rx) ** 2))
        return zc + 0.09

    right = _turn((1.0, 0.0, 0.0), yaw)
    up = (0.0, 1.0, 0.0)

    def feature(fx, dy, width, tall, colour, out=0.003):
        b.rect(T((fx, yc + dy, front(dy, fx) + out)), right, up, width * s, tall * s, colour)

    def shape(fx, dy, outline, colour, out=0.003):
        """A flat shape laid on the face, following its curve: `outline` is points (across, up) round its middle."""
        points = [T((fx + ox, yc + dy + oy, front(dy + oy, fx + ox) + out)) for ox, oy in outline]
        # Which way it faces, taken from the whole outline (its first three points may lie in a line).
        normal = [0.0, 0.0, 0.0]
        for i, p0 in enumerate(points):
            p1 = points[(i + 1) % len(points)]
            normal[0] += (p0[1] - p1[1]) * (p0[2] + p1[2])
            normal[1] += (p0[2] - p1[2]) * (p0[0] + p1[0])
            normal[2] += (p0[0] - p1[0]) * (p0[1] + p1[1])
        forward = _turn((0.0, 0.0, 1.0), yaw)
        if normal[0] * forward[0] + normal[1] * forward[1] + normal[2] * forward[2] < 0:
            points.reverse()
        b.face(points, colour)

    def oval(width, tall, sides=8, lift=0.0):
        return [(math.cos(2 * math.pi * k / sides) * width / 2, math.sin(2 * math.pi * k / sides) * tall / 2 + lift * math.cos(2 * math.pi * k / sides) ** 2) for k in range(sides)]

    iris = spec.get("eye", "eyeBrown")
    for side in (-1, 1):
        ex = side * 0.032
        # An eye is an almond: wide, low, its outer corner a little higher. The lid cuts the top of the iris.
        almond = [(-0.0135, 0.0), (-0.006, 0.0052), (0.004, 0.0056), (0.0135, 0.0018), (0.006, -0.0046), (-0.005, -0.0048)]
        shape(ex, 0.012, [(side * ox, oy) for ox, oy in almond], "eyeWhite")
        shape(ex, 0.0115, oval(0.0105, 0.0105, 8), iris, out=0.0036)
        shape(ex, 0.0115, oval(0.0048, 0.0048, 6), "eyeDark", out=0.0042)
        shape(ex, 0.0182, [(side * -0.0145, -0.0022), (side * -0.006, 0.0016), (side * 0.005, 0.002), (side * 0.0145, -0.0006), (side * 0.005, 0.0002), (side * -0.006, -0.0002)], "eyeDark", out=0.0046)
        # The brow: an arch, thicker toward the nose.
        brow = [(-0.016, -0.004), (-0.010, 0.0035), (0.002, 0.0055), (0.017, 0.001), (0.017, -0.0015), (0.002, 0.0015), (-0.010, -0.0005)]
        shape(ex, 0.031 if not female else 0.033, [(side * ox, oy) for ox, oy in brow], hair_colour, out=0.0034)
        # The ear: small, flat to the head, behind the cheek.
        box((side * 0.080, yc - 0.004, zc - 0.012), (0.008, 0.032, 0.018), skin)
    # The nose: a ridge that widens to the nostrils.
    bridge, tip = T((0.0, yc + 0.014, front(0.014, 0.0) + 0.003)), T((0.0, yc - 0.027, front(-0.027, 0.0) + 0.022))
    wing = 0.021 if not female else 0.0185
    left, right_wing = T((-wing, yc - 0.034, front(-0.034, wing) + 0.003)), T((wing, yc - 0.034, front(-0.034, wing) + 0.003))
    under = T((0.0, yc - 0.039, front(-0.039, 0.0) + 0.006))
    inside = T((0.0, yc - 0.02, zc))
    for half in (-1, 1):
        ridge = T((half * 0.007, yc + 0.014, front(0.014, 0.007) + 0.001))
        b.face([bridge, ridge, left if half < 0 else right_wing, tip], skin, away_from=inside)
    b.face([left, under, tip], skin, away_from=inside)
    b.face([under, right_wing, tip], skin, away_from=inside)
    # The mouth: a full lower lip, a thinner upper one with its bow; the corners rise in a smile.
    rise = 0.004 if spec.get("smile") else 0.0005
    wide = 0.025 if spec.get("smile") else 0.022
    upper = [(-wide, rise), (-0.010, 0.0052), (-0.003, 0.0062), (0.0, 0.0046), (0.003, 0.0062), (0.010, 0.0052), (wide, rise), (0.008, -0.0006), (-0.008, -0.0006)]
    lower = [(-wide, rise), (-0.008, -0.0006), (0.008, -0.0006), (wide, rise), (0.012, -0.0082), (0.0, -0.0102), (-0.012, -0.0082)]
    shape(0.0, -0.060, upper, f"lipDark{spec.get('skin', 0)}", out=0.0032)
    shape(0.0, -0.060, lower, lip, out=0.0036)
    if spec.get("beard"):
        chin = [(-0.040, 0.012), (-0.024, 0.002), (0.024, 0.002), (0.040, 0.012), (0.036, -0.022), (0.014, -0.034), (-0.014, -0.034), (-0.036, -0.022)]
        shape(0.0, -0.078, chin, hair_colour, out=0.0028)
        shape(0.0, -0.047, [(-0.024, 0.0035), (0.024, 0.0035), (0.027, -0.004), (-0.027, -0.004)], hair_colour, out=0.0034)

    # ------------------------------------------------------------------- hair
    style = spec.get("hair", "baixo")

    def scalp(angle, dy, grow=1.03):
        """A point on the head at this bearing (0 is the person's left, 90 the front) and height."""
        rows = list(reversed(head))
        rx, rz, off = rows[-1][1], rows[-1][2], rows[-1][3]
        for i in range(len(rows) - 1):
            (d0, rx0, rz0, o0), (d1, rx1, rz1, o1) = rows[i], rows[i + 1]
            if d0 <= dy <= d1:
                t_ = (dy - d0) / (d1 - d0)
                rx, rz, off = rx0 + (rx1 - rx0) * t_, rz0 + (rz1 - rz0) * t_, o0 + (o1 - o0) * t_
        return (rx * grow * math.cos(angle), yc + dy, zc + off + rz * grow * math.sin(angle))

    if style == "afro":
        size = spec.get("afro", 1.0)
        shell = [(-0.030, 0.094, 0.100), (0.020, 0.118 * size, 0.124 * size), (0.080, 0.124 * size, 0.128 * size), (0.132, 0.100 * size, 0.104 * size), (0.166 * size, 0.052, 0.056)]
        afro = [ring(0.0, yc + dy, zc - 0.022, rx, rz, 10) for (dy, rx, rz) in shell]
        loft(afro, [hair_colour] * 4)
        cap(afro[-1], hair_colour, T((0.0, yc, zc)))
    elif style in ("trancas", "dreads"):
        thick = 0.0085 if style == "trancas" else 0.015
        count = 22 if style == "trancas" else 13
        reach = spec.get("hair_length", 1.20 if style == "trancas" else 1.38)
        for i in range(count):
            # Round the back of the head from one temple to the other.
            angle = math.radians(152) + math.radians(236) * i / (count - 1)
            forward = abs(math.cos(angle)) > 0.82  # the ones at the temples fall in front of the shoulder
            start = scalp(angle, 0.05 + 0.03 * rng.random(), 1.02)
            middle = scalp(angle, -0.075, 1.12)
            sway = rng.uniform(-0.012, 0.012)
            end_y = reach + rng.uniform(-0.07, 0.05)
            shoulder_z = 0.05 if forward else -0.085
            rest = (start[0] * 1.55 + sway, 1.43, shoulder_z + rng.uniform(-0.01, 0.01))
            fall = (rest[0] + sway, end_y, shoulder_z + (0.03 if forward else -0.02))
            b.tube([T(start), T(middle), T(rest), T(fall)], [thick * s, thick * s, thick * s, thick * 0.7 * s], 3, hair_colour, cap=False)
        if style == "dreads":
            for i in range(5):
                angle = math.radians(20 + 140 * i / 4)
                start, fall = scalp(angle, 0.085, 1.0), scalp(angle, 0.03 - 0.03 * rng.random(), 1.1)
                b.tube([T(start), T(fall)], [thick * s, thick * 0.8 * s], 3, hair_colour, cap=False)
    elif style == "puxinho":
        b.gem(T((0.0, yc + 0.105, zc - 0.062)), (0.05 * s, 0.05 * s, 0.05 * s), 6, hair_colour, rng, rough=0.08)
    elif style == "lenco":
        cloth = spec.get("lenco", "cloth")
        shell = [(0.018, 0.090, 0.104), (0.060, 0.092, 0.104), (0.105, 0.074, 0.084), (0.140, 0.040, 0.046)]
        wrap = [ring(0.0, yc + dy, zc - 0.006, rx, rz, 10) for (dy, rx, rz) in shell]
        loft(wrap, [cloth] * 3)
        cap(wrap[-1], cloth, T((0.0, yc, zc)))
        b.gem(T((0.0, yc + 0.135, zc + 0.03)), (0.045 * s, 0.035 * s, 0.04 * s), 5, cloth, rng, rough=0.1)
    return height
