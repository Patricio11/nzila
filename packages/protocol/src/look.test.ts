import { describe, expect, test } from "vitest";
import { CATALOGUE, COLOURS, LOOK_BYTES, WIRE_IDS, arrivalLook, checkLook, packLook, unpackLook, type Look } from "./look.ts";

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

describe("a look for someone who has not chosen one", () => {
  test("is always one the wardrobe can dress, the same for the same number, and different from person to person", () => {
    const seen = new Set<string>();
    const sexes = new Set<string>();
    for (let seed = 0; seed < 600; seed++) {
      const look = arrivalLook(seed);
      expect(checkLook(look), `seed ${seed}`).not.toBeNull();
      expect(arrivalLook(seed)).toEqual(look);
      seen.add(JSON.stringify(look));
      sexes.add(look.sex);
    }
    // A street of newcomers is a street of different people.
    expect(seen.size).toBeGreaterThan(500);
    expect(sexes.size).toBe(2);
    // Covered hair takes a cloth's colour; hair that shows is its natural dark.
    const all = Array.from({ length: 600 }, (_, seed) => arrivalLook(seed));
    expect(all.filter((look) => look.hair === "lenco").every((look) => (COLOURS.cloth as readonly string[]).includes(look.hairColour))).toBe(true);
    expect(all.filter((look) => look.hair === "afro").every((look) => ["hairBlack", "hairBrown"].includes(look.hairColour))).toBe(true);
    expect(all.some((look) => look.top === "vestido" && look.bottom === "none")).toBe(true);
    // A number that is not a small whole one is still a number.
    expect(checkLook(arrivalLook(-7.5))).not.toBeNull();
    expect(Object.keys(CATALOGUE)).toContain(arrivalLook(4_000_000_000).sex);
  });
});

describe("a look on the wire", () => {
  test("every look the wardrobe can dress goes into twelve bytes and comes back the same", () => {
    for (let seed = 0; seed < 400; seed++) {
      const look = checkLook(arrivalLook(seed))!;
      const bytes = packLook(look);
      expect(bytes).toHaveLength(LOOK_BYTES);
      expect(unpackLook(bytes), `seed ${seed}`).toEqual(look);
    }
    // What is worn on the face, and the build, travel too.
    const him = checkLook({ ...arrivalLook(3), sex: "m", top: "tshirt", bottom: "shorts", hair: "dreads", hairColour: "hairCopper", extras: ["barba", "oculos"], tall: 1, broad: -1 })!;
    expect(unpackLook(packLook(him))).toEqual(him);
    const her = checkLook({ ...arrivalLook(3), sex: "f", top: "vestido", bottom: "none", hair: "lenco", hairColour: "awningRed", extras: ["brincos"], tall: -1, broad: 1 })!;
    expect(unpackLook(packLook(her))).toEqual(her);
  });

  test("bytes that are not a look are nobody's look; a thing this phone does not have is drawn as the nearest it does", () => {
    const good = packLook(checkLook(arrivalLook(1))!);
    expect(unpackLook(good.slice(0, 11))).toBeNull();
    expect(unpackLook(new Uint8Array(13))).toBeNull();
    // Neither a woman nor a man, or a build out of its nine: not a look.
    for (const n of [0, 11]) {
      const bad = good.slice();
      bad[n] = 250;
      expect(unpackLook(bad), `byte ${n}`).toBeNull();
    }
    // Any one thing a newer wardrobe has and this one does not: that thing as the nearest this phone has, the rest as sent.
    for (let n = 1; n < 11; n++) {
      const newer = good.slice();
      newer[n] = 250;
      const seen = unpackLook(newer);
      expect(seen, `byte ${n}`).not.toBeNull();
      expect(checkLook(seen)).toEqual(seen);
    }
    const unknownHair = good.slice();
    unknownHair[2] = 200;
    expect(unpackLook(unknownHair)!.hair).toBe("baixo");
    // Extras by their own bits: none, known ones, and one this phone has never heard of.
    const plain = checkLook({ ...arrivalLook(2), sex: "m", top: "tshirt", bottom: "shorts", hair: "baixo", hairColour: "hairBlack" })!;
    expect(packLook({ ...plain, extras: [] })[10]).toBe(0);
    expect(packLook({ ...arrivalLook(2) })[10]).toBe(0);
    expect(packLook({ ...plain, extras: ["bigode", "brincos"] })[10]).toBe((1 << 3) | (1 << 0));
    expect(packLook({ ...plain, extras: ["capacete"] })[10]).toBe(0);
        // A look with an invented thing travels as the nearest real one: nothing invented is drawn.
    expect(unpackLook(packLook({ ...arrivalLook(1), hair: "moicano", extras: ["monoculo"] }))!.hair).toBe("baixo");
  });

  test("THE NUMBERS ARE WIRE FORMAT: each thing keeps its number for ever; the order things are shown in is free", () => {
    // If this fails because a new thing took the next number, add it here. If it fails for any other reason,
    // every player's look would change on every phone that has not reloaded: do not do it.
    expect(WIRE_IDS).toEqual({
      hair: { baixo: 0, careca: 1, afro: 2, cachos: 3, trancas: 4, bob: 5, puxinho: 6, dreads: 7, lenco: 8, bone: 9, galo: 10 },
      top: { tshirt: 0, blusa: 1, alcas: 2, vestido: 3, long: 4, camisa: 5, camisola: 6, fato: 7 },
      bottom: { trousers: 0, shorts: 1, skirt: 2, pano: 3, none: 4 },
      colour: {
        paintWhite: 0, clothBlack: 1, awningRed: 2, awningGold: 3, awningTeal: 4, zincBlue: 5, vanBlue: 6, person1: 7, person3: 8, person4: 9, khaki: 10, jeans: 11,
        jeansDark: 12, person2: 13, cloth: 14, hairBlack: 15, hairBrown: 16, hairCopper: 17, hairRed: 18, hairBlond: 19, hairGrey: 20, shoe: 21, shoeWhite: 22, shoeTan: 23,
      },
      extra: { brincos: 0, oculos: 1, barba: 2, bigode: 3 },
    });
    // No number is given twice, and everything the wardrobe offers has one.
    for (const table of Object.values(WIRE_IDS)) expect(new Set(Object.values(table)).size).toBe(Object.values(table).length);
    for (const sex of ["f", "m"] as const) {
      for (const hair of CATALOGUE[sex].hair) expect(WIRE_IDS.hair, hair).toHaveProperty(hair);
      for (const [top, below] of Object.entries(CATALOGUE[sex].tops)) {
        expect(WIRE_IDS.top, top).toHaveProperty(top);
        for (const bottom of below) expect(WIRE_IDS.bottom, bottom).toHaveProperty(bottom);
      }
      for (const extra of CATALOGUE[sex].extras) expect(WIRE_IDS.extra, extra).toHaveProperty(extra);
    }
    for (const list of Object.values(COLOURS)) for (const colour of list) expect(WIRE_IDS.colour, colour).toHaveProperty(colour);
  });
});
