import {describe, expect, it} from "vitest";
import {calculateRsc0204Cssc, type Rsc0204CsscInput, type Rsc0204CsscResult} from "./rsc0204Cssc";

const flapFields = [
  "topLengthPanelFlapDepthMm",
  "topWidthPanelFlapDepthMm",
  "bottomLengthPanelFlapDepthMm",
  "bottomWidthPanelFlapDepthMm",
] as const;

function inputForTarget(lengthMm = 460, widthMm = 360): Rsc0204CsscInput {
  const lengthSpanMm = lengthMm + 4;
  const widthSpanMm = widthMm + 4;
  const heightSpanMm = 308;
  const lengthPanelFlapDepthMm = (widthSpanMm + 10) / 2;
  const widthPanelFlapDepthMm = (lengthSpanMm + 10) / 2;
  const maximumFlapDepthMm = Math.max(lengthPanelFlapDepthMm, widthPanelFlapDepthMm);
  return {
    originalInternal: {lengthMm: 500, widthMm: 400, heightMm: 300},
    targetInternal: {lengthMm, widthMm, heightMm: 300},
    topStyle: "FEFCO_0204",
    bottomStyle: "FEFCO_0204",
    panelLayout: "L_W_L_W_JOINT",
    sourceForm: "ONE_PIECE_OPENED_BLANK",
    usableBlankWidthMm: 2 * (lengthSpanMm + widthSpanMm) + 20,
    usableBlankHeightMm: 2 * maximumFlapDepthMm + heightSpanMm,
    jointWidthMm: 20,
    joint: "ADHESIVE",
    boardThicknessMm: 4,
    additionalCreaseAllowanceMm: {lengthMm: 0, widthMm: 0, heightMm: 0},
    topLengthPanelFlapDepthMm: lengthPanelFlapDepthMm,
    topWidthPanelFlapDepthMm: widthPanelFlapDepthMm,
    bottomLengthPanelFlapDepthMm: lengthPanelFlapDepthMm,
    bottomWidthPanelFlapDepthMm: widthPanelFlapDepthMm,
    minimumClosureOverlapMm: 10,
    maximumClosureOverlapMm: 10,
    slotWidthMm: 4,
    edgeClearanceMm: 3,
    fluteDirection: "PARALLEL_TO_HEIGHT",
    condition: "NEW",
  };
}

function requirePlan(result: Rsc0204CsscResult) {
  expect(result.status).toBe("PROTOTYPE_ONLY");
  if (result.status !== "PROTOTYPE_ONLY") throw new Error(result.error);
  return result;
}

function requireInvalid(input: unknown, code: string, field?: string) {
  let result: Rsc0204CsscResult | undefined;
  expect(() => { result = calculateRsc0204Cssc(input as Rsc0204CsscInput); }).not.toThrow();
  expect(result).toMatchObject({id: "RSC_FEFCO_0204_CSSC_V1", status: "INVALID", diagnostics: [{code, ...(field ? {field} : {})}]});
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result?.diagnostics)).toBe(true);
  expect(result).not.toHaveProperty("operations");
  return result!;
}

function expectDeepFrozen(value: unknown, seen = new WeakSet<object>()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value as Record<string, unknown>)) expectDeepFrozen(child, seen);
}

describe("FEFCO 0204/CSSC measured profile", () => {
  it("builds the exact canonical 460 x 360 x 300 plan from four independent flap measurements", () => {
    const result = requirePlan(calculateRsc0204Cssc(inputForTarget()));
    expect(result).toMatchObject({
      id: "RSC_FEFCO_0204_CSSC_V1",
      status: "PROTOTYPE_ONLY",
      styleIdentity: "FEFCO_0204/FEFCO_0204",
      finalInternal: {lengthMm: 460, widthMm: 360, heightMm: 300},
      scoreCenterSpansMm: {lengthMm: 464, widthMm: 364, heightMm: 308},
      panelScorePositionsMm: [0, 464, 828, 1292, 1656, 1676],
      perimeterSpanMm: 1676,
      wallBandScorePositionsMm: [237, 545],
      crossSpanMm: 782,
      topLengthPanelFlapDepthMm: 187,
      topWidthPanelFlapDepthMm: 237,
      bottomLengthPanelFlapDepthMm: 187,
      bottomWidthPanelFlapDepthMm: 237,
      topMaximumFlapDepthMm: 237,
      bottomMaximumFlapDepthMm: 237,
      minimumClosureOverlapMm: 10,
      maximumClosureOverlapMm: 10,
      minimumReliefStockMm: 7,
      remainingBlankWidthMm: 0,
      remainingBlankHeightMm: 0,
    });
    expect(Object.values(result.closureFacts).map((fact) => fact.overlapMm)).toEqual([10, 10, 10, 10]);
    expect(Object.values(result.closureFacts).map((fact) => fact.measuredFlapDepthMm)).toEqual([187, 237, 187, 237]);
    expect(result.trimFacts).toEqual([]);
    expect(result.scrapFacts).toEqual([]);
    expect(result.warnings.join(" ")).toContain("does not certify strength, carrier acceptance, seal performance, or manufacturing compliance");
  });

  it("keeps stable named reliefs, scalar operations, and the terminal REMEASURE playbook", () => {
    const result = requirePlan(calculateRsc0204Cssc(inputForTarget()));
    expect(result.reliefFacts.map((fact) => fact.id)).toEqual([
      "TOP_L1_TO_W1", "TOP_W1_TO_L2", "TOP_L2_TO_W2", "TOP_W2_TO_JOINT",
      "BOTTOM_L1_TO_W1", "BOTTOM_W1_TO_L2", "BOTTOM_L2_TO_W2", "BOTTOM_W2_TO_JOINT",
    ]);
    expect(result.reliefFacts.map((fact) => fact.scorePositionMm)).toEqual([464, 828, 1292, 1656, 464, 828, 1292, 1656]);
    expect(result.reliefFacts.map((fact) => [
      fact.id, fact.slotWidthMm, fact.edgeClearanceMm, fact.leftFlapChannel, fact.rightFlapChannel,
    ])).toEqual([
      ["TOP_L1_TO_W1", 4, 3, "TOP_LENGTH_PANEL_FLAPS", "TOP_WIDTH_PANEL_FLAPS"],
      ["TOP_W1_TO_L2", 4, 3, "TOP_WIDTH_PANEL_FLAPS", "TOP_LENGTH_PANEL_FLAPS"],
      ["TOP_L2_TO_W2", 4, 3, "TOP_LENGTH_PANEL_FLAPS", "TOP_WIDTH_PANEL_FLAPS"],
      ["TOP_W2_TO_JOINT", 4, 3, "TOP_WIDTH_PANEL_FLAPS", "MANUFACTURER_JOINT"],
      ["BOTTOM_L1_TO_W1", 4, 3, "BOTTOM_LENGTH_PANEL_FLAPS", "BOTTOM_WIDTH_PANEL_FLAPS"],
      ["BOTTOM_W1_TO_L2", 4, 3, "BOTTOM_WIDTH_PANEL_FLAPS", "BOTTOM_LENGTH_PANEL_FLAPS"],
      ["BOTTOM_L2_TO_W2", 4, 3, "BOTTOM_LENGTH_PANEL_FLAPS", "BOTTOM_WIDTH_PANEL_FLAPS"],
      ["BOTTOM_W2_TO_JOINT", 4, 3, "BOTTOM_WIDTH_PANEL_FLAPS", "MANUFACTURER_JOINT"],
    ]);
    expect(result.operations.map((operation) => [
      operation.id, operation.type, operation.measurementMm, operation.reference, operation.count,
    ])).toEqual([
      ["panel-score-l1-to-w1", "SCORE", 464, "FROM_USABLE_BLANK_LEFT_EDGE", 1],
      ["panel-score-w1-to-l2", "SCORE", 828, "FROM_USABLE_BLANK_LEFT_EDGE", 1],
      ["panel-score-l2-to-w2", "SCORE", 1292, "FROM_USABLE_BLANK_LEFT_EDGE", 1],
      ["panel-score-w2-to-joint", "SCORE", 1656, "FROM_USABLE_BLANK_LEFT_EDGE", 1],
      ["top-wall-band-score", "SCORE", 237, "FROM_USABLE_BLANK_TOP_EDGE", 1],
      ["bottom-wall-band-score", "SCORE", 545, "FROM_USABLE_BLANK_TOP_EDGE", 1],
      ["top-length-panel-flap-contours", "CUT", 187, "OUTWARD_FROM_TOP_WALL_SCORE", 2],
      ["top-width-panel-flap-contours", "CUT", 237, "OUTWARD_FROM_TOP_WALL_SCORE", 2],
      ["bottom-length-panel-flap-contours", "CUT", 187, "OUTWARD_FROM_BOTTOM_WALL_SCORE", 2],
      ["bottom-width-panel-flap-contours", "CUT", 237, "OUTWARD_FROM_BOTTOM_WALL_SCORE", 2],
      ["top-l1-to-w1-relief", "CUT", 4, "AT_TOP_L1_TO_W1_SCORE_BOUNDARY", 1],
      ["top-w1-to-l2-relief", "CUT", 4, "AT_TOP_W1_TO_L2_SCORE_BOUNDARY", 1],
      ["top-l2-to-w2-relief", "CUT", 4, "AT_TOP_L2_TO_W2_SCORE_BOUNDARY", 1],
      ["top-w2-to-joint-relief", "CUT", 4, "AT_TOP_W2_TO_JOINT_SCORE_BOUNDARY", 1],
      ["bottom-l1-to-w1-relief", "CUT", 4, "AT_BOTTOM_L1_TO_W1_SCORE_BOUNDARY", 1],
      ["bottom-w1-to-l2-relief", "CUT", 4, "AT_BOTTOM_W1_TO_L2_SCORE_BOUNDARY", 1],
      ["bottom-l2-to-w2-relief", "CUT", 4, "AT_BOTTOM_L2_TO_W2_SCORE_BOUNDARY", 1],
      ["bottom-w2-to-joint-relief", "CUT", 4, "AT_BOTTOM_W2_TO_JOINT_SCORE_BOUNDARY", 1],
    ]);
    expect(result.playbook.map((step) => step.order)).toEqual(Array.from({length: 14}, (_, index) => index + 1));
    expect(result.playbook.map((step) => step.code)).toEqual([
      "VERIFY_STYLE_COMBINATION", "OPEN_AND_FLATTEN", "MEASURE_BLANK_AND_FLAPS", "MARK_PANEL_SCORES",
      "MARK_FOUR_FLAP_CHANNELS", "CUT_FLAP_CONTOURS", "CUT_NAMED_RELIEFS", "TRIM_SCRAP", "SCORE",
      "REJOIN_MANUFACTURER_SEAM", "DRY_FOLD", "VERIFY_FOUR_CLOSURES", "SEAL_ENDS", "REMEASURE",
    ]);
    expect(result.playbook.at(-1)?.code).toBe("REMEASURE");
  });

  it("returns isolated deeply frozen results without freezing or mutating the caller input", () => {
    const input = inputForTarget();
    const snapshot = structuredClone(input);
    const first = requirePlan(calculateRsc0204Cssc(input));
    const second = requirePlan(calculateRsc0204Cssc(input));
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.operations).not.toBe(second.operations);
    expect(first.originalInternal).not.toBe(input.originalInternal);
    expect(first.additionalCreaseAllowanceMm).not.toBe(input.additionalCreaseAllowanceMm);
    expectDeepFrozen(first);
    expect(input).toEqual(snapshot);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.originalInternal)).toBe(false);
    expect(Object.isFrozen(input.additionalCreaseAllowanceMm)).toBe(false);
  });

  it("accepts exact meet-at-center closures when minimum and maximum overlap are zero", () => {
    const input = inputForTarget();
    Object.assign(input, {
      topLengthPanelFlapDepthMm: 182,
      topWidthPanelFlapDepthMm: 232,
      bottomLengthPanelFlapDepthMm: 182,
      bottomWidthPanelFlapDepthMm: 232,
      minimumClosureOverlapMm: 0,
      maximumClosureOverlapMm: 0,
      usableBlankHeightMm: 772,
    });
    const result = requirePlan(calculateRsc0204Cssc(input));
    expect(Object.values(result.closureFacts).map((fact) => fact.overlapMm)).toEqual([0, 0, 0, 0]);
    expect(result.crossSpanMm).toBe(772);
  });

  it("maps width-only and length-only reductions to only their physical flap channels and keeps both-axis output deterministic", () => {
    const widthOnly = requirePlan(calculateRsc0204Cssc(inputForTarget(500, 360)));
    expect(widthOnly.horizontalReductionsMm).toEqual({lengthMm: 0, widthMm: 40});
    expect(widthOnly.affectedFlapChannels).toEqual(["TOP_LENGTH_PANEL_FLAPS", "BOTTOM_LENGTH_PANEL_FLAPS"]);

    const lengthOnly = requirePlan(calculateRsc0204Cssc(inputForTarget(460, 400)));
    expect(lengthOnly.horizontalReductionsMm).toEqual({lengthMm: 40, widthMm: 0});
    expect(lengthOnly.affectedFlapChannels).toEqual(["TOP_WIDTH_PANEL_FLAPS", "BOTTOM_WIDTH_PANEL_FLAPS"]);

    const bothInput = inputForTarget();
    const first = requirePlan(calculateRsc0204Cssc(bothInput));
    const second = requirePlan(calculateRsc0204Cssc(structuredClone(bothInput)));
    expect(first.affectedFlapChannels).toEqual([
      "TOP_LENGTH_PANEL_FLAPS", "BOTTOM_LENGTH_PANEL_FLAPS", "TOP_WIDTH_PANEL_FLAPS", "BOTTOM_WIDTH_PANEL_FLAPS",
    ]);
    expect(first).toEqual(second);
  });

  it("attributes shortfall, excess, missing, and nonfinite measurements to each flap field independently", () => {
    for (const field of flapFields) {
      requireInvalid({...inputForTarget(), [field]: inputForTarget()[field] - 0.01}, "FLAP_CLOSURE_SHORTFALL", field);
      requireInvalid({...inputForTarget(), [field]: inputForTarget()[field] + 0.01}, "FLAP_CLOSURE_EXCESS", field);

      const missing = inputForTarget() as unknown as Record<string, unknown>;
      delete missing[field];
      requireInvalid(missing, "MEASUREMENT_REQUIRED", field);

      requireInvalid({...inputForTarget(), [field]: Number.NaN}, "INVALID_MEASUREMENTS", field);
    }
  });

  it("honors exact and just-below stock boundaries and emits measured trim and scrap for genuine surplus", () => {
    const exact = requirePlan(calculateRsc0204Cssc(inputForTarget()));
    expect(exact.operations.some((operation) => operation.type === "SCRAP")).toBe(false);
    requireInvalid({...inputForTarget(), usableBlankWidthMm: 1675.99}, "PANEL_SPAN_SHORTFALL", "usableBlankWidthMm");
    requireInvalid({...inputForTarget(), usableBlankHeightMm: 781.99}, "TARGET_EXCEEDS_BLANK", "usableBlankHeightMm");

    const surplus = requirePlan(calculateRsc0204Cssc({...inputForTarget(), usableBlankWidthMm: 1696, usableBlankHeightMm: 802}));
    expect(surplus.remainingBlankWidthMm).toBe(20);
    expect(surplus.remainingBlankHeightMm).toBe(20);
    expect(surplus.trimFacts.map((operation) => operation.id)).toEqual(["blank-width-trim", "blank-height-trim"]);
    expect(surplus.scrapFacts.map((operation) => [operation.id, operation.measurementMm])).toEqual([
      ["blank-width-scrap", 20], ["blank-height-scrap", 20],
    ]);
  });

  it("preserves explicit 0204/0215 identity in frozen INVALID results and never emits operations", () => {
    for (const [topStyle, bottomStyle] of [["FEFCO_0204", "FEFCO_0215"], ["FEFCO_0215", "FEFCO_0204"]] as const) {
      const result = requireInvalid({...inputForTarget(), topStyle, bottomStyle}, "END_STYLE_COMBINATION_UNSUPPORTED", topStyle === "FEFCO_0215" ? "topStyle" : "bottomStyle");
      expect(result).toMatchObject({topStyle, bottomStyle, styleIdentity: `${topStyle}/${bottomStyle}`, panelLayout: "L_W_L_W_JOINT"});
      expectDeepFrozen(result);
    }
  });

  it("rejects every unsupported or unsafe input without throwing or producing a recipe", () => {
    const cases: Array<[unknown, string, string?]> = [
      [null, "INVALID_MEASUREMENTS"],
      [{...inputForTarget(), topStyle: "UNKNOWN"}, "STYLE_UNKNOWN", "topStyle"],
      [{...inputForTarget(), bottomStyle: "UNKNOWN"}, "STYLE_UNKNOWN", "bottomStyle"],
      [{...inputForTarget(), panelLayout: "W_L_W_L_JOINT"}, "PANEL_LAYOUT_UNSUPPORTED", "panelLayout"],
      [{...inputForTarget(), sourceForm: "SIDE_BY_SIDE_JOIN"}, "SIDE_BY_SIDE_JOIN_UNSUPPORTED", "sourceForm"],
      [{...inputForTarget(), sourceForm: "BUTT_JOIN"}, "SOURCE_FORM_UNSUPPORTED", "sourceForm"],
      [{...inputForTarget(), joint: "STAPLED"}, "UNSUPPORTED_JOINT_OR_CONDITION"],
      [{...inputForTarget(), condition: "DAMAGED"}, "UNSUPPORTED_JOINT_OR_CONDITION"],
      [{...inputForTarget(), fluteDirection: "UNKNOWN"}, "FLUTE_DIRECTION_UNKNOWN", "fluteDirection"],
      [{...inputForTarget(), additionalCreaseAllowanceMm: undefined}, "CREASE_ALLOWANCE_UNKNOWN", "additionalCreaseAllowanceMm"],
      [{...inputForTarget(), additionalCreaseAllowanceMm: {lengthMm: -1, widthMm: 0, heightMm: 0}}, "INVALID_MEASUREMENTS"],
      [{...inputForTarget(), additionalCreaseAllowanceMm: {lengthMm: Number.NaN, widthMm: 0, heightMm: 0}}, "INVALID_MEASUREMENTS"],
      [{...inputForTarget(), originalInternal: undefined}, "INVALID_MEASUREMENTS"],
      [{...inputForTarget(), targetInternal: {...inputForTarget().targetInternal, widthMm: Number.POSITIVE_INFINITY}}, "INVALID_MEASUREMENTS"],
      [{...inputForTarget(), boardThicknessMm: 0}, "INVALID_MEASUREMENTS"],
      [{...inputForTarget(), jointWidthMm: Number.NaN}, "INVALID_MEASUREMENTS"],
      [{...inputForTarget(), targetInternal: inputForTarget().originalInternal}, "TARGET_NOT_SMALLER"],
      [{...inputForTarget(), targetInternal: {...inputForTarget().targetInternal, lengthMm: 501}}, "TARGET_NOT_SMALLER"],
      [{...inputForTarget(), targetInternal: {...inputForTarget().targetInternal, heightMm: 301}}, "HEIGHT_CHANGE_UNSUPPORTED", "targetInternal.heightMm"],
      [{...inputForTarget(), minimumClosureOverlapMm: 11, maximumClosureOverlapMm: 10}, "INVALID_MEASUREMENTS", "maximumClosureOverlapMm"],
      [{...inputForTarget(), minimumClosureOverlapMm: Number.NaN}, "INVALID_MEASUREMENTS", "minimumClosureOverlapMm"],
      [{...inputForTarget(), maximumClosureOverlapMm: undefined}, "MEASUREMENT_REQUIRED", "maximumClosureOverlapMm"],
      [{...inputForTarget(), slotWidthMm: 185}, "CORNER_SCORE_CONFLICT", "topLengthPanelFlapDepthMm"],
      [{...inputForTarget(), jointWidthMm: 2}, "SEAM_OVERLAP_TOO_SMALL", "jointWidthMm"],
    ];
    for (const [input, code, field] of cases) requireInvalid(input, code, field);
  });
});
