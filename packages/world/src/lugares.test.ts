import { expect, test } from "vitest";
import { errandPlaces, isErrandPlace } from "./lugares.ts";

test("errands are sent to the places of a bairro, never to work or to a barbearia, and the order is the pack's", () => {
  const pois = [{ id: "mercado" }, { id: "biscato-zunga-zango" }, { id: "igreja" }, { id: "servico-corte-zango" }, { id: "cantina-zango" }];
  expect(errandPlaces(pois).map((one) => one.id)).toEqual(["mercado", "igreja", "cantina-zango"]);
  expect(isErrandPlace("servicos")).toBe(true);
  expect(isErrandPlace("biscato-carga-x")).toBe(false);
});
