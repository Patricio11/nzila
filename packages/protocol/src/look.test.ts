import { describe, expect, test } from "vitest";
import { CATALOGUE, COLOURS, checkLook, type Look } from "./look.ts";

const her: Look = { sex: "f", skin: 2, hair: "trancas", hairColour: "hairBlack", top: "blusa", topColour: "awningGold", bottom: "pano", bottomColour: "awningTeal", bands: "awningGold", shoe: "shoeTan" };
const him: Look = { sex: "m", skin: 3, hair: "galo", hairColour: "hairBlond", top: "tshirt", topColour: "paintWhite", bottom: "trousers", bottomColour: "jeansDark", bands: "awningGold", shoe: "shoeWhite", extras: ["oculos", "bigode"], tall: 1, broad: -1 };

describe("a look the wardrobe can dress", () => {
  test("is kept as it was given, with what was left out filled in", () => {
    expect(checkLook(her)).toEqual({ ...her, extras: [], tall: 0, broad: 0 });
    expect(checkLook(him)).toEqual(him);
  });

  test("a covered head takes the colour of a cloth, a dress has nothing below", () => {
    expect(checkLook({ ...her, hair: "lenco", hairColour: "awningRed" })).not.toBeNull();
    expect(checkLook({ ...her, hair: "lenco", hairColour: "hairRed" })).toBeNull();
    expect(checkLook({ ...her, top: "vestido", bottom: "none" })).not.toBeNull();
    expect(checkLook({ ...her, top: "vestido", bottom: "pano" })).toBeNull();
  });

  test("every thing in the catalogue can be worn", () => {
    for (const sex of ["f", "m"] as const) {
      for (const [top, below] of Object.entries(CATALOGUE[sex].tops)) for (const bottom of below) expect(checkLook({ ...her, sex, hair: "afro", top, bottom }), `${sex} ${top} ${bottom}`).not.toBeNull();
      for (const hair of CATALOGUE[sex].hair) expect(checkLook({ ...(sex === "f" ? her : him), hair, hairColour: hair === "lenco" || hair === "bone" ? COLOURS.cloth[0] : COLOURS.hair[0] }), hair).not.toBeNull();
    }
  });
});

describe("a look is refused whole", () => {
  test("when it is not an object, or carries a field nobody asked for", () => {
    for (const bad of [null, undefined, 7, "look", [her]]) expect(checkLook(bad)).toBeNull();
    expect(checkLook({ ...her, admin: true })).toBeNull();
  });

  test("when one thing in it is not in the wardrobe", () => {
    const wrong: Record<string, unknown>[] = [
      { sex: "x" },
      { skin: 5 },
      { skin: -1 },
      { skin: 1.5 },
      { skin: "2" },
      { hair: "galo" },
      { hair: 3 },
      { hairColour: "awningRed" },
      { top: "long" },
      { top: "toString" },
      { top: 1 },
      { bottom: "none" },
      { topColour: "sky" },
      { bottomColour: "sky" },
      { bands: "sky" },
      { shoe: "sky" },
      { extras: "oculos" },
      { extras: ["barba"] },
      { extras: ["oculos", "oculos"] },
      { tall: 2 },
      { broad: 0.5 },
    ];
    for (const patch of wrong) expect(checkLook({ ...her, ...patch }), JSON.stringify(patch)).toBeNull();
  });
});
