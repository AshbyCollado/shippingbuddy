import {getWrapAnimationFrame, type WrapAnimationStage} from "./animation";
import {
  foldNetAtProgress,
  foldNetStepProgress,
  validateFoldNet,
  type FoldNet,
  type FoldNetCut,
  type FoldNetDiagnosticCode,
  type FoldNetPose,
  type FoldNetScrap,
  type FoldNetSeam,
  type FoldNetSeamEdgeReference,
  type FoldNetVector3,
  type FoldNetVertex,
  type FoldStepId,
} from "./foldnet";

const EPSILON_MM = 0.000001;
const LIFT_THRESHOLD_MM = 0.01;
const LIFT_HEIGHT_MM = 8;

export interface ConstructionPoint3 {
  readonly xMm: number;
  readonly yMm: number;
  readonly zMm: number;
}

export interface ConstructionPathSegment {
  readonly id: string;
  readonly from: ConstructionPoint3;
  readonly to: ConstructionPoint3;
  readonly lengthMm: number;
  readonly tangent: ConstructionPoint3;
}

export interface ConstructionCutOperation {
  readonly id: string;
  readonly kind: "CUT";
  readonly cutId: string;
  readonly from: ConstructionPoint3;
  readonly to: ConstructionPoint3;
  readonly weight: number;
}

export interface ConstructionLiftOperation {
  readonly id: string;
  readonly kind: "LIFT";
  readonly fromCutId: string;
  readonly toCutId: string;
  readonly from: ConstructionPoint3;
  readonly to: ConstructionPoint3;
  readonly distanceMm: number;
  readonly weight: number;
  readonly heightMm: number;
}

export type ConstructionOperation =
  | ConstructionCutOperation
  | ConstructionLiftOperation;

export type ConstructionDiagnosticCode =
  | FoldNetDiagnosticCode
  | "CHOREOGRAPHY_INVALID_NET"
  | "CHOREOGRAPHY_UNRESOLVED_REFERENCE"
  | "CHOREOGRAPHY_INVALID_FOLD_STEP"
  | "CHOREOGRAPHY_DUPLICATE_FOLD_STEP"
  | "CHOREOGRAPHY_UNRESOLVED_FOLD_STEP"
  | "CHOREOGRAPHY_INVALID_CREASE";

export interface ConstructionChoreographyInvalid {
  readonly status: "INVALID";
  readonly codes: readonly ConstructionDiagnosticCode[];
  readonly errors: readonly string[];
}

export interface ConstructionChoreographyReady {
  readonly status: "READY";
  readonly foldNet: FoldNet;
  readonly order: {
    readonly scoreIds: readonly string[];
    readonly cutIds: readonly string[];
    readonly scrapIds: readonly string[];
    readonly creaseIds: readonly string[];
    readonly seamIds: readonly string[];
  };
  readonly scoreSegments: readonly ConstructionPathSegment[];
  readonly cutSegments: readonly ConstructionPathSegment[];
  readonly cutOperations: readonly ConstructionOperation[];
  readonly foldCompleteAt: number;
}

export type ConstructionChoreography =
  | ConstructionChoreographyReady
  | ConstructionChoreographyInvalid;

export interface ConstructionPathFrame {
  readonly progress: number;
  readonly totalLengthMm: number;
  readonly completedIds: readonly string[];
  readonly activeId: string | null;
  readonly activeProgress: number;
  readonly position: ConstructionPoint3 | null;
  readonly tangent: ConstructionPoint3 | null;
}

export interface ConstructionKerf {
  readonly cutId: string;
  readonly from: ConstructionPoint3;
  readonly to: ConstructionPoint3;
  readonly progress: number;
}

export interface ConstructionScrapFrame {
  readonly id: string;
  readonly filled: true;
  readonly cutIds: readonly string[];
  readonly points: readonly ConstructionPoint3[];
  readonly exitDirection: readonly [number, number];
  readonly ready: boolean;
  readonly removalProgress: number;
}

export interface ConstructionSeamFrame {
  readonly id: string;
  readonly kind: "tape";
  readonly pairing: "DIRECT" | "REVERSED";
  readonly endpointGapsMm: readonly [number, number];
  readonly maxGapMm: number;
  readonly meanGapMm: number;
  readonly skewMm: number;
  readonly expectedGapMm: number;
  readonly toleranceMm: number;
  readonly errorMm: number;
  readonly ready: boolean;
  readonly centerline: readonly [ConstructionPoint3, ConstructionPoint3];
}

export interface ConstructionFrame {
  readonly status: "READY";
  readonly progress: number;
  readonly stage: {
    readonly id: WrapAnimationStage;
    readonly label: string;
    readonly progress: number;
    readonly checkpointIndex: number;
    readonly checkpointCount: number;
  };
  readonly score: ConstructionPathFrame;
  readonly trace: ConstructionPathFrame;
  readonly knife: {
    readonly visible: boolean;
    readonly position: ConstructionPoint3 | null;
    readonly tangent: ConstructionPoint3 | null;
  };
  readonly operation:
    | {
        readonly id: string;
        readonly kind: "CUT";
        readonly cutId: string;
        readonly index: number;
        readonly count: number;
        readonly progress: number;
      }
    | {
        readonly id: string;
        readonly kind: "LIFT";
        readonly fromCutId: string;
        readonly toCutId: string;
        readonly index: number;
        readonly count: number;
        readonly progress: number;
      }
    | null;
  readonly lifts: readonly (ConstructionLiftOperation & {
    readonly progress: number;
    readonly completed: boolean;
  })[];
  readonly completedCutIds: readonly string[];
  readonly kerf: readonly ConstructionKerf[];
  readonly scraps: readonly ConstructionScrapFrame[];
  readonly fold: {
    readonly pose: FoldNetPose;
    readonly diagnostics: FoldNetPose["diagnostics"];
    readonly creaseIds: readonly string[];
    readonly completedCreaseIds: readonly string[];
    readonly steps: readonly {
      readonly id: FoldStepId;
      readonly progress: number;
    }[];
    readonly completeAt: number;
    readonly complete: boolean;
  };
  readonly seams: readonly ConstructionSeamFrame[];
  readonly tape: {
    readonly ready: boolean;
    readonly visible: boolean;
    readonly progress: number;
    readonly seamIds: readonly string[];
    readonly centerlines: readonly (readonly [ConstructionPoint3, ConstructionPoint3])[];
  };
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

function clampProgress(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function point(vertex: FoldNetVertex): ConstructionPoint3 {
  return {xMm: vertex.xMm, yMm: vertex.yMm, zMm: 0};
}

function subtract(first: ConstructionPoint3, second: ConstructionPoint3) {
  return {
    xMm: first.xMm - second.xMm,
    yMm: first.yMm - second.yMm,
    zMm: first.zMm - second.zMm,
  };
}

function magnitude(value: ConstructionPoint3) {
  return Math.hypot(value.xMm, value.yMm, value.zMm);
}

function normalize(value: ConstructionPoint3): ConstructionPoint3 {
  const length = magnitude(value);
  return length > EPSILON_MM
    ? {xMm: value.xMm / length, yMm: value.yMm / length, zMm: value.zMm / length}
    : {xMm: 0, yMm: 0, zMm: 0};
}

function interpolate(
  from: ConstructionPoint3,
  to: ConstructionPoint3,
  progress: number,
): ConstructionPoint3 {
  return {
    xMm: from.xMm + (to.xMm - from.xMm) * progress,
    yMm: from.yMm + (to.yMm - from.yMm) * progress,
    zMm: from.zMm + (to.zMm - from.zMm) * progress,
  };
}

function pathSegment(
  id: string,
  from: FoldNetVertex,
  to: FoldNetVertex,
): ConstructionPathSegment {
  const fromPoint = point(from);
  const toPoint = point(to);
  const delta = subtract(toPoint, fromPoint);
  return {
    id,
    from: fromPoint,
    to: toPoint,
    lengthMm: magnitude(delta),
    tangent: normalize(delta),
  };
}

function invalid(
  codes: readonly ConstructionDiagnosticCode[],
  errors: readonly string[],
): ConstructionChoreographyInvalid {
  return immutableResult({
    status: "INVALID",
    codes: [...new Set(codes)].sort(),
    errors: [...new Set(errors)],
  });
}

function hasCanonicalContainers(value: unknown): value is FoldNet {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const metadata = candidate.metadata;
  if (
    typeof candidate.rootFaceId !== "string" ||
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  )
    return false;
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

function playbookIds(net: FoldNet, code: "SCORE" | "CUT" | "SCRAP" | "FOLD" | "SEAL") {
  const step = net.playbook.find((candidate) => candidate.code === code);
  if (!step) return undefined;
  if (code === "SCORE") return step.scoreIds;
  if (code === "CUT") return step.cutIds;
  if (code === "SCRAP") return step.scrapIds;
  if (code === "FOLD") return step.creaseIds;
  return step.seamIds;
}

function cutOperations(segments: readonly ConstructionPathSegment[]) {
  const operations: ConstructionOperation[] = [];
  segments.forEach((segment, index) => {
    const previous = segments[index - 1];
    if (previous) {
      const distanceMm = magnitude(subtract(segment.from, previous.to));
      if (distanceMm > LIFT_THRESHOLD_MM)
        operations.push({
          id: `lift:${previous.id}->${segment.id}`,
          kind: "LIFT",
          fromCutId: previous.id,
          toCutId: segment.id,
          from: previous.to,
          to: segment.from,
          distanceMm,
          weight: Math.max(12, 0.35 * distanceMm),
          heightMm: LIFT_HEIGHT_MM,
        });
    }
    operations.push({
      id: `cut:${segment.id}`,
      kind: "CUT",
      cutId: segment.id,
      from: segment.from,
      to: segment.to,
      weight: segment.lengthMm,
    });
  });
  return operations;
}

/** Compile immutable, renderer-free construction authority from a valid net. */
export function createConstructionChoreography(
  net: FoldNet,
): ConstructionChoreography {
  if (!hasCanonicalContainers(net))
    return invalid(
      ["CHOREOGRAPHY_INVALID_NET"],
      ["FoldNet is missing a required canonical container."],
    );
  let validation: ReturnType<typeof validateFoldNet>;
  try {
    validation = validateFoldNet(net);
  } catch {
    return invalid(
      ["CHOREOGRAPHY_INVALID_NET"],
      ["FoldNet validation could not complete for the supplied data."],
    );
  }
  if (!validation.valid)
    return invalid(validation.diagnosticCodes, validation.errors);

  const scoreIds = playbookIds(net, "SCORE");
  const cutIds = playbookIds(net, "CUT");
  const scrapIds = playbookIds(net, "SCRAP");
  const creaseIds = playbookIds(net, "FOLD");
  const seamIds = playbookIds(net, "SEAL");
  if (!scoreIds || !cutIds || !scrapIds || !creaseIds || !seamIds)
    return invalid(
      ["CHOREOGRAPHY_UNRESOLVED_REFERENCE"],
      ["Validated playbook is missing a construction reference field."],
    );

  const vertices = new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
  const scores = new Map(net.scores.map((score) => [score.id, score]));
  const cuts = new Map(net.cuts.map((cut) => [cut.id, cut]));
  const scoreSegments: ConstructionPathSegment[] = [];
  const cutSegments: ConstructionPathSegment[] = [];
  const unresolved: string[] = [];
  const resolveSegment = (
    id: string,
    segment: FoldNetCut | {readonly fromVertexId: string; readonly toVertexId: string} | undefined,
  ) => {
    const from = segment ? vertices.get(segment.fromVertexId) : undefined;
    const to = segment ? vertices.get(segment.toVertexId) : undefined;
    if (!from || !to) {
      unresolved.push(id);
      return undefined;
    }
    const resolved = pathSegment(id, from, to);
    if (resolved.lengthMm <= EPSILON_MM) {
      unresolved.push(id);
      return undefined;
    }
    return resolved;
  };
  scoreIds.forEach((id) => {
    const segment = resolveSegment(id, scores.get(id));
    if (segment) scoreSegments.push(segment);
  });
  cutIds.forEach((id) => {
    const segment = resolveSegment(id, cuts.get(id));
    if (segment) cutSegments.push(segment);
  });
  const faceById = new Map(net.faces.map((face) => [face.id, face]));
  seamIds.forEach((id) => {
    const seam = net.seams.find((candidate) => candidate.id === id);
    if (!seam) {
      unresolved.push(id);
      return;
    }
    seam.matingEdges.forEach((edge) => {
      const face = faceById.get(edge.faceId);
      if (
        !face ||
        !face.vertexIds.includes(edge.fromVertexId) ||
        !face.vertexIds.includes(edge.toVertexId)
      )
        unresolved.push(`${id}:${edge.faceId}`);
    });
  });
  const invalidSteps = net.steps.filter(
    (step, index) =>
      typeof step.id !== "string" ||
      step.id.trim().length === 0 ||
      step.sequence !== index ||
      !Number.isFinite(step.start) ||
      !Number.isFinite(step.end) ||
      step.start < 0 ||
      step.end < step.start ||
      step.end > 1,
  );
  const stepCounts = new Map<string, number>();
  net.steps.forEach((step) =>
    stepCounts.set(step.id, (stepCounts.get(step.id) ?? 0) + 1),
  );
  const duplicateStepIds = [...stepCounts]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort();
  const creaseById = new Map(net.creases.map((crease) => [crease.id, crease]));
  const invalidCreases = net.creases.filter(
    (crease, index) =>
      !Number.isFinite(crease.angleRad) ||
      crease.angleRad <= 0 ||
      (crease.direction !== -1 && crease.direction !== 1) ||
      (crease.kind !== "score" && crease.kind !== "hinge") ||
      typeof crease.stepId !== "string" ||
      crease.stepId.trim().length === 0 ||
      !Number.isInteger(crease.sequence) ||
      crease.sequence < 0 ||
      crease.sequence !== index,
  );
  const unresolvedFoldStepRefs = creaseIds.flatMap((creaseId) => {
    const crease = creaseById.get(creaseId);
    return !crease || stepCounts.get(crease.stepId) !== 1
      ? [`${creaseId}:${crease?.stepId ?? "missing-crease"}`]
      : [];
  });
  if (
    unresolved.length ||
    invalidSteps.length ||
    duplicateStepIds.length ||
    invalidCreases.length ||
    unresolvedFoldStepRefs.length
  )
    return invalid(
      [
        ...(unresolved.length
          ? (["CHOREOGRAPHY_UNRESOLVED_REFERENCE"] as const)
          : []),
        ...(invalidSteps.length
          ? (["CHOREOGRAPHY_INVALID_FOLD_STEP"] as const)
          : []),
        ...(duplicateStepIds.length
          ? (["CHOREOGRAPHY_DUPLICATE_FOLD_STEP"] as const)
          : []),
        ...(unresolvedFoldStepRefs.length
          ? (["CHOREOGRAPHY_UNRESOLVED_FOLD_STEP"] as const)
          : []),
        ...(invalidCreases.length
          ? (["CHOREOGRAPHY_INVALID_CREASE"] as const)
          : []),
      ],
      [
        ...unresolved.map((id) => `Unresolved construction reference: ${id}`),
        ...invalidSteps.map((step) => `Invalid fold step contract: ${step.id}`),
        ...duplicateStepIds.map((id) => `Duplicate fold step id: ${id}`),
        ...unresolvedFoldStepRefs.map(
          (id) => `Unresolved fold-step reference: ${id}`,
        ),
        ...invalidCreases.map((crease) =>
          `Invalid crease contract: ${crease.id}`,
        ),
      ],
    );

  return immutableResult({
    status: "READY",
    foldNet: net,
    order: {scoreIds, cutIds, scrapIds, creaseIds, seamIds},
    scoreSegments,
    cutSegments,
    cutOperations: cutOperations(cutSegments),
    foldCompleteAt: Math.max(0, ...net.steps.map((step) => step.end)),
  });
}

function samplePath(
  segments: readonly ConstructionPathSegment[],
  rawProgress: number,
): ConstructionPathFrame {
  const progress = clampProgress(rawProgress);
  const totalLengthMm = segments.reduce((sum, segment) => sum + segment.lengthMm, 0);
  if (!segments.length || totalLengthMm <= EPSILON_MM)
    return {progress, totalLengthMm: 0, completedIds: [], activeId: null, activeProgress: 0, position: null, tangent: null};
  const traveled = progress * totalLengthMm;
  const completedIds: string[] = [];
  let elapsed = 0;
  for (const segment of segments) {
    const end = elapsed + segment.lengthMm;
    if (traveled >= end - EPSILON_MM) {
      completedIds.push(segment.id);
      elapsed = end;
      continue;
    }
    const activeProgress = clampProgress((traveled - elapsed) / segment.lengthMm);
    return {
      progress,
      totalLengthMm,
      completedIds,
      activeId: segment.id,
      activeProgress,
      position: interpolate(segment.from, segment.to, activeProgress),
      tangent: segment.tangent,
    };
  }
  const last = segments[segments.length - 1];
  return {progress, totalLengthMm, completedIds, activeId: null, activeProgress: 1, position: last.to, tangent: last.tangent};
}

function liftSample(operation: ConstructionLiftOperation, progress: number) {
  const t = clampProgress(progress);
  const interpolated = interpolate(operation.from, operation.to, t);
  const position = {
    ...interpolated,
    zMm: 4 * operation.heightMm * t * (1 - t),
  };
  const tangent = normalize({
    xMm: operation.to.xMm - operation.from.xMm,
    yMm: operation.to.yMm - operation.from.yMm,
    zMm: 4 * operation.heightMm * (1 - 2 * t),
  });
  return {position, tangent};
}

function operationFrame(
  operations: readonly ConstructionOperation[],
  rawProgress: number,
) {
  const progress = clampProgress(rawProgress);
  const totalWeight = operations.reduce((sum, operation) => sum + operation.weight, 0);
  const traveled = progress * totalWeight;
  const completedCutIds: string[] = [];
  const lifts: Array<ConstructionLiftOperation & {progress: number; completed: boolean}> = [];
  let elapsed = 0;
  let active: {operation: ConstructionOperation; index: number; progress: number} | null = null;
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    const end = elapsed + operation.weight;
    const localProgress = clampProgress((traveled - elapsed) / operation.weight);
    if (operation.kind === "CUT" && traveled >= end - EPSILON_MM)
      completedCutIds.push(operation.cutId);
    if (operation.kind === "LIFT")
      lifts.push({...operation, progress: localProgress, completed: traveled >= end - EPSILON_MM});
    if (!active && traveled < end - EPSILON_MM)
      active = {operation, index, progress: localProgress};
    elapsed = end;
  }
  return {active, completedCutIds, lifts};
}

function posedVertex(
  net: FoldNet,
  pose: FoldNetPose,
  edge: FoldNetSeamEdgeReference,
  endpoint: "from" | "to",
): FoldNetVector3 | undefined {
  const face = net.faces.find((candidate) => candidate.id === edge.faceId);
  const posedFace = pose.faces.find((candidate) => candidate.faceId === edge.faceId);
  const vertexId = endpoint === "from" ? edge.fromVertexId : edge.toVertexId;
  const index = face?.vertexIds.indexOf(vertexId) ?? -1;
  return index >= 0 ? posedFace?.vertices[index] : undefined;
}

function midpoint(first: FoldNetVector3, second: FoldNetVector3): ConstructionPoint3 {
  return {
    xMm: (first.xMm + second.xMm) / 2,
    yMm: (first.yMm + second.yMm) / 2,
    zMm: (first.zMm + second.zMm) / 2,
  };
}

function vectorDistance(first: FoldNetVector3, second: FoldNetVector3) {
  return Math.hypot(first.xMm - second.xMm, first.yMm - second.yMm, first.zMm - second.zMm);
}

function seamFrame(
  net: FoldNet,
  pose: FoldNetPose,
  seam: FoldNetSeam,
  foldComplete: boolean,
): ConstructionSeamFrame {
  const first = seam.matingEdges[0];
  const second = seam.matingEdges[1];
  const firstFrom = posedVertex(net, pose, first, "from")!;
  const firstTo = posedVertex(net, pose, first, "to")!;
  const secondFrom = posedVertex(net, pose, second, "from")!;
  const secondTo = posedVertex(net, pose, second, "to")!;
  const direct: [number, number] = [
    vectorDistance(firstFrom, secondFrom),
    vectorDistance(firstTo, secondTo),
  ];
  const reversed: [number, number] = [
    vectorDistance(firstFrom, secondTo),
    vectorDistance(firstTo, secondFrom),
  ];
  const pairing = Math.max(...direct) <= Math.max(...reversed) ? "DIRECT" : "REVERSED";
  const pairedSecond: [FoldNetVector3, FoldNetVector3] =
    pairing === "DIRECT" ? [secondFrom, secondTo] : [secondTo, secondFrom];
  const endpointGapsMm: [number, number] = pairing === "DIRECT" ? direct : reversed;
  const maxGapMm = Math.max(...endpointGapsMm);
  const meanGapMm = (endpointGapsMm[0] + endpointGapsMm[1]) / 2;
  const skewMm = Math.abs(endpointGapsMm[0] - endpointGapsMm[1]);
  const withinTolerance = endpointGapsMm.every(
    (gap) => Math.abs(gap - seam.expectedGapMm) <= seam.toleranceMm,
  ) && skewMm <= seam.toleranceMm;
  return {
    id: seam.id,
    kind: seam.kind,
    pairing,
    endpointGapsMm,
    maxGapMm,
    meanGapMm,
    skewMm,
    expectedGapMm: seam.expectedGapMm,
    toleranceMm: seam.toleranceMm,
    errorMm: meanGapMm - seam.expectedGapMm,
    ready: foldComplete && withinTolerance,
    centerline: [
      midpoint(firstFrom, pairedSecond[0]),
      midpoint(firstTo, pairedSecond[1]),
    ],
  };
}

function scrapFrame(
  scrap: FoldNetScrap,
  completedCutIds: ReadonlySet<string>,
  removalProgress: number,
): ConstructionScrapFrame {
  const ready = scrap.cutIds.length > 0 && scrap.cutIds.every((id) => completedCutIds.has(id));
  return {
    id: scrap.id,
    filled: true,
    cutIds: scrap.cutIds,
    points: scrap.points.map((vertex) => point(vertex)),
    exitDirection: scrap.exitDirection,
    ready,
    removalProgress: ready ? removalProgress : 0,
  };
}

/** Sample all construction channels at one normalized presentation progress. */
export function constructionFrameAt(
  choreography: ConstructionChoreography,
  rawProgress: number,
): ConstructionFrame | ConstructionChoreographyInvalid {
  if (choreography.status === "INVALID") return choreography;
  const progress = clampProgress(rawProgress);
  const animation = getWrapAnimationFrame(progress);
  const score = samplePath(choreography.scoreSegments, animation.scores);
  const trace = samplePath(choreography.cutSegments, animation.cuts);
  const cutting = operationFrame(choreography.cutOperations, animation.cutting);
  const activeOperation = cutting.active?.operation;
  let knifePosition: ConstructionPoint3 | null = null;
  let knifeTangent: ConstructionPoint3 | null = null;
  if (activeOperation?.kind === "CUT") {
    knifePosition = interpolate(activeOperation.from, activeOperation.to, cutting.active!.progress);
    knifeTangent = normalize(subtract(activeOperation.to, activeOperation.from));
  } else if (activeOperation?.kind === "LIFT") {
    const sampled = liftSample(activeOperation, cutting.active!.progress);
    knifePosition = sampled.position;
    knifeTangent = sampled.tangent;
  } else if (choreography.cutSegments.length) {
    const finalCut = choreography.cutSegments[choreography.cutSegments.length - 1];
    knifePosition = finalCut.to;
    knifeTangent = finalCut.tangent;
  }
  const cuttingStarted = progress >= 0.3;
  const kerf = choreography.cutSegments.flatMap((segment) => {
    const completed = cutting.completedCutIds.includes(segment.id);
    const partial =
      activeOperation?.kind === "CUT" && activeOperation.cutId === segment.id
        ? cutting.active!.progress
        : 0;
    const kerfProgress = completed ? 1 : partial;
    return kerfProgress > 0
      ? [{cutId: segment.id, from: segment.from, to: segment.to, progress: kerfProgress}]
      : [];
  });
  const completedCuts = new Set(cutting.completedCutIds);
  const scrapsById = new Map(choreography.foldNet.scraps.map((scrap) => [scrap.id, scrap]));
  const scraps = choreography.order.scrapIds.map((id) =>
    scrapFrame(scrapsById.get(id)!, completedCuts, animation.scrap),
  );
  const pose = foldNetAtProgress(choreography.foldNet, progress);
  const foldComplete = progress >= choreography.foldCompleteAt;
  const creaseById = new Map(choreography.foldNet.creases.map((crease) => [crease.id, crease]));
  const completedCreaseIds = choreography.order.creaseIds.filter((id) => {
    const crease = creaseById.get(id)!;
    return foldNetStepProgress(choreography.foldNet, crease.stepId, progress) >= 1;
  });
  const seamsById = new Map(choreography.foldNet.seams.map((seam) => [seam.id, seam]));
  const seams = choreography.order.seamIds.map((id) =>
    seamFrame(choreography.foldNet, pose, seamsById.get(id)!, foldComplete),
  );
  const tapeReady = seams.length > 0 && seams.every((seam) => seam.ready);
  const tapeProgress = tapeReady ? animation.seal : 0;
  return immutableResult({
    status: "READY",
    progress,
    stage: {
      id: animation.stage as WrapAnimationStage,
      label: animation.label,
      progress: animation.stageProgress,
      checkpointIndex: animation.checkpointIndex,
      checkpointCount: animation.stageCount,
    },
    score,
    trace,
    knife: {
      visible: cuttingStarted && animation.cutting < 1 && choreography.cutOperations.length > 0,
      position: knifePosition,
      tangent: knifeTangent,
    },
    operation: cuttingStarted && cutting.active
      ? cutting.active.operation.kind === "CUT"
        ? {
            id: cutting.active.operation.id,
            kind: "CUT",
            cutId: cutting.active.operation.cutId,
            index: cutting.active.index,
            count: choreography.cutOperations.length,
            progress: cutting.active.progress,
          }
        : {
            id: cutting.active.operation.id,
            kind: "LIFT",
            fromCutId: cutting.active.operation.fromCutId,
            toCutId: cutting.active.operation.toCutId,
            index: cutting.active.index,
            count: choreography.cutOperations.length,
            progress: cutting.active.progress,
          }
      : null,
    lifts: cutting.lifts,
    completedCutIds: cutting.completedCutIds,
    kerf,
    scraps,
    fold: {
      pose,
      diagnostics: pose.diagnostics,
      creaseIds: choreography.order.creaseIds,
      completedCreaseIds,
      steps: choreography.foldNet.steps.map((step) => ({
        id: step.id,
        progress: foldNetStepProgress(choreography.foldNet, step.id, progress),
      })),
      completeAt: choreography.foldCompleteAt,
      complete: foldComplete,
    },
    seams,
    tape: {
      ready: tapeReady,
      visible: tapeReady && tapeProgress > 0,
      progress: tapeProgress,
      seamIds: choreography.order.seamIds,
      centerlines: seams.map((seam) => seam.centerline),
    },
  });
}
