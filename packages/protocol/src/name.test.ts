import { describe, expect, test } from "vitest";
import { checkName, nameKey } from "./name.ts";

describe("a name", () => {
  test("is kept trimmed, with single spaces, and with its accents", () => {
    expect(checkName("  Zé   Manel ")).toEqual({ name: "Zé Manel", key: "zemanel" });
    expect(checkName("Ngola-Kiluanji")).toEqual({ name: "Ngola-Kiluanji", key: "ngolakiluanji" });
    expect(checkName("D'Artagnan23")).toEqual({ name: "D'Artagnan23", key: "dartagnan23" });
    // Typed with a combining accent, kept as one letter.
    expect(checkName("Zé Tó")).toEqual({ name: "Zé Tó", key: "zeto" });
  });

  test("is the same name whatever the case, the accents and what stands between the words", () => {
    for (const other of ["ze manel", "ZÉ MANEL", "Ze-Manel", "zémanel", "Zè'Manél"]) expect(nameKey(other)).toBe("zemanel");
  });

  test("is 3 to 16 characters", () => {
    expect(checkName("Zé")).toBe("short");
    expect(checkName("   ")).toBe("short");
    expect(checkName("a".repeat(17))).toBe("long");
    expect(checkName("a".repeat(16))).toMatchObject({ key: "a".repeat(16) });
  });

  test("is made of letters: a letter first, then letters and digits, one separator at a time", () => {
    for (const bad of ["1Manel", "Zé  -Manel", "Zé--Manel", "-Manel", "Manel-", "Manel!", "Zé_Manel", "Мария", "Zé\nManel<b>", "😀😀😀", "ªºª", 42, null, undefined]) expect(checkName(bad), String(bad)).toBe("letters");
  });
});
