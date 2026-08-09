export type RscJoint = "ADHESIVE" | "TAPE" | "STAPLED" | "UNKNOWN";
export type RscCondition = "NEW" | "USED" | "DAMAGED";
export type RscDeclaredStyle = "FEFCO_0201" | "FEFCO_0204" | "UNKNOWN";
export type RscSourceForm = "ONE_PIECE_OPENED_BLANK" | "SIDE_BY_SIDE_JOIN" | "BUTT_JOIN" | "TAPE_ONLY_JOIN" | "UNKNOWN";
export type RscFluteDirection = "PARALLEL_TO_HEIGHT" | "PARALLEL_TO_PERIMETER" | "UNKNOWN";

export const RSC_DIMENSION_EPSILON_MM = 0.01;

export type RscDiagnosticCode =
  | "INVALID_MEASUREMENTS"
  | "INVALID_PANEL_ANCHOR"
  | "LENGTH_WIDTH_NO_FIT"
  | "HEIGHT_NOT_REDUCED"
  | "WALL_TOO_SHORT"
  | "INSUFFICIENT_FLAP_STOCK"
  | "NO_EDGE_CLEARANCE"
  | "UNSUPPORTED_JOINT_OR_CONDITION"
  | "ENLARGEMENT_UNSUPPORTED"
  | "NO_REDUCTION"
  | "SPLIT_SUM_MISMATCH"
  | "INSUFFICIENT_CORNER_ALLOWANCE"
  | "TARGET_NOT_SMALLER"
  | "HEIGHT_CHANGE_UNSUPPORTED"
  | "MULTI_AXIS_REQUIRES_REBUILD"
  | "NEEDS_PRECISE_REBUILD"
  | "INSUFFICIENT_UNCREASED_PANEL"
  | "SEAM_OVERLAP_TOO_SMALL"
  | "FLAP_CLOSURE_SHORTFALL"
  | "CORNER_SCORE_CONFLICT"
  | "STYLE_UNKNOWN"
  | "STYLE_REQUIRES_DETAILED_FLAPS"
  | "FLUTE_DIRECTION_UNKNOWN"
  | "SOURCE_FORM_UNSUPPORTED"
  | "CREASE_ALLOWANCE_UNKNOWN"
  | "TARGET_EXCEEDS_BLANK"
  | "PANEL_SPAN_SHORTFALL"
  | "SIDE_BY_SIDE_JOIN_UNSUPPORTED"
  | "MEASUREMENT_REQUIRED"
  | "BOARD_THICKNESS_REQUIRED"
  | "INVALID_AXIS_PERMUTATION"
  | "INVALID_TARGET_AXIS"
  | "STYLE_REFERENCE_INVALID"
  | "PART_ROLE_MISMATCH"
  | "SOURCE_NOT_INTACT"
  | "TRANSFORMED_SOURCE_UNVERIFIED"
  | "DAMAGED_SOURCE"
  | "CROSS_AXIS_INTERFERENCE"
  | "CLEARANCE_TOO_SMALL"
  | "INSUFFICIENT_OVERLAP"
  | "INVALID_OVERLAP"
  | "TARGET_NOT_EXTENDED"
  | "TARGET_DOES_NOT_FIT"
  | "SLEEVE_REQUIRED"
  | "SLEEVE_FORM_UNSUPPORTED"
  | "INSUFFICIENT_SLEEVE_LENGTH"
  | "INSUFFICIENT_COVERAGE"
  | "INVALID_SEAM_INTRUSION"
  | "TAPE_ONLY_JOIN_UNSUPPORTED"
  | "UNSUPPORTED_SPLICE_GEOMETRY"
  | "AXIAL_OPENING_REQUIRED"
  | "AXIAL_MEASUREMENT_REQUIRED"
  | "AXIAL_TOPOLOGY_UNSUPPORTED"
  | "PROTOTYPE_ONLY";

export interface RscDiagnostic {
  readonly code: RscDiagnosticCode;
  readonly severity: "ERROR" | "WARNING";
  readonly message: string;
  readonly field?: string;
}

export interface RscScalarOperation {
  readonly id: string;
  readonly type: "SCORE" | "CUT" | "SCRAP";
  readonly measurementMm: number;
  readonly reference: string;
  readonly count: number;
  readonly description: string;
}

export interface RscPlaybookStep<Code extends string = string> {
  readonly order: number;
  readonly code: Code;
  readonly instruction: string;
}

export interface RscModificationError {
  readonly status: "INVALID";
  readonly error: string;
  readonly diagnostics: readonly RscDiagnostic[];
}

export function immutable<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((entry) => immutable(entry));
    Object.freeze(value);
  }
  return value;
}

export function modificationError(code: RscDiagnosticCode, message: string, field?: string): RscModificationError {
  return immutable({
    status: "INVALID" as const,
    error: message,
    diagnostics: [{code, severity: "ERROR" as const, message, ...(field ? {field} : {})}],
  });
}
