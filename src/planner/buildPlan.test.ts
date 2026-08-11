import {describe, expect, it} from "vitest";
import {
  PROTOTYPE_PROFILE,
  type WrapPatternId,
} from "@/domain/geometry";
import {
  createDefaultPlannerDraft,
  validatePlannerDraft,
  type PlannerDraft,
  type PlannerSourceMode,
} from "./draft";
import {derivePlannerBuildPlan} from "./buildPlan";

const zeroFaces = {
  leftMm: 0,
  rightMm: 0,
  frontMm: 0,
  backMm: 0,
  bottomMm: 0,
  topMm: 0,
};
const zeroTolerance = {
  lengthTotalMm: 0,
  widthTotalMm: 0,
  heightTotalMm: 0,
};

function flatDraft(
  pattern: WrapPatternId = "WRAP_BOX_V1",
  sheet = {lengthMm: 962, widthMm: 1360},
  allowRotation = true,
): PlannerDraft {
  const draft = createDefaultPlannerDraft();
  return {
    ...draft,
    item: {
      ...draft.item,
      dimensions: {lengthMm: 356, widthMm: 330, heightMm: 305},
      shapeProfile: {kind: "RECTANGULAR_BOX"},
      cushioning: {...zeroFaces},
      tolerance: {...zeroTolerance},
      allowRotation,
      keepUpright: false,
    },
    source: {
      ...draft.source,
      mode: "FLAT_SHEET",
      sheet: {...sheet},
      pattern,
    },
  };
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  Object.values(value as Record<string, unknown>).forEach((child) =>
    expectDeepFrozen(child, seen),
  );
}

function captureDraft(draft: PlannerDraft) {
  return {
    json: JSON.stringify(draft),
    value: structuredClone(draft),
    shapeProfile: draft.item.shapeProfile,
    sheet: draft.source.sheet,
  };
}

function expectDraftUntouched(
  draft: PlannerDraft,
  before: ReturnType<typeof captureDraft>,
) {
  expect(JSON.stringify(draft)).toBe(before.json);
  expect(draft).toEqual(before.value);
  expect(draft.item.shapeProfile).toBe(before.shapeProfile);
  expect(draft.source.sheet).toBe(before.sheet);
  expect(Object.isFrozen(draft)).toBe(false);
  expect(Object.isFrozen(draft.item.shapeProfile)).toBe(false);
  expect(Object.isFrozen(draft.source.sheet)).toBe(false);
  expect(Object.isFrozen(PROTOTYPE_PROFILE)).toBe(false);
}

describe("planner build-plan adapter", () => {
  it.each([
    ["WRAP_BOX_V1", 40, 6, 4940],
    ["MAILER_BOX_V1", 41, 7, 5193.84],
    ["TAB_INSERT_V1", 41, 8, 5308],
  ] as const)(
    "derives a frozen %s cut-and-fold plan without mutating or freezing the draft",
    (pattern, cutCount, scoreCount, cutLengthMm) => {
      const draft = flatDraft(pattern);
      const before = captureDraft(draft);
      expect(Object.isFrozen(PROTOTYPE_PROFILE)).toBe(false);

      const result = derivePlannerBuildPlan(draft);

      expect(result.kind).toBe("CUT_AND_FOLD");
      if (result.kind !== "CUT_AND_FOLD") return;
      expect(result).toMatchObject({
        kind: "CUT_AND_FOLD",
        workflow: "CUT",
        sourceMode: "FLAT_SHEET",
        requiresCutting: true,
        orientation: {
          id: "WLH",
          packageDimensions: {lengthMm: 330, widthMm: 356, heightMm: 305},
        },
        packedEnvelope: {
          dimensions: {lengthMm: 330, widthMm: 356, heightMm: 305},
        },
        enteredStock: {lengthMm: 962, widthMm: 1360},
        fitsSheet: {
          fits: true,
          shortfall: {lengthMm: 0, widthMm: 0},
          rotatedFits: false,
        },
        autoFitSheet: {
          lengthMm: 962,
          widthMm: 1360,
          orientation: "unchanged",
        },
      });
      expect(result.plan.patternId).toBe(pattern);
      expect(result.plan.id).toBe("WRAP_BOX_V1");
      expect(result.plan.metrics).toMatchObject({
        requiredSheetWidthMm: 962,
        requiredSheetHeightMm: 1360,
        cutCount,
        scoreCount,
        foldCount: 10,
      });
      expect(result.plan.metrics.cutLengthMm).toBeCloseTo(cutLengthMm, 8);
      expect(result.plan.packedEnvelope).toEqual(result.packedEnvelope);
      expect(result.plan.foldNet.metadata.orientation).toEqual(result.orientation);
      expect(result.packedEnvelope.itemProfile).not.toBe(draft.item.shapeProfile);
      expect(result.plan.profile).not.toBe(PROTOTYPE_PROFILE);
      expectDeepFrozen(result);
      expectDraftUntouched(draft, before);
    },
  );

  it("keeps undersized entered stock explicit while returning auto-fit advice", () => {
    const draft = flatDraft(
      "WRAP_BOX_V1",
      {lengthMm: 980, widthMm: 1320},
      false,
    );
    const before = captureDraft(draft);

    const result = derivePlannerBuildPlan(draft);

    expect(result.kind).toBe("CUT_AND_FOLD");
    if (result.kind !== "CUT_AND_FOLD") return;
    expect(result.orientation.id).toBe("LWH");
    expect(result.plan.metrics).toMatchObject({
      requiredSheetWidthMm: 988,
      requiredSheetHeightMm: 1308,
    });
    expect(result.enteredStock).toEqual({lengthMm: 980, widthMm: 1320});
    expect(result.fitsSheet).toEqual({
      fits: false,
      shortfall: {lengthMm: 8, widthMm: 0},
      rotatedFits: false,
    });
    expect(result.autoFitSheet).toEqual({
      lengthMm: 990.6,
      widthMm: 1320,
      orientation: "direct",
    });
    expectDeepFrozen(result);
    expectDraftUntouched(draft, before);
  });

  it.each(["EXISTING_BOX", "COMMON_BOX"] as const)(
    "routes an ungeneratable item from %s to assembly without dieline fields",
    (mode) => {
      const draft = flatDraft();
      draft.item.dimensions = {lengthMm: 100, widthMm: 100, heightMm: 100};
      draft.source.mode = mode;
      const before = captureDraft(draft);

      const result = derivePlannerBuildPlan(draft);

      expect(result).toEqual({
        kind: "ASSEMBLY",
        workflow: "ASSEMBLY",
        sourceMode: mode satisfies Exclude<PlannerSourceMode, "FLAT_SHEET">,
        requiresCutting: false,
        reasonCode: "SOURCE_IS_ASSEMBLED_BOX",
      });
      expect("plan" in result).toBe(false);
      expect("cuts" in result).toBe(false);
      expect("fitsSheet" in result).toBe(false);
      expectDeepFrozen(result);
      expectDraftUntouched(draft, before);
    },
  );

  it("returns a stable frozen domain error when the selected geometry is too small", () => {
    const draft = flatDraft("WRAP_BOX_V1", {lengthMm: 900, widthMm: 900}, false);
    draft.item.dimensions = {lengthMm: 100, widthMm: 100, heightMm: 100};
    const before = captureDraft(draft);
    expect(validatePlannerDraft(draft).success).toBe(true);

    const first = derivePlannerBuildPlan(draft);
    const second = derivePlannerBuildPlan(draft);

    expect(first).toEqual({
      kind: "ERROR",
      workflow: "CUT",
      sourceMode: "FLAT_SHEET",
      requiresCutting: false,
      code: "FLAT_SHEET_GENERATION_FAILED",
      message: "This box is too small for the minimum 32 mm corner-tab geometry.",
      enteredStock: {lengthMm: 900, widthMm: 900},
    });
    expect(second).toEqual(first);
    expectDeepFrozen(first);
    expectDraftUntouched(draft, before);
  });

  it("returns the stable generic error when numeric generation overflows", () => {
    const draft = flatDraft("WRAP_BOX_V1", {lengthMm: 900, widthMm: 900}, false);
    draft.item.dimensions = {lengthMm: 1e100, widthMm: 1e100, heightMm: 1e100};
    const before = captureDraft(draft);
    expect(validatePlannerDraft(draft).success).toBe(true);

    const first = derivePlannerBuildPlan(draft);
    const second = derivePlannerBuildPlan(draft);

    expect(first).toEqual({
      kind: "ERROR",
      workflow: "CUT",
      sourceMode: "FLAT_SHEET",
      requiresCutting: false,
      code: "FLAT_SHEET_GENERATION_FAILED",
      message: "The flat-sheet construction plan could not be generated from these measurements.",
      enteredStock: {lengthMm: 900, widthMm: 900},
    });
    expect(second).toEqual(first);
    expectDeepFrozen(first);
    expectDraftUntouched(draft, before);
  });
});
