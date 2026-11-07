import { describe, expect, it } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import HomePage from "../../app/(root)/page";

function render() {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<HomePage />);
  return container;
}

describe("Home page shell", () => {
  it("streams a hero and shelf skeleton while the catalogue loads", () => {
    const container = render();
    const skeleton = container.querySelector('[aria-hidden="true"]');

    expect(skeleton).not.toBeNull();
    expect(skeleton?.querySelectorAll(".bg-fill").length).toBeGreaterThan(8);
  });

  it("keeps the old catalog carousel off the page", () => {
    const container = render();

    expect(container.textContent).not.toContain("Featured playlist");
    expect(container.textContent).not.toContain("Quick picks");
  });

  it("renders no static demo shelves before the real reads return", () => {
    const container = render();

    expect(container.querySelectorAll("article")).toHaveLength(0);
    expect(container.textContent).not.toContain("Harbor Lights");
  });
});
