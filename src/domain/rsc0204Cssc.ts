import type {Dimensions3D} from "./geometry";
import {
  immutable,
  RSC_DIMENSION_EPSILON_MM,
  type RscCondition,
  type RscDiagnostic,
  type RscDiagnosticCode,
  type RscFluteDirection,
  type RscJoint,
  type RscPlaybookStep,
  type RscScalarOperation,
  type RscSourceForm,
} from "./rscModification";

export type Rsc0204EndStyle = "FEFCO_0204" | "FEFCO_0215";
export type Rsc0204PanelLayout = "L_W_L_W_JOINT";
export type Rsc0204StyleIdentity = `${Rsc0204EndStyle}/${Rsc0204EndStyle}`;
export type Rsc0204End = "TOP" | "BOTTOM";
export type Rsc0204PanelAttachment = "LENGTH_PANEL" | "WIDTH_PANEL";
export type Rsc0204FlapFamily = "W_HALF" | "L_HALF";
export type Rsc0204FlapChannel =
  | "TOP_LENGTH_PANEL_FLAPS"
  | "TOP_WIDTH_PANEL_FLAPS"
  | "BOTTOM_LENGTH_PANEL_FLAPS"
  | "BOTTOM_WIDTH_PANEL_FLAPS";
export type Rsc0204ReliefBoundary = "L1_TO_W1" | "W1_TO_L2" | "L2_TO_W2" | "W2_TO_JOINT";
export type Rsc0204ReliefId = `${Rsc0204End}_${Rsc0204ReliefBoundary}`;

export interface Rsc0204CsscInput {
  originalInternal: Dimensions3D;
  targetInternal: Dimensions3D;
  topStyle: Rsc0204EndStyle;
  bottomStyle: Rsc0204EndStyle;
  panelLayout: Rsc0204PanelLayout;
  sourceForm: RscSourceForm;
  usableBlankWidthMm: number;
  usableBlankHeightMm: number;
  jointWidthMm: number;
  joint: RscJoint;
  boardThicknessMm: number;
  additionalCreaseAllowanceMm: Dimensions3D;
  topLengthPanelFlapDepthMm: number;
  topWidthPanelFlapDepthMm: number;
  bottomLengthPanelFlapDepthMm: number;
  bottomWidthPanelFlapDepthMm: number;
  minimumClosureOverlapMm: number;
  maximumClosureOverlapMm: number;
  slotWidthMm: number;
  edgeClearanceMm: number;
  fluteDirection: RscFluteDirection;
  condition: RscCondition;
}

export type Rsc0204CsscStepCode =
  | "VERIFY_STYLE_COMBINATION"
  | "OPEN_AND_FLATTEN"
  | "MEASURE_BLANK_AND_FLAPS"
  | "MARK_PANEL_SCORES"
  | "MARK_FOUR_FLAP_CHANNELS"
  | "CUT_FLAP_CONTOURS"
  | "CUT_NAMED_RELIEFS"
  | "TRIM_SCRAP"
  | "SCORE"
  | "REJOIN_MANUFACTURER_SEAM"
  | "DRY_FOLD"
  | "VERIFY_FOUR_CLOSURES"
  | "SEAL_ENDS"
  | "REMEASURE";

export interface Rsc0204ClosureFact {
  readonly id: Rsc0204FlapChannel;
  readonly end: Rsc0204End;
  readonly attachedToPanel: Rsc0204PanelAttachment;
  readonly nominalFamily: Rsc0204FlapFamily;
  readonly pairCount: 2;
  readonly measuredFlapDepthMm: number;
  readonly scoreCenterClosureSpanMm: number;
  readonly overlapMm: number;
  readonly minimumClosureOverlapMm: number;
  readonly maximumClosureOverlapMm: number;
  readonly passes: true;
}

export interface Rsc0204ClosureFacts {
  readonly topLengthPanel: Rsc0204ClosureFact;
  readonly topWidthPanel: Rsc0204ClosureFact;
  readonly bottomLengthPanel: Rsc0204ClosureFact;
  readonly bottomWidthPanel: Rsc0204ClosureFact;
}

export interface Rsc0204ReliefFact {
  readonly id: Rsc0204ReliefId;
  readonly end: Rsc0204End;
  readonly boundary: Rsc0204ReliefBoundary;
  readonly scorePositionMm: number;
  readonly slotWidthMm: number;
  readonly edgeClearanceMm: number;
  readonly leftFlapChannel: Rsc0204FlapChannel;
  readonly rightFlapChannel: Rsc0204FlapChannel | "MANUFACTURER_JOINT";
}

export interface Rsc0204CsscInvalid {
  readonly id: "RSC_FEFCO_0204_CSSC_V1";
  readonly status: "INVALID";
  readonly topStyle: string;
  readonly bottomStyle: string;
  readonly styleIdentity: string;
  readonly panelLayout: string;
  readonly error: string;
  readonly diagnostics: readonly RscDiagnostic[];
}

export interface Rsc0204CsscPlan {
  readonly id: "RSC_FEFCO_0204_CSSC_V1";
  readonly status: "PROTOTYPE_ONLY";
  readonly topStyle: "FEFCO_0204";
  readonly bottomStyle: "FEFCO_0204";
  readonly styleIdentity: "FEFCO_0204/FEFCO_0204";
  readonly panelLayout: "L_W_L_W_JOINT";
  readonly sourceForm: "ONE_PIECE_OPENED_BLANK";
  readonly fluteDirection: Exclude<RscFluteDirection, "UNKNOWN">;
  readonly originalInternal: Readonly<Dimensions3D>;
  readonly targetInternal: Readonly<Dimensions3D>;
  readonly finalInternal: Readonly<Dimensions3D>;
  readonly horizontalReductionsMm: Readonly<{lengthMm: number; widthMm: number}>;
  readonly affectedFlapChannels: readonly Rsc0204FlapChannel[];
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
  readonly topLengthPanelFlapDepthMm: number;
  readonly topWidthPanelFlapDepthMm: number;
  readonly bottomLengthPanelFlapDepthMm: number;
  readonly bottomWidthPanelFlapDepthMm: number;
  readonly topMaximumFlapDepthMm: number;
  readonly bottomMaximumFlapDepthMm: number;
  readonly closureFacts: Rsc0204ClosureFacts;
  readonly minimumClosureOverlapMm: number;
  readonly maximumClosureOverlapMm: number;
  readonly slotWidthMm: number;
  readonly edgeClearanceMm: number;
  readonly minimumReliefStockMm: number;
  readonly remainingBlankWidthMm: number;
  readonly remainingBlankHeightMm: number;
  readonly reliefFacts: readonly Rsc0204ReliefFact[];
  readonly scoreFacts: readonly RscScalarOperation[];
  readonly flapContourFacts: readonly RscScalarOperation[];
  readonly trimFacts: readonly RscScalarOperation[];
  readonly scrapFacts: readonly RscScalarOperation[];
  readonly marks: readonly RscScalarOperation[];
  readonly operations: readonly RscScalarOperation[];
  readonly playbook: readonly RscPlaybookStep<Rsc0204CsscStepCode>[];
  readonly diagnostics: readonly RscDiagnostic[];
  readonly warnings: readonly string[];
}

export type Rsc0204CsscResult = Rsc0204CsscPlan | Rsc0204CsscInvalid;

const CSSC_PLAYBOOK: readonly RscPlaybookStep<Rsc0204CsscStepCode>[] = [
  {order: 1, code: "VERIFY_STYLE_COMBINATION", instruction: "Verify both carton ends are explicitly identified as FEFCO 0204; do not substitute 0215 locking geometry."},
  {order: 2, code: "OPEN_AND_FLATTEN", instruction: "Open the accessible manufacturer seam and flatten the intact one-piece blank."},
  {order: 3, code: "MEASURE_BLANK_AND_FLAPS", instruction: "Measure usable blank stock and all four top/bottom, length-panel/width-panel flap-depth channels."},
  {order: 4, code: "MARK_PANEL_SCORES", instruction: "Mark the canonical L-W-L-W and joint score centers using the declared board thickness and per-axis allowances."},
  {order: 5, code: "MARK_FOUR_FLAP_CHANNELS", instruction: "Mark each measured W-half and L-half flap family independently at both carton ends."},
  {order: 6, code: "CUT_FLAP_CONTOURS", instruction: "Cut only the four measured paired flap contours; do not infer a flap over the manufacturer joint."},
  {order: 7, code: "CUT_NAMED_RELIEFS", instruction: "Cut each named top and bottom relief at its declared panel or joint boundary."},
  {order: 8, code: "TRIM_SCRAP", instruction: "Trim only the measured blank remainder beyond the generated perimeter and cross-span."},
  {order: 9, code: "SCORE", instruction: "Score the verified FEFCO Recommendation 101 prototype crease centers."},
  {order: 10, code: "REJOIN_MANUFACTURER_SEAM", instruction: "Rejoin the measured manufacturer seam with the declared adhesive or tape joint."},
  {order: 11, code: "DRY_FOLD", instruction: "Dry-fold the four distinct flap families without sealing."},
  {order: 12, code: "VERIFY_FOUR_CLOSURES", instruction: "Verify the top and bottom W-half and L-half flap-pair overlaps independently."},
  {order: 13, code: "SEAL_ENDS", instruction: "Seal the ends only after all four measured closure checks pass."},
  {order: 14, code: "REMEASURE", instruction: "Remeasure final inside dimensions, manufacturer seam, and all four end closures before use."},
];

const RELIEF_BOUNDARIES = [
  {boundary: "L1_TO_W1", scoreIndex: 1, leftAttachment: "LENGTH_PANEL", rightAttachment: "WIDTH_PANEL"},
  {boundary: "W1_TO_L2", scoreIndex: 2, leftAttachment: "WIDTH_PANEL", rightAttachment: "LENGTH_PANEL"},
  {boundary: "L2_TO_W2", scoreIndex: 3, leftAttachment: "LENGTH_PANEL", rightAttachment: "WIDTH_PANEL"},
  {boundary: "W2_TO_JOINT", scoreIndex: 4, leftAttachment: "WIDTH_PANEL", rightAttachment: "MANUFACTURER_JOINT"},
] as const;

const FLAP_MEASUREMENTS = [
  {field: "topLengthPanelFlapDepthMm", channel: "TOP_LENGTH_PANEL_FLAPS"},
  {field: "topWidthPanelFlapDepthMm", channel: "TOP_WIDTH_PANEL_FLAPS"},
  {field: "bottomLengthPanelFlapDepthMm", channel: "BOTTOM_LENGTH_PANEL_FLAPS"},
  {field: "bottomWidthPanelFlapDepthMm", channel: "BOTTOM_WIDTH_PANEL_FLAPS"},
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isEndStyle(value: unknown): value is Rsc0204EndStyle {
  return value === "FEFCO_0204" || value === "FEFCO_0215";
}

function knownFlute(direction: RscFluteDirection): direction is Exclude<RscFluteDirection, "UNKNOWN"> {
  return direction === "PARALLEL_TO_HEIGHT" || direction === "PARALLEL_TO_PERIMETER";
}

function allPositiveFinite(values: readonly number[]) {
  return values.every((value) => Number.isFinite(value) && value > 0);
}

function allNonnegativeFinite(values: readonly number[]) {
  return values.every((value) => Number.isFinite(value) && value >= 0);
}

function identityPart(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : "UNKNOWN";
}

function csscError(input: unknown, code: RscDiagnosticCode, message: string, field?: string): Rsc0204CsscInvalid {
  const candidate = isRecord(input) ? input : {};
  const topStyle = identityPart(candidate.topStyle);
  const bottomStyle = identityPart(candidate.bottomStyle);
  return immutable({
    id: "RSC_FEFCO_0204_CSSC_V1" as const,
    status: "INVALID" as const,
    topStyle,
    bottomStyle,
    styleIdentity: `${topStyle}/${bottomStyle}`,
    panelLayout: identityPart(candidate.panelLayout),
    error: message,
    diagnostics: [{code, severity: "ERROR" as const, message, ...(field ? {field} : {})}],
  });
}

function flapChannel(end: Rsc0204End, attachment: Rsc0204PanelAttachment): Rsc0204FlapChannel {
  return `${end}_${attachment}_FLAPS`;
}

function createClosureFact(
  id: Rsc0204FlapChannel,
  end: Rsc0204End,
  attachedToPanel: Rsc0204PanelAttachment,
  measuredFlapDepthMm: number,
  scoreCenterClosureSpanMm: number,
  minimumClosureOverlapMm: number,
  maximumClosureOverlapMm: number,
): Rsc0204ClosureFact {
  return {
    id,
    end,
    attachedToPanel,
    nominalFamily: attachedToPanel === "LENGTH_PANEL" ? "W_HALF" : "L_HALF",
    pairCount: 2,
    measuredFlapDepthMm,
    scoreCenterClosureSpanMm,
    overlapMm: 2 * measuredFlapDepthMm - scoreCenterClosureSpanMm,
    minimumClosureOverlapMm,
    maximumClosureOverlapMm,
    passes: true,
  };
}

function reliefFactsForEnd(
  end: Rsc0204End,
  panelScorePositionsMm: readonly [number, number, number, number, number, number],
  slotWidthMm: number,
  edgeClearanceMm: number,
): Rsc0204ReliefFact[] {
  return RELIEF_BOUNDARIES.map((definition) => ({
    id: `${end}_${definition.boundary}` as Rsc0204ReliefId,
    end,
    boundary: definition.boundary,
    scorePositionMm: panelScorePositionsMm[definition.scoreIndex],
    slotWidthMm,
    edgeClearanceMm,
    leftFlapChannel: flapChannel(end, definition.leftAttachment),
    rightFlapChannel: definition.rightAttachment === "MANUFACTURER_JOINT"
      ? "MANUFACTURER_JOINT"
      : flapChannel(end, definition.rightAttachment),
  }));
}

export function calculateRsc0204Cssc(input: Rsc0204CsscInput): Rsc0204CsscResult {
  if (!isRecord(input)) {
    return csscError(input, "INVALID_MEASUREMENTS", "FEFCO 0204/CSSC requires a complete measured input.");
  }
  if (!isEndStyle(input.topStyle)) {
    return csscError(input, "STYLE_UNKNOWN", "Declare the verified top-end FEFCO style.", "topStyle");
  }
  if (!isEndStyle(input.bottomStyle)) {
    return csscError(input, "STYLE_UNKNOWN", "Declare the verified bottom-end FEFCO style.", "bottomStyle");
  }
  if (input.topStyle !== "FEFCO_0204" || input.bottomStyle !== "FEFCO_0204") {
    return csscError(
      input,
      "END_STYLE_COMBINATION_UNSUPPORTED",
      `The explicit ${input.topStyle}/${input.bottomStyle} top/bottom combination is preserved but rejected because FEFCO 0215 locking and cut geometry is not represented by this 0204 generator.`,
      input.topStyle === "FEFCO_0215" ? "topStyle" : "bottomStyle",
    );
  }
  if (input.panelLayout !== "L_W_L_W_JOINT") {
    return csscError(input, "PANEL_LAYOUT_UNSUPPORTED", "Only the measured canonical L-W-L-W panel order followed by the manufacturer joint is supported.", "panelLayout");
  }
  if (input.sourceForm === "SIDE_BY_SIDE_JOIN") {
    return csscError(input, "SIDE_BY_SIDE_JOIN_UNSUPPORTED", "FEFCO 0204/CSSC generation does not support a side-by-side joined blank.", "sourceForm");
  }
  if (input.sourceForm !== "ONE_PIECE_OPENED_BLANK") {
    return csscError(input, "SOURCE_FORM_UNSUPPORTED", "FEFCO 0204/CSSC requires an intact opened one-piece blank.", "sourceForm");
  }
  if ((input.condition !== "NEW" && input.condition !== "USED") || (input.joint !== "ADHESIVE" && input.joint !== "TAPE")) {
    return csscError(input, "UNSUPPORTED_JOINT_OR_CONDITION", "FEFCO 0204/CSSC requires a non-damaged blank with an accessible adhesive or tape manufacturer joint.");
  }
  if (!knownFlute(input.fluteDirection)) {
    return csscError(input, "FLUTE_DIRECTION_UNKNOWN", "Measure and declare the blank's flute direction before generating the 0204 plan.", "fluteDirection");
  }
  if (!isRecord(input.additionalCreaseAllowanceMm)) {
    return csscError(input, "CREASE_ALLOWANCE_UNKNOWN", "Enter explicit nonnegative length, width, and height crease allowances.", "additionalCreaseAllowanceMm");
  }

  for (const measurement of FLAP_MEASUREMENTS) {
    if (input[measurement.field] === undefined || input[measurement.field] === null) {
      return csscError(input, "MEASUREMENT_REQUIRED", `Measure ${measurement.channel.toLowerCase().replaceAll("_", " ")} independently.`, measurement.field);
    }
    if (!Number.isFinite(input[measurement.field]) || input[measurement.field] <= 0) {
      return csscError(input, "INVALID_MEASUREMENTS", `${measurement.channel} must be a finite positive measured depth.`, measurement.field);
    }
  }
  for (const field of ["minimumClosureOverlapMm", "maximumClosureOverlapMm"] as const) {
    if (input[field] === undefined || input[field] === null) {
      return csscError(input, "MEASUREMENT_REQUIRED", "Enter both the minimum and maximum permitted closure overlap.", field);
    }
    if (!Number.isFinite(input[field]) || input[field] < 0) {
      return csscError(input, "INVALID_MEASUREMENTS", "Closure overlap bounds must be finite nonnegative measurements.", field);
    }
  }
  if (input.maximumClosureOverlapMm < input.minimumClosureOverlapMm) {
    return csscError(input, "INVALID_MEASUREMENTS", "Maximum closure overlap must be greater than or equal to the minimum.", "maximumClosureOverlapMm");
  }

  const original = input.originalInternal;
  const target = input.targetInternal;
  if (!isRecord(original) || !isRecord(target)) {
    return csscError(input, "INVALID_MEASUREMENTS", "Source and target inside dimensions are required and must be measured.");
  }
  if (!allPositiveFinite([
    original.lengthMm, original.widthMm, original.heightMm,
    target.lengthMm, target.widthMm, target.heightMm,
    input.usableBlankWidthMm, input.usableBlankHeightMm,
    input.jointWidthMm, input.boardThicknessMm,
    input.topLengthPanelFlapDepthMm, input.topWidthPanelFlapDepthMm,
    input.bottomLengthPanelFlapDepthMm, input.bottomWidthPanelFlapDepthMm,
    input.slotWidthMm, input.edgeClearanceMm,
  ]) || !allNonnegativeFinite([
    input.additionalCreaseAllowanceMm.lengthMm,
    input.additionalCreaseAllowanceMm.widthMm,
    input.additionalCreaseAllowanceMm.heightMm,
    input.minimumClosureOverlapMm,
    input.maximumClosureOverlapMm,
  ])) {
    return csscError(input, "INVALID_MEASUREMENTS", "FEFCO 0204/CSSC requires finite positive source, target, blank, flap, board, joint, and clearance measurements, plus nonnegative per-axis allowances.");
  }

  const rawLengthReductionMm = original.lengthMm - target.lengthMm;
  const rawWidthReductionMm = original.widthMm - target.widthMm;
  if (rawLengthReductionMm < -RSC_DIMENSION_EPSILON_MM || rawWidthReductionMm < -RSC_DIMENSION_EPSILON_MM) {
    return csscError(input, "TARGET_NOT_SMALLER", "FEFCO 0204/CSSC generation cannot enlarge either horizontal inside dimension.");
  }
  if (Math.abs(original.heightMm - target.heightMm) > RSC_DIMENSION_EPSILON_MM) {
    return csscError(input, "HEIGHT_CHANGE_UNSUPPORTED", "This FEFCO 0204/CSSC contract keeps the original box height unchanged.", "targetInternal.heightMm");
  }
  const lengthReductionMm = rawLengthReductionMm > RSC_DIMENSION_EPSILON_MM ? rawLengthReductionMm : 0;
  const widthReductionMm = rawWidthReductionMm > RSC_DIMENSION_EPSILON_MM ? rawWidthReductionMm : 0;
  if (lengthReductionMm === 0 && widthReductionMm === 0) {
    return csscError(input, "TARGET_NOT_SMALLER", "FEFCO 0204/CSSC generation requires a smaller target length or width.");
  }

  const finalInternal: Dimensions3D = {
    lengthMm: lengthReductionMm > 0 ? target.lengthMm : original.lengthMm,
    widthMm: widthReductionMm > 0 ? target.widthMm : original.widthMm,
    heightMm: original.heightMm,
  };
  const scoreCenterSpansMm: Dimensions3D = {
    lengthMm: finalInternal.lengthMm + input.boardThicknessMm + input.additionalCreaseAllowanceMm.lengthMm,
    widthMm: finalInternal.widthMm + input.boardThicknessMm + input.additionalCreaseAllowanceMm.widthMm,
    heightMm: finalInternal.heightMm + 2 * input.boardThicknessMm + input.additionalCreaseAllowanceMm.heightMm,
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
    2 * (lengthSpanMm + widthSpanMm) + input.jointWidthMm,
  ];
  const perimeterSpanMm = panelScorePositionsMm[5];
  const topMaximumFlapDepthMm = Math.max(input.topLengthPanelFlapDepthMm, input.topWidthPanelFlapDepthMm);
  const bottomMaximumFlapDepthMm = Math.max(input.bottomLengthPanelFlapDepthMm, input.bottomWidthPanelFlapDepthMm);
  const wallBandScorePositionsMm: [number, number] = [topMaximumFlapDepthMm, topMaximumFlapDepthMm + heightSpanMm];
  const crossSpanMm = topMaximumFlapDepthMm + heightSpanMm + bottomMaximumFlapDepthMm;

  const closureEntries = [
    {field: "topLengthPanelFlapDepthMm", fact: createClosureFact("TOP_LENGTH_PANEL_FLAPS", "TOP", "LENGTH_PANEL", input.topLengthPanelFlapDepthMm, widthSpanMm, input.minimumClosureOverlapMm, input.maximumClosureOverlapMm)},
    {field: "topWidthPanelFlapDepthMm", fact: createClosureFact("TOP_WIDTH_PANEL_FLAPS", "TOP", "WIDTH_PANEL", input.topWidthPanelFlapDepthMm, lengthSpanMm, input.minimumClosureOverlapMm, input.maximumClosureOverlapMm)},
    {field: "bottomLengthPanelFlapDepthMm", fact: createClosureFact("BOTTOM_LENGTH_PANEL_FLAPS", "BOTTOM", "LENGTH_PANEL", input.bottomLengthPanelFlapDepthMm, widthSpanMm, input.minimumClosureOverlapMm, input.maximumClosureOverlapMm)},
    {field: "bottomWidthPanelFlapDepthMm", fact: createClosureFact("BOTTOM_WIDTH_PANEL_FLAPS", "BOTTOM", "WIDTH_PANEL", input.bottomWidthPanelFlapDepthMm, lengthSpanMm, input.minimumClosureOverlapMm, input.maximumClosureOverlapMm)},
  ] as const;
  for (const entry of closureEntries) {
    if (entry.fact.overlapMm < input.minimumClosureOverlapMm) {
      return csscError(input, "FLAP_CLOSURE_SHORTFALL", `${entry.fact.id} provides ${entry.fact.overlapMm} mm overlap, below the ${input.minimumClosureOverlapMm} mm minimum.`, entry.field);
    }
    if (entry.fact.overlapMm > input.maximumClosureOverlapMm) {
      return csscError(input, "FLAP_CLOSURE_EXCESS", `${entry.fact.id} provides ${entry.fact.overlapMm} mm overlap, above the ${input.maximumClosureOverlapMm} mm maximum.`, entry.field);
    }
  }
  const closureFacts: Rsc0204ClosureFacts = {
    topLengthPanel: closureEntries[0].fact,
    topWidthPanel: closureEntries[1].fact,
    bottomLengthPanel: closureEntries[2].fact,
    bottomWidthPanel: closureEntries[3].fact,
  };

  if (input.usableBlankWidthMm < perimeterSpanMm) {
    return csscError(input, "PANEL_SPAN_SHORTFALL", `The canonical panel perimeter and joint need ${perimeterSpanMm} mm but the usable blank width is ${input.usableBlankWidthMm} mm.`, "usableBlankWidthMm");
  }
  if (input.usableBlankHeightMm < crossSpanMm) {
    return csscError(input, "TARGET_EXCEEDS_BLANK", `The four flap channels and wall band need ${crossSpanMm} mm but the usable blank height is ${input.usableBlankHeightMm} mm.`, "usableBlankHeightMm");
  }

  const maximumAdditionalCreaseAllowanceMm = Math.max(
    input.additionalCreaseAllowanceMm.lengthMm,
    input.additionalCreaseAllowanceMm.widthMm,
    input.additionalCreaseAllowanceMm.heightMm,
  );
  const minimumSeamStockMm = maximumAdditionalCreaseAllowanceMm + input.edgeClearanceMm;
  if (input.jointWidthMm < minimumSeamStockMm) {
    return csscError(input, "SEAM_OVERLAP_TOO_SMALL", "Joint width must retain the largest additional crease allowance plus edge clearance.", "jointWidthMm");
  }
  const minimumReliefStockMm = input.slotWidthMm + input.edgeClearanceMm + maximumAdditionalCreaseAllowanceMm;
  for (const measurement of FLAP_MEASUREMENTS) {
    if (input[measurement.field] < minimumReliefStockMm) {
      return csscError(input, "CORNER_SCORE_CONFLICT", `${measurement.channel} cannot retain the slot width, edge clearance, and largest additional crease allowance.`, measurement.field);
    }
  }

  const reliefFacts = [
    ...reliefFactsForEnd("TOP", panelScorePositionsMm, input.slotWidthMm, input.edgeClearanceMm),
    ...reliefFactsForEnd("BOTTOM", panelScorePositionsMm, input.slotWidthMm, input.edgeClearanceMm),
  ];
  const scoreFacts: RscScalarOperation[] = [
    ...RELIEF_BOUNDARIES.map((definition, index) => ({
      id: `panel-score-${definition.boundary.toLowerCase().replaceAll("_", "-")}`,
      type: "SCORE" as const,
      measurementMm: panelScorePositionsMm[index + 1],
      reference: "FROM_USABLE_BLANK_LEFT_EDGE",
      count: 1,
      description: "FEFCO-101 prototype crease-center position for the named canonical panel boundary.",
    })),
    {id: "top-wall-band-score", type: "SCORE", measurementMm: wallBandScorePositionsMm[0], reference: "FROM_USABLE_BLANK_TOP_EDGE", count: 1, description: "Top wall-band score after the maximum measured top flap depth."},
    {id: "bottom-wall-band-score", type: "SCORE", measurementMm: wallBandScorePositionsMm[1], reference: "FROM_USABLE_BLANK_TOP_EDGE", count: 1, description: "Bottom wall-band score after the FEFCO-101 height span."},
  ];
  const flapContourFacts: RscScalarOperation[] = [
    {id: "top-length-panel-flap-contours", type: "CUT", measurementMm: input.topLengthPanelFlapDepthMm, reference: "OUTWARD_FROM_TOP_WALL_SCORE", count: 2, description: "Paired W-half-family free edges attached to the two length panels."},
    {id: "top-width-panel-flap-contours", type: "CUT", measurementMm: input.topWidthPanelFlapDepthMm, reference: "OUTWARD_FROM_TOP_WALL_SCORE", count: 2, description: "Paired L-half-family free edges attached to the two width panels."},
    {id: "bottom-length-panel-flap-contours", type: "CUT", measurementMm: input.bottomLengthPanelFlapDepthMm, reference: "OUTWARD_FROM_BOTTOM_WALL_SCORE", count: 2, description: "Paired W-half-family free edges attached to the two length panels."},
    {id: "bottom-width-panel-flap-contours", type: "CUT", measurementMm: input.bottomWidthPanelFlapDepthMm, reference: "OUTWARD_FROM_BOTTOM_WALL_SCORE", count: 2, description: "Paired L-half-family free edges attached to the two width panels."},
  ];
  const reliefOperations: RscScalarOperation[] = reliefFacts.map((fact) => ({
    id: `${fact.id.toLowerCase().replaceAll("_", "-")}-relief`,
    type: "CUT",
    measurementMm: fact.slotWidthMm,
    reference: `AT_${fact.id}_SCORE_BOUNDARY`,
    count: 1,
    description: `Named ${fact.end.toLowerCase()} relief at ${fact.boundary}; no manufacturer-joint flap is inferred.`,
  }));
  const remainingBlankWidthMm = input.usableBlankWidthMm - perimeterSpanMm;
  const remainingBlankHeightMm = input.usableBlankHeightMm - crossSpanMm;
  const trimFacts: RscScalarOperation[] = [];
  const scrapFacts: RscScalarOperation[] = [];
  if (remainingBlankWidthMm > RSC_DIMENSION_EPSILON_MM) {
    trimFacts.push({id: "blank-width-trim", type: "CUT", measurementMm: perimeterSpanMm, reference: "FROM_USABLE_BLANK_LEFT_EDGE", count: 1, description: "Scalar trim line after the L-W-L-W perimeter and measured manufacturer joint."});
    scrapFacts.push({id: "blank-width-scrap", type: "SCRAP", measurementMm: remainingBlankWidthMm, reference: "USABLE_WIDTH_REMAINDER", count: 1, description: "Measured usable width beyond the canonical perimeter trim."});
  }
  if (remainingBlankHeightMm > RSC_DIMENSION_EPSILON_MM) {
    trimFacts.push({id: "blank-height-trim", type: "CUT", measurementMm: crossSpanMm, reference: "FROM_USABLE_BLANK_TOP_EDGE", count: 1, description: "Scalar trim line after the maximum top flap, wall band, and maximum bottom flap."});
    scrapFacts.push({id: "blank-height-scrap", type: "SCRAP", measurementMm: remainingBlankHeightMm, reference: "USABLE_HEIGHT_REMAINDER", count: 1, description: "Measured usable height beyond the canonical cross-span trim."});
  }
  const operations: RscScalarOperation[] = [
    ...scoreFacts,
    ...flapContourFacts,
    ...reliefOperations,
    ...trimFacts,
    ...scrapFacts,
  ];
  const affectedFlapChannels: Rsc0204FlapChannel[] = [];
  if (widthReductionMm > 0) affectedFlapChannels.push("TOP_LENGTH_PANEL_FLAPS", "BOTTOM_LENGTH_PANEL_FLAPS");
  if (lengthReductionMm > 0) affectedFlapChannels.push("TOP_WIDTH_PANEL_FLAPS", "BOTTOM_WIDTH_PANEL_FLAPS");
  const warnings = [
    "PROTOTYPE_ONLY: verify this measured FEFCO 0204/CSSC sequence on the actual opened blank.",
    "The top/bottom style identity is explicit; FEFCO 0215 locking and cut geometry is not approximated.",
    "Score centers use the FEFCO Recommendation 101 board-thickness basis plus explicit per-axis additional allowances.",
    "Scalar marks and named relief facts are not manufacturing-certified cut coordinates.",
    "This plan does not certify strength, carrier acceptance, seal performance, or manufacturing compliance.",
    "Remeasure final inside dimensions, manufacturer seam, and all four independent flap closures before use.",
  ];
  const diagnostics: RscDiagnostic[] = [{code: "PROTOTYPE_ONLY", severity: "WARNING", message: warnings[0]}];

  return immutable({
    id: "RSC_FEFCO_0204_CSSC_V1" as const,
    status: "PROTOTYPE_ONLY" as const,
    topStyle: input.topStyle,
    bottomStyle: input.bottomStyle,
    styleIdentity: `${input.topStyle}/${input.bottomStyle}` as const,
    panelLayout: input.panelLayout,
    sourceForm: input.sourceForm,
    fluteDirection: input.fluteDirection,
    originalInternal: {...original},
    targetInternal: {...target},
    finalInternal,
    horizontalReductionsMm: {lengthMm: lengthReductionMm, widthMm: widthReductionMm},
    affectedFlapChannels,
    usableBlankWidthMm: input.usableBlankWidthMm,
    usableBlankHeightMm: input.usableBlankHeightMm,
    panelScorePositionsMm,
    perimeterSpanMm,
    wallBandScorePositionsMm,
    crossSpanMm,
    jointWidthMm: input.jointWidthMm,
    joint: input.joint,
    boardThicknessMm: input.boardThicknessMm,
    additionalCreaseAllowanceMm: {...input.additionalCreaseAllowanceMm},
    scoreCenterSpansMm,
    topLengthPanelFlapDepthMm: input.topLengthPanelFlapDepthMm,
    topWidthPanelFlapDepthMm: input.topWidthPanelFlapDepthMm,
    bottomLengthPanelFlapDepthMm: input.bottomLengthPanelFlapDepthMm,
    bottomWidthPanelFlapDepthMm: input.bottomWidthPanelFlapDepthMm,
    topMaximumFlapDepthMm,
    bottomMaximumFlapDepthMm,
    closureFacts,
    minimumClosureOverlapMm: input.minimumClosureOverlapMm,
    maximumClosureOverlapMm: input.maximumClosureOverlapMm,
    slotWidthMm: input.slotWidthMm,
    edgeClearanceMm: input.edgeClearanceMm,
    minimumReliefStockMm,
    remainingBlankWidthMm,
    remainingBlankHeightMm,
    reliefFacts,
    scoreFacts,
    flapContourFacts,
    trimFacts,
    scrapFacts,
    marks: operations,
    operations,
    playbook: CSSC_PLAYBOOK.map((step) => ({...step})),
    diagnostics,
    warnings,
  });
}
