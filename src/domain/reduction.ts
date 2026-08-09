import type {Dimensions3D} from "./geometry";
import {
  immutable,
  modificationError,
  type RscCondition,
  type RscDiagnostic,
  type RscJoint,
  type RscModificationError,
  type RscPlaybookStep,
  type RscScalarOperation,
} from "./rscModification";

export interface HeightReductionInput {
  originalInternal: Dimensions3D;
  requiredInternal: Dimensions3D;
  panelDepthScoreToScoreMm: number;
  openingWidthScoreSpanMm: number;
  thicknessMm: number;
  topSeamGapMm: number;
  slotWidthMm: number;
  joint: RscJoint;
  condition: RscCondition;
  minimumWallHeightMm?: number;
  edgeClearanceMm?: number;
}

export type HeightCutDownStepCode =
  | "VERIFY_SOURCE"
  | "OPEN_JOINT"
  | "REMOVE_OLD_TOP"
  | "MARK_NEW_SCORE"
  | "SCORE_PERIMETER"
  | "CUT_SLOTS"
  | "TRIM_SCRAP"
  | "DRY_FOLD"
  | "REJOIN_JOINT"
  | "TAPE_TOP"
  | "REMEASURE";

export interface HeightReductionPlan {
  readonly id: "RSC_HEIGHT_CUT_DOWN_V1";
  readonly status: "PROTOTYPE_ONLY";
  readonly originalInternal: Readonly<Dimensions3D>;
  readonly requiredInternal: Readonly<Dimensions3D>;
  readonly finalInternal: Readonly<Dimensions3D>;
  readonly targetHeightMm: number;
  readonly retainedAllowanceMm: number;
  readonly newScoreMm: number;
  readonly newScoreFromBottomMm: number;
  readonly replacementFlapDepthMm: number;
  readonly outerTrimMm: number;
  readonly trimLineFromBottomMm: number;
  readonly trimFromTopMm: number;
  readonly availableFlapMaterialMm: number;
  readonly slotWidthMm: number;
  readonly edgeClearanceMm: number;
  readonly marks: readonly RscScalarOperation[];
  readonly operations: readonly RscScalarOperation[];
  readonly playbook: readonly RscPlaybookStep<HeightCutDownStepCode>[];
  readonly diagnostics: readonly RscDiagnostic[];
  readonly warnings: readonly string[];
}

const HEIGHT_PLAYBOOK: readonly RscPlaybookStep<HeightCutDownStepCode>[] = immutable([
  {order: 1, code: "VERIFY_SOURCE", instruction: "Verify all measurements, board condition, and the accessible tape or adhesive joint."},
  {order: 2, code: "OPEN_JOINT", instruction: "Open only the existing tape or adhesive manufacturer joint."},
  {order: 3, code: "REMOVE_OLD_TOP", instruction: "Remove the original top flaps and old top score without entering the retained wall area."},
  {order: 4, code: "MARK_NEW_SCORE", instruction: "Mark the new score height from the bottom on every wall panel."},
  {order: 5, code: "SCORE_PERIMETER", instruction: "Score the full perimeter at the marked scalar height."},
  {order: 6, code: "CUT_SLOTS", instruction: "Cut the corner slots to the entered slot width without crossing the new score."},
  {order: 7, code: "TRIM_SCRAP", instruction: "Trim above the replacement flap depth and remove the identified top scrap."},
  {order: 8, code: "DRY_FOLD", instruction: "Dry-fold every replacement flap and confirm edge clearance."},
  {order: 9, code: "REJOIN_JOINT", instruction: "Rejoin the original manufacturer joint with an appropriate tape or adhesive method."},
  {order: 10, code: "TAPE_TOP", instruction: "Close and tape the replacement top flaps."},
  {order: 11, code: "REMEASURE", instruction: "Remeasure the final inside length, width, and height before use."},
]);

function positiveFinite(values: readonly number[]) {
  return values.every((value) => Number.isFinite(value) && value > 0);
}

export function calculateHeightReduction(input: HeightReductionInput): HeightReductionPlan | RscModificationError {
  const original = input.originalInternal;
  const required = input.requiredInternal;
  const requiredValues = [
    original.lengthMm, original.widthMm, original.heightMm,
    required.lengthMm, required.widthMm, required.heightMm,
    input.panelDepthScoreToScoreMm, input.openingWidthScoreSpanMm,
    input.thicknessMm, input.topSeamGapMm, input.slotWidthMm,
  ];
  const optionalValues = [input.minimumWallHeightMm, input.edgeClearanceMm].filter((value): value is number => value !== undefined);
  if (!positiveFinite([...requiredValues, ...optionalValues])) {
    return modificationError("INVALID_MEASUREMENTS", "All measured dimensions and optional limits must be finite and greater than zero.");
  }
  if ((input.condition !== "NEW" && input.condition !== "USED") || (input.joint !== "ADHESIVE" && input.joint !== "TAPE")) {
    return modificationError("UNSUPPORTED_JOINT_OR_CONDITION", "Height cut-down requires a non-damaged box with an accessible adhesive or tape manufacturer joint.");
  }
  if (input.panelDepthScoreToScoreMm < original.heightMm) {
    return modificationError("INVALID_PANEL_ANCHOR", "Panel depth from score to score cannot be shorter than the original inside height.", "panelDepthScoreToScoreMm");
  }
  if (required.lengthMm > original.lengthMm || required.widthMm > original.widthMm) {
    return modificationError("LENGTH_WIDTH_NO_FIT", "The required item envelope does not fit the original inside length and width.");
  }
  if (required.heightMm >= original.heightMm) {
    return modificationError("HEIGHT_NOT_REDUCED", "The target height must be lower than the original inside height.", "requiredInternal.heightMm");
  }
  if (input.minimumWallHeightMm !== undefined && required.heightMm < input.minimumWallHeightMm) {
    return modificationError("WALL_TOO_SHORT", `The target wall is shorter than the configured ${input.minimumWallHeightMm} mm minimum.`, "requiredInternal.heightMm");
  }

  const retainedAllowanceMm = input.panelDepthScoreToScoreMm - original.heightMm;
  const newScoreMm = required.heightMm + retainedAllowanceMm;
  const replacementFlapDepthMm = (input.openingWidthScoreSpanMm - input.topSeamGapMm) / 2;
  if (!Number.isFinite(replacementFlapDepthMm) || replacementFlapDepthMm <= 0) {
    return modificationError("INSUFFICIENT_FLAP_STOCK", "The opening span and seam gap do not leave a positive replacement flap depth.");
  }
  const edgeClearanceMm = Math.max(input.edgeClearanceMm ?? 3, input.thicknessMm, input.slotWidthMm);
  if (replacementFlapDepthMm <= edgeClearanceMm) {
    return modificationError("NO_EDGE_CLEARANCE", "Replacement flap depth must be greater than the slot width and required edge clearance.");
  }

  const outerTrimMm = newScoreMm + replacementFlapDepthMm;
  const trimFromTopMm = input.panelDepthScoreToScoreMm - outerTrimMm;
  const availableFlapMaterialMm = input.panelDepthScoreToScoreMm - newScoreMm;
  if (outerTrimMm > input.panelDepthScoreToScoreMm - edgeClearanceMm || availableFlapMaterialMm < replacementFlapDepthMm + edgeClearanceMm) {
    return modificationError("INSUFFICIENT_FLAP_STOCK", `This box cannot be reduced to ${required.heightMm} mm while retaining the exact replacement-flap stock and edge boundary.`);
  }

  const warnings = [
    "Experimental recipe: remove the original top flaps and old top score before creating replacement flaps.",
    "Physical validation is required before relying on the resized box.",
    "PROTOTYPE_ONLY: this cut-down sequence requires physical validation on the actual corrugated box.",
    "This plan does not establish strength, carrier, or manufacturing compliance.",
  ] as const;
  const diagnostics: readonly RscDiagnostic[] = [{code: "PROTOTYPE_ONLY", severity: "WARNING", message: warnings[2]}];
  const operations: readonly RscScalarOperation[] = [
    {id: "new-top-score", type: "SCORE", measurementMm: newScoreMm, reference: "FROM_BOTTOM", count: 4, description: "Score every wall panel at this height from its bottom score."},
    {id: "corner-slot-width", type: "CUT", measurementMm: input.slotWidthMm, reference: "SLOT_WIDTH", count: 4, description: "Cut four replacement corner slots at the entered scalar width."},
    {id: "top-trim-line", type: "CUT", measurementMm: outerTrimMm, reference: "FROM_BOTTOM", count: 4, description: "Trim each panel at this scalar distance from its bottom score."},
    {id: "top-scrap", type: "SCRAP", measurementMm: trimFromTopMm, reference: "FROM_TOP", count: 4, description: "Remove this scalar depth of top scrap from each panel."},
  ];

  return immutable({
    id: "RSC_HEIGHT_CUT_DOWN_V1" as const,
    status: "PROTOTYPE_ONLY" as const,
    originalInternal: {...original},
    requiredInternal: {...required},
    finalInternal: {lengthMm: original.lengthMm, widthMm: original.widthMm, heightMm: required.heightMm},
    targetHeightMm: required.heightMm,
    retainedAllowanceMm,
    newScoreMm,
    newScoreFromBottomMm: newScoreMm,
    replacementFlapDepthMm,
    outerTrimMm,
    trimLineFromBottomMm: outerTrimMm,
    trimFromTopMm,
    availableFlapMaterialMm,
    slotWidthMm: input.slotWidthMm,
    edgeClearanceMm,
    marks: operations,
    operations,
    playbook: HEIGHT_PLAYBOOK,
    diagnostics,
    warnings,
  });
}
