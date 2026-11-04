import { expect, it } from "vitest";
import {
  localDay,
  monthDays,
  shiftMonth,
  loadValue,
  numberLabel,
  validRange,
  validZone,
  validMonth,
} from "./model";
it("assigns a workout to its local start day across midnight and DST", () => {
  expect(localDay("2026-11-01T06:30:00Z", "America/Los_Angeles")).toBe(
    "2026-10-31",
  );
  expect(localDay("2026-11-01T08:30:00Z", "America/Los_Angeles")).toBe(
    "2026-11-01",
  );
  expect(localDay("2026-11-01T09:30:00Z", "America/Los_Angeles")).toBe(
    "2026-11-01",
  );
});
it("calendar handles leap years and year transitions without timezone drift", () => {
  expect(monthDays("2024-02-01")).toHaveLength(29);
  expect(monthDays("2025-02-01")).toHaveLength(28);
  expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
  expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
});
it("canonical kg values convert for display without rewriting source", () => {
  const source = 22.68;
  expect(numberLabel(loadValue(source, "lb"), "lb")).toBe("50");
  expect(loadValue(source, "kg")).toBe(source);
  expect(source).toBe(22.68);
});
it("rejects unsafe date and timezone filters", () => {
  expect(validRange("90")).toBe(true);
  expect(validRange("all")).toBe(true);
  expect(validRange("forever")).toBe(false);
  expect(validZone("America/Los_Angeles")).toBe(true);
  expect(validZone("fake/zone")).toBe(false);
  expect(validMonth("2026-11-01")).toBe(true);
  expect(validMonth("2026-11-02")).toBe(false);
  expect(validMonth("2026-99-01")).toBe(false);
});
