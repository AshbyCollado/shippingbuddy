import {describe, expect, it} from "vitest";
import {calculateCornerReform, type CornerReformInput} from "./cornerReform";

describe("corner reform recipe", () => {
  const base: CornerReformInput = {
    originalInternal: {lengthMm: 500, widthMm: 400, heightMm: 600},
    requiredInternal: {lengthMm: 460, widthMm: 360, heightMm: 600},
    mode: "SYMMETRIC",
    availableAllowancesMm: {lengthStart: 50, lengthEnd: 50, widthStart: 50, widthEnd: 50},
    minimumOverlapMm: 20,
    edgeClearanceMm: 3,
    joint: "ADHESIVE",
    condition: "NEW",
  };
  const expectError = (input: CornerReformInput, code: string) => {
    const result = calculateCornerReform(input);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.diagnostics[0].code).toBe(code);
  };

  it("creates the exact deeply immutable symmetric four-corner plan", () => {
    const result = calculateCornerReform(base);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result).toMatchObject({
      id: "RSC_CORNER_REFORM_V1", status: "PROTOTYPE_ONLY", mode: "SYMMETRIC",
      finalInternal: {lengthMm: 460, widthMm: 360, heightMm: 600},
      reductionsMm: {lengthStart: 20, lengthEnd: 20, widthStart: 20, widthEnd: 20},
    });
    expect(result.marks).toHaveLength(4);
    expect(result.marks.every((mark) => mark.requiredAllowanceMm === 43)).toBe(true);
    expect(result.operations.filter((operation) => operation.type === "SCORE")).toHaveLength(4);
    expect(result.operations.filter((operation) => operation.type === "CUT")).toHaveLength(4);
    expect(result.operations.filter((operation) => operation.type === "SCRAP")).toHaveLength(2);
    expect(result.playbook.map((step) => step.code)).toEqual(["VERIFY_SOURCE", "MARK_REDUCTIONS", "CUT_RELIEF", "REFORM_CORNERS", "REJOIN_JOINT", "TAPE_TOP", "REMEASURE"]);
    expect(result.warnings.join(" ")).toContain("does not establish strength, carrier, or manufacturing compliance");
    expect(result.operations.every((operation) => !("x" in operation) && !("y" in operation))).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.marks)).toBe(true);
    expect(Object.isFrozen(result.marks[0])).toBe(true);
  });

  it("allows one-axis reform without demanding allowance on untouched width sides", () => {
    const result = calculateCornerReform({...base,
      requiredInternal: {lengthMm: 460, widthMm: 400, heightMm: 600},
      availableAllowancesMm: {lengthStart: 43, lengthEnd: 43, widthStart: 0, widthEnd: 0},
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.finalInternal).toEqual({lengthMm: 460, widthMm: 400, heightMm: 600});
    expect(result.marks.map((mark) => mark.side)).toEqual(["lengthStart", "lengthEnd"]);
    expect(result.operations.filter((operation) => operation.type !== "SCRAP")).toHaveLength(4);
    expectError({...base, requiredInternal: {lengthMm: 460, widthMm: 400, heightMm: 600}, availableAllowancesMm: {lengthStart: 42.99, lengthEnd: 43, widthStart: 0, widthEnd: 0}}, "INSUFFICIENT_CORNER_ALLOWANCE");
  });

  it("accepts unequal exact splits and rejects missing, negative, or mismatched splits", () => {
    const result = calculateCornerReform({...base, mode: "UNEQUAL", reductionsMm: {lengthStart: 10, lengthEnd: 30, widthStart: 5, widthEnd: 35}, availableAllowancesMm: {lengthStart: 33, lengthEnd: 53, widthStart: 28, widthEnd: 58}});
    expect("error" in result).toBe(false);
    if (!("error" in result)) expect(result.reductionsMm).toEqual({lengthStart: 10, lengthEnd: 30, widthStart: 5, widthEnd: 35});
    expectError({...base, mode: "UNEQUAL"}, "INVALID_MEASUREMENTS");
    expectError({...base, mode: "UNEQUAL", reductionsMm: {lengthStart: -1, lengthEnd: 41, widthStart: 20, widthEnd: 20}}, "INVALID_MEASUREMENTS");
    expectError({...base, mode: "UNEQUAL", reductionsMm: {lengthStart: 10, lengthEnd: 29, widthStart: 20, widthEnd: 20}}, "SPLIT_SUM_MISMATCH");
  });

  it("clamps insignificant noise but rejects enlargement, no-op, invalid sources, and insufficient active allowance", () => {
    const noise = calculateCornerReform({...base, requiredInternal: {lengthMm: 500.005, widthMm: 360, heightMm: 599.995}});
    expect("error" in noise).toBe(false);
    if (!("error" in noise)) expect(noise.finalInternal).toEqual({lengthMm: 500, widthMm: 360, heightMm: 600});
    expectError({...base, requiredInternal: {lengthMm: 501, widthMm: 360, heightMm: 600}}, "ENLARGEMENT_UNSUPPORTED");
    expectError({...base, requiredInternal: {lengthMm: 460, widthMm: 401, heightMm: 600}}, "ENLARGEMENT_UNSUPPORTED");
    expectError({...base, requiredInternal: {lengthMm: 460, widthMm: 360, heightMm: 601}}, "ENLARGEMENT_UNSUPPORTED");
    expectError({...base, requiredInternal: base.originalInternal}, "NO_REDUCTION");
    expectError({...base, mode: "BAD" as "SYMMETRIC"}, "INVALID_MEASUREMENTS");
    expectError({...base, edgeClearanceMm: Number.NaN}, "INVALID_MEASUREMENTS");
    expectError({...base, availableAllowancesMm: {lengthStart: 42, lengthEnd: 50, widthStart: 50, widthEnd: 50}}, "INSUFFICIENT_CORNER_ALLOWANCE");
    expectError({...base, condition: "DAMAGED"}, "UNSUPPORTED_JOINT_OR_CONDITION");
    expectError({...base, joint: "STAPLED"}, "UNSUPPORTED_JOINT_OR_CONDITION");
    expectError({...base, joint: "UNKNOWN"}, "UNSUPPORTED_JOINT_OR_CONDITION");
  });
});
