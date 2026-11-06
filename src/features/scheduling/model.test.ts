import { expect, it } from "vitest";
import { dateOffset, localDate, validDate } from "./model";
it("validates real bounded ISO dates rather than normalizing impossible dates", () => {
  expect(validDate("2028-02-29")).toBe(true);
  for (const value of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "infinity",
    "2026-1-1",
    ["2026-01-01"],
    "1800-01-01",
  ])
    expect(validDate(value)).toBe(false);
});
it("navigates calendar dates across week/month/year boundaries without host timezone arithmetic", () => {
  expect(dateOffset("2026-12-28", 7)).toBe("2027-01-04");
  expect(dateOffset("2026-03-01", -7)).toBe("2026-02-22");
  expect(dateOffset("2028-02-28", 1)).toBe("2028-02-29");
  expect(() => dateOffset("invalid", 7)).toThrow();
});
it("uses the selected timezone across midnight and both DST transitions", () => {
  expect(localDate("America/New_York", new Date("2026-11-06T01:00:00Z"))).toBe(
    "2026-11-05",
  );
  expect(localDate("Pacific/Auckland", new Date("2026-11-06T23:00:00Z"))).toBe(
    "2026-11-07",
  );
  for (const timestamp of ["2026-03-08T06:30:00Z", "2026-03-08T07:30:00Z"])
    expect(localDate("America/New_York", new Date(timestamp))).toBe(
      "2026-03-08",
    );
  for (const timestamp of ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"])
    expect(localDate("America/New_York", new Date(timestamp))).toBe(
      "2026-11-01",
    );
});
