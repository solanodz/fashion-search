import { describe, expect, it } from "vitest";

import { translateQuery } from "./spanish";

describe("translateQuery", () => {
  it.each([
    ["un vestido rojo", "red dress"],
    ["remera blanca para hombre", "white t-shirt for men"],
    ["camisa azul marino para hombre", "navy blue shirt for men"],
    ["zapatos de taco alto negros", "black high heels"],
    ["anteojos de sol negros", "black sunglasses"],
    ["Campera negra para hombre", "black jacket for men"],
    ["ojotas azules", "blue flip flops"],
    ["aros dorados", "gold earrings"],
    ["remera de manga larga negra", "long sleeve black t-shirt"],
    ["en azul", "blue"],
  ])("“%s” → “%s”", (spanish, english) => {
    expect(translateQuery(spanish)).toEqual({
      text: english,
      translated: true,
    });
  });

  it("strips accents and plurals", () => {
    expect(translateQuery("pantalón deportivo gris").text).toBe(
      "grey track pants",
    );
    expect(translateQuery("zapatillas blancas").text).toBe("white sneakers");
  });

  it("keeps words it doesn't know, such as brands", () => {
    expect(translateQuery("zapatillas Nike rojas").text).toBe(
      "nike red sneakers",
    );
  });

  it("leaves English queries unchanged", () => {
    for (const english of [
      "a red dress",
      "men's blue jeans",
      "white running shoes",
      "top",
    ]) {
      expect(translateQuery(english)).toEqual({
        text: english,
        translated: false,
      });
    }
  });
});
