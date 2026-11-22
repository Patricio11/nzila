# The insides of the houses a family is given (Phase 5, D-5.8). A house stands in its bairro as a house that is
# shut (kit.casa_de_realojamento and those to come); its inside is drawn here once, at the origin with its door
# looking to +Z, and the game sets it in whichever house of that kind the player's family was given. Every house of
# a kind has the same rooms: what makes one somebody's is what they put in it (5.3).
#
# Each returns what the pack of homes says of the kind (casas.json): see packages/world/src/casas.ts.

import kit
import kit_baixa as kb
from kit import FULL

CELL = 0.5


def _walked(b, half_x, half_z, floor, door):
    """
    Where the family walks, from what was built: the cells of the house and one more all round it, "." walked, "#" a
    wall, "-" as the street has it, "d" the doorway (the family's while the door stands open). The cells before the
    doorway are the family's whatever the street says of them (the street has the whole house shut, and what
    stands against its front wall with it).
    """
    nx, nz = int(half_x / CELL) + 1, int(half_z / CELL) + 1
    rows = [["." if -nx < ix < nx - 1 and -nz < iz < nz - 1 else "-" for ix in range(-nx, nx)] for iz in range(-nz, nz)]

    def flag_at(ix, iz):
        return rows[iz + nz][ix + nx] if -nx <= ix < nx and -nz <= iz < nz else None

    def block(ix, iz):
        rows[iz + nz][ix + nx] = "#"

    kit.block_solids(b, CELL, flag_at, lambda ix, iz: floor, block, walked=".")
    kit.block_built(b, CELL, flag_at, lambda ix, iz: floor, block, walked=".")
    for ix in (int(door // CELL) - 1, int(door // CELL)):
        if rows[nz - 2 + nz][ix + nx] != ".":
            raise SystemExit(f"nzila: the doorway of a home is shut at cell {ix}")
        rows[nz - 2 + nz][ix + nx] = "d"
        rows[nz - 1 + nz][ix + nx] = "."
    return {"cellMm": int(CELL * 1000), "cellX0": -nx, "cellZ0": -nz, "rows": ["".join(row) for row in rows]}


def interior_de_realojamento(b):
    """
    Inside the house of a resettlement bairro (kit.casa_de_realojamento: eight metres by six), as the State
    delivered it, bare: a sala and a quarto with a wall between them, a cement floor level with the veranda's
    step, white walls, the door between two windows, one window in the side wall on the right hand, and the zinc
    of the roof overhead (the roof is the house's own, drawn with its outside). The family gives it empty
    (D-3.13): a bulb on its wire in the sala, an esteira on the quarto's floor to wake on, and nothing else.
    """
    width, depth, height, floor = 8.0, 6.0, 2.6, kit.DOOR_SILL
    # A hair inside the house's own walls, so that the two are never drawn in the same place.
    w, d = width - 0.04, depth - 0.04
    b.level = FULL
    # The walls go up past the top of the outside ones, to just under the roof where it is lowest.
    inside = kb.sala(b, 0.0, 0.0, 1, w, d, height=2.76, ground=floor, wall="paintWhite", floor="concrete", door=0.0, windows=(-2.45, 2.45), sides=(0.0,), only_side=1, roof=None)
    # What closes the gap between the top of the long walls and the roof's slopes, seen from inside only.
    zi = d / 2 - 0.3
    for z, top, toward in ((zi, 3.10, -1.0), (-zi, 3.02, 1.0)):
        b.face([(-w / 2, floor + 2.76, z), (w / 2, floor + 2.76, z), (w / 2, top, z), (-w / 2, top, z)], "paintWhite", toward=(0.0, 0.0, toward))
    # The wall between the sala and the quarto, with a doorway in it and no door: the sala has the front door and
    # one window, the quarto the other window and the one in the side wall.
    top = floor + 2.76
    px = 1.15
    for z0, z1, y0 in ((-zi, 0.4, floor), (1.7, zi, floor), (0.4, 1.7, floor + 2.1)):
        b.box((px, (y0 + top) / 2, (z0 + z1) / 2), (0.2, top - y0, z1 - z0), "paintWhite", skip_bottom=y0 == floor)
    # A bulb on its wire over the middle of the sala: it glows after dark, and the game lights the room by it.
    b.soft = True
    b.tube([(-1.3, 3.25, 0.0), (-1.3, 2.62, 0.0)], [0.012, 0.012], 3, "tarShade", cap=False)
    b.box((-1.3, 2.58, 0.0), (0.07, 0.08, 0.07), "metal", skip_bottom=False)
    b.box((-1.3, 2.48, 0.0), (0.11, 0.13, 0.11), "lamp", skip_bottom=False)
    # The esteira: woven palm, in the quarto along its back wall. Whoever wakes stands up beside it, with their
    # window before them.
    wake = (2.45, -2.15)
    b.box((wake[0], floor + 0.05, wake[1]), (1.9, 0.02, 0.9), "mucua", skip_bottom=True)
    for k in range(5):
        b.box((wake[0] - 0.8 + k * 0.4, floor + 0.062, wake[1]), (0.05, 0.004, 0.9), "khaki", skip_bottom=True)
    b.soft = False
    return {
        "id": "realojamento",
        "model": "realojamento.glb",
        **_walked(b, width / 2, depth / 2, floor, 0.0),
        "rect": inside["rect"],
        "height": height,
        "floor": floor,
        "door": [0.0, depth / 2],
        # The door the game hangs: its hinge on the left hand of someone going in, the leaf's size, and the step it stands on.
        "leaf": {"hinge": [-kit.DOOR_WIDE / 2, depth / 2], "wide": kit.DOOR_WIDE, "high": kit.DOOR_HIGH, "sill": kit.DOOR_SILL},
        "wake": [wake[0], round(wake[1] + 1.15, 2)],
        # It lies along the back wall: whoever lies on it lies along it (a quarter turned).
        "esteira": [wake[0], wake[1], 1],
    }


# Every kind of home there is, by its name in a bairro's `homes`.
KINDS = {"realojamento": interior_de_realojamento}


# ====================================================================== what a house is furnished with (Task 5.3)
# Each thing is drawn alone, standing on the floor about the origin, its front to +Z, inside the floor the
# catalogue gives it (packages/economy/tunables/items.json: `chao`, in cells of half a metre): the game sets it
# down on those cells and turns it by quarters. Things a family in Luanda has: the plastic chair and table of every
# yard, a mattress before there is a bed, the sofa and the television that say the house is a home.

def cadeira(b):
    """The white plastic chair: on four splayed legs, with its curved back. Half a metre square."""
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.tube([(sx * 0.19, 0.0, sz * 0.19), (sx * 0.16, 0.42, sz * 0.15)], [0.02, 0.022], 4, "paintWhite", cap=False)
    b.box((0.0, 0.44, 0.0), (0.4, 0.04, 0.38), "paintWhite", skip_bottom=False)
    b.box((0.0, 0.66, -0.19), (0.38, 0.42, 0.03), "paintWhite", skip_bottom=False)
    for sx in (-1, 1):
        b.box((sx * 0.2, 0.58, -0.02), (0.03, 0.03, 0.34), "paintWhite", skip_bottom=False)


def mesa(b):
    """The plastic table of the yard, a metre square less a hand: white, on four legs."""
    b.box((0.0, 0.72, 0.0), (0.9, 0.04, 0.9), "paintWhite", skip_bottom=False)
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.tube([(sx * 0.38, 0.0, sz * 0.38), (sx * 0.34, 0.7, sz * 0.34)], [0.025, 0.03], 4, "paintWhite", cap=False)


def colchao(b):
    """A mattress on the floor, a metre by two: striped ticking, and a pillow at its head."""
    b.box((0.0, 0.09, 0.0), (0.94, 0.18, 1.94), "kerb", skip_bottom=True)
    for k in range(6):
        b.box((-0.4 + k * 0.16, 0.183, 0.0), (0.04, 0.004, 1.94), "zincBlue", skip_bottom=True)
    b.box((0.0, 0.23, -0.74), (0.6, 0.1, 0.34), "paintWhite", skip_bottom=True)


def cama(b):
    """A bed of wood, a metre and a half by two: the frame, its headboard, the mattress, a cloth over it and two pillows."""
    b.box((0.0, 0.2, 0.0), (1.46, 0.16, 1.96), "wood", skip_bottom=False)
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box((sx * 0.68, 0.06, sz * 0.93), (0.08, 0.12, 0.08), "acaciaTrunk", skip_bottom=True)
    b.box((0.0, 0.62, -0.955), (1.46, 0.84, 0.05), "wood", skip_bottom=False)
    b.box((0.0, 0.37, 0.02), (1.38, 0.18, 1.86), "kerb", skip_bottom=True)
    b.box((0.0, 0.47, 0.3), (1.4, 0.02, 1.3), "cloth", skip_bottom=True)
    for sx in (-1, 1):
        b.box((sx * 0.34, 0.51, -0.68), (0.52, 0.1, 0.32), "paintWhite", skip_bottom=True)


def sofa(b):
    """The sofa of the sala, two metres by one: dark red, deep, with fat arms and three cushions, its back to the wall."""
    b.box((0.0, 0.2, 0.05), (1.94, 0.4, 0.86), "carRed", skip_bottom=True)
    b.box((0.0, 0.6, -0.36), (1.94, 0.5, 0.22), "carRed", skip_bottom=True)
    for sx in (-1, 1):
        b.box((sx * 0.86, 0.42, 0.05), (0.22, 0.34, 0.86), "zincRed", skip_bottom=True)
    for k in (-1, 0, 1):
        b.box((k * 0.5, 0.45, 0.1), (0.46, 0.1, 0.6), "zincRed", skip_bottom=True)
        b.box((k * 0.5, 0.62, -0.22), (0.44, 0.34, 0.1), "roof", skip_bottom=True)


def televisao(b):
    """A television on its low stand, a metre wide: the stand of wood with a shelf, the set dark, its screen to the room."""
    b.box((0.0, 0.25, 0.0), (0.96, 0.5, 0.42), "wood", skip_bottom=True)
    b.box((0.0, 0.26, 0.2), (0.86, 0.3, 0.03), "acaciaTrunk", skip_bottom=True)
    b.box((0.0, 0.53, 0.0), (0.3, 0.04, 0.2), "tarShade", skip_bottom=True)
    b.box((0.0, 0.84, 0.0), (0.92, 0.56, 0.05), "tarShade", skip_bottom=False)
    b.rect((0.0, 0.84, 0.028), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), 0.84, 0.48, "window")


# Every thing a house is furnished with, by its name in the catalogue.
MOVEIS = {"cadeira": cadeira, "mesa": mesa, "colchao": colchao, "cama": cama, "sofa": sofa, "televisao": televisao}
