export type RscJoint = "ADHESIVE" | "TAPE" | "STAPLED" | "UNKNOWN";
export type RscCondition = "NEW" | "USED" | "DAMAGED";

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
