import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MuscleMap } from "../muscle-map/muscle-map";
import { BACK_SHAPES, FRONT_SHAPES } from "../muscle-map/body-shapes";
import { MAPPED_MUSCLES } from "../../lib/muscles/muscle-load";

const render = (intensities = {}) =>
  renderToStaticMarkup(createElement(MuscleMap, { intensities, label: "Primary: Chest" }));

describe("MuscleMap", () => {
  it("draws every muscle the logic can shade, on at least one side", () => {
    const drawn = new Set([...FRONT_SHAPES, ...BACK_SHAPES].map((s) => s.muscle));
    for (const m of MAPPED_MUSCLES) expect(drawn).toContain(m);
  });

  it("shades a muscle with its intensity token on both sides of the body", () => {
    const html = render({ chest: 4 });
    const chestFills = html.match(/fill="var\(--muscle-4\)" data-muscle="chest"/g) ?? [];
    const chestShapes = FRONT_SHAPES.filter((s) => s.muscle === "chest").length;
    expect(chestFills).toHaveLength(chestShapes * 2);
    expect(html).not.toMatch(/data-muscle="biceps"[^>]*--muscle-4|--muscle-4\)" data-muscle="biceps"/);
  });

  it("is announced as one image with the given label", () => {
    expect(render()).toContain('role="img" aria-label="Primary: Chest"');
  });
});
