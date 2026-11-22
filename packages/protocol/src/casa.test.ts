import { expect, test } from "vitest";
import { encodePorta } from "./casa.ts";
import { decodeClientMessage } from "./messages.ts";

test("a door is asked open or shut in two bytes, and read back as it was asked", () => {
  expect(encodePorta(true)).toHaveLength(2);
  expect(decodeClientMessage(encodePorta(true))).toEqual({ type: "porta", open: true });
  expect(decodeClientMessage(encodePorta(false))).toEqual({ type: "porta", open: false });
});
