import {describe, expect, it} from "vitest";
import {calculateHeightReduction} from "./reduction";

describe("height reduction recipe", () => {
  const base = {originalInternal: {lengthMm: 500, widthMm: 400, heightMm: 600}, requiredInternal: {lengthMm: 500, widthMm: 400, heightMm: 300}, panelDepthScoreToScoreMm: 604, openingWidthScoreSpanMm: 408, thicknessMm: 4, topSeamGapMm: 4, slotWidthMm: 4, joint: "ADHESIVE" as const, condition: "NEW" as const};
  const expectError = (input: Parameters<typeof calculateHeightReduction>[0], code: string) => {
    const result = calculateHeightReduction(input);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.diagnostics[0].code).toBe(code);
  };

  it("calculates the immutable, scalar-only valid replacement flap plan", () => {
    const result = calculateHeightReduction(base);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result).toMatchObject({
      id: "RSC_HEIGHT_CUT_DOWN_V1", status: "PROTOTYPE_ONLY",
      originalInternal: base.originalInternal, requiredInternal: base.requiredInternal,
      finalInternal: {lengthMm: 500, widthMm: 400, heightMm: 300},
      retainedAllowanceMm: 4, newScoreMm: 304, replacementFlapDepthMm: 202,
      outerTrimMm: 506, trimFromTopMm: 98, slotWidthMm: 4,
    });
    expect(result.marks.map((mark) => [mark.type, mark.count])).toEqual([["SCORE", 4], ["CUT", 4], ["CUT", 4], ["SCRAP", 4]]);
    expect(result.playbook.map((step) => step.code)).toEqual(["VERIFY_SOURCE", "OPEN_JOINT", "REMOVE_OLD_TOP", "MARK_NEW_SCORE", "SCORE_PERIMETER", "CUT_SLOTS", "TRIM_SCRAP", "DRY_FOLD", "REJOIN_JOINT", "TAPE_TOP", "REMEASURE"]);
    expect(result.diagnostics).toMatchObject([{code: "PROTOTYPE_ONLY", severity: "WARNING"}]);
    expect(result.warnings.join(" ")).toContain("does not establish strength, carrier, or manufacturing compliance");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.playbook)).toBe(true);
    expect(Object.isFrozen(result.finalInternal)).toBe(true);
  });

  it("accepts the exact retained-stock edge boundary and rejects immediately above it", () => {
    const boundary = calculateHeightReduction({...base, requiredInternal: {...base.requiredInternal, heightMm: 394}});
    expect("error" in boundary).toBe(false);
    if (!("error" in boundary)) expect(boundary.outerTrimMm).toBe(600);
    expectError({...base, requiredInternal: {...base.requiredInternal, heightMm: 394.01}}, "INSUFFICIENT_FLAP_STOCK");
  });

  it("rejects invalid geometry, anchors, limits, and flap stock with legacy error results", () => {
    expectError({...base, thicknessMm: Number.NaN}, "INVALID_MEASUREMENTS");
    expectError({...base, panelDepthScoreToScoreMm: 599}, "INVALID_PANEL_ANCHOR");
    expectError({...base, requiredInternal: {...base.requiredInternal, lengthMm: 501}}, "LENGTH_WIDTH_NO_FIT");
    expectError({...base, requiredInternal: {...base.requiredInternal, widthMm: 401}}, "LENGTH_WIDTH_NO_FIT");
    expectError({...base, requiredInternal: {...base.requiredInternal, heightMm: 600}}, "HEIGHT_NOT_REDUCED");
    expectError({...base, minimumWallHeightMm: 301}, "WALL_TOO_SHORT");
    expectError({...base, openingWidthScoreSpanMm: 10}, "NO_EDGE_CLEARANCE");
    expectError({...base, requiredInternal: {...base.requiredInternal, heightMm: 450}}, "INSUFFICIENT_FLAP_STOCK");
    expectError({...base, condition: "DAMAGED"}, "UNSUPPORTED_JOINT_OR_CONDITION");
    expectError({...base, joint: "STAPLED"}, "UNSUPPORTED_JOINT_OR_CONDITION");
    expectError({...base, joint: "UNKNOWN"}, "UNSUPPORTED_JOINT_OR_CONDITION");
  });
});
