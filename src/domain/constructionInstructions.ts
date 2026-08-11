import type {WrapAnimationStage} from "./animation";
import {
  validateFoldNet,
  type FoldNet,
  type FoldNetDiagnosticCode,
  type FoldNetPlaybookCode,
  type FoldNetPlaybookStep,
} from "./foldnet";
import type {Dimensions3D, WrapPlan} from "./geometry";

export type ConstructionInstructionActionId =
  `playbook:${FoldNetPlaybookCode}`;

export interface ConstructionInstructionReferences {
  readonly faceIds: readonly string[];
  readonly scoreIds: readonly string[];
  readonly cutIds: readonly string[];
  readonly scrapIds: readonly string[];
  readonly creaseIds: readonly string[];
  readonly seamIds: readonly string[];
}

export interface ConstructionInstructionCount {
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

export interface ConstructionEnteredStock {
  readonly lengthMm: number;
  readonly widthMm: number;
}

export type ConstructionInstructionMeasurement =
  | {
      readonly id: string;
      readonly kind: "LENGTH";
      readonly label: string;
      readonly valueMm: number;
    }
  | {
      readonly id: string;
      readonly kind: "SHEET";
      readonly label: string;
      readonly lengthMm: number;
      readonly widthMm: number;
    }
  | {
      readonly id: string;
      readonly kind: "DIMENSIONS";
      readonly label: string;
      readonly dimensionsMm: Dimensions3D;
    };

export interface ConstructionInstructionAction {
  readonly id: ConstructionInstructionActionId;
  readonly code: FoldNetPlaybookCode;
  readonly sequence: number;
  readonly canonicalLabel: string;
  readonly title: string;
  readonly instruction: string;
  readonly tools: readonly string[];
  readonly safety: string;
  readonly expectedResult: string;
  readonly stageIds: readonly WrapAnimationStage[];
  readonly startProgress: number;
  readonly endProgress: number;
  readonly references: ConstructionInstructionReferences;
  readonly counts: readonly ConstructionInstructionCount[];
  readonly measurements: readonly ConstructionInstructionMeasurement[];
}

export type ConstructionInstructionDiagnosticCode =
  | FoldNetDiagnosticCode
  | "CONSTRUCTION_INSTRUCTIONS_INVALID_PLAN"
  | "CONSTRUCTION_INSTRUCTIONS_INVALID_PLAYBOOK"
  | "CONSTRUCTION_INSTRUCTIONS_INVALID_MEASUREMENT";

export interface ConstructionInstructionsInvalid {
  readonly status: "INVALID";
  readonly codes: readonly ConstructionInstructionDiagnosticCode[];
  readonly errors: readonly string[];
}

export interface ConstructionInstructionsReady {
  readonly status: "READY";
  readonly patternId: WrapPlan["patternId"];
  readonly orientationId: string;
  readonly enteredStock: ConstructionEnteredStock;
  readonly actions: readonly ConstructionInstructionAction[];
}

export type ConstructionInstructions =
  | ConstructionInstructionsReady
  | ConstructionInstructionsInvalid;

interface ActionDefinition {
  readonly code: FoldNetPlaybookCode;
  readonly title: string;
  readonly instruction: string;
  readonly tools: readonly string[];
  readonly safety: string;
  readonly expectedResult: string;
  readonly stageIds: readonly WrapAnimationStage[];
  readonly startProgress: number;
  readonly endProgress: number;
}

const ACTION_DEFINITIONS: readonly ActionDefinition[] = [
  {
    code: "VERIFY",
    title: "Check the sheet and protected item",
    instruction:
      "Confirm the cardboard is large enough for the generated net and the protected item matches the calculated inside space.",
    tools: ["Tape measure", "Pencil"],
    safety: "Keep the utility knife closed until the cutting step.",
    expectedResult: "The full sheet and protected item outline are ready to mark.",
    stageIds: ["reveal", "envelope"],
    startProgress: 0,
    endProgress: 0.14,
  },
  {
    code: "SCORE",
    title: "Press the fold guides",
    instruction:
      "Score means press a fold guide into the cardboard. Follow every generated dashed line without cutting through the sheet.",
    tools: ["Metal ruler", "Scoring tool"],
    safety: "Press firmly enough to guide a fold, but do not cut through the cardboard.",
    expectedResult: "Every generated dashed fold guide is visible on the sheet.",
    stageIds: ["scores"],
    startProgress: 0.14,
    endProgress: 0.22,
  },
  {
    code: "CUT",
    title: "Cut the generated outline",
    instruction:
      "Place the sheet on a cutting mat, hold a straightedge on each generated cut, and follow the shown knife path in order.",
    tools: ["Cutting mat", "Metal straightedge", "Utility knife"],
    safety: "Use light passes and keep fingers away from the cutting edge.",
    expectedResult: "The generated cut boundaries separate the package net from its scrap.",
    stageIds: ["cuts", "cutting"],
    startProgress: 0.22,
    endProgress: 0.38,
  },
  {
    code: "SCRAP",
    title: "Clear the loose scrap",
    instruction:
      "Remove only the generated scrap pieces after all of their required cuts are complete.",
    tools: ["Hands"],
    safety: "If a piece resists, stop and check for an unfinished cut instead of tearing it away.",
    expectedResult: "Only the connected package net remains on the work surface.",
    stageIds: ["scrap"],
    startProgress: 0.38,
    endProgress: 0.44,
  },
  {
    code: "FOLD",
    title: "Fold the tabs, walls, and top",
    instruction:
      "Follow the animation order: fold the joining tabs, raise the walls, then bring the top flaps together.",
    tools: ["Hands"],
    safety: "Dry-fold first. Stop if a crease pulls, tears, or forces two panels through each other.",
    expectedResult: "The generated faces form the calculated package without detached panels.",
    stageIds: ["tabs", "walls", "top"],
    startProgress: 0.44,
    endProgress: 0.9,
  },
  {
    code: "SEAL",
    title: "Tape the centre seam",
    instruction:
      "Apply packing tape only after the generated top edges meet within the listed gap tolerance.",
    tools: ["Packing tape"],
    safety: "Do not force a seam closed if the measured gap is outside the plan tolerance.",
    expectedResult: "The generated mating seam is covered by one continuous strip of tape.",
    stageIds: ["seal"],
    startProgress: 0.9,
    endProgress: 0.97,
  },
  {
    code: "REMEASURE",
    title: "Remeasure the finished inside",
    instruction:
      "Measure the finished inside length, width, and height before placing the real item inside.",
    tools: ["Tape measure"],
    safety:
      "This confirms geometric fit only; it does not establish strength or carrier approval.",
    expectedResult: "The finished inside dimensions meet the calculated minimum.",
    stageIds: ["present"],
    startProgress: 0.97,
    endProgress: 1,
  },
];

function clonePlainData<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.map((child) => clonePlainData(child)) as T;
  const clone: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>))
    clone[key] = clonePlainData(child);
  return clone as T;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>))
    deepFreeze(child);
  return value;
}

function immutableResult<T>(value: T): T {
  return deepFreeze(clonePlainData(value));
}

function invalid(
  codes: readonly ConstructionInstructionDiagnosticCode[],
  errors: readonly string[],
): ConstructionInstructionsInvalid {
  return immutableResult({status: "INVALID", codes, errors});
}

function hasCanonicalContainers(net: FoldNet) {
  if (!net || typeof net !== "object") return false;
  const candidate = net as unknown as Record<string, unknown>;
  return [
    "vertices",
    "faces",
    "scores",
    "cuts",
    "scraps",
    "seams",
    "creases",
    "steps",
    "playbook",
  ].every((field) => Array.isArray(candidate[field]));
}

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

function validPlanMeasurements(plan: WrapPlan) {
  const dimensions = plan.requiredInternal;
  return (
    dimensions &&
    finitePositive(dimensions.lengthMm) &&
    finitePositive(dimensions.widthMm) &&
    finitePositive(dimensions.heightMm) &&
    plan.metrics &&
    finitePositive(plan.metrics.netWidthMm) &&
    finitePositive(plan.metrics.netHeightMm) &&
    finitePositive(plan.metrics.requiredSheetWidthMm) &&
    finitePositive(plan.metrics.requiredSheetHeightMm)
  );
}

function referencesFor(step: FoldNetPlaybookStep): ConstructionInstructionReferences {
  return {
    faceIds: [...(step.faceIds ?? [])],
    scoreIds: [...(step.scoreIds ?? [])],
    cutIds: [...(step.cutIds ?? [])],
    scrapIds: [...(step.scrapIds ?? [])],
    creaseIds: [...(step.creaseIds ?? [])],
    seamIds: [...(step.seamIds ?? [])],
  };
}

function sameOrderedIds(
  actual: readonly string[] | undefined,
  expected: readonly string[],
) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((id, index) => id === expected[index])
  );
}

function hasExactCanonicalReferences(net: FoldNet) {
  const expected = new Map<FoldNetPlaybookCode, readonly string[]>([
    ["VERIFY", net.faces.map((face) => face.id)],
    ["SCORE", net.scores.map((score) => score.id)],
    ["CUT", net.cuts.map((cut) => cut.id)],
    ["SCRAP", net.scraps.map((scrap) => scrap.id)],
    ["FOLD", net.creases.map((crease) => crease.id)],
    ["SEAL", net.seams.map((seam) => seam.id)],
    ["REMEASURE", []],
  ]);
  return net.playbook.every((step) => {
    const ids = expected.get(step.code);
    if (!ids) return false;
    if (step.code === "VERIFY") return sameOrderedIds(step.faceIds, ids);
    if (step.code === "SCORE") return sameOrderedIds(step.scoreIds, ids);
    if (step.code === "CUT") return sameOrderedIds(step.cutIds, ids);
    if (step.code === "SCRAP") return sameOrderedIds(step.scrapIds, ids);
    if (step.code === "FOLD") return sameOrderedIds(step.creaseIds, ids);
    if (step.code === "SEAL") return sameOrderedIds(step.seamIds, ids);
    return ids.length === 0;
  });
}

function segmentLengthTotalMm(
  net: FoldNet,
  ids: readonly string[],
  kind: "SCORE" | "CUT",
) {
  const vertices = new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
  const segments = new Map(
    (kind === "SCORE" ? net.scores : net.cuts).map((segment) => [
      segment.id,
      segment,
    ]),
  );
  return ids.reduce((total, id) => {
    const segment = segments.get(id);
    const from = segment ? vertices.get(segment.fromVertexId) : undefined;
    const to = segment ? vertices.get(segment.toVertexId) : undefined;
    return from && to
      ? total + Math.hypot(to.xMm - from.xMm, to.yMm - from.yMm)
      : Number.NaN;
  }, 0);
}

function presentationData(
  definition: ActionDefinition,
  references: ConstructionInstructionReferences,
  plan: WrapPlan,
  enteredStock: ConstructionEnteredStock,
) {
  const counts: ConstructionInstructionCount[] = [];
  const measurements: ConstructionInstructionMeasurement[] = [];
  if (definition.code === "VERIFY") {
    counts.push({id: "generated-faces", label: "Generated faces", value: references.faceIds.length});
    measurements.push(
      {
        id: "entered-sheet",
        kind: "SHEET",
        label: "Entered sheet",
        lengthMm: enteredStock.lengthMm,
        widthMm: enteredStock.widthMm,
      },
      {
        id: "minimum-sheet",
        kind: "SHEET",
        label: "Minimum sheet",
        lengthMm: plan.metrics.requiredSheetWidthMm,
        widthMm: plan.metrics.requiredSheetHeightMm,
      },
      {
        id: "generated-net",
        kind: "SHEET",
        label: "Generated net",
        lengthMm: plan.metrics.netWidthMm,
        widthMm: plan.metrics.netHeightMm,
      },
      {
        id: "protected-inside",
        kind: "DIMENSIONS",
        label: "Required inside space",
        dimensionsMm: {...plan.requiredInternal},
      },
    );
  } else if (definition.code === "SCORE") {
    counts.push({id: "score-lines", label: "Score lines", value: references.scoreIds.length});
    measurements.push({
      id: "score-length",
      kind: "LENGTH",
      label: "Total score length",
      valueMm: segmentLengthTotalMm(plan.foldNet, references.scoreIds, "SCORE"),
    });
  } else if (definition.code === "CUT") {
    counts.push({id: "cut-lines", label: "Cut segments", value: references.cutIds.length});
    measurements.push({
      id: "cut-length",
      kind: "LENGTH",
      label: "Total cut length",
      valueMm: segmentLengthTotalMm(plan.foldNet, references.cutIds, "CUT"),
    });
  } else if (definition.code === "SCRAP") {
    counts.push({id: "scrap-pieces", label: "Scrap pieces", value: references.scrapIds.length});
  } else if (definition.code === "FOLD") {
    counts.push({id: "fold-creases", label: "Generated creases", value: references.creaseIds.length});
  } else if (definition.code === "SEAL") {
    counts.push({id: "tape-seams", label: "Tape seams", value: references.seamIds.length});
    const seams = new Map(plan.foldNet.seams.map((seam) => [seam.id, seam]));
    references.seamIds.forEach((id) => {
      const seam = seams.get(id)!;
      measurements.push(
        {
          id: `${id}:expected-gap`,
          kind: "LENGTH",
          label: "Expected seam gap",
          valueMm: seam.expectedGapMm,
        },
        {
          id: `${id}:tolerance`,
          kind: "LENGTH",
          label: "Allowed gap tolerance",
          valueMm: seam.toleranceMm,
        },
      );
    });
  } else {
    measurements.push({
      id: "finished-inside",
      kind: "DIMENSIONS",
      label: "Minimum finished inside",
      dimensionsMm: {...plan.requiredInternal},
    });
  }
  return {counts, measurements};
}

/** Derive novice-facing instructions without creating a second geometry authority. */
export function createConstructionInstructions(
  plan: WrapPlan,
  enteredStock: ConstructionEnteredStock,
): ConstructionInstructions {
  if (
    !plan ||
    typeof plan !== "object" ||
    !plan.foldNet ||
    !hasCanonicalContainers(plan.foldNet)
  )
    return invalid(
      ["CONSTRUCTION_INSTRUCTIONS_INVALID_PLAN"],
      ["The generated plan is missing required construction data."],
    );
  if (
    !enteredStock ||
    typeof enteredStock !== "object" ||
    !finitePositive(enteredStock.lengthMm) ||
    !finitePositive(enteredStock.widthMm)
  )
    return invalid(
      ["CONSTRUCTION_INSTRUCTIONS_INVALID_MEASUREMENT"],
      ["The entered sheet dimensions must both be finite and greater than zero."],
    );

  let validation: ReturnType<typeof validateFoldNet>;
  try {
    validation = validateFoldNet(plan.foldNet);
  } catch {
    return invalid(
      ["CONSTRUCTION_INSTRUCTIONS_INVALID_PLAN"],
      ["The generated construction data could not be validated."],
    );
  }
  if (!validation.valid)
    return invalid(validation.diagnosticCodes, validation.errors);

  const exactPlaybook =
    plan.foldNet.playbook.length === ACTION_DEFINITIONS.length &&
    plan.foldNet.playbook.every(
      (step, index) =>
        step.code === ACTION_DEFINITIONS[index].code &&
        step.sequence === index,
    ) &&
    hasExactCanonicalReferences(plan.foldNet);
  if (!exactPlaybook)
    return invalid(
      ["CONSTRUCTION_INSTRUCTIONS_INVALID_PLAYBOOK"],
      ["The generated playbook does not match the canonical construction order."],
    );
  if (!validPlanMeasurements(plan))
    return invalid(
      ["CONSTRUCTION_INSTRUCTIONS_INVALID_MEASUREMENT"],
      ["The generated plan contains an invalid construction measurement."],
    );

  const actions = ACTION_DEFINITIONS.map((definition, index) => {
    const step = plan.foldNet.playbook[index];
    const references = referencesFor(step);
    const presentation = presentationData(
      definition,
      references,
      plan,
      enteredStock,
    );
    return {
      id: `playbook:${definition.code}` as const,
      code: definition.code,
      sequence: step.sequence,
      canonicalLabel: step.label,
      title: definition.title,
      instruction: definition.instruction,
      tools: [...definition.tools],
      safety: definition.safety,
      expectedResult: definition.expectedResult,
      stageIds: [...definition.stageIds],
      startProgress: definition.startProgress,
      endProgress: definition.endProgress,
      references,
      counts: presentation.counts,
      measurements: presentation.measurements,
    } satisfies ConstructionInstructionAction;
  });
  if (
    actions.some((action) =>
      action.measurements.some((measurement) =>
        measurement.kind === "LENGTH"
          ? !Number.isFinite(measurement.valueMm) || measurement.valueMm < 0
          : measurement.kind === "SHEET"
            ? !finitePositive(measurement.widthMm) ||
              !finitePositive(measurement.lengthMm)
            : !finitePositive(measurement.dimensionsMm.lengthMm) ||
              !finitePositive(measurement.dimensionsMm.widthMm) ||
              !finitePositive(measurement.dimensionsMm.heightMm),
      ),
    )
  )
    return invalid(
      ["CONSTRUCTION_INSTRUCTIONS_INVALID_MEASUREMENT"],
      ["A generated instruction contains an invalid measurement."],
    );

  return immutableResult({
    status: "READY",
    patternId: plan.patternId,
    orientationId: plan.foldNet.metadata.orientation.id,
    enteredStock: {...enteredStock},
    actions,
  });
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function actionForProgress(
  instructions: ConstructionInstructions,
  rawProgress: number,
): ConstructionInstructionAction | null {
  if (instructions.status === "INVALID") return null;
  const progress = clampProgress(rawProgress);
  for (let index = instructions.actions.length - 1; index >= 0; index -= 1)
    if (progress >= instructions.actions[index].startProgress)
      return instructions.actions[index];
  return instructions.actions[0] ?? null;
}

export function progressForAction(
  instructions: ConstructionInstructions,
  actionId: ConstructionInstructionActionId,
): number | null {
  if (instructions.status === "INVALID") return null;
  return (
    instructions.actions.find((action) => action.id === actionId)
      ?.startProgress ?? null
  );
}

export function previousAction(
  instructions: ConstructionInstructions,
  actionId: ConstructionInstructionActionId,
): ConstructionInstructionAction | null {
  if (instructions.status === "INVALID") return null;
  const index = instructions.actions.findIndex((action) => action.id === actionId);
  return index > 0 ? instructions.actions[index - 1] : null;
}

export function nextAction(
  instructions: ConstructionInstructions,
  actionId: ConstructionInstructionActionId,
): ConstructionInstructionAction | null {
  if (instructions.status === "INVALID") return null;
  const index = instructions.actions.findIndex((action) => action.id === actionId);
  return index >= 0 && index < instructions.actions.length - 1
    ? instructions.actions[index + 1]
    : null;
}
