import { describe, it, expect } from "vitest";
import { loadStyleForEquipment, usesPlates } from "../equipment-loading";

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

describe("usesPlates", () => {
  it("is true only for a barbell", () => {
    expect(usesPlates("barbell")).toBe(true);
    expect(usesPlates("dumbbell")).toBe(false);
    expect(usesPlates("machine")).toBe(false);
    expect(usesPlates("bodyweight")).toBe(false);
    expect(usesPlates("cardio")).toBe(false);
    expect(usesPlates("unknown")).toBe(false);
  });
});
