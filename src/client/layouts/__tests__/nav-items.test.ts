import { describe, it, expect } from "vitest";
import { NAV_ITEMS, SECONDARY_NAV_ITEMS, ALL_NAV_ITEMS } from "../nav-items";

/**
 * The drawer is the only navigation surface in the app, so a destination missing
 * from these lists is a destination the user cannot reach at all — which is how
 * /profile ended up link-less except for the avatar on Home.
 */

describe("drawer navigation", () => {
  it("reaches Profile from the bottom group, next to Settings", () => {
    expect(SECONDARY_NAV_ITEMS.map((item) => item.to)).toEqual([
      "/profile",
      "/settings",
    ]);
  });

  it("keeps the top-level surfaces in the primary group", () => {
    expect(NAV_ITEMS.map((item) => item.to)).toEqual([
      "/",
      "/workout/start",
      "/exercises",
      "/routines",
      "/programs",
      "/goals",
      "/history",
      "/equipment",
    ]);
  });

  it("links each destination exactly once, with a label", () => {
    const paths = ALL_NAV_ITEMS.map((item) => item.to);
    expect(new Set(paths).size).toBe(paths.length);
    for (const item of ALL_NAV_ITEMS) {
      expect(item.label.trim()).not.toBe("");
      expect(item.to.startsWith("/")).toBe(true);
    }
  });
});
