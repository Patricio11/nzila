import { describe, expect, test } from "vitest";
import { checkEmail, checkPassword } from "./email.ts";

describe("an email address", () => {
  test("is kept in the one form two typings of it share", () => {
    expect(checkEmail("  Ze.Manel@Exemplo.CO.AO ")).toBe("ze.manel@exemplo.co.ao");
    expect(checkEmail("a@b.ao")).toBe("a@b.ao");
  });

  test("is refused when it is not one", () => {
    for (const bad of ["", "ze", "ze@", "@exemplo.ao", "ze@exemplo", "ze manel@exemplo.ao", "ze@@exemplo.ao", "ze@exemplo..ao", "ze@.ao", `${"a".repeat(250)}@b.ao`, 42, null, undefined]) expect(checkEmail(bad), String(bad)).toBeNull();
  });
});

describe("a password", () => {
  test("is long enough, whatever it is made of", () => {
    expect(checkPassword("funje com peixe")).toBeNull();
    expect(checkPassword("abcdefgh")).toBeNull();
    expect(checkPassword("çãéõçãéõ")).toBeNull();
    expect(checkPassword("abcdefg")).toBe("short");
    expect(checkPassword("")).toBe("short");
    expect(checkPassword(12345678)).toBe("short");
    expect(checkPassword("a".repeat(129))).toBe("long");
  });

  test("is not the address it goes with, one letter over and over, or the first thing anyone would try", () => {
    expect(checkPassword("ze.manel@exemplo.ao", "ze.manel@exemplo.ao")).toBe("obvious");
    expect(checkPassword("Ze.Manel.Luanda", "ze.manel.luanda@exemplo.ao")).toBe("obvious");
    // A short name before the @ is too short to be a password anyway, and is not what is being guarded against.
    expect(checkPassword("zezinho1", "ze@exemplo.ao")).toBeNull();
    expect(checkPassword("aaaaaaaaaa")).toBe("obvious");
    expect(checkPassword("12345678")).toBe("obvious");
    expect(checkPassword(" Password ")).toBe("obvious");
    expect(checkPassword("funje com peixe", "@")).toBeNull();
  });
});
