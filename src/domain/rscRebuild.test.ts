import {describe, expect, it} from "vitest";
import {calculateRscPreciseRebuild, type RscPreciseRebuildInput} from "./rscRebuild";

describe("precise RSC rebuild", () => {
  const base: RscPreciseRebuildInput = {
    originalInternal: {lengthMm: 500, widthMm: 400, heightMm: 300},
    targetInternal: {lengthMm: 460, widthMm: 360, heightMm: 300},
    style: "FEFCO_0201", sourceForm: "ONE_PIECE_OPENED_BLANK",
    usableBlankWidthMm: 1676, usableBlankHeightMm: 682, jointWidthMm: 20, joint: "ADHESIVE",
    boardThicknessMm: 4, additionalCreaseAllowanceMm: {lengthMm: 0, widthMm: 0, heightMm: 0}, topFlapDepthMm: 187, bottomFlapDepthMm: 187,
    minimumClosureOverlapMm: 10, slotWidthMm: 4, edgeClearanceMm: 3,
    fluteDirection: "PARALLEL_TO_HEIGHT", condition: "NEW",
  };
  const expectError = (input: RscPreciseRebuildInput, code: string) => {
    const result = calculateRscPreciseRebuild(input);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.diagnostics[0].code).toBe(code);
  };

  it("creates an exact-fit frozen scalar rebuild plan", () => {
    const result = calculateRscPreciseRebuild(base);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result).toMatchObject({
      id: "RSC_PRECISE_REBUILD_V1", status: "PROTOTYPE_ONLY",
      finalInternal: {lengthMm: 460, widthMm: 360, heightMm: 300},
      panelScorePositionsMm: [0, 464, 828, 1292, 1656, 1676],
      wallBandScorePositionsMm: [187, 495], topClosureOverlapMm: 10, bottomClosureOverlapMm: 10, closureOverlapMm: 10,
      remainingBlankWidthMm: 0, remainingBlankHeightMm: 0,
    });
    expect(result.operations.some((operation) => operation.type === "SCRAP")).toBe(false);
    expect(result.playbook).toHaveLength(11);
    expect(result.playbook.at(-1)?.code).toBe("REMEASURE");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.panelScorePositionsMm)).toBe(true);
  });

  it("rejects blanks just below either exact required boundary and trims genuine excess", () => {
    expectError({...base, usableBlankWidthMm: 1675.99}, "PANEL_SPAN_SHORTFALL");
    expectError({...base, usableBlankHeightMm: 681.99}, "TARGET_EXCEEDS_BLANK");
    const extra = calculateRscPreciseRebuild({...base, usableBlankWidthMm: 1696, usableBlankHeightMm: 702});
    expect("error" in extra).toBe(false);
    if (!("error" in extra)) {
      expect(extra.operations.filter((operation) => operation.type === "CUT").map((operation) => operation.id)).toEqual(expect.arrayContaining(["blank-width-trim", "blank-height-trim"]));
      expect(extra.operations.filter((operation) => operation.type === "SCRAP").map((operation) => operation.id)).toEqual(["blank-width-scrap", "blank-height-scrap"]);
    }
  });

  it("supports one-axis rebuilding while preserving the untouched dimension", () => {
    const result = calculateRscPreciseRebuild({...base, targetInternal: {lengthMm: 460, widthMm: 400, heightMm: 300}, usableBlankWidthMm: 1756, usableBlankHeightMm: 722, topFlapDepthMm: 207, bottomFlapDepthMm: 207});
    expect("error" in result).toBe(false);
    if (!("error" in result)) expect(result.finalInternal).toEqual({lengthMm: 460, widthMm: 400, heightMm: 300});
  });

  it("checks top and bottom closure overlap independently and attributes the failing flap", () => {
    const bottomShort = calculateRscPreciseRebuild({...base, bottomFlapDepthMm: 184.99});
    expect("error" in bottomShort).toBe(true);
    if ("error" in bottomShort) expect(bottomShort.diagnostics[0]).toMatchObject({code: "FLAP_CLOSURE_SHORTFALL", field: "bottomFlapDepthMm"});
    const topShort = calculateRscPreciseRebuild({...base, topFlapDepthMm: 184.99});
    expect("error" in topShort).toBe(true);
    if ("error" in topShort) expect(topShort.diagnostics[0]).toMatchObject({code: "FLAP_CLOSURE_SHORTFALL", field: "topFlapDepthMm"});
  });

  it("rejects every safety gate before producing a recipe", () => {
    expectError({...base, style: "UNKNOWN"}, "STYLE_UNKNOWN");
    expectError({...base, style: "FEFCO_0204"}, "STYLE_REQUIRES_DETAILED_FLAPS");
    expectError({...base, fluteDirection: "UNKNOWN"}, "FLUTE_DIRECTION_UNKNOWN");
    expectError({...base, sourceForm: "SIDE_BY_SIDE_JOIN"}, "SIDE_BY_SIDE_JOIN_UNSUPPORTED");
    expectError({...base, sourceForm: "BUTT_JOIN"}, "SOURCE_FORM_UNSUPPORTED");
    expectError({...base, condition: "DAMAGED"}, "UNSUPPORTED_JOINT_OR_CONDITION");
    expectError({...base, joint: "STAPLED"}, "UNSUPPORTED_JOINT_OR_CONDITION");
    expectError({...base, additionalCreaseAllowanceMm: undefined as unknown as {lengthMm: number; widthMm: number; heightMm: number}}, "CREASE_ALLOWANCE_UNKNOWN");
    expectError({...base, additionalCreaseAllowanceMm: {lengthMm: -1, widthMm: 0, heightMm: 0}}, "INVALID_MEASUREMENTS");
    expectError({...base, additionalCreaseAllowanceMm: {lengthMm: Number.NaN, widthMm: 0, heightMm: 0}}, "INVALID_MEASUREMENTS");
    expectError({...base, boardThicknessMm: Number.NaN}, "INVALID_MEASUREMENTS");
    expectError({...base, targetInternal: {...base.targetInternal, lengthMm: 501}}, "TARGET_NOT_SMALLER");
    expectError({...base, targetInternal: {...base.targetInternal, heightMm: 301}}, "HEIGHT_CHANGE_UNSUPPORTED");
    expectError({...base, targetInternal: base.originalInternal}, "TARGET_NOT_SMALLER");
    expectError({...base, topFlapDepthMm: 184, bottomFlapDepthMm: 184}, "FLAP_CLOSURE_SHORTFALL");
    expectError({...base, jointWidthMm: 2}, "SEAM_OVERLAP_TOO_SMALL");
    expectError({...base, slotWidthMm: 200}, "CORNER_SCORE_CONFLICT");
  });

  it("adds explicit per-axis crease allowances only to the score-center spans", () => {
    const result = calculateRscPreciseRebuild({...base,
      additionalCreaseAllowanceMm: {lengthMm: 1, widthMm: 2, heightMm: 3},
      usableBlankWidthMm: 1682,
      usableBlankHeightMm: 687,
      topFlapDepthMm: 188,
      bottomFlapDepthMm: 188,
    });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.finalInternal).toEqual({lengthMm: 460, widthMm: 360, heightMm: 300});
      expect(result.panelScorePositionsMm).toEqual([0, 465, 831, 1296, 1662, 1682]);
      expect(result.wallBandScorePositionsMm).toEqual([188, 499]);
      expect(result.additionalCreaseAllowanceMm).toEqual({lengthMm: 1, widthMm: 2, heightMm: 3});
    }
  });
});
