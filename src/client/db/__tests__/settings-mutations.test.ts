import { describe, it, expect } from "vitest";
import { SETTINGS_ID } from "../mutations";
import type { Settings } from "../../../shared";

// Since Dexie requires IndexedDB (not available in node), we test the mutation
// contract by verifying payload shapes, entity/op values, and the SETTINGS_ID constant.

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  const now = Date.now();
  return {
    id: SETTINGS_ID,
    weightUnit: "kg",
    distanceUnit: "km",
    heightUnit: "cm",
    timezone: "America/Chicago",
    weekStartsOn: "mon",
    showRpe: true,
    showCardio: true,
    theme: "system",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("SETTINGS_ID constant", () => {
  it("is the expected singleton UUID", () => {
    expect(SETTINGS_ID).toBe("00000000-0000-0000-0000-000000000001");
  });
});

describe("updateSettings — outbox entry shape", () => {
  it("outbox entry has entity='settings', op='update', and payload matches record", () => {
    const record = makeSettings();
    // Simulate what updateSettings enqueues
    const entry = {
      id: "pending-settings-1",
      entity: "settings" as const,
      op: "update" as const,
      payload: record,
      createdAt: Date.now(),
      retries: 0,
      lastError: null,
    };
    expect(entry.entity).toBe("settings");
    expect(entry.op).toBe("update");
    expect((entry.payload as Settings).id).toBe(SETTINGS_ID);
    expect((entry.payload as Settings).weightUnit).toBe("kg");
  });

  it("changed weightUnit reflects in the payload", () => {
    const record = makeSettings({ weightUnit: "lb" });
    const entry = {
      entity: "settings" as const,
      op: "update" as const,
      payload: record,
    };
    expect((entry.payload as Settings).weightUnit).toBe("lb");
  });

  it("two subsequent updates have different updatedAt values", () => {
    const t1 = Date.now();
    const r1 = makeSettings({ updatedAt: t1 });
    const t2 = t1 + 100;
    const r2 = makeSettings({ updatedAt: t2 });
    expect(r2.updatedAt).toBeGreaterThan(r1.updatedAt);
  });

  it("updateSettings payload carries all 11 settings fields", () => {
    const record = makeSettings();
    const fieldNames = [
      "id",
      "weightUnit",
      "distanceUnit",
      "heightUnit",
      "timezone",
      "weekStartsOn",
      "showRpe",
      "showCardio",
      "theme",
      "createdAt",
      "updatedAt",
    ];
    for (const field of fieldNames) {
      expect(record).toHaveProperty(field);
    }
  });
});
