import {resolveBoxMeasurement, type BoxMeasurement} from "./boxInventory";
import type {Dimensions3D} from "./geometry";
import {
  immutable,
  modificationError,
  RSC_DIMENSION_EPSILON_MM,
  type RscCondition,
  type RscDiagnostic,
  type RscJoint,
  type RscModificationError,
  type RscPlaybookStep,
} from "./rscModification";

export type BoxAxis = "lengthMm" | "widthMm" | "heightMm";
/** Entries map output length, width, and height (in that order) to source measurement axes. */
export type AxisPermutation = readonly [BoxAxis, BoxAxis, BoxAxis];
export type PartMeasurementState = "ORIGINAL_INTACT" | "MODIFIED_REMEASURED" | "MODIFIED_UNVERIFIED";
export type Fefco03DesignBasis = "FEFCO_03" | "ENGINEERED_EQUIVALENT";
export interface AxialPartMeasurement {
  readonly interfaceEndState: "FACTORY_OPEN" | "OPENED_REMEASURED" | "CLOSED" | "UNVERIFIED";
  readonly basis: "INSIDE" | "OUTSIDE";
  readonly depthMm: number;
  readonly closedEndWallCount: 0 | 1;
}

interface SourceMetadata {
  readonly condition: RscCondition;
  readonly joint: RscJoint;
  readonly sourceState: PartMeasurementState;
}

export type SourceMetadataSnapshot = Readonly<SourceMetadata>;
export type PartAuditSnapshot = SourceMetadataSnapshot & Readonly<{axialMeasurement: Readonly<AxialPartMeasurement>}>;

export interface TelescopePart extends SourceMetadata {
  readonly measurement: BoxMeasurement;
  readonly axialMeasurement: AxialPartMeasurement;
  readonly role: "BODY" | "LID";
  readonly styleReference: string;
  readonly designBasis: Fefco03DesignBasis;
}

export interface ConservativePartResolution {
  readonly internalDimensions: Readonly<Dimensions3D>;
  readonly outerDimensions: Readonly<Dimensions3D>;
  readonly boardThicknessMm: number;
  readonly uncertaintyMm: number;
}

export type TelescopeStepCode = "VERIFY_PARTS" | "MAP_AXES" | "CHECK_CROSS_CLEARANCE" | "MARK_OVERLAP" | "ASSEMBLE" | "REMEASURE_AND_TEST";

export interface Fefco03TelescopeInput {
  readonly body: TelescopePart;
  readonly lid: TelescopePart;
  readonly bodyAxisPermutation: AxisPermutation;
  readonly lidAxisPermutation: AxisPermutation;
  readonly targetAxis: BoxAxis;
  readonly targetInternal: Dimensions3D;
  readonly overlapMm: number;
  readonly minimumOverlapMm: number;
  readonly minimumClearancePerSideMm: number;
}

export interface Fefco03TelescopePlan {
  readonly id: "RSC_FEFCO_03_TELESCOPE_V1";
  readonly status: "PROTOTYPE_ONLY";
  readonly body: ConservativePartResolution;
  readonly lid: ConservativePartResolution;
  readonly targetAxis: BoxAxis;
  readonly crossAxes: readonly [BoxAxis, BoxAxis];
  readonly bodyAxisPermutation: AxisPermutation;
  readonly lidAxisPermutation: AxisPermutation;
  readonly styleReferences: Readonly<{body: string; lid: string}>;
  readonly designBasis: Readonly<{body: Fefco03DesignBasis; lid: Fefco03DesignBasis}>;
  readonly sourceMetadata: Readonly<{body: PartAuditSnapshot; lid: PartAuditSnapshot}>;
  readonly targetInternal: Readonly<Dimensions3D>;
  readonly finalInternal: Readonly<Dimensions3D>;
  readonly overlapMm: number;
  readonly minimumOverlapMm: number;
  readonly clearancePerSideMm: readonly [number, number];
  readonly minimumClearancePerSideMm: number;
  readonly playbook: readonly RscPlaybookStep<TelescopeStepCode>[];
  readonly diagnostics: readonly RscDiagnostic[];
  readonly warnings: readonly string[];
}

const TELESCOPE_PLAYBOOK: readonly RscPlaybookStep<TelescopeStepCode>[] = immutable([
  {order: 1, code: "VERIFY_PARTS", instruction: "Verify the purpose-built FEFCO-03 body and lid references, condition, joints, wall thicknesses, and measurements."},
  {order: 2, code: "MAP_AXES", instruction: "Map each measured part axis to the declared target and cross axes before checking fit or marking overlap."},
  {order: 3, code: "CHECK_CROSS_CLEARANCE", instruction: "Dry-fit the lid over the body and confirm the declared per-side clearance on both cross axes."},
  {order: 4, code: "MARK_OVERLAP", instruction: "Mark the measured overlap from the open edge along the target axis on both parts."},
  {order: 5, code: "ASSEMBLE", instruction: "Nest the lid over the body to the overlap mark without cutting or crushing either wall."},
  {order: 6, code: "REMEASURE_AND_TEST", instruction: "Remeasure all final inside dimensions, confirm overlap and clearance, then physically test the prototype before use."},
]);

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

function finiteNonnegative(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function validDimensions(dimensions: Dimensions3D) {
  return Object.values(dimensions).every(finitePositive);
}

function validPermutation(permutation: unknown): permutation is AxisPermutation {
  return Array.isArray(permutation)
    && permutation.length === 3
    && new Set(permutation).size === 3
    && permutation.every((axis) => axis === "lengthMm" || axis === "widthMm" || axis === "heightMm");
}

function validAxis(axis: BoxAxis) {
  return axis === "lengthMm" || axis === "widthMm" || axis === "heightMm";
}

function crossAxesFor(targetAxis: BoxAxis): [BoxAxis, BoxAxis] {
  return (["lengthMm", "widthMm", "heightMm"] as const).filter((axis) => axis !== targetAxis) as [BoxAxis, BoxAxis];
}

function orient(dimensions: Readonly<Dimensions3D>, permutation: AxisPermutation): Dimensions3D {
  return {lengthMm: dimensions[permutation[0]], widthMm: dimensions[permutation[1]], heightMm: dimensions[permutation[2]]};
}

function validateSource(source: SourceMetadata): RscModificationError | undefined {
  if (source.condition === "DAMAGED") return modificationError("DAMAGED_SOURCE", "Damaged cardboard cannot be used for this prototype.", "condition");
  if (source.condition !== "NEW" && source.condition !== "USED") {
    return modificationError("SOURCE_NOT_INTACT", "The source condition must be NEW or USED and physically verified.", "condition");
  }
  if (source.joint !== "ADHESIVE" && source.joint !== "TAPE" && source.joint !== "STAPLED") {
    return modificationError("UNSUPPORTED_JOINT_OR_CONDITION", "This prototype requires a verified adhesive, tape, or stapled manufacturer joint.", "joint");
  }
  if (source.sourceState !== "ORIGINAL_INTACT" && source.sourceState !== "MODIFIED_REMEASURED") {
    return modificationError("SOURCE_NOT_INTACT", "The source must be original and intact or modified and remeasured.", "sourceState");
  }
  return undefined;
}

function sourceMetadataSnapshot(source: SourceMetadata): SourceMetadataSnapshot {
  return {condition: source.condition, joint: source.joint, sourceState: source.sourceState};
}

function partAuditSnapshot(source: SourceMetadata & {readonly axialMeasurement: AxialPartMeasurement}): PartAuditSnapshot {
  return {...sourceMetadataSnapshot(source), axialMeasurement: {...source.axialMeasurement}};
}

function hasFefco03Reference(reference: string) {
  return /FEFCO[\s_-]*03(?:\d{2})?|(?:^|\D)03\d{2}(?:\D|$)/i.test(reference);
}

/** Resolve a box conservatively in both directions. Wall thickness is mandatory even for inside measurements. */
export function resolveConservativePart(measurement: BoxMeasurement): ConservativePartResolution | RscModificationError {
  if (measurement.basis === "NOT_SURE") {
    const unresolved = resolveBoxMeasurement(measurement);
    const message = unresolved.status === "RESOLVED" ? "Choose whether these are inside or outside measurements before checking fit." : unresolved.message;
    return modificationError("MEASUREMENT_REQUIRED", message, "measurement.basis");
  }
  if (measurement.boardThicknessMm === undefined) {
    return modificationError("BOARD_THICKNESS_REQUIRED", "Measure and enter the cardboard wall thickness for every part.", "boardThicknessMm");
  }
  const resolved = resolveBoxMeasurement(measurement);
  if (resolved.status === "MEASUREMENT_REQUIRED") return modificationError("MEASUREMENT_REQUIRED", resolved.message, "measurement");
  if (resolved.status === "INVALID") return modificationError("INVALID_MEASUREMENTS", resolved.message, "measurement");

  const uncertaintyMm = measurement.uncertaintyMm ?? 0;
  const wallAllowanceMm = 2 * (measurement.boardThicknessMm + uncertaintyMm);
  const outerDimensions = measurement.basis === "OUTSIDE"
    ? {...measurement.rawDimensions}
    : {
        lengthMm: resolved.internalDimensions.lengthMm + wallAllowanceMm,
        widthMm: resolved.internalDimensions.widthMm + wallAllowanceMm,
        heightMm: resolved.internalDimensions.heightMm + wallAllowanceMm,
      };
  return immutable({
    internalDimensions: {...resolved.internalDimensions},
    outerDimensions,
    boardThicknessMm: measurement.boardThicknessMm,
    uncertaintyMm,
  });
}

function resolveOrientedPart(measurement: BoxMeasurement, permutation: AxisPermutation) {
  if (!validPermutation(permutation)) return modificationError("INVALID_AXIS_PERMUTATION", "Axis mapping must use each of lengthMm, widthMm, and heightMm exactly once.", "axisPermutation");
  const resolved = resolveConservativePart(measurement);
  if ("status" in resolved) return resolved;
  return immutable({...resolved, internalDimensions: orient(resolved.internalDimensions, permutation), outerDimensions: orient(resolved.outerDimensions, permutation)});
}

function validateAxialMeasurement(
  axialMeasurement: AxialPartMeasurement | undefined,
  sourceState: PartMeasurementState,
  field: string,
): RscModificationError | undefined {
  if (!axialMeasurement || (axialMeasurement.basis !== "INSIDE" && axialMeasurement.basis !== "OUTSIDE") || !finitePositive(axialMeasurement.depthMm)) {
    return modificationError("AXIAL_MEASUREMENT_REQUIRED", "Enter a positive measured axial depth and declare whether it is an inside or outside depth.", field);
  }
  if (axialMeasurement.closedEndWallCount !== 0 && axialMeasurement.closedEndWallCount !== 1) {
    return modificationError("AXIAL_TOPOLOGY_UNSUPPORTED", "Axial conversion supports only zero or one measured closed-end wall.", `${field}.closedEndWallCount`);
  }
  if (axialMeasurement.interfaceEndState !== "FACTORY_OPEN" && axialMeasurement.interfaceEndState !== "OPENED_REMEASURED") {
    return modificationError("AXIAL_OPENING_REQUIRED", "The nesting interface must be factory-open or opened and remeasured.", `${field}.interfaceEndState`);
  }
  if (axialMeasurement.interfaceEndState === "OPENED_REMEASURED" && sourceState !== "MODIFIED_REMEASURED") {
    return modificationError("AXIAL_OPENING_REQUIRED", "A manually opened nesting end must use a MODIFIED_REMEASURED source state.", `${field}.interfaceEndState`);
  }
  return undefined;
}

function resolveAxiallyMeasuredPart(
  measurement: BoxMeasurement,
  permutation: AxisPermutation,
  targetAxis: BoxAxis,
  axialMeasurement: AxialPartMeasurement,
) {
  if (!validPermutation(permutation)) return modificationError("INVALID_AXIS_PERMUTATION", "Axis mapping must use each of lengthMm, widthMm, and heightMm exactly once.", "axisPermutation");
  if (measurement.basis === "NOT_SURE" || measurement.boardThicknessMm === undefined) return resolveConservativePart(measurement);

  const outputAxisIndex = (["lengthMm", "widthMm", "heightMm"] as const).indexOf(targetAxis);
  const sourceAxialAxis = permutation[outputAxisIndex];
  const syntheticAxialMm = measurement.basis === "OUTSIDE"
    ? 2 * (measurement.boardThicknessMm + (measurement.uncertaintyMm ?? 0)) + 1
    : 1;
  const crossOnlyMeasurement: BoxMeasurement = {
    ...measurement,
    rawDimensions: {...measurement.rawDimensions, [sourceAxialAxis]: syntheticAxialMm},
  };
  const resolved = resolveOrientedPart(crossOnlyMeasurement, permutation);
  if ("status" in resolved) return resolved;

  const wallAllowanceMm = axialMeasurement.closedEndWallCount * (measurement.boardThicknessMm + (measurement.uncertaintyMm ?? 0));
  const axialInternalMm = axialMeasurement.basis === "OUTSIDE" ? axialMeasurement.depthMm - wallAllowanceMm : axialMeasurement.depthMm;
  const axialOuterMm = axialMeasurement.basis === "OUTSIDE" ? axialMeasurement.depthMm : axialMeasurement.depthMm + wallAllowanceMm;
  if (!finitePositive(axialInternalMm) || !finitePositive(axialOuterMm)) {
    return modificationError("AXIAL_MEASUREMENT_REQUIRED", "The axial depth must remain positive after its declared closed-end wall allowance.", "axialMeasurement.depthMm");
  }
  return immutable({
    ...resolved,
    internalDimensions: {...resolved.internalDimensions, [targetAxis]: axialInternalMm},
    outerDimensions: {...resolved.outerDimensions, [targetAxis]: axialOuterMm},
  });
}

function resolveOrientedSleeve(
  measurement: BoxMeasurement,
  permutation: AxisPermutation,
  targetAxis: BoxAxis,
  axialLengthMm: number,
  usableAxialLengthMm: number,
) {
  if (!validPermutation(permutation)) return modificationError("INVALID_AXIS_PERMUTATION", "Axis mapping must use each of lengthMm, widthMm, and heightMm exactly once.", "sleeve.axisPermutation");
  if (measurement.basis === "NOT_SURE") return resolveConservativePart(measurement);
  if (measurement.boardThicknessMm === undefined) return resolveConservativePart(measurement);

  const outputAxisIndex = (["lengthMm", "widthMm", "heightMm"] as const).indexOf(targetAxis);
  const sourceAxialAxis = permutation[outputAxisIndex];
  const syntheticAxialMm = measurement.basis === "OUTSIDE"
    ? 2 * (measurement.boardThicknessMm + (measurement.uncertaintyMm ?? 0)) + 1
    : 1;
  const crossOnlyMeasurement: BoxMeasurement = {
    ...measurement,
    rawDimensions: {...measurement.rawDimensions, [sourceAxialAxis]: syntheticAxialMm},
  };
  const resolved = resolveOrientedPart(crossOnlyMeasurement, permutation);
  if ("status" in resolved) return resolved;
  return immutable({
    ...resolved,
    internalDimensions: {...resolved.internalDimensions, [targetAxis]: usableAxialLengthMm},
    outerDimensions: {...resolved.outerDimensions, [targetAxis]: axialLengthMm},
  });
}

function prototypeWarnings(label: string) {
  return [
    `PROTOTYPE_ONLY: ${label} must be verified on the actual measured cardboard parts.`,
    "This calculation does not certify retained strength, carrier acceptance, or manufacturing compliance.",
    "Remeasure the assembled inside dimensions, clearances, overlap, and joints, then perform a physical load and handling test before use.",
  ] as const;
}

export function calculateFefco03Telescope(input: Fefco03TelescopeInput): Fefco03TelescopePlan | RscModificationError {
  if (input.body.role !== "BODY" || input.lid.role !== "LID") return modificationError("PART_ROLE_MISMATCH", "Telescope assembly requires one BODY and one LID in their declared positions.");
  for (const [field, part] of [["body", input.body], ["lid", input.lid]] as const) {
    const hasSupportedBasis = part.designBasis === "FEFCO_03" || part.designBasis === "ENGINEERED_EQUIVALENT";
    const hasMatchingReference = part.styleReference.trim() && (part.designBasis !== "FEFCO_03" || hasFefco03Reference(part.styleReference));
    if (!hasSupportedBasis || !hasMatchingReference) {
      return modificationError("STYLE_REFERENCE_INVALID", "Each purpose-built part needs a nonempty style reference and a supported FEFCO-03 design basis.", `${field}.styleReference`);
    }
    const sourceError = validateSource(part);
    if (sourceError) return sourceError;
    const axialError = validateAxialMeasurement(part.axialMeasurement, part.sourceState, `${field}.axialMeasurement`);
    if (axialError) return axialError;
  }
  if (!validDimensions(input.targetInternal) || !finitePositive(input.overlapMm) || !finitePositive(input.minimumOverlapMm) || !finiteNonnegative(input.minimumClearancePerSideMm)) {
    return modificationError("INVALID_MEASUREMENTS", "Target dimensions, overlap, and clearance requirements must be finite; dimensions and overlaps must be positive.");
  }
  if (!validAxis(input.targetAxis)) return modificationError("INVALID_TARGET_AXIS", "Choose one valid target axis for the telescope extension.", "targetAxis");
  if (input.overlapMm + RSC_DIMENSION_EPSILON_MM < input.minimumOverlapMm) return modificationError("INSUFFICIENT_OVERLAP", "The telescope overlap is below the declared minimum.", "overlapMm");

  const body = resolveAxiallyMeasuredPart(input.body.measurement, input.bodyAxisPermutation, input.targetAxis, input.body.axialMeasurement);
  if ("status" in body) return body;
  const lid = resolveAxiallyMeasuredPart(input.lid.measurement, input.lidAxisPermutation, input.targetAxis, input.lid.axialMeasurement);
  if ("status" in lid) return lid;
  const crossAxes = crossAxesFor(input.targetAxis);
  const shorterAxialDepthMm = Math.min(body.internalDimensions[input.targetAxis], lid.internalDimensions[input.targetAxis]);
  if (input.overlapMm >= shorterAxialDepthMm - RSC_DIMENSION_EPSILON_MM) {
    return modificationError("INVALID_OVERLAP", "Overlap must be strictly shorter than both parts' available inside target-axis depths.", "overlapMm");
  }
  const clearancePerSideMm: readonly [number, number] = [
    (lid.internalDimensions[crossAxes[0]] - body.outerDimensions[crossAxes[0]]) / 2,
    (lid.internalDimensions[crossAxes[1]] - body.outerDimensions[crossAxes[1]]) / 2,
  ] as const;
  if (clearancePerSideMm.some((value) => value < -RSC_DIMENSION_EPSILON_MM)) return modificationError("CROSS_AXIS_INTERFERENCE", "The lid opening does not fit around the body on both cross axes.");
  if (clearancePerSideMm.some((value) => value + RSC_DIMENSION_EPSILON_MM < input.minimumClearancePerSideMm)) return modificationError("CLEARANCE_TOO_SMALL", "The lid-to-body per-side clearance is below the declared minimum.");

  const finalInternal: Dimensions3D = {
    lengthMm: Math.min(body.internalDimensions.lengthMm, lid.internalDimensions.lengthMm),
    widthMm: Math.min(body.internalDimensions.widthMm, lid.internalDimensions.widthMm),
    heightMm: Math.min(body.internalDimensions.heightMm, lid.internalDimensions.heightMm),
  };
  finalInternal[input.targetAxis] = body.internalDimensions[input.targetAxis] + lid.internalDimensions[input.targetAxis] - input.overlapMm;
  if (finalInternal[input.targetAxis] <= Math.max(body.internalDimensions[input.targetAxis], lid.internalDimensions[input.targetAxis]) + RSC_DIMENSION_EPSILON_MM) {
    return modificationError("TARGET_NOT_EXTENDED", "The assembled target axis must be longer than either individual part.", "overlapMm");
  }
  if (Object.keys(finalInternal).some((key) => finalInternal[key as BoxAxis] + RSC_DIMENSION_EPSILON_MM < input.targetInternal[key as BoxAxis])) {
    return modificationError("TARGET_DOES_NOT_FIT", "The conservative final inside dimensions do not contain the requested target.", "targetInternal");
  }
  const warnings = prototypeWarnings("This telescope assembly");
  return immutable({
    id: "RSC_FEFCO_03_TELESCOPE_V1" as const,
    status: "PROTOTYPE_ONLY" as const,
    body,
    lid,
    targetAxis: input.targetAxis,
    crossAxes,
    bodyAxisPermutation: [...input.bodyAxisPermutation],
    lidAxisPermutation: [...input.lidAxisPermutation],
    styleReferences: {body: input.body.styleReference, lid: input.lid.styleReference},
    designBasis: {body: input.body.designBasis, lid: input.lid.designBasis},
    sourceMetadata: {body: partAuditSnapshot(input.body), lid: partAuditSnapshot(input.lid)},
    targetInternal: {...input.targetInternal},
    finalInternal,
    overlapMm: input.overlapMm,
    minimumOverlapMm: input.minimumOverlapMm,
    clearancePerSideMm,
    minimumClearancePerSideMm: input.minimumClearancePerSideMm,
    playbook: TELESCOPE_PLAYBOOK,
    diagnostics: [{code: "PROTOTYPE_ONLY", severity: "WARNING", message: warnings[0]}],
    warnings,
  });
}

export interface SplicePart extends SourceMetadata {
  readonly measurement: BoxMeasurement;
  readonly role: "PART_A" | "PART_B";
  readonly axialMeasurement: AxialPartMeasurement;
}

export type SpliceSourceMetadataSnapshot = PartAuditSnapshot;

export type RscSpliceArrangement = "PART_A_INTO_PART_B" | "OPEN_SLEEVE_AROUND_PARTS" | "SIDE_BY_SIDE" | "TAPE_ONLY";

interface RscSpliceBase {
  readonly partA: SplicePart;
  readonly partB: SplicePart;
  readonly partAAxisPermutation: AxisPermutation;
  readonly partBAxisPermutation: AxisPermutation;
  readonly targetAxis: BoxAxis;
  readonly targetInternal: Dimensions3D;
}

export interface InternalNestingSpliceInput extends RscSpliceBase {
  readonly mode: "INTERNAL_NESTING";
  readonly arrangement: "PART_A_INTO_PART_B" | "SIDE_BY_SIDE" | "TAPE_ONLY";
  readonly overlapMm: number;
  readonly minimumOverlapMm: number;
  readonly minimumClearancePerSideMm: number;
}

export interface OpenSleeveContract extends SourceMetadata {
  readonly form: "OPEN";
  /** Only the two cross axes are consumed after applying axisPermutation; its target-axis dimension is ignored. */
  readonly crossMeasurement: BoxMeasurement;
  readonly axisPermutation: AxisPermutation;
  /** Direct physical length along the splice axis. No wall deduction is applied to this value. */
  readonly axialLengthMm: number;
  readonly axialLengthUncertaintyMm?: number;
}

export interface ExternalSleeveSpliceInput extends RscSpliceBase {
  readonly mode: "EXTERNAL_SLEEVE";
  readonly arrangement: "OPEN_SLEEVE_AROUND_PARTS" | "SIDE_BY_SIDE" | "TAPE_ONLY";
  readonly sleeve: OpenSleeveContract;
  readonly coverageAMm: number;
  readonly coverageBMm: number;
  readonly seamIntrusionMm: number;
  readonly minimumCoverageMm: number;
  readonly minimumClearancePerSideMm: number;
}

export type RscSpliceInput = InternalNestingSpliceInput | ExternalSleeveSpliceInput;
export type RscSpliceStepCode = "VERIFY_PARTS" | "MAP_AXES" | "CHECK_INTERFACE" | "MARK_COVERAGE" | "ASSEMBLE" | "REMEASURE_AND_TEST";

export interface RscSplicePlan {
  readonly id: "RSC_SPLICE_V1";
  readonly status: "PROTOTYPE_ONLY";
  readonly mode: RscSpliceInput["mode"];
  readonly arrangement: RscSpliceArrangement;
  readonly targetAxis: BoxAxis;
  readonly crossAxes: readonly [BoxAxis, BoxAxis];
  readonly partAAxisPermutation: AxisPermutation;
  readonly partBAxisPermutation: AxisPermutation;
  readonly sleeveAxisPermutation?: AxisPermutation;
  readonly sourceMetadata: Readonly<{
    partA: SpliceSourceMetadataSnapshot;
    partB: SpliceSourceMetadataSnapshot;
    sleeve?: SourceMetadataSnapshot;
  }>;
  readonly partA: ConservativePartResolution;
  readonly partB: ConservativePartResolution;
  readonly sleeve?: ConservativePartResolution & {readonly axialLengthMm: number; readonly axialLengthUncertaintyMm: number; readonly usableAxialLengthMm: number};
  readonly targetInternal: Readonly<Dimensions3D>;
  readonly finalInternal: Readonly<Dimensions3D>;
  readonly clearancePerSideMm: readonly [number, number];
  readonly overlapMm?: number;
  readonly minimumOverlapMm?: number;
  readonly coverageAMm?: number;
  readonly coverageBMm?: number;
  readonly minimumCoverageMm?: number;
  readonly seamIntrusionMm?: number;
  readonly minimumClearancePerSideMm: number;
  readonly playbook: readonly RscPlaybookStep<RscSpliceStepCode>[];
  readonly diagnostics: readonly RscDiagnostic[];
  readonly warnings: readonly string[];
}

const SPLICE_PLAYBOOK: readonly RscPlaybookStep<RscSpliceStepCode>[] = immutable([
  {order: 1, code: "VERIFY_PARTS", instruction: "Verify all declared parts are intact or remeasured, undamaged, and use supported manufacturer joints."},
  {order: 2, code: "MAP_AXES", instruction: "Map each measured part and sleeve axis to the declared target and cross axes before checking the interface."},
  {order: 3, code: "CHECK_INTERFACE", instruction: "Dry-fit the declared nesting or open-sleeve interface and confirm both conservative cross-axis clearances."},
  {order: 4, code: "MARK_COVERAGE", instruction: "Mark the calculated overlap or each sleeve coverage from the relevant open edge."},
  {order: 5, code: "ASSEMBLE", instruction: "Align and join only in the declared nesting or external-sleeve arrangement; do not substitute a side-by-side or tape-only join."},
  {order: 6, code: "REMEASURE_AND_TEST", instruction: "Remeasure final inside dimensions, coverage, clearance, and seam position, then physically test the prototype before use."},
]);

function validateSpliceParts(input: RscSpliceInput): RscModificationError | undefined {
  if (input.partA.role !== "PART_A" || input.partB.role !== "PART_B") return modificationError("PART_ROLE_MISMATCH", "Splice assembly requires PART_A and PART_B in their declared positions.");
  const sourceError = validateSource(input.partA) ?? validateSource(input.partB);
  if (sourceError) return sourceError;
  for (const [field, part] of [["partA", input.partA], ["partB", input.partB]] as const) {
    const axialError = validateAxialMeasurement(part.axialMeasurement, part.sourceState, `${field}.axialMeasurement`);
    if (axialError) return axialError;
  }
  return undefined;
}

function spliceSourceMetadataSnapshot(source: SplicePart): SpliceSourceMetadataSnapshot {
  return partAuditSnapshot(source);
}

function validateArrangement(input: RscSpliceInput): RscModificationError | undefined {
  if (input.arrangement === "SIDE_BY_SIDE") return modificationError("SIDE_BY_SIDE_JOIN_UNSUPPORTED", "A side-by-side assembly is not a supported splice geometry.", "arrangement");
  if (input.arrangement === "TAPE_ONLY") return modificationError("TAPE_ONLY_JOIN_UNSUPPORTED", "Tape alone is not a supported splice arrangement.", "arrangement");
  if (input.mode === "INTERNAL_NESTING" && input.arrangement !== "PART_A_INTO_PART_B") return modificationError("UNSUPPORTED_SPLICE_GEOMETRY", "Internal nesting requires the PART_A_INTO_PART_B arrangement.", "arrangement");
  if (input.mode === "EXTERNAL_SLEEVE" && input.arrangement !== "OPEN_SLEEVE_AROUND_PARTS") return modificationError("UNSUPPORTED_SPLICE_GEOMETRY", "External sleeve mode requires the OPEN_SLEEVE_AROUND_PARTS arrangement.", "arrangement");
  return undefined;
}

export function calculateRscSplice(input: RscSpliceInput): RscSplicePlan | RscModificationError {
  if (input.mode !== "INTERNAL_NESTING" && input.mode !== "EXTERNAL_SLEEVE") return modificationError("UNSUPPORTED_SPLICE_GEOMETRY", "Choose internal nesting or external sleeve splice geometry.", "mode");
  const arrangementError = validateArrangement(input);
  if (arrangementError) return arrangementError;
  const sourceError = validateSpliceParts(input);
  if (sourceError) return sourceError;
  const minimumInterfaceMm = input.mode === "INTERNAL_NESTING" ? input.minimumOverlapMm : input.minimumCoverageMm;
  if (!validDimensions(input.targetInternal) || !finitePositive(minimumInterfaceMm) || !finiteNonnegative(input.minimumClearancePerSideMm)) {
    return modificationError("INVALID_MEASUREMENTS", "Splice target dimensions, minimum overlap or coverage, and clearance must be finite and valid.");
  }
  if (!validAxis(input.targetAxis)) return modificationError("INVALID_TARGET_AXIS", "Choose one valid target axis for the splice extension.", "targetAxis");
  const partA = resolveAxiallyMeasuredPart(input.partA.measurement, input.partAAxisPermutation, input.targetAxis, input.partA.axialMeasurement);
  if ("status" in partA) return partA;
  const partB = resolveAxiallyMeasuredPart(input.partB.measurement, input.partBAxisPermutation, input.targetAxis, input.partB.axialMeasurement);
  if ("status" in partB) return partB;
  const crossAxes = crossAxesFor(input.targetAxis);

  let finalInternal: Dimensions3D;
  let clearancePerSideMm: readonly [number, number];
  let sleeveOutput: RscSplicePlan["sleeve"];
  if (input.mode === "INTERNAL_NESTING") {
    if (!finitePositive(input.overlapMm)) return modificationError("INVALID_OVERLAP", "Internal nesting overlap must be a positive finite measurement.", "overlapMm");
    if (input.overlapMm + RSC_DIMENSION_EPSILON_MM < input.minimumOverlapMm) return modificationError("INSUFFICIENT_OVERLAP", "Internal nesting overlap is below the declared minimum.", "overlapMm");
    if (input.overlapMm >= Math.min(partA.internalDimensions[input.targetAxis], partB.internalDimensions[input.targetAxis]) - RSC_DIMENSION_EPSILON_MM) return modificationError("INVALID_OVERLAP", "Overlap must be strictly shorter than both parts' mapped axial depths.", "overlapMm");
    clearancePerSideMm = [
      (partB.internalDimensions[crossAxes[0]] - partA.outerDimensions[crossAxes[0]]) / 2,
      (partB.internalDimensions[crossAxes[1]] - partA.outerDimensions[crossAxes[1]]) / 2,
    ];
    finalInternal = {
      lengthMm: Math.min(partA.internalDimensions.lengthMm, partB.internalDimensions.lengthMm),
      widthMm: Math.min(partA.internalDimensions.widthMm, partB.internalDimensions.widthMm),
      heightMm: Math.min(partA.internalDimensions.heightMm, partB.internalDimensions.heightMm),
    };
    finalInternal[input.targetAxis] = partA.internalDimensions[input.targetAxis] + partB.internalDimensions[input.targetAxis] - input.overlapMm;
  } else {
    if (!input.sleeve) return modificationError("SLEEVE_REQUIRED", "External sleeve splicing requires a third measured OPEN sleeve.", "sleeve");
    if (input.sleeve.form !== "OPEN") return modificationError("SLEEVE_FORM_UNSUPPORTED", "External sleeve splicing requires an OPEN sleeve contract.", "sleeve.form");
    const sleeveError = validateSource(input.sleeve);
    if (sleeveError) return sleeveError;
    const axialLengthUncertaintyMm = input.sleeve.axialLengthUncertaintyMm ?? 0;
    if (!finitePositive(input.sleeve.axialLengthMm) || !finiteNonnegative(axialLengthUncertaintyMm) || !finitePositive(input.coverageAMm) || !finitePositive(input.coverageBMm) || !finiteNonnegative(input.seamIntrusionMm)) {
      return modificationError("INVALID_MEASUREMENTS", "Sleeve axial length and coverages must be positive; seam intrusion must be nonnegative.");
    }
    if (input.coverageAMm + RSC_DIMENSION_EPSILON_MM < input.minimumCoverageMm || input.coverageBMm + RSC_DIMENSION_EPSILON_MM < input.minimumCoverageMm) {
      return modificationError("INSUFFICIENT_COVERAGE", "Each part must meet the declared minimum sleeve coverage.");
    }
    if (input.coverageAMm > partA.internalDimensions[input.targetAxis] + RSC_DIMENSION_EPSILON_MM || input.coverageBMm > partB.internalDimensions[input.targetAxis] + RSC_DIMENSION_EPSILON_MM) {
      return modificationError("INSUFFICIENT_COVERAGE", "Sleeve coverage cannot exceed the corresponding part's mapped axial depth.");
    }
    const usableAxialLengthMm = input.sleeve.axialLengthMm - axialLengthUncertaintyMm;
    if (!finitePositive(usableAxialLengthMm) || usableAxialLengthMm + RSC_DIMENSION_EPSILON_MM < input.coverageAMm + input.coverageBMm) {
      return modificationError("INSUFFICIENT_SLEEVE_LENGTH", "The sleeve's direct axial length is shorter than the two required coverages.", "sleeve.axialLengthMm");
    }
    if (input.seamIntrusionMm >= Math.min(partA.internalDimensions[input.targetAxis], partB.internalDimensions[input.targetAxis]) - RSC_DIMENSION_EPSILON_MM) {
      return modificationError("INVALID_SEAM_INTRUSION", "Seam intrusion must be smaller than each part's inside target-axis length.", "seamIntrusionMm");
    }
    const sleeve = resolveOrientedSleeve(
      input.sleeve.crossMeasurement,
      input.sleeve.axisPermutation,
      input.targetAxis,
      input.sleeve.axialLengthMm,
      usableAxialLengthMm,
    );
    if ("status" in sleeve) return sleeve;
    sleeveOutput = immutable({...sleeve, axialLengthMm: input.sleeve.axialLengthMm, axialLengthUncertaintyMm, usableAxialLengthMm});
    clearancePerSideMm = [
      (sleeve.internalDimensions[crossAxes[0]] - Math.max(partA.outerDimensions[crossAxes[0]], partB.outerDimensions[crossAxes[0]])) / 2,
      (sleeve.internalDimensions[crossAxes[1]] - Math.max(partA.outerDimensions[crossAxes[1]], partB.outerDimensions[crossAxes[1]])) / 2,
    ];
    finalInternal = {
      lengthMm: Math.min(partA.internalDimensions.lengthMm, partB.internalDimensions.lengthMm),
      widthMm: Math.min(partA.internalDimensions.widthMm, partB.internalDimensions.widthMm),
      heightMm: Math.min(partA.internalDimensions.heightMm, partB.internalDimensions.heightMm),
    };
    finalInternal[input.targetAxis] = partA.internalDimensions[input.targetAxis] + partB.internalDimensions[input.targetAxis] - input.seamIntrusionMm;
  }

  if (clearancePerSideMm.some((value) => value < -RSC_DIMENSION_EPSILON_MM)) return modificationError("CROSS_AXIS_INTERFERENCE", "The nesting receiver or sleeve does not open around the required outer cross section.");
  if (clearancePerSideMm.some((value) => value + RSC_DIMENSION_EPSILON_MM < input.minimumClearancePerSideMm)) return modificationError("CLEARANCE_TOO_SMALL", "The splice per-side cross-axis clearance is below the declared minimum.");
  if (finalInternal[input.targetAxis] <= Math.max(partA.internalDimensions[input.targetAxis], partB.internalDimensions[input.targetAxis]) + RSC_DIMENSION_EPSILON_MM) return modificationError("TARGET_NOT_EXTENDED", "The splice target axis must be longer than either individual part.");
  if (Object.keys(finalInternal).some((key) => finalInternal[key as BoxAxis] + RSC_DIMENSION_EPSILON_MM < input.targetInternal[key as BoxAxis])) return modificationError("TARGET_DOES_NOT_FIT", "The conservative final splice dimensions do not contain the requested target.", "targetInternal");

  const warnings = prototypeWarnings("This RSC splice");
  return immutable({
    id: "RSC_SPLICE_V1" as const,
    status: "PROTOTYPE_ONLY" as const,
    mode: input.mode,
    arrangement: input.arrangement,
    targetAxis: input.targetAxis,
    crossAxes,
    partAAxisPermutation: [...input.partAAxisPermutation],
    partBAxisPermutation: [...input.partBAxisPermutation],
    ...(input.mode === "EXTERNAL_SLEEVE" ? {sleeveAxisPermutation: [...input.sleeve.axisPermutation]} : {}),
    sourceMetadata: {
      partA: spliceSourceMetadataSnapshot(input.partA),
      partB: spliceSourceMetadataSnapshot(input.partB),
      ...(input.mode === "EXTERNAL_SLEEVE" ? {sleeve: sourceMetadataSnapshot(input.sleeve)} : {}),
    },
    partA,
    partB,
    ...(sleeveOutput ? {sleeve: sleeveOutput} : {}),
    targetInternal: {...input.targetInternal},
    finalInternal,
    clearancePerSideMm,
    minimumClearancePerSideMm: input.minimumClearancePerSideMm,
    ...(input.mode === "INTERNAL_NESTING"
      ? {overlapMm: input.overlapMm, minimumOverlapMm: input.minimumOverlapMm}
      : {coverageAMm: input.coverageAMm, coverageBMm: input.coverageBMm, minimumCoverageMm: input.minimumCoverageMm, seamIntrusionMm: input.seamIntrusionMm}),
    playbook: SPLICE_PLAYBOOK,
    diagnostics: [{code: "PROTOTYPE_ONLY", severity: "WARNING", message: warnings[0]}],
    warnings,
  });
}
