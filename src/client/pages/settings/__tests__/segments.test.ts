import { describe, it, expect } from "vitest";
import { z } from "zod";
import { SettingsSchema } from "../../../../shared/settings";
import {
  DISTANCE_UNIT_SEGMENTS,
  HEIGHT_UNIT_SEGMENTS,
  THEME_SEGMENTS,
  WEEK_START_SEGMENTS,
  WEIGHT_UNIT_SEGMENTS,
} from "../segments";
import type { SegmentOption } from "../segments";

/**
 * A segmented control that cannot render one of the values its setting is allowed
 * to hold is a control that lies: the stored value stays put while the highlight
 * lands somewhere else (or nowhere). These tests pin every segmented setting's
 * option list to the enum in the schema, so adding a value to the schema without
 * adding a segment fails here rather than in front of a user.
 */

/** The literal values a settings field is allowed to hold, straight from the schema. */
function allowedValues(field: keyof typeof SettingsSchema.shape): string[] {
  const shape = SettingsSchema.shape[field] as z.ZodTypeAny;
  const inner = shape instanceof z.ZodDefault ? shape.removeDefault() : shape;
  if (!(inner instanceof z.ZodEnum)) {
    throw new Error(`${field} is not an enum`);
  }
  return inner.options as string[];
}

const CASES: [keyof typeof SettingsSchema.shape, readonly SegmentOption<string>[]][] = [
  ["weightUnit", WEIGHT_UNIT_SEGMENTS],
  ["distanceUnit", DISTANCE_UNIT_SEGMENTS],
  ["heightUnit", HEIGHT_UNIT_SEGMENTS],
  ["weekStartsOn", WEEK_START_SEGMENTS],
  ["theme", THEME_SEGMENTS],
];

describe("settings segmented controls", () => {
  for (const [field, segments] of CASES) {
    it(`offers a segment for every value ${field} can hold`, () => {
      expect(segments.map((s) => s.value)).toEqual(allowedValues(field));
    });

    it(`gives every ${field} segment a non-empty label`, () => {
      for (const segment of segments) {
        expect(segment.label.trim()).not.toBe("");
      }
    });
  }
});
