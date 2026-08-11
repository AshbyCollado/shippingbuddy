import {
  autoFitSheet as deriveAutoFitSheet,
  chooseWrapOrientation,
  fitsSheet as assessSheetFit,
  generatePatternPlan,
  packedEnvelope,
  type Orientation,
  type PackedEnvelope,
  type WrapPlan,
} from "@/domain/geometry";
import type {PlannerDraft, PlannerSourceMode} from "./draft";

export interface PlannerSheetStock {
  readonly lengthMm: number;
  readonly widthMm: number;
}

export interface PlannerFlatSheetBuildPlan {
  readonly kind: "CUT_AND_FOLD";
  readonly workflow: "CUT";
  readonly sourceMode: "FLAT_SHEET";
  readonly requiresCutting: true;
  readonly orientation: Orientation;
  readonly packedEnvelope: PackedEnvelope;
  readonly plan: WrapPlan;
  readonly enteredStock: PlannerSheetStock;
  readonly fitsSheet: ReturnType<typeof assessSheetFit>;
  /** Advisory only. The persisted planner draft remains untouched. */
  readonly autoFitSheet: ReturnType<typeof deriveAutoFitSheet>;
}

export interface PlannerAssemblyBuildPlan {
  readonly kind: "ASSEMBLY";
  readonly workflow: "ASSEMBLY";
  readonly sourceMode: Exclude<PlannerSourceMode, "FLAT_SHEET">;
  readonly requiresCutting: false;
  readonly reasonCode: "SOURCE_IS_ASSEMBLED_BOX";
}

export interface PlannerBuildPlanError {
  readonly kind: "ERROR";
  readonly workflow: "CUT";
  readonly sourceMode: "FLAT_SHEET";
  readonly requiresCutting: false;
  readonly code: "FLAT_SHEET_GENERATION_FAILED";
  readonly message: string;
  readonly enteredStock: PlannerSheetStock;
}

export type PlannerBuildPlan =
  | PlannerFlatSheetBuildPlan
  | PlannerAssemblyBuildPlan
  | PlannerBuildPlanError;

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>))
    deepFreeze(child);
  return value;
}

function clonePlainData<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.map((child) => clonePlainData(child)) as T;
  const clone: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>))
    clone[key] = clonePlainData(child);
  return clone as T;
}

function immutableResult<T>(value: T): T {
  return deepFreeze(clonePlainData(value));
}

/**
 * Routes canonical planner inputs without writing back auto-fit advice or
 * generated geometry. Existing/Common sources deliberately bypass dielines.
 */
export function derivePlannerBuildPlan(draft: PlannerDraft): PlannerBuildPlan {
  if (draft.source.mode !== "FLAT_SHEET")
    return immutableResult({
      kind: "ASSEMBLY",
      workflow: "ASSEMBLY",
      sourceMode: draft.source.mode,
      requiresCutting: false,
      reasonCode: "SOURCE_IS_ASSEMBLED_BOX",
    });

  const enteredStock = {
    lengthMm: draft.source.sheet.lengthMm,
    widthMm: draft.source.sheet.widthMm,
  };
  try {
    const orientation = chooseWrapOrientation(
      draft.item,
      enteredStock,
      draft.source.pattern,
    );
    const envelope = packedEnvelope(draft.item, orientation);
    const generated = generatePatternPlan(
      envelope,
      draft.source.pattern,
    );
    if ("error" in generated)
      return immutableResult({
        kind: "ERROR",
        workflow: "CUT",
        sourceMode: "FLAT_SHEET",
        requiresCutting: false,
        code: "FLAT_SHEET_GENERATION_FAILED",
        message: generated.error,
        enteredStock,
      });
    return immutableResult({
      kind: "CUT_AND_FOLD",
      workflow: "CUT",
      sourceMode: "FLAT_SHEET",
      requiresCutting: true,
      orientation,
      packedEnvelope: envelope,
      plan: generated,
      enteredStock,
      fitsSheet: assessSheetFit(generated, enteredStock),
      autoFitSheet: deriveAutoFitSheet(generated, enteredStock),
    });
  } catch {
    return immutableResult({
      kind: "ERROR",
      workflow: "CUT",
      sourceMode: "FLAT_SHEET",
      requiresCutting: false,
      code: "FLAT_SHEET_GENERATION_FAILED",
      message: "The flat-sheet construction plan could not be generated from these measurements.",
      enteredStock,
    });
  }
}
