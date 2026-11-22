import { expect, test } from "vitest";
import { MOVEL_OPS, encodeMovel, encodePorta } from "./casa.ts";
import { decodeClientMessage } from "./messages.ts";

test("a door is asked open or shut in two bytes, and read back as it was asked", () => {
  expect(encodePorta(true)).toHaveLength(2);
  expect(decodeClientMessage(encodePorta(true))).toEqual({ type: "porta", open: true });
  expect(decodeClientMessage(encodePorta(false))).toEqual({ type: "porta", open: false });
});

test("a thing set down, taken up or put elsewhere is asked with the cell of the house's plan and the turn, and read back as asked; what is no such asking is refused", () => {
  const asked = { op: "por" as const, id: 0, item: "cadeira", cx: -7, cz: 4, rot: 3 };
  expect(decodeClientMessage(encodeMovel(asked))).toEqual({ type: "movel", ...asked, op: MOVEL_OPS.indexOf("por") });
  expect(decodeClientMessage(encodeMovel({ ...asked, op: "mudar", id: 300 }))).toMatchObject({ op: 2, id: 300 });
  const bytes = encodeMovel(asked);
  expect(() => decodeClientMessage(Uint8Array.from([...bytes.slice(0, -1), 4]))).toThrow(/malformed/);
  expect(() => decodeClientMessage(Uint8Array.from([bytes[0]!, 3, ...bytes.slice(2)]))).toThrow(/malformed/);
  expect(() => decodeClientMessage(encodeMovel({ ...asked, item: "Cadeira!" }))).toThrow(/malformed/);
});
