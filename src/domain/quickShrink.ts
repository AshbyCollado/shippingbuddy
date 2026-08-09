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

export type QuickShrinkAxis = "LENGTH" | "WIDTH";

export interface QuickOverlapShrinkInput {
  originalInternal: Dimensions3D;
  targetInternal: Dimensions3D;
  axis: QuickShrinkAxis;
  style: RscDeclaredStyle;
  sourceForm: RscSourceForm;
  uncreasedPanelMaterialMm: number;
  minimumJointOverlapMm: number;
  flapOverlapAfterMm: number;
  minimumClosureOverlapMm: number;
  oldScoreClearanceMm: number;
  slotWidthMm: number;
  edgeClearanceMm: number;
  boardThicknessMm: number;
  joint: RscJoint;
  condition: RscCondition;
  fluteDirection: RscFluteDirection;
}

export type QuickShrinkStepCode =
  | "VERIFY_FLAT_BLANK"
  | "MARK_NEW_SCORE"
  | "CUT_RELIEF"
  | "OVERLAP_PANEL"
  | "SEAL_JOINT"
  | "REFOLD_FLAPS"
  | "REMEASURE";

export interface QuickOverlapShrinkPlan {
  readonly id: "QUICK_OVERLAP_SHRINK_V1";
  readonly status: "PROTOTYPE_ONLY";
  readonly axis: QuickShrinkAxis;
  readonly style: "FEFCO_0201";
  readonly sourceForm: "ONE_PIECE_OPENED_BLANK";
  readonly fluteDirection: Exclude<RscFluteDirection, "UNKNOWN">;
  readonly originalInternal: Readonly<Dimensions3D>;
  readonly targetInternal: Readonly<Dimensions3D>;
  readonly finalInternal: Readonly<Dimensions3D>;
  readonly deltaMm: number;
  readonly uncreasedPanelMaterialMm: number;
  readonly remainingPanelMaterialMm: number;
  readonly minimumJointOverlapMm: number;
  readonly remainingJointOverlapMm: number;
  readonly flapOverlapAfterMm: number;
  readonly minimumClosureOverlapMm: number;
  readonly oldScoreClearanceMm: number;
  readonly slotWidthMm: number;
  readonly edgeClearanceMm: number;
  readonly boardThicknessMm: number;
  readonly marks: readonly RscScalarOperation[];
  readonly operations: readonly RscScalarOperation[];
  readonly playbook: readonly RscPlaybookStep<QuickShrinkStepCode>[];
  readonly diagnostics: readonly RscDiagnostic[];
  readonly warnings: readonly string[];
}

const QUICK_PLAYBOOK: readonly RscPlaybookStep<QuickShrinkStepCode>[] = immutable([
  {order: 1, code: "VERIFY_FLAT_BLANK", instruction: "Verify the opened blank is an intact one-piece FEFCO 0201 RSC with known flute direction."},
  {order: 2, code: "MARK_NEW_SCORE", instruction: "Mark the new scalar panel score on the declared horizontal axis."},
  {order: 3, code: "CUT_RELIEF", instruction: "Cut only the declared slot-width relief while preserving old-score and edge clearances."},
  {order: 4, code: "OVERLAP_PANEL", instruction: "Overlap the shortened panel by the calculated scalar delta while retaining the minimum joint overlap."},
  {order: 5, code: "SEAL_JOINT", instruction: "Seal the accessible tape or adhesive manufacturer joint after verifying the overlap."},
  {order: 6, code: "REFOLD_FLAPS", instruction: "Refold the existing flaps and verify the measured closure overlap."},
  {order: 7, code: "REMEASURE", instruction: "Remeasure all final inside dimensions before use."},
]);

function allPositiveFinite(values: readonly number[]) {
  return values.every((value) => Number.isFinite(value) && value > 0);
}

function knownFlute(direction: RscFluteDirection): direction is Exclude<RscFluteDirection, "UNKNOWN"> {
  return direction === "PARALLEL_TO_HEIGHT" || direction === "PARALLEL_TO_PERIMETER";
}

export function calculateQuickOverlapShrink(input: QuickOverlapShrinkInput): QuickOverlapShrinkPlan | RscModificationError {
  const original = input.originalInternal;
  const target = input.targetInternal;
  if (!allPositiveFinite([
    original.lengthMm, original.widthMm, original.heightMm,
    target.lengthMm, target.widthMm, target.heightMm,
    input.uncreasedPanelMaterialMm, input.minimumJointOverlapMm,
    input.minimumClosureOverlapMm,
    input.oldScoreClearanceMm, input.slotWidthMm, input.edgeClearanceMm,
    input.boardThicknessMm,
  ]) || !Number.isFinite(input.flapOverlapAfterMm) || input.flapOverlapAfterMm < 0
    || (input.axis !== "LENGTH" && input.axis !== "WIDTH")) {
    return modificationError("INVALID_MEASUREMENTS", "Quick shrink requires finite, positive measurements and one declared horizontal axis.");
  }
  if (input.style === "UNKNOWN") {
    return modificationError("STYLE_UNKNOWN", "Declare and verify an opened FEFCO 0201 RSC before using quick shrink.", "style");
  }
  if (input.style === "FEFCO_0204") {
    return modificationError("STYLE_REQUIRES_DETAILED_FLAPS", "FEFCO 0204 has separate length-half and width-half flap sets; quick shrink requires a detailed per-flap recipe.", "style");
  }
  if (!knownFlute(input.fluteDirection)) {
    return modificationError("FLUTE_DIRECTION_UNKNOWN", "Measure and declare the blank's flute direction before using quick shrink.", "fluteDirection");
  }
  if (input.sourceForm === "SIDE_BY_SIDE_JOIN") {
    return modificationError("SIDE_BY_SIDE_JOIN_UNSUPPORTED", "Quick shrink does not support a side-by-side joined blank; use a precise rebuild recipe.", "sourceForm");
  }
  if (input.sourceForm !== "ONE_PIECE_OPENED_BLANK") {
    return modificationError("NEEDS_PRECISE_REBUILD", "Butt-joined, tape-only, unknown, or non-one-piece sources require a measured precise rebuild.", "sourceForm");
  }
  if ((input.condition !== "NEW" && input.condition !== "USED") || (input.joint !== "ADHESIVE" && input.joint !== "TAPE")) {
    return modificationError("UNSUPPORTED_JOINT_OR_CONDITION", "Quick shrink requires a non-damaged blank with an accessible adhesive or tape manufacturer joint.");
  }

  const rawLengthDeltaMm = original.lengthMm - target.lengthMm;
  const rawWidthDeltaMm = original.widthMm - target.widthMm;
  const heightChangeMm = Math.abs(original.heightMm - target.heightMm);
  if (rawLengthDeltaMm < -RSC_DIMENSION_EPSILON_MM || rawWidthDeltaMm < -RSC_DIMENSION_EPSILON_MM) {
    return modificationError("TARGET_NOT_SMALLER", "Quick shrink cannot enlarge either horizontal inside dimension.");
  }
  if (heightChangeMm > RSC_DIMENSION_EPSILON_MM) {
    return modificationError("HEIGHT_CHANGE_UNSUPPORTED", "Quick overlap shrink cannot change box height; use a height or rebuild recipe.", "targetInternal.heightMm");
  }
  const lengthDeltaMm = Math.abs(rawLengthDeltaMm) <= RSC_DIMENSION_EPSILON_MM ? 0 : rawLengthDeltaMm;
  const widthDeltaMm = Math.abs(rawWidthDeltaMm) <= RSC_DIMENSION_EPSILON_MM ? 0 : rawWidthDeltaMm;
  if (lengthDeltaMm === 0 && widthDeltaMm === 0) {
    return modificationError("TARGET_NOT_SMALLER", "Quick shrink requires one positive horizontal reduction.");
  }
  if (lengthDeltaMm > 0 && widthDeltaMm > 0) {
    return modificationError("MULTI_AXIS_REQUIRES_REBUILD", "Changing both horizontal axes requires a precise rebuild recipe.");
  }
  const activeAxis: QuickShrinkAxis = lengthDeltaMm > 0 ? "LENGTH" : "WIDTH";
  if (input.axis !== activeAxis) {
    return modificationError("NEEDS_PRECISE_REBUILD", `The declared ${input.axis.toLowerCase()} axis does not match the measured ${activeAxis.toLowerCase()} reduction.`, "axis");
  }
  const deltaMm = activeAxis === "LENGTH" ? lengthDeltaMm : widthDeltaMm;
  const maximumDeltaMm = input.uncreasedPanelMaterialMm - input.minimumJointOverlapMm - input.edgeClearanceMm;
  if (maximumDeltaMm < 0 || deltaMm > maximumDeltaMm) {
    return modificationError("INSUFFICIENT_UNCREASED_PANEL", "The declared uncreased panel stock cannot absorb this reduction while retaining joint overlap and edge clearance.", "uncreasedPanelMaterialMm");
  }
  const remainingPanelMaterialMm = input.uncreasedPanelMaterialMm - deltaMm;
  const remainingJointOverlapMm = remainingPanelMaterialMm - input.edgeClearanceMm;
  if (remainingJointOverlapMm < input.minimumJointOverlapMm) {
    return modificationError("SEAM_OVERLAP_TOO_SMALL", "The remaining manufacturer-joint overlap is below the declared minimum.");
  }
  if (input.flapOverlapAfterMm < input.minimumClosureOverlapMm) {
    return modificationError("FLAP_CLOSURE_SHORTFALL", "The measured flap overlap after shrinking is below the minimum closure overlap.", "flapOverlapAfterMm");
  }
  const requiredOldScoreClearanceMm = input.slotWidthMm + input.edgeClearanceMm;
  if (input.oldScoreClearanceMm < requiredOldScoreClearanceMm) {
    return modificationError("CORNER_SCORE_CONFLICT", "The old-score clearance must be at least the slot width plus edge clearance.", "oldScoreClearanceMm");
  }

  const operations: readonly RscScalarOperation[] = [
    {id: "new-panel-score", type: "SCORE", measurementMm: deltaMm, reference: `INWARD_FROM_EXISTING_${activeAxis}_SCORE`, count: 1, description: "Mark the replacement crease center this distance inward from the verified existing crease center."},
    {id: "corner-relief", type: "CUT", measurementMm: input.slotWidthMm, reference: "RELIEF_SLOT_WIDTH", count: 2, description: "Cut two relief slots at the declared scalar width."},
  ];
  const warnings = [
    "PROTOTYPE_ONLY: verify this overlap-shrink sequence on the actual opened blank.",
    "This plan does not certify strength, carrier acceptance, or manufacturing compliance.",
    "Remeasure the final inside dimensions and flap closure before use.",
  ] as const;
  const diagnostics: readonly RscDiagnostic[] = [{code: "PROTOTYPE_ONLY", severity: "WARNING", message: warnings[0]}];
  const finalInternal = {
    lengthMm: activeAxis === "LENGTH" ? target.lengthMm : original.lengthMm,
    widthMm: activeAxis === "WIDTH" ? target.widthMm : original.widthMm,
    heightMm: original.heightMm,
  };

  return immutable({
    id: "QUICK_OVERLAP_SHRINK_V1" as const,
    status: "PROTOTYPE_ONLY" as const,
    axis: activeAxis,
    style: input.style,
    sourceForm: input.sourceForm,
    fluteDirection: input.fluteDirection,
    originalInternal: {...original},
    targetInternal: {...target},
    finalInternal,
    deltaMm,
    uncreasedPanelMaterialMm: input.uncreasedPanelMaterialMm,
    remainingPanelMaterialMm,
    minimumJointOverlapMm: input.minimumJointOverlapMm,
    remainingJointOverlapMm,
    flapOverlapAfterMm: input.flapOverlapAfterMm,
    minimumClosureOverlapMm: input.minimumClosureOverlapMm,
    oldScoreClearanceMm: input.oldScoreClearanceMm,
    slotWidthMm: input.slotWidthMm,
    edgeClearanceMm: input.edgeClearanceMm,
    boardThicknessMm: input.boardThicknessMm,
    marks: operations,
    operations,
    playbook: QUICK_PLAYBOOK,
    diagnostics,
    warnings,
  });
}
