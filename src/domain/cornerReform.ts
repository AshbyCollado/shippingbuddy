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

export type CornerReformMode = "SYMMETRIC" | "UNEQUAL";
export type CornerSide = "lengthStart" | "lengthEnd" | "widthStart" | "widthEnd";

export interface CornerSideValues {
  readonly lengthStart: number;
  readonly lengthEnd: number;
  readonly widthStart: number;
  readonly widthEnd: number;
}

export interface CornerReformInput {
  originalInternal: Dimensions3D;
  requiredInternal: Dimensions3D;
  mode: CornerReformMode;
  reductionsMm?: CornerSideValues;
  availableAllowancesMm: CornerSideValues;
  minimumOverlapMm: number;
  edgeClearanceMm: number;
  joint: RscJoint;
  condition: RscCondition;
}

export interface CornerReformMark {
  readonly side: CornerSide;
  readonly reductionMm: number;
  readonly availableAllowanceMm: number;
  readonly requiredAllowanceMm: number;
  readonly reference: "FROM_EXISTING_CORNER";
}

export type CornerReformStepCode =
  | "VERIFY_SOURCE"
  | "MARK_REDUCTIONS"
  | "CUT_RELIEF"
  | "REFORM_CORNERS"
  | "REJOIN_JOINT"
  | "TAPE_TOP"
  | "REMEASURE";

export interface CornerReformPlan {
  readonly id: "RSC_CORNER_REFORM_V1";
  readonly status: "PROTOTYPE_ONLY";
  readonly mode: CornerReformMode;
  readonly originalInternal: Readonly<Dimensions3D>;
  readonly requiredInternal: Readonly<Dimensions3D>;
  readonly finalInternal: Readonly<Dimensions3D>;
  readonly reductionsMm: Readonly<CornerSideValues>;
  readonly availableAllowancesMm: Readonly<CornerSideValues>;
  readonly minimumOverlapMm: number;
  readonly edgeClearanceMm: number;
  readonly marks: readonly CornerReformMark[];
  readonly operations: readonly RscScalarOperation[];
  readonly playbook: readonly RscPlaybookStep<CornerReformStepCode>[];
  readonly diagnostics: readonly RscDiagnostic[];
  readonly warnings: readonly string[];
}

export const CORNER_SPLIT_EPSILON_MM = 0.01;

const SIDES: readonly CornerSide[] = ["lengthStart", "lengthEnd", "widthStart", "widthEnd"];

const CORNER_PLAYBOOK: readonly RscPlaybookStep<CornerReformStepCode>[] = immutable([
  {order: 1, code: "VERIFY_SOURCE", instruction: "Verify raw dimensions, available side allowances, board condition, and the accessible tape or adhesive joint."},
  {order: 2, code: "MARK_REDUCTIONS", instruction: "Mark each scalar side reduction from its existing corner reference."},
  {order: 3, code: "CUT_RELIEF", instruction: "Cut only the marked corner relief needed for the declared reductions."},
  {order: 4, code: "REFORM_CORNERS", instruction: "Reform each marked corner while retaining the minimum overlap and edge clearance."},
  {order: 5, code: "REJOIN_JOINT", instruction: "Rejoin the accessible manufacturer joint after a dry dimensional check."},
  {order: 6, code: "TAPE_TOP", instruction: "Close and tape the top only after the reformed corners align."},
  {order: 7, code: "REMEASURE", instruction: "Remeasure the final inside length, width, and height before use."},
]);

function finitePositiveDimensions(dimensions: Dimensions3D) {
  return Object.values(dimensions).every((value) => Number.isFinite(value) && value > 0);
}

function finiteNonnegativeSides(values: CornerSideValues) {
  return SIDES.every((side) => Number.isFinite(values[side]) && values[side] >= 0);
}

function symmetricReductions(lengthDeltaMm: number, widthDeltaMm: number): CornerSideValues {
  return {
    lengthStart: lengthDeltaMm / 2,
    lengthEnd: lengthDeltaMm / 2,
    widthStart: widthDeltaMm / 2,
    widthEnd: widthDeltaMm / 2,
  };
}

export function calculateCornerReform(input: CornerReformInput): CornerReformPlan | RscModificationError {
  if ((input.mode !== "SYMMETRIC" && input.mode !== "UNEQUAL")
    || !finitePositiveDimensions(input.originalInternal)
    || !finitePositiveDimensions(input.requiredInternal)
    || !Number.isFinite(input.minimumOverlapMm) || input.minimumOverlapMm <= 0
    || !Number.isFinite(input.edgeClearanceMm) || input.edgeClearanceMm <= 0
    || !finiteNonnegativeSides(input.availableAllowancesMm)) {
    return modificationError("INVALID_MEASUREMENTS", "Dimensions, overlap, and edge clearance must be finite and positive; side allowances must be finite and nonnegative.");
  }
  if ((input.condition !== "NEW" && input.condition !== "USED") || (input.joint !== "ADHESIVE" && input.joint !== "TAPE")) {
    return modificationError("UNSUPPORTED_JOINT_OR_CONDITION", "Corner reform requires a non-damaged box with an accessible adhesive or tape manufacturer joint.");
  }

  const rawLengthDeltaMm = input.originalInternal.lengthMm - input.requiredInternal.lengthMm;
  const rawWidthDeltaMm = input.originalInternal.widthMm - input.requiredInternal.widthMm;
  const heightOverflowMm = input.requiredInternal.heightMm - input.originalInternal.heightMm;
  if (rawLengthDeltaMm < -CORNER_SPLIT_EPSILON_MM || rawWidthDeltaMm < -CORNER_SPLIT_EPSILON_MM || heightOverflowMm > CORNER_SPLIT_EPSILON_MM) {
    return modificationError("ENLARGEMENT_UNSUPPORTED", "Corner reform is shrink-only and cannot satisfy any required dimension larger than the original box.");
  }
  const lengthDeltaMm = Math.abs(rawLengthDeltaMm) <= CORNER_SPLIT_EPSILON_MM ? 0 : rawLengthDeltaMm;
  const widthDeltaMm = Math.abs(rawWidthDeltaMm) <= CORNER_SPLIT_EPSILON_MM ? 0 : rawWidthDeltaMm;
  if (lengthDeltaMm === 0 && widthDeltaMm === 0) {
    return modificationError("NO_REDUCTION", "Corner reform requires a positive length or width reduction.");
  }

  let reductionsMm: CornerSideValues;
  if (input.mode === "SYMMETRIC") {
    reductionsMm = symmetricReductions(lengthDeltaMm, widthDeltaMm);
  } else {
    if (!input.reductionsMm || !finiteNonnegativeSides(input.reductionsMm)) {
      return modificationError("INVALID_MEASUREMENTS", "Unequal corner reform requires finite, nonnegative reductions for all four sides.", "reductionsMm");
    }
    reductionsMm = {
      lengthStart: input.reductionsMm.lengthStart <= CORNER_SPLIT_EPSILON_MM ? 0 : input.reductionsMm.lengthStart,
      lengthEnd: input.reductionsMm.lengthEnd <= CORNER_SPLIT_EPSILON_MM ? 0 : input.reductionsMm.lengthEnd,
      widthStart: input.reductionsMm.widthStart <= CORNER_SPLIT_EPSILON_MM ? 0 : input.reductionsMm.widthStart,
      widthEnd: input.reductionsMm.widthEnd <= CORNER_SPLIT_EPSILON_MM ? 0 : input.reductionsMm.widthEnd,
    };
    const lengthMismatchMm = Math.abs(reductionsMm.lengthStart + reductionsMm.lengthEnd - lengthDeltaMm);
    const widthMismatchMm = Math.abs(reductionsMm.widthStart + reductionsMm.widthEnd - widthDeltaMm);
    if (lengthMismatchMm > CORNER_SPLIT_EPSILON_MM || widthMismatchMm > CORNER_SPLIT_EPSILON_MM) {
      return modificationError("SPLIT_SUM_MISMATCH", "Unequal side reductions must sum to the exact length and width deltas within 0.01 mm.", "reductionsMm");
    }
  }

  const marks: CornerReformMark[] = SIDES.filter((side) => reductionsMm[side] > CORNER_SPLIT_EPSILON_MM).map((side) => ({
    side,
    reductionMm: reductionsMm[side],
    availableAllowanceMm: input.availableAllowancesMm[side],
    requiredAllowanceMm: reductionsMm[side] + input.minimumOverlapMm + input.edgeClearanceMm,
    reference: "FROM_EXISTING_CORNER" as const,
  }));
  const insufficient = marks.find((mark) => mark.availableAllowanceMm < mark.requiredAllowanceMm);
  if (insufficient) {
    return modificationError(
      "INSUFFICIENT_CORNER_ALLOWANCE",
      `${insufficient.side} needs ${insufficient.requiredAllowanceMm} mm of measured allowance but only ${insufficient.availableAllowanceMm} mm is available.`,
      `availableAllowancesMm.${insufficient.side}`,
    );
  }

  const sideOperations: RscScalarOperation[] = marks
    .filter((mark) => mark.reductionMm > 0)
    .flatMap((mark) => [
      {id: `score-${mark.side}`, type: "SCORE" as const, measurementMm: mark.reductionMm, reference: `FROM_EXISTING_CORNER:${mark.side}`, count: 1, description: `Score the ${mark.side} reform at its declared scalar reduction.`},
      {id: `cut-${mark.side}`, type: "CUT" as const, measurementMm: mark.reductionMm, reference: `CORNER_RELIEF:${mark.side}`, count: 1, description: `Cut relief only for the declared ${mark.side} reduction.`},
    ]);
  const scrapOperations: RscScalarOperation[] = [
    ...(lengthDeltaMm > 0 ? [{id: "scrap-length-reduction", type: "SCRAP" as const, measurementMm: lengthDeltaMm, reference: "TOTAL_LENGTH_REDUCTION", count: 1, description: "Scalar total removed from the original inside length."}] : []),
    ...(widthDeltaMm > 0 ? [{id: "scrap-width-reduction", type: "SCRAP" as const, measurementMm: widthDeltaMm, reference: "TOTAL_WIDTH_REDUCTION", count: 1, description: "Scalar total removed from the original inside width."}] : []),
  ];
  const warnings = [
    "PROTOTYPE_ONLY: corner reform requires a physical trial on the actual corrugated box.",
    "This plan does not establish strength, carrier, or manufacturing compliance.",
    "Remeasure the final inside dimensions before use.",
  ] as const;
  const diagnostics: readonly RscDiagnostic[] = [{code: "PROTOTYPE_ONLY", severity: "WARNING", message: warnings[0]}];

  return immutable({
    id: "RSC_CORNER_REFORM_V1" as const,
    status: "PROTOTYPE_ONLY" as const,
    mode: input.mode,
    originalInternal: {...input.originalInternal},
    requiredInternal: {...input.requiredInternal},
    finalInternal: {
      lengthMm: lengthDeltaMm === 0 ? input.originalInternal.lengthMm : input.requiredInternal.lengthMm,
      widthMm: widthDeltaMm === 0 ? input.originalInternal.widthMm : input.requiredInternal.widthMm,
      heightMm: input.originalInternal.heightMm,
    },
    reductionsMm,
    availableAllowancesMm: {...input.availableAllowancesMm},
    minimumOverlapMm: input.minimumOverlapMm,
    edgeClearanceMm: input.edgeClearanceMm,
    marks,
    operations: [...sideOperations, ...scrapOperations],
    playbook: CORNER_PLAYBOOK,
    diagnostics,
    warnings,
  });
}
