import {describe, expect, it} from "vitest";
import {measurementFromSource, resolveBoxMeasurement} from "./boxInventory";
import {inchesToMm} from "./measurements";

const cube = (inches: number) => ({lengthMm: inchesToMm(inches), widthMm: inchesToMm(inches), heightMm: inchesToMm(inches)});

describe("box inventory measurement basis", () => {
  it("uses inside measurements directly", () => {
    expect(resolveBoxMeasurement({rawDimensions: cube(16), basis: "INSIDE"})).toEqual({status: "RESOLVED", internalDimensions: cube(16)});
    expect(measurementFromSource({existingBox: cube(16)})).toMatchObject({basis: "INSIDE", rawDimensions: cube(16)});
  });

  it("deducts two conservative outside walls from every axis", () => {
    const resolved = resolveBoxMeasurement({rawDimensions: cube(16.5), basis: "OUTSIDE", boardThicknessMm: 4, uncertaintyMm: 1});
    expect(resolved).toMatchObject({status: "RESOLVED"});
    if (resolved.status !== "RESOLVED") return;
    for (const value of Object.values(resolved.internalDimensions)) expect(value / 25.4).toBeCloseTo(16.106, 3);
    expect(resolved.warning).toContain("two walls");
  });

  it("does not claim a fit for unknown or incomplete outside measurements", () => {
    expect(resolveBoxMeasurement({rawDimensions: cube(16), basis: "NOT_SURE"})).toMatchObject({status: "MEASUREMENT_REQUIRED"});
    expect(resolveBoxMeasurement({rawDimensions: cube(16), basis: "OUTSIDE"})).toMatchObject({status: "MEASUREMENT_REQUIRED"});
    expect(resolveBoxMeasurement({rawDimensions: cube(16), basis: "OUTSIDE", boardThicknessMm: 0})).toMatchObject({status: "INVALID"});
  });

  it("rejects a 16-inch envelope when 16.3-inch outside walls leave only 15.906 inches", () => {
    const resolved = resolveBoxMeasurement({rawDimensions: cube(16.3), basis: "OUTSIDE", boardThicknessMm: 4, uncertaintyMm: 1});
    expect(resolved).toMatchObject({status: "RESOLVED"});
    if (resolved.status !== "RESOLVED") return;
    for (const value of Object.values(resolved.internalDimensions)) expect(value / 25.4).toBeCloseTo(15.906, 3);
    expect(Object.values(resolved.internalDimensions).every((value) => value < inchesToMm(16))).toBe(true);
  });

  it("rejects invalid raw and post-deduction dimensions", () => {
    expect(resolveBoxMeasurement({rawDimensions: {lengthMm: 1, widthMm: 0, heightMm: 1}, basis: "INSIDE"})).toMatchObject({status: "INVALID"});
    expect(resolveBoxMeasurement({rawDimensions: {lengthMm: 8, widthMm: 8, heightMm: 8}, basis: "OUTSIDE", boardThicknessMm: 4, uncertaintyMm: 1})).toMatchObject({status: "INVALID"});
  });
});
