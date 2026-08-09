import {describe, expect, it} from "vitest";
import {calculateQuickOverlapShrink, type QuickOverlapShrinkInput} from "./quickShrink";

describe("quick overlap shrink", () => {
  const base: QuickOverlapShrinkInput = {
    originalInternal: {lengthMm: 500, widthMm: 400, heightMm: 300},
    targetInternal: {lengthMm: 460, widthMm: 400, heightMm: 300},
    axis: "LENGTH", style: "FEFCO_0201", sourceForm: "ONE_PIECE_OPENED_BLANK",
    uncreasedPanelMaterialMm: 80, minimumJointOverlapMm: 25, flapOverlapAfterMm: 60,
    minimumClosureOverlapMm: 20, oldScoreClearanceMm: 10, slotWidthMm: 4,
    edgeClearanceMm: 3, boardThicknessMm: 4, joint: "ADHESIVE", condition: "NEW",
    fluteDirection: "PARALLEL_TO_HEIGHT",
  };
  const expectError = (input: QuickOverlapShrinkInput, code: string) => {
    const result = calculateQuickOverlapShrink(input);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.diagnostics[0].code).toBe(code);
  };

  it("calculates the scalar-only immutable length shrink at the declared stock boundary", () => {
    const result = calculateQuickOverlapShrink(base);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result).toMatchObject({
      id: "QUICK_OVERLAP_SHRINK_V1", status: "PROTOTYPE_ONLY", axis: "LENGTH",
      deltaMm: 40, remainingPanelMaterialMm: 40, remainingJointOverlapMm: 37,
      finalInternal: {lengthMm: 460, widthMm: 400, heightMm: 300},
    });
    expect(result.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({id: "new-panel-score", type: "SCORE", measurementMm: 40, reference: "INWARD_FROM_EXISTING_LENGTH_SCORE"}),
      expect.objectContaining({id: "corner-relief", type: "CUT", count: 2}),
    ]));
    expect(result.operations.some((operation) => operation.type === "SCRAP")).toBe(false);
    expect(result.playbook.map((step) => step.code)).toEqual(["VERIFY_FLAT_BLANK", "MARK_NEW_SCORE", "CUT_RELIEF", "OVERLAP_PANEL", "SEAL_JOINT", "REFOLD_FLAPS", "REMEASURE"]);
    expect(result.warnings.join(" ")).toContain("does not certify strength, carrier acceptance, or manufacturing compliance");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.operations)).toBe(true);
  });

  it("accepts an exact 52mm reduction but rejects a 52.01mm reduction", () => {
    const exact = calculateQuickOverlapShrink({...base, targetInternal: {...base.targetInternal, lengthMm: 448}});
    expect("error" in exact).toBe(false);
    if (!("error" in exact)) expect(exact.deltaMm).toBe(52);
    expectError({...base, targetInternal: {...base.targetInternal, lengthMm: 447.99}}, "INSUFFICIENT_UNCREASED_PANEL");
  });

  it("supports width only and directs two-axis changes to a rebuild", () => {
    const width = calculateQuickOverlapShrink({...base, axis: "WIDTH", targetInternal: {lengthMm: 500, widthMm: 360, heightMm: 300}});
    expect("error" in width).toBe(false);
    if (!("error" in width)) expect(width.finalInternal).toEqual({lengthMm: 500, widthMm: 360, heightMm: 300});
    expectError({...base, targetInternal: {lengthMm: 460, widthMm: 360, heightMm: 300}}, "MULTI_AXIS_REQUIRES_REBUILD");
    expectError({...base, axis: "WIDTH"}, "NEEDS_PRECISE_REBUILD");
  });

  it("rejects safety, source, closure, conflict, and dimensional failures", () => {
    expectError({...base, targetInternal: base.originalInternal}, "TARGET_NOT_SMALLER");
    expectError({...base, targetInternal: {...base.targetInternal, lengthMm: 501}}, "TARGET_NOT_SMALLER");
    expectError({...base, targetInternal: {...base.targetInternal, heightMm: 301}}, "HEIGHT_CHANGE_UNSUPPORTED");
    expectError({...base, style: "UNKNOWN"}, "STYLE_UNKNOWN");
    expectError({...base, style: "FEFCO_0204"}, "STYLE_REQUIRES_DETAILED_FLAPS");
    expectError({...base, fluteDirection: "UNKNOWN"}, "FLUTE_DIRECTION_UNKNOWN");
    expectError({...base, sourceForm: "SIDE_BY_SIDE_JOIN"}, "SIDE_BY_SIDE_JOIN_UNSUPPORTED");
    expectError({...base, sourceForm: "BUTT_JOIN"}, "NEEDS_PRECISE_REBUILD");
    expectError({...base, condition: "DAMAGED"}, "UNSUPPORTED_JOINT_OR_CONDITION");
    expectError({...base, joint: "UNKNOWN"}, "UNSUPPORTED_JOINT_OR_CONDITION");
    expectError({...base, flapOverlapAfterMm: 19}, "FLAP_CLOSURE_SHORTFALL");
    expectError({...base, oldScoreClearanceMm: 6}, "CORNER_SCORE_CONFLICT");
    expectError({...base, uncreasedPanelMaterialMm: Number.NaN}, "INVALID_MEASUREMENTS");
  });

  it("treats sub-epsilon target noise as no dimensional change", () => {
    expectError({...base, targetInternal: {lengthMm: 500.005, widthMm: 400, heightMm: 300.005}}, "TARGET_NOT_SMALLER");
  });
});
