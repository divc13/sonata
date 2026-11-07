import { describe, expect, it } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import HomePage from "../../app/(root)/page";
import { demoMasters, topEarners } from "../../lib/sonata-demo";

function render() {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<HomePage />);
  return container;
}

describe("Home page", () => {
  it("features Midnight Drive with a play control and a master link", () => {
    const container = render();

    expect(container.querySelector("h1")?.textContent).toBe("Midnight Drive");
    expect(container.textContent).toContain("Nadia Vale");
    expect(container.textContent).toContain("Earns $0.03 per verified hour");
    expect(
      container.querySelector('button[aria-label="Play Midnight Drive"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('a[href="/master/midnight-drive"]'),
    ).not.toBeNull();
  });

  it("shows the pass strip with the 30 day offer", () => {
    const container = render();

    expect(container.textContent).toContain("Listen to everything for");
    expect(container.textContent).toContain("30 days");
    expect(container.querySelector('a[href="/pass"]')).not.toBeNull();
  });

  it("lists the six top earning masters with trailing earnings", () => {
    const container = render();
    const heading = [...container.querySelectorAll("h2")].find(
      (h) => h.textContent === "Top earning masters",
    );
    const section = heading?.closest("section");
    const cards = section?.querySelectorAll("article");

    expect(cards?.length).toBe(6);
    expect(topEarners[0]?.title).toBe("Harbor Lights");
    expect(section?.textContent).toContain("$158.70");
  });

  it("lists eight new releases", () => {
    const container = render();
    const heading = [...container.querySelectorAll("h2")].find(
      (h) => h.textContent === "New releases",
    );
    const section = heading?.closest("section");
    const cards = section?.querySelectorAll("article");

    expect(cards?.length).toBe(8);
    expect(demoMasters.length).toBeGreaterThanOrEqual(8);
  });

  it("keeps the old carousel off the page", () => {
    const container = render();

    expect(container.textContent).not.toContain("Featured playlist");
    expect(container.textContent).not.toContain("Quick picks");
  });
});
