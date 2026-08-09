import {describe, expect, it} from "vitest";
import {ceilToQuarterInchMm, formatLengthInput, inchesToMm, nextLengthCheckpoint, parseDraft, QUARTER_INCH_MM} from "./measurements";

describe("customer measurement policy", () => {
  it("keeps clean inch defaults and quarter checkpoints", () => {
    expect(inchesToMm(14)).toBe(355.6);
    expect(formatLengthInput(inchesToMm(14), "in")).toBe("14");
    expect(formatLengthInput(inchesToMm(14.25), "in")).toBe("14.25");
    expect(formatLengthInput(inchesToMm(14.5), "in")).toBe("14.50");
    expect(formatLengthInput(inchesToMm(14.75), "in")).toBe("14.75");
  });

  it("moves arrows and focused wheel through the same checkpoints", () => {
    const start = inchesToMm(14);
    expect(nextLengthCheckpoint(start, "in", 1)).toBe(inchesToMm(14.25));
    expect(nextLengthCheckpoint(inchesToMm(14.25), "in", 1)).toBe(inchesToMm(14.5));
    expect(nextLengthCheckpoint(inchesToMm(14.5), "in", -1)).toBe(inchesToMm(14.25));
    expect(nextLengthCheckpoint(inchesToMm(14.1), "in", 1)).toBe(inchesToMm(14.25));
  });

  it("does not turn empty drafts into zero", () => {
    expect(parseDraft("", "in")).toBeUndefined();
    expect(parseDraft(".", "in")).toBeUndefined();
    expect(parseDraft("14.25", "in")).toBe(inchesToMm(14.25));
  });

  it("rounds generated stock upward and never below the exact requirement", () => {
    expect(ceilToQuarterInchMm(49.57 * 25.4)).toBeCloseTo(49.75 * 25.4, 5);
    expect(ceilToQuarterInchMm(62.44 * 25.4)).toBeCloseTo(62.5 * 25.4, 5);
    expect(ceilToQuarterInchMm(QUARTER_INCH_MM)).toBe(QUARTER_INCH_MM);
    expect(ceilToQuarterInchMm(49.57 * 25.4)).toBeGreaterThan(49.57 * 25.4);
  });
});
