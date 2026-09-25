import { describe, it, expect } from "vitest";
import { getSaleStatus } from "./saleWindow.js";

const start = new Date("2026-01-01T00:00:00.000Z");
const end = new Date("2026-01-02T00:00:00.000Z");

describe("getSaleStatus", () => {
  it("TC-A1: returns upcoming before the sale starts", () => {
    expect(getSaleStatus(new Date("2025-12-31T23:59:59.999Z"), start, end)).toBe("upcoming");
  });

  it("returns active at the exact start instant (inclusive)", () => {
    expect(getSaleStatus(start, start, end)).toBe("active");
  });

  it("TC-A2: returns active during the sale window", () => {
    expect(getSaleStatus(new Date("2026-01-01T12:00:00.000Z"), start, end)).toBe("active");
  });

  it("returns ended at the exact end instant (exclusive)", () => {
    expect(getSaleStatus(end, start, end)).toBe("ended");
  });

  it("TC-A3: returns ended after the sale ends", () => {
    expect(getSaleStatus(new Date("2026-01-02T00:00:01.000Z"), start, end)).toBe("ended");
  });
});
