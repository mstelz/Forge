import { describe, it, expect } from "vitest";
import {
  loadIncrement,
  loadStyleForEquipment,
  roundToLoadable,
  usesPlates,
} from "../equipment-loading";

describe("loadStyleForEquipment", () => {
  it("recognises the equipment names this app ships with", () => {
    expect(loadStyleForEquipment(["Barbell"])).toBe("barbell");
    expect(loadStyleForEquipment(["Dumbbells"])).toBe("dumbbell");
    expect(loadStyleForEquipment(["Kettlebell"])).toBe("dumbbell");
    expect(loadStyleForEquipment(["Cable Machine"])).toBe("machine");
    expect(loadStyleForEquipment(["Machine"])).toBe("machine");
    expect(loadStyleForEquipment(["Bodyweight"])).toBe("bodyweight");
    expect(loadStyleForEquipment(["Pull-up Bar"])).toBe("bodyweight");
    expect(loadStyleForEquipment(["Treadmill"])).toBe("cardio");
    expect(loadStyleForEquipment(["Rower"])).toBe("cardio");
    expect(loadStyleForEquipment(["Stationary Bike"])).toBe("cardio");
    expect(loadStyleForEquipment(["None"])).toBe("bodyweight");
  });

  it("admits when it does not recognise the equipment", () => {
    expect(loadStyleForEquipment(["Resistance Band"])).toBe("unknown");
    expect(loadStyleForEquipment([])).toBe("unknown");
  });

  it("prefers the barbell when an exercise lists several", () => {
    // A bench press lists a barbell and a bench; the bar is what gets loaded.
    expect(loadStyleForEquipment(["Bench", "Barbell"])).toBe("barbell");
  });
});

describe("loadIncrement", () => {
  it("moves a barbell by a pair of the smallest plates", () => {
    expect(loadIncrement("barbell", "kg")).toBe(2.5);
    expect(loadIncrement("barbell", "lb")).toBe(5);
  });

  it("uses a rack-sized step for dumbbells", () => {
    expect(loadIncrement("dumbbell", "kg")).toBe(2);
  });

  it("uses a coarser step for a machine stack", () => {
    expect(loadIncrement("machine", "kg")).toBe(5);
  });

  it("refuses to suggest a load change where load is not the variable", () => {
    // Bodyweight progresses in reps and cardio in distance or time.
    expect(loadIncrement("bodyweight", "kg")).toBeNull();
    expect(loadIncrement("cardio", "kg")).toBeNull();
  });

  it("stays quiet rather than guessing at unknown equipment", () => {
    expect(loadIncrement("unknown", "kg")).toBeNull();
  });

  it("gives pound users pound-shaped numbers, not converted kilos", () => {
    // 2.5kg is 5.5lb, which is not a number anyone loads.
    expect(loadIncrement("barbell", "lb")).toBe(5);
    expect(loadIncrement("machine", "lb")).toBe(10);
  });
});

describe("usesPlates", () => {
  it("is true only for a barbell", () => {
    expect(usesPlates("barbell")).toBe(true);
    expect(usesPlates("dumbbell")).toBe(false);
    expect(usesPlates("machine")).toBe(false);
    expect(usesPlates("bodyweight")).toBe(false);
  });
});

describe("roundToLoadable", () => {
  it("snaps to the nearest loadable weight", () => {
    expect(roundToLoadable(84.2, 2.5)).toBe(85);
    expect(roundToLoadable(83.7, 2.5)).toBe(82.5);
    expect(roundToLoadable(82.4, 2.5)).toBe(82.5);
  });

  it("leaves the weight alone when there is no increment to snap to", () => {
    expect(roundToLoadable(83.7, null)).toBe(83.7);
    expect(roundToLoadable(83.7, 0)).toBe(83.7);
  });
});
