import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import Home from "./page";

test("home page shows the title and the search sentence", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", { level: 1, name: "fashion-search" }),
  ).toBeDefined();
  expect(
    screen.getByRole("textbox", { name: "Describe what you are looking for" }),
  ).toBeDefined();
});
