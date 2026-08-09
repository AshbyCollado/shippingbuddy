import type {Dimensions3D} from "./geometry";
import {
  immutable,
  modificationError,
  RSC_DIMENSION_EPSILON_MM,
  type RscCondition,
  type RscDeclaredStyle,
  type RscDiagnostic,
  type RscFluteDirection,
  type RscJoint,
  type RscModificationError,
  type RscPlaybookStep,
  type RscScalarOperation,
  type RscSourceForm,
} from "./rscModification";

export interface RscPreciseRebuildInput {
  originalInternal: Dimensions3D;
  targetInternal: Dimensions3D;
  style: RscDeclaredStyle;
  sourceForm: RscSourceForm;
  usableBlankWidthMm: number;
  usableBlankHeightMm: number;
  jointWidthMm: number;
  joint: RscJoint;
  boardThicknessMm: number;
  additionalCreaseAllowanceMm: Dimensions3D;
  topFlapDepthMm: number;
  bottomFlapDepthMm: number;
  minimumClosureOverlapMm: number;
  slotWidthMm: number;
  edgeClearanceMm: number;
  fluteDirection: RscFluteDirection;
  condition: RscCondition;
}

export type RscPreciseRebuildStepCode =
  | "VERIFY_STYLE"
  | "OPEN_AND_FLATTEN"
  | "MEASURE_BLANK"
  | "MARK_PANEL_SCORES"
  | "MARK_FLAP_SCORES"
  | "CUT_RELIEFS"
  | "SCORE"
  | "REJOIN_MANUFACTURER_SEAM"
  | "DRY_FOLD"
  | "TAPE_H_SEAMS"
  | "REMEASURE";

export interface RscPreciseRebuildPlan {
  readonly id: "RSC_PRECISE_REBUILD_V1";
  readonly status: "PROTOTYPE_ONLY";
  readonly style: "FEFCO_0201";
  readonly sourceForm: "ONE_PIECE_OPENED_BLANK";
  readonly fluteDirection: Exclude<RscFluteDirection, "UNKNOWN">;
  readonly originalInternal: Readonly<Dimensions3D>;
  readonly targetInternal: Readonly<Dimensions3D>;
  readonly finalInternal: Readonly<Dimensions3D>;
  readonly usableBlankWidthMm: number;
  readonly usableBlankHeightMm: number;
  readonly panelScorePositionsMm: readonly [number, number, number, number, number, number];
  readonly perimeterSpanMm: number;
  readonly wallBandScorePositionsMm: readonly [number, number];
  readonly crossSpanMm: number;
  readonly jointWidthMm: number;
  readonly joint: Extract<RscJoint, "ADHESIVE" | "TAPE">;
  readonly boardThicknessMm: number;
  readonly additionalCreaseAllowanceMm: Readonly<Dimensions3D>;
  readonly scoreCenterSpansMm: Readonly<Dimensions3D>;
  readonly topFlapDepthMm: number;
  readonly bottomFlapDepthMm: number;
  readonly topClosureOverlapMm: number;
  readonly bottomClosureOverlapMm: number;
  /** Conservative compatibility value: the smaller of the independent top and bottom closure overlaps. */
  readonly closureOverlapMm: number;
  readonly minimumClosureOverlapMm: number;
  readonly slotWidthMm: number;
  readonly edgeClearanceMm: number;
  readonly remainingBlankWidthMm: number;
  readonly remainingBlankHeightMm: number;
  readonly marks: readonly RscScalarOperation[];
  readonly operations: readonly RscScalarOperation[];
  readonly playbook: readonly RscPlaybookStep<RscPreciseRebuildStepCode>[];
  readonly diagnostics: readonly RscDiagnostic[];
  readonly warnings: readonly string[];
}

const REBUILD_PLAYBOOK: readonly RscPlaybookStep<RscPreciseRebuildStepCode>[] = immutable([
  {order: 1, code: "VERIFY_STYLE", instruction: "Verify the opened one-piece blank is FEFCO 0201 with known flute direction."},
  {order: 2, code: "OPEN_AND_FLATTEN", instruction: "Open the accessible manufacturer seam and flatten the blank without adding a side-by-side join."},
  {order: 3, code: "MEASURE_BLANK", instruction: "Measure usable blank width and height after excluding damaged edges and declared margins."},
  {order: 4, code: "MARK_PANEL_SCORES", instruction: "Mark FEFCO Recommendation 101 score-center panel spans using board thickness and the explicit per-axis additional allowances."},
  {order: 5, code: "MARK_FLAP_SCORES", instruction: "Mark the two scalar wall-band scores using the FEFCO-101 height span and measured flap depths."},
  {order: 6, code: "CUT_RELIEFS", instruction: "Cut scalar slot-width reliefs while preserving edge and crease clearances."},
  {order: 7, code: "SCORE", instruction: "Score only the verified FEFCO-101 crease centers derived from the explicit per-axis additional allowances."},
  {order: 8, code: "REJOIN_MANUFACTURER_SEAM", instruction: "Rejoin the original manufacturer seam using the declared adhesive or tape joint."},
  {order: 9, code: "DRY_FOLD", instruction: "Dry-fold all panels and independently confirm the top and bottom closure overlaps before sealing."},
  {order: 10, code: "TAPE_H_SEAMS", instruction: "Tape the top and bottom H seams only after both closure checks pass."},
  {order: 11, code: "REMEASURE", instruction: "Remeasure final inside dimensions and both closure overlaps before use."},
]);

function allPositiveFinite(values: readonly number[]) {
  return values.every((value) => Number.isFinite(value) && value > 0);
}

function allNonnegativeFinite(values: readonly number[]) {
  return values.every((value) => Number.isFinite(value) && value >= 0);
}

function knownFlute(direction: RscFluteDirection): direction is Exclude<RscFluteDirection, "UNKNOWN"> {
  return direction === "PARALLEL_TO_HEIGHT" || direction === "PARALLEL_TO_PERIMETER";
}

export function calculateRscPreciseRebuild(input: RscPreciseRebuildInput): RscPreciseRebuildPlan | RscModificationError {
  if (input.style === "UNKNOWN") {
    return modificationError("STYLE_UNKNOWN", "Declare and verify an opened FEFCO 0201 RSC blank before rebuilding.", "style");
  }
  if (input.style === "FEFCO_0204") {
    return modificationError("STYLE_REQUIRES_DETAILED_FLAPS", "FEFCO 0204 needs separate length-half and width-half flap measurements; this 0201 rebuild contract cannot represent it.", "style");
  }
  if (!knownFlute(input.fluteDirection)) {
    return modificationError("FLUTE_DIRECTION_UNKNOWN", "Measure and declare the blank's flute direction before rebuilding.", "fluteDirection");
  }
  if (input.sourceForm === "SIDE_BY_SIDE_JOIN") {
    return modificationError("SIDE_BY_SIDE_JOIN_UNSUPPORTED", "Precise rebuild does not support a side-by-side joined blank.", "sourceForm");
  }
  if (input.sourceForm !== "ONE_PIECE_OPENED_BLANK") {
    return modificationError("SOURCE_FORM_UNSUPPORTED", "Precise rebuild requires an intact opened one-piece RSC blank.", "sourceForm");
  }
  if ((input.condition !== "NEW" && input.condition !== "USED") || (input.joint !== "ADHESIVE" && input.joint !== "TAPE")) {
    return modificationError("UNSUPPORTED_JOINT_OR_CONDITION", "Precise rebuild requires a non-damaged blank with an accessible adhesive or tape manufacturer joint.");
  }
  if (input.additionalCreaseAllowanceMm === undefined) {
    return modificationError("CREASE_ALLOWANCE_UNKNOWN", "Enter explicit additional length, width, and height crease allowances for the FEFCO-101 score-center conversion.", "additionalCreaseAllowanceMm");
  }

  const original = input.originalInternal;
  const target = input.targetInternal;
  if (!allPositiveFinite([
    original.lengthMm, original.widthMm, original.heightMm,
    target.lengthMm, target.widthMm, target.heightMm,
    input.usableBlankWidthMm, input.usableBlankHeightMm,
    input.jointWidthMm, input.boardThicknessMm,
    input.topFlapDepthMm, input.bottomFlapDepthMm,
    input.minimumClosureOverlapMm, input.slotWidthMm, input.edgeClearanceMm,
  ]) || !allNonnegativeFinite([
    input.additionalCreaseAllowanceMm.lengthMm,
    input.additionalCreaseAllowanceMm.widthMm,
    input.additionalCreaseAllowanceMm.heightMm,
  ])) {
    return modificationError("INVALID_MEASUREMENTS", "Precise rebuild requires finite, positive measured dimensions and clearances.");
  }

  const rawLengthDeltaMm = original.lengthMm - target.lengthMm;
  const rawWidthDeltaMm = original.widthMm - target.widthMm;
  if (rawLengthDeltaMm < -RSC_DIMENSION_EPSILON_MM || rawWidthDeltaMm < -RSC_DIMENSION_EPSILON_MM) {
    return modificationError("TARGET_NOT_SMALLER", "Precise rebuild cannot enlarge either horizontal inside dimension.");
  }
  if (Math.abs(original.heightMm - target.heightMm) > RSC_DIMENSION_EPSILON_MM) {
    return modificationError("HEIGHT_CHANGE_UNSUPPORTED", "This precise rebuild keeps the original box height unchanged.", "targetInternal.heightMm");
  }
  const lengthDeltaMm = Math.abs(rawLengthDeltaMm) <= RSC_DIMENSION_EPSILON_MM ? 0 : rawLengthDeltaMm;
  const widthDeltaMm = Math.abs(rawWidthDeltaMm) <= RSC_DIMENSION_EPSILON_MM ? 0 : rawWidthDeltaMm;
  if (lengthDeltaMm === 0 && widthDeltaMm === 0) {
    return modificationError("TARGET_NOT_SMALLER", "Precise rebuild requires a smaller target length or width.");
  }

  const lengthMm = lengthDeltaMm === 0 ? original.lengthMm : target.lengthMm;
  const widthMm = widthDeltaMm === 0 ? original.widthMm : target.widthMm;
  const heightMm = original.heightMm;
  const jointWidthMm = input.jointWidthMm;
  const scoreCenterSpansMm: Dimensions3D = {
    lengthMm: lengthMm + input.boardThicknessMm + input.additionalCreaseAllowanceMm.lengthMm,
    widthMm: widthMm + input.boardThicknessMm + input.additionalCreaseAllowanceMm.widthMm,
    heightMm: heightMm + 2 * input.boardThicknessMm + input.additionalCreaseAllowanceMm.heightMm,
  };
  const lengthSpanMm = scoreCenterSpansMm.lengthMm;
  const widthSpanMm = scoreCenterSpansMm.widthMm;
  const heightSpanMm = scoreCenterSpansMm.heightMm;
  const panelScorePositionsMm: [number, number, number, number, number, number] = [
    0,
    lengthSpanMm,
    lengthSpanMm + widthSpanMm,
    2 * lengthSpanMm + widthSpanMm,
    2 * (lengthSpanMm + widthSpanMm),
    2 * (lengthSpanMm + widthSpanMm) + jointWidthMm,
  ];
  const perimeterSpanMm = panelScorePositionsMm[5];
  const wallBandScorePositionsMm: [number, number] = [input.topFlapDepthMm, input.topFlapDepthMm + heightSpanMm];
  const crossSpanMm = input.topFlapDepthMm + heightSpanMm + input.bottomFlapDepthMm;
  const topClosureOverlapMm = 2 * input.topFlapDepthMm - widthSpanMm;
  const bottomClosureOverlapMm = 2 * input.bottomFlapDepthMm - widthSpanMm;
  const closureOverlapMm = Math.min(topClosureOverlapMm, bottomClosureOverlapMm);

  if (input.usableBlankWidthMm < perimeterSpanMm) {
    return modificationError("PANEL_SPAN_SHORTFALL", `The target panel perimeter needs ${perimeterSpanMm} mm but the usable blank width is ${input.usableBlankWidthMm} mm.`, "usableBlankWidthMm");
  }
  if (input.usableBlankHeightMm < crossSpanMm) {
    return modificationError("TARGET_EXCEEDS_BLANK", `The target wall and flap cross-span needs ${crossSpanMm} mm but the usable blank height is ${input.usableBlankHeightMm} mm.`, "usableBlankHeightMm");
  }
  if (topClosureOverlapMm < input.minimumClosureOverlapMm) {
    return modificationError("FLAP_CLOSURE_SHORTFALL", "The top-end flap pair does not provide the declared minimum closure overlap.", "topFlapDepthMm");
  }
  if (bottomClosureOverlapMm < input.minimumClosureOverlapMm) {
    return modificationError("FLAP_CLOSURE_SHORTFALL", "The bottom-end flap pair does not provide the declared minimum closure overlap.", "bottomFlapDepthMm");
  }
  const maximumAdditionalCreaseAllowanceMm = Math.max(
    input.additionalCreaseAllowanceMm.lengthMm,
    input.additionalCreaseAllowanceMm.widthMm,
    input.additionalCreaseAllowanceMm.heightMm,
  );
  const minimumSeamStockMm = maximumAdditionalCreaseAllowanceMm + input.edgeClearanceMm;
  if (jointWidthMm < minimumSeamStockMm) {
    return modificationError("SEAM_OVERLAP_TOO_SMALL", "Joint width must retain at least the largest per-axis additional crease allowance plus edge clearance.", "jointWidthMm");
  }
  const minimumReliefStockMm = input.slotWidthMm + input.edgeClearanceMm + maximumAdditionalCreaseAllowanceMm;
  if (input.topFlapDepthMm < minimumReliefStockMm || input.bottomFlapDepthMm < minimumReliefStockMm) {
    return modificationError("CORNER_SCORE_CONFLICT", "Each flap depth must retain the slot width, edge clearance, and largest per-axis additional crease allowance.");
  }

  const panelScoreOperations: RscScalarOperation[] = panelScorePositionsMm.slice(1, 5).map((positionMm, index) => ({
    id: `panel-score-${index + 1}`,
    type: "SCORE" as const,
    measurementMm: positionMm,
    reference: "FROM_USABLE_BLANK_LEFT_EDGE",
    count: 1,
    description: "FEFCO-101 prototype crease-center position from the usable blank's left edge.",
  }));
  const remainingBlankWidthMm = input.usableBlankWidthMm - perimeterSpanMm;
  const remainingBlankHeightMm = input.usableBlankHeightMm - crossSpanMm;
  const trimOperations: RscScalarOperation[] = [];
  if (remainingBlankWidthMm > RSC_DIMENSION_EPSILON_MM) {
    trimOperations.push(
      {id: "blank-width-trim", type: "CUT", measurementMm: perimeterSpanMm, reference: "FROM_USABLE_BLANK_LEFT_EDGE", count: 1, description: "Scalar trim line after the panel perimeter and manufacturer-joint allowance."},
      {id: "blank-width-scrap", type: "SCRAP", measurementMm: remainingBlankWidthMm, reference: "USABLE_WIDTH_REMAINDER", count: 1, description: "Scalar usable width removed beyond the trim line."},
    );
  }
  if (remainingBlankHeightMm > RSC_DIMENSION_EPSILON_MM) {
    trimOperations.push(
      {id: "blank-height-trim", type: "CUT", measurementMm: crossSpanMm, reference: "FROM_USABLE_BLANK_TOP_EDGE", count: 1, description: "Scalar trim line after the top flap, wall band, and bottom flap."},
      {id: "blank-height-scrap", type: "SCRAP", measurementMm: remainingBlankHeightMm, reference: "USABLE_HEIGHT_REMAINDER", count: 1, description: "Scalar usable height removed beyond the trim line."},
    );
  }
  const operations: readonly RscScalarOperation[] = [
    ...panelScoreOperations,
    {id: "top-flap-score", type: "SCORE", measurementMm: wallBandScorePositionsMm[0], reference: "FROM_USABLE_BLANK_TOP_EDGE", count: 1, description: "Scalar top wall-band score position."},
    {id: "bottom-flap-score", type: "SCORE", measurementMm: wallBandScorePositionsMm[1], reference: "FROM_USABLE_BLANK_TOP_EDGE", count: 1, description: "Scalar bottom wall-band score position."},
    {id: "flap-relief-slots", type: "CUT", measurementMm: input.slotWidthMm, reference: "RELIEF_SLOT_WIDTH", count: 8, description: "Cut eight scalar flap-relief slots at the panel-score boundaries."},
    ...trimOperations,
  ];
  const warnings = [
    "PROTOTYPE_ONLY: verify this rebuild sequence on the actual opened blank.",
    "Panel marks use the FEFCO Recommendation 101 board-thickness basis plus explicit per-axis additional allowances.",
    "These marks are prototype score-center geometry, not a manufacturing-certified internal-to-blank conversion.",
    "This plan does not certify strength, carrier acceptance, or manufacturing compliance.",
    "Remeasure the final inside dimensions, seam, and both end-closure overlaps before use.",
  ] as const;
  const diagnostics: readonly RscDiagnostic[] = [{code: "PROTOTYPE_ONLY", severity: "WARNING", message: warnings[0]}];

  return immutable({
    id: "RSC_PRECISE_REBUILD_V1" as const,
    status: "PROTOTYPE_ONLY" as const,
    style: input.style,
    sourceForm: input.sourceForm,
    fluteDirection: input.fluteDirection,
    originalInternal: {...original},
    targetInternal: {...target},
    finalInternal: {lengthMm, widthMm, heightMm},
    usableBlankWidthMm: input.usableBlankWidthMm,
    usableBlankHeightMm: input.usableBlankHeightMm,
    panelScorePositionsMm,
    perimeterSpanMm,
    wallBandScorePositionsMm,
    crossSpanMm,
    jointWidthMm,
    joint: input.joint,
    boardThicknessMm: input.boardThicknessMm,
    additionalCreaseAllowanceMm: {...input.additionalCreaseAllowanceMm},
    scoreCenterSpansMm,
    topFlapDepthMm: input.topFlapDepthMm,
    bottomFlapDepthMm: input.bottomFlapDepthMm,
    topClosureOverlapMm,
    bottomClosureOverlapMm,
    closureOverlapMm,
    minimumClosureOverlapMm: input.minimumClosureOverlapMm,
    slotWidthMm: input.slotWidthMm,
    edgeClearanceMm: input.edgeClearanceMm,
    remainingBlankWidthMm,
    remainingBlankHeightMm,
    marks: operations,
    operations,
    playbook: REBUILD_PLAYBOOK,
    diagnostics,
    warnings,
  });
}
