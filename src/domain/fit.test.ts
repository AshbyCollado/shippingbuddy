import {describe, expect, it} from "vitest";
import {assessFit, protectedEnvelopeBreakdown, protectedEnvelopeCopy} from "./fit";
import {inchesToMm} from "./measurements";
import type {ItemInput, ProtectionGoal} from "./geometry";

function item(overrides: Partial<ItemInput> = {}): ItemInput {
  return {
    dimensions: {lengthMm: 100, widthMm: 80, heightMm: 60},
    shapeProfile: {kind: "RECTANGULAR_BOX"},
    weightKg: 1,
    fragility: "MODERATE",
    cushioning: {leftMm: 0, rightMm: 0, frontMm: 0, backMm: 0, bottomMm: 0, topMm: 0},
    tolerance: {lengthTotalMm: 0, widthTotalMm: 0, heightTotalMm: 0},
    allowRotation: true,
    keepUpright: false,
    ...overrides,
  };
}

function cubeForGoal(goal: ProtectionGoal): ItemInput {
  const perFace = inchesToMm(([0, 0.5, 1, 1.5, 2, 3] as const)[goal]);
  return item({
    dimensions: {lengthMm: inchesToMm(1), widthMm: inchesToMm(1), heightMm: inchesToMm(1)},
    cushioning: {leftMm: perFace, rightMm: perFace, frontMm: perFace, backMm: perFace, bottomMm: perFace, topMm: perFace},
  });
}

describe("fit assessment", () => {
  it("maps every goal to its per-face padding and zero-clearance cube total", () => {
    const perFace = [0.5, 1, 1.5, 2, 3];
    const totals = [2, 3, 4, 5, 7];
    for (let index = 0; index < perFace.length; index += 1) {
      const breakdown = protectedEnvelopeBreakdown(cubeForGoal((index + 1) as ProtectionGoal));
      for (const axis of breakdown.axes) expect(axis.firstFacePaddingMm / 25.4).toBeCloseTo(perFace[index], 8);
      for (const axis of breakdown.axes) expect(axis.requiredMm / 25.4).toBeCloseTo(totals[index], 8);
    }
  });

  it("returns direct, rotated, and keep-upright outcomes deterministically", () => {
    const available = {lengthMm: 80, widthMm: 100, heightMm: 60};
    expect(assessFit(item({allowRotation: false}), available)).toMatchObject({
      fits: false,
      orientationId: "LWH",
      deficitsMm: {lengthMm: 20, widthMm: 0, heightMm: 0},
      extraRoomMm: {lengthMm: 0, widthMm: 20, heightMm: 0},
    });
    expect(assessFit(item(), available)).toMatchObject({fits: true, orientationId: "WLH", deficitsMm: {lengthMm: 0, widthMm: 0, heightMm: 0}});
    expect(assessFit(item({keepUpright: true}), available)).toMatchObject({fits: true, orientationId: "WLH"});
  });

  it("keeps asymmetric face padding and clearance in the chosen orientation", () => {
    const asymmetric = item({
      cushioning: {leftMm: 5, rightMm: 10, frontMm: 15, backMm: 20, bottomMm: 25, topMm: 30},
      tolerance: {lengthTotalMm: 1, widthTotalMm: 2, heightTotalMm: 3},
      allowRotation: false,
    });
    const assessment = assessFit(asymmetric, {lengthMm: 116, widthMm: 117, heightMm: 118});
    expect(assessment).toMatchObject({
      fits: true,
      orientationId: "LWH",
      requiredDimensions: {lengthMm: 116, widthMm: 117, heightMm: 118},
      extraRoomMm: {lengthMm: 0, widthMm: 0, heightMm: 0},
    });
  });

  it("formats the 16-inch Goal 2 cube with separate 6mm clearance", () => {
    const cube = item({
      dimensions: {lengthMm: inchesToMm(16), widthMm: inchesToMm(16), heightMm: inchesToMm(16)},
      cushioning: {leftMm: 25.4, rightMm: 25.4, frontMm: 25.4, backMm: 25.4, bottomMm: 25.4, topMm: 25.4},
      tolerance: {lengthTotalMm: 6, widthTotalMm: 6, heightTotalMm: 6},
    });
    const copy = protectedEnvelopeCopy(protectedEnvelopeBreakdown(cube), "in");
    expect(copy.axes.map((axis) => axis.formula)).toEqual([
      "16 + 1 + 1 + 0.24 = 18.24 in",
      "16 + 1 + 1 + 0.24 = 18.24 in",
      "16 + 1 + 1 + 0.24 = 18.24 in",
    ]);
  });
});
