import {describe, expect, it} from "vitest";
import {calculateHeightReduction} from "./reduction";

describe("height reduction recipe", () => {
  const base = {originalInternal: {lengthMm: 500, widthMm: 400, heightMm: 600}, requiredInternal: {lengthMm: 500, widthMm: 400, heightMm: 300}, panelDepthScoreToScoreMm: 604, openingWidthScoreSpanMm: 408, thicknessMm: 4, topSeamGapMm: 4, slotWidthMm: 4, joint: "ADHESIVE" as const, condition: "NEW" as const};
  it("calculates the valid replacement flap stock", () => {
    const result = calculateHeightReduction(base);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.newScoreMm).toBe(304);
    expect(result.replacementFlapDepthMm).toBe(202);
    expect(result.outerTrimMm).toBe(506);
  });
  it("rejects a reduction with insufficient uncreased material", () => {
    const result = calculateHeightReduction({...base, requiredInternal: {...base.requiredInternal, heightMm: 450}});
    expect("error" in result).toBe(true);
  });
  it("rejects damaged or stapled sources", () => {
    expect("error" in calculateHeightReduction({...base, condition: "DAMAGED"})).toBe(true);
    expect("error" in calculateHeightReduction({...base, joint: "STAPLED"})).toBe(true);
  });
});
