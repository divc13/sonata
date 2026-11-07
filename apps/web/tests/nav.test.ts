import { describe, expect, it } from "bun:test";

import { isNavActive, primaryNav } from "../config/nav";

describe("primary navigation", () => {
  it("is exactly the five Sonata screens", () => {
    expect(primaryNav.map((item) => [item.title, item.href])).toEqual([
      ["Home", "/"],
      ["Search", "/search"],
      ["Library", "/library"],
      ["Market", "/market"],
      ["You", "/me"],
    ]);
  });

  it("drops the old browse destinations", () => {
    const hrefs = primaryNav.map((item) => item.href);

    for (const old of ["/podcast", "/radio", "/show", "/mix", "/browse"]) {
      expect(hrefs).not.toContain(old);
    }
  });

  it("keeps the route below an item active, but not for the home link", () => {
    expect(isNavActive("/market", "/market")).toBe(true);
    expect(isNavActive("/market/midnight-drive", "/market")).toBe(true);
    expect(isNavActive("/me/liked-songs", "/me")).toBe(true);
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/search", "/")).toBe(false);
    expect(isNavActive(null, "/market")).toBe(false);
  });
});
