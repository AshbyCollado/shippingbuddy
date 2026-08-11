/**
 * The renderer-independent polygon fold net.
 *
 * This module deliberately has no geometry or Three.js imports.  A FoldNet is
 * the authoritative flat-sheet contract; the rectangle fields on WrapPlan are
 * compatibility projections for older callers only.
 */

export type FoldRole = "PANEL" | "FLAP" | "TAB";
export type FoldNetCoordinateSystem = "flat-sheet-mm";
export type FoldNetMarkKind = "score" | "hinge";
export type FoldNetCutKind =
  | "boundary"
  | "relief"
  | "slot"
  | "seam"
  | "trim"
  | "lock";
/** The six signed package axes used by orientation metadata. */
export type FoldNetSignedAxis = "+L" | "−L" | "+W" | "−W" | "+H" | "−H";

export interface FoldNetVertex {
  readonly id: string;
  readonly xMm: number;
  readonly yMm: number;
}

export interface FoldNetFace {
  readonly id: string;
  /** Existing rectangle id retained while arbitrary polygon faces are supported. */
  readonly sourceRectId?: string;
  readonly role: FoldRole;
  /** Vertex ids are ordered around the face perimeter. */
  readonly vertexIds: readonly string[];
}

export interface FoldNetMark {
  readonly id: string;
  readonly kind: FoldNetMarkKind;
  readonly fromVertexId: string;
  readonly toVertexId: string;
}
export interface FoldNetScore {
  readonly id: string;
  readonly kind: "score";
  readonly fromVertexId: string;
  readonly toVertexId: string;
}

export interface FoldNetCut {
  readonly id: string;
  readonly kind: FoldNetCutKind;
  readonly fromVertexId: string;
  readonly toVertexId: string;
}

export interface FoldNetSeamEdgeReference {
  readonly faceId: string;
  readonly fromVertexId: string;
  readonly toVertexId: string;
}

export interface FoldNetSeam {
  readonly id: string;
  readonly kind: "tape";
  readonly matingEdges: readonly [
    FoldNetSeamEdgeReference,
    FoldNetSeamEdgeReference,
  ];
  readonly expectedGapMm: number;
  readonly toleranceMm: number;
}

export interface FoldNetScrap {
  readonly id: string;
  readonly vertexIds: readonly string[];
  /** Canonical cuts that release this scrap, retained in cut execution order. */
  readonly cutIds: readonly string[];
  /** Compatibility points for the old SVG/scene consumers. */
  readonly points: readonly FoldNetVertex[];
  readonly exitDirection: readonly [number, number];
}

export type FoldStepId = "tabs" | "walls" | "top" | (string & {});

export interface FoldNetStep {
  readonly id: FoldStepId;
  readonly sequence: number;
  readonly start: number;
  readonly end: number;
  readonly label: string;
}

export interface FoldNetCrease {
  readonly id: string;
  readonly fromVertexId: string;
  readonly toVertexId: string;
  readonly parentFaceId: string;
  readonly childFaceId: string;
  readonly kind: FoldNetMarkKind;
  readonly direction: 1 | -1;
  readonly angleRad: number;
  readonly stepId: FoldStepId;
  readonly sequence: number;
}

export interface FoldNetOrientation {
  readonly id: string;
  readonly packageDimensions: {
    readonly lengthMm: number;
    readonly widthMm: number;
    readonly heightMm: number;
  };
  readonly packageAxes: readonly FoldNetSignedAxis[];
  readonly upright: boolean;
}

export interface FoldNetMetadata {
  readonly version: 1;
  readonly coordinateSystem: FoldNetCoordinateSystem;
  readonly units: "mm";
  readonly orientation: FoldNetOrientation;
}

export type FoldNetPlaybookCode =
  | "VERIFY"
  | "SCORE"
  | "CUT"
  | "SCRAP"
  | "FOLD"
  | "SEAL"
  | "REMEASURE";
export interface FoldNetPlaybookStep {
  readonly code: FoldNetPlaybookCode;
  readonly sequence: number;
  readonly label: string;
  readonly scoreIds?: readonly string[];
  readonly cutIds?: readonly string[];
  readonly scrapIds?: readonly string[];
  readonly creaseIds?: readonly string[];
  readonly faceIds?: readonly string[];
  readonly seamIds?: readonly string[];
}

export interface FoldNet {
  readonly metadata: FoldNetMetadata;
  readonly rootFaceId: string;
  readonly vertices: readonly FoldNetVertex[];
  readonly faces: readonly FoldNetFace[];
  readonly scores: readonly FoldNetScore[];
  readonly cuts: readonly FoldNetCut[];
  readonly scraps: readonly FoldNetScrap[];
  readonly seams: readonly FoldNetSeam[];
  /** Creases form a deterministic spanning tree rooted at rootFaceId. */
  readonly creases: readonly FoldNetCrease[];
  /** Pose timeline retained for existing animation consumers. */
  readonly steps: readonly FoldNetStep[];
  readonly playbook: readonly FoldNetPlaybookStep[];
}
export type CanonicalFoldNet = FoldNet;
/** Loose boundary used only when validating malformed external data. */
export type FoldNetCandidate = Partial<FoldNet> &
  Pick<FoldNet, "rootFaceId" | "vertices" | "faces" | "creases" | "steps">;

export interface FoldNetVector3 {
  readonly xMm: number;
  readonly yMm: number;
  readonly zMm: number;
}
export interface FoldNetTransform {
  readonly origin: FoldNetVector3;
  readonly xAxis: FoldNetVector3;
  readonly yAxis: FoldNetVector3;
  readonly zAxis: FoldNetVector3;
}
export interface FoldFacePose {
  readonly faceId: string;
  readonly transform: FoldNetTransform;
  readonly vertices: readonly FoldNetVector3[];
}

export interface FoldNetDiagnostics {
  readonly connected: boolean;
  readonly detachedFaceIds: readonly string[];
  readonly maxHingeGapMm: number;
  readonly maxEdgeStretchMm: number;
  readonly nonFiniteValues: boolean;
  readonly missingVertexIds: readonly string[];
  readonly creaseTearIds: readonly string[];
  readonly inversionFaceIds: readonly string[];
  readonly collisionPairs: readonly string[];
}
export interface FoldNetPose {
  readonly progress: number;
  readonly faces: readonly FoldFacePose[];
  readonly diagnostics: FoldNetDiagnostics;
}

export interface FoldNetValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly duplicateIds: readonly string[];
  readonly missingVertexIds: readonly string[];
  readonly missingFaceIds: readonly string[];
  readonly nonFiniteVertexIds: readonly string[];
  readonly nonSimpleFaceIds: readonly string[];
  readonly degenerateFaceIds: readonly string[];
  readonly invalidScoreKindIds: readonly string[];
  readonly missingMarkIds: readonly string[];
  readonly zeroLengthMarkIds: readonly string[];
  readonly missingCutIds: readonly string[];
  readonly zeroLengthCutIds: readonly string[];
  readonly missingScrapIds: readonly string[];
  readonly invalidScrapIds: readonly string[];
  readonly invalidScrapCutIds: readonly string[];
  readonly missingSeamEndpointIds: readonly string[];
  readonly seamEndpointNotOnFaceIds: readonly string[];
  readonly invalidSeamIds: readonly string[];
  readonly missingCreaseEndpointIds: readonly string[];
  readonly creaseEndpointNotOnFaceIds: readonly string[];
  readonly connected: boolean;
  readonly acyclic: boolean;
  readonly diagnosticCodes: readonly FoldNetDiagnosticCode[];
}

export type FoldNetDiagnosticCode =
  | "MISSING_METADATA"
  | "UNSUPPORTED_VERSION"
  | "INVALID_COORDINATE_SYSTEM"
  | "EMPTY_ID"
  | "DUPLICATE_ID"
  | "MISSING_VERTEX"
  | "NONFINITE_VERTEX"
  | "DEGENERATE_FACE"
  | "NON_SIMPLE_FACE"
  | "INVALID_SCORE_KIND"
  | "MISSING_ROOT"
  | "MISSING_MARK_ENDPOINT"
  | "ZERO_LENGTH_MARK"
  | "MISSING_CUT_ENDPOINT"
  | "ZERO_LENGTH_CUT"
  | "MISSING_SCRAP_ENDPOINT"
  | "INVALID_SCRAP"
  | "INVALID_SCRAP_CUT_REFERENCE"
  | "MISSING_SEAM_ENDPOINT"
  | "SEAM_ENDPOINT_NOT_ON_FACE"
  | "INVALID_SEAM"
  | "MISSING_CREASE_ENDPOINT"
  | "CREASE_ENDPOINT_NOT_ON_FACE"
  | "DISCONNECTED"
  | "CYCLE"
  | "INVALID_PLAYBOOK_REFERENCE"
  | "TRIANGULATION_FAILED";

export interface FoldNetTriangle {
  readonly faceId: string;
  readonly vertexIds: readonly [string, string, string];
}
export interface FoldNetTriangulation {
  readonly triangles: readonly FoldNetTriangle[];
  readonly diagnostics: {
    readonly faceIds: readonly string[];
    readonly errors: readonly string[];
    readonly codes: readonly FoldNetDiagnosticCode[];
  };
}

export const DEFAULT_FOLD_NET_STEPS: readonly FoldNetStep[] = freeze([
  {
    id: "tabs",
    sequence: 0,
    start: 0.44,
    end: 0.54,
    label: "Fold the joining tabs",
  },
  {
    id: "walls",
    sequence: 1,
    start: 0.54,
    end: 0.72,
    label: "Raise the side walls",
  },
  {
    id: "top",
    sequence: 2,
    start: 0.72,
    end: 0.9,
    label: "Close the top flaps",
  },
]);

interface Point2D {
  xMm: number;
  yMm: number;
}
interface RectInput {
  id: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  role: FoldRole;
}
interface LineInput {
  id: string;
  from: Point2D;
  to: Point2D;
  kind?: FoldNetCutKind;
}
interface ScrapInput {
  id: string;
  points: readonly Point2D[];
  exitDirection?: readonly [number, number];
}
interface SeamPointEdgeReference {
  readonly faceId: string;
  readonly from: Point2D;
  readonly to: Point2D;
}
export interface FoldNetSeamInput {
  readonly id: string;
  readonly kind: "tape";
  readonly matingEdges: readonly [
    SeamPointEdgeReference,
    SeamPointEdgeReference,
  ];
  readonly expectedGapMm: number;
  readonly toleranceMm: number;
}
export interface FoldNetRectangleInput {
  readonly rectangles: readonly RectInput[];
  readonly scores?: readonly LineInput[];
  readonly cuts?: readonly LineInput[];
  readonly scrapRegions?: readonly ScrapInput[];
  readonly seams?: readonly FoldNetSeamInput[];
  readonly orientation: FoldNetOrientation;
  readonly steps?: readonly FoldNetStep[];
  readonly playbook?: readonly FoldNetPlaybookStep[];
}

const EPSILON_MM = 0.000001;
const HALF_PI = Math.PI / 2;

function freeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>))
    freeze(child);
  return value;
}
function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
function pointKey(point: Point2D) {
  return `${point.xMm.toFixed(6)},${point.yMm.toFixed(6)}`;
}
function vector(xMm: number, yMm: number, zMm = 0): FoldNetVector3 {
  return { xMm, yMm, zMm };
}
function add(a: FoldNetVector3, b: FoldNetVector3): FoldNetVector3 {
  return vector(a.xMm + b.xMm, a.yMm + b.yMm, a.zMm + b.zMm);
}
function subtract(a: FoldNetVector3, b: FoldNetVector3): FoldNetVector3 {
  return vector(a.xMm - b.xMm, a.yMm - b.yMm, a.zMm - b.zMm);
}
function scale(a: FoldNetVector3, amount: number): FoldNetVector3 {
  return vector(a.xMm * amount, a.yMm * amount, a.zMm * amount);
}
function dot(a: FoldNetVector3, b: FoldNetVector3) {
  return a.xMm * b.xMm + a.yMm * b.yMm + a.zMm * b.zMm;
}
function cross(a: FoldNetVector3, b: FoldNetVector3): FoldNetVector3 {
  return vector(
    a.yMm * b.zMm - a.zMm * b.yMm,
    a.zMm * b.xMm - a.xMm * b.zMm,
    a.xMm * b.yMm - a.yMm * b.xMm,
  );
}
function length(a: FoldNetVector3) {
  return Math.hypot(a.xMm, a.yMm, a.zMm);
}
function normalize(a: FoldNetVector3): FoldNetVector3 {
  const magnitude = length(a);
  return magnitude <= EPSILON_MM ? vector(0, 0, 1) : scale(a, 1 / magnitude);
}
function distance(a: FoldNetVector3, b: FoldNetVector3) {
  return length(subtract(a, b));
}
function rotateAroundAxis(
  point: FoldNetVector3,
  axisOrigin: FoldNetVector3,
  axis: FoldNetVector3,
  angle: number,
): FoldNetVector3 {
  const relative = subtract(point, axisOrigin);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(
    axisOrigin,
    add(
      add(scale(relative, cosine), scale(cross(axis, relative), sine)),
      scale(axis, dot(axis, relative) * (1 - cosine)),
    ),
  );
}
interface MutableTransform {
  origin: FoldNetVector3;
  xAxis: FoldNetVector3;
  yAxis: FoldNetVector3;
  zAxis: FoldNetVector3;
}
function identityTransform(): MutableTransform {
  return {
    origin: vector(0, 0, 0),
    xAxis: vector(1, 0, 0),
    yAxis: vector(0, 1, 0),
    zAxis: vector(0, 0, 1),
  };
}
function applyTransform(
  transform: MutableTransform,
  point: FoldNetVector3,
): FoldNetVector3 {
  return add(
    transform.origin,
    add(
      add(scale(transform.xAxis, point.xMm), scale(transform.yAxis, point.yMm)),
      scale(transform.zAxis, point.zMm),
    ),
  );
}
function rotateTransform(
  transform: MutableTransform,
  axisOrigin: FoldNetVector3,
  axis: FoldNetVector3,
  angle: number,
): MutableTransform {
  return {
    origin: rotateAroundAxis(transform.origin, axisOrigin, axis, angle),
    xAxis: rotateAroundAxis(transform.xAxis, vector(0, 0, 0), axis, angle),
    yAxis: rotateAroundAxis(transform.yAxis, vector(0, 0, 0), axis, angle),
    zAxis: rotateAroundAxis(transform.zAxis, vector(0, 0, 0), axis, angle),
  };
}
function rectPoints(rectangle: RectInput): Point2D[] {
  const x = Math.min(rectangle.xMm, rectangle.xMm + rectangle.widthMm);
  const y = Math.min(rectangle.yMm, rectangle.yMm + rectangle.heightMm);
  return [
    { xMm: x, yMm: y },
    { xMm: x + Math.abs(rectangle.widthMm), yMm: y },
    {
      xMm: x + Math.abs(rectangle.widthMm),
      yMm: y + Math.abs(rectangle.heightMm),
    },
    { xMm: x, yMm: y + Math.abs(rectangle.heightMm) },
  ];
}
function polygonCentroid(
  face: FoldNetFace,
  vertices: Map<string, FoldNetVertex>,
): Point2D {
  const points = face.vertexIds
    .map((id) => vertices.get(id))
    .filter((point): point is FoldNetVertex => Boolean(point));
  return points.length
    ? {
        xMm: points.reduce((sum, point) => sum + point.xMm, 0) / points.length,
        yMm: points.reduce((sum, point) => sum + point.yMm, 0) / points.length,
      }
    : { xMm: 0, yMm: 0 };
}
interface Boundary {
  faceId: string;
  from: FoldNetVertex;
  to: FoldNetVertex;
}
function collinearOverlap(
  first: Boundary,
  second: Boundary,
): { from: Point2D; to: Point2D } | undefined {
  const a = vector(first.from.xMm, first.from.yMm);
  const b = vector(first.to.xMm, first.to.yMm);
  const c = vector(second.from.xMm, second.from.yMm);
  const d = vector(second.to.xMm, second.to.yMm);
  const axis = subtract(b, a);
  const axisLength = length(axis);
  if (
    axisLength <= EPSILON_MM ||
    Math.abs(cross(axis, subtract(c, a)).zMm) >
      EPSILON_MM * Math.max(1, axisLength) ||
    Math.abs(cross(axis, subtract(d, a)).zMm) >
      EPSILON_MM * Math.max(1, axisLength)
  )
    return undefined;
  const denominator = dot(axis, axis);
  const t1 = dot(subtract(c, a), axis) / denominator;
  const t2 = dot(subtract(d, a), axis) / denominator;
  const start = Math.max(0, Math.min(t1, t2));
  const end = Math.min(1, Math.max(t1, t2));
  return end - start > EPSILON_MM / axisLength
    ? {
        from: { xMm: a.xMm + axis.xMm * start, yMm: a.yMm + axis.yMm * start },
        to: { xMm: a.xMm + axis.xMm * end, yMm: a.yMm + axis.yMm * end },
      }
    : undefined;
}
function segmentOverlap(
  first: Point2D,
  second: Point2D,
  candidateFirst: Point2D,
  candidateSecond: Point2D,
) {
  return collinearOverlap(
    { faceId: "", from: { id: "", ...first }, to: { id: "", ...second } },
    {
      faceId: "",
      from: { id: "", ...candidateFirst },
      to: { id: "", ...candidateSecond },
    },
  );
}
function insertPoint(
  faceVertexIds: Map<string, string[]>,
  faceId: string,
  point: Point2D,
  vertexId: string,
  vertices: Map<string, FoldNetVertex>,
) {
  const ids = faceVertexIds.get(faceId);
  if (!ids || ids.includes(vertexId)) return;
  for (let index = 0; index < ids.length; index += 1) {
    const from = vertices.get(ids[index]);
    const to = vertices.get(ids[(index + 1) % ids.length]);
    if (!from || !to) continue;
    const edge = vector(to.xMm - from.xMm, to.yMm - from.yMm);
    const relative = vector(point.xMm - from.xMm, point.yMm - from.yMm);
    const edgeLengthSquared = dot(edge, edge);
    if (edgeLengthSquared <= EPSILON_MM * EPSILON_MM) continue;
    const along = dot(relative, edge) / edgeLengthSquared;
    if (
      Math.abs(cross(edge, relative).zMm) <=
        EPSILON_MM * Math.max(1, length(edge)) &&
      along > EPSILON_MM &&
      along < 1 - EPSILON_MM
    ) {
      ids.splice(index + 1, 0, vertexId);
      return;
    }
  }
}
function foldStepForFace(face: FoldNetFace): FoldStepId {
  return face.role === "TAB" ? "tabs" : face.role === "FLAP" ? "top" : "walls";
}
function faceRoleRank(role: FoldRole) {
  return role === "PANEL" ? 0 : role === "FLAP" ? 1 : 2;
}
function inferCutKind(id: string): FoldNetCutKind {
  const normalized = id.toLowerCase();
  if (normalized.includes("relief")) return "relief";
  if (normalized.includes("slot")) return "slot";
  if (normalized.includes("lock")) return "lock";
  if (normalized.includes("seam")) return "seam";
  if (normalized.includes("trim")) return "trim";
  return "boundary";
}
export function foldNetStepProgress(
  net: FoldNet,
  stepId: FoldStepId,
  progress: number,
) {
  const step = net.steps.find((candidate) => candidate.id === stepId);
  if (!step) return 0;
  const local =
    step.end <= step.start
      ? progress >= step.end
        ? 1
        : 0
      : clamp((progress - step.start) / (step.end - step.start));
  return local * local * (3 - 2 * local);
}
function creaseAngle(net: FoldNet, crease: FoldNetCrease, progress: number) {
  return (
    crease.direction *
    crease.angleRad *
    foldNetStepProgress(net, crease.stepId, progress)
  );
}
function worldPointForVertex(
  transform: MutableTransform,
  vertex: FoldNetVertex,
): FoldNetVector3 {
  return applyTransform(transform, vector(vertex.xMm, vertex.yMm, 0));
}
function transformForChild(
  parent: MutableTransform,
  crease: FoldNetCrease,
  vertices: Map<string, FoldNetVertex>,
  angle: number,
): MutableTransform {
  const from = vertices.get(crease.fromVertexId);
  const to = vertices.get(crease.toVertexId);
  if (!from || !to) return parent;
  const origin = worldPointForVertex(parent, from);
  const end = worldPointForVertex(parent, to);
  return rotateTransform(
    parent,
    origin,
    normalize(subtract(end, origin)),
    angle,
  );
}

function pointInBounds(point: Point2D, first: Point2D, second: Point2D) {
  return (
    point.xMm >= Math.min(first.xMm, second.xMm) - EPSILON_MM &&
    point.xMm <= Math.max(first.xMm, second.xMm) + EPSILON_MM &&
    point.yMm >= Math.min(first.yMm, second.yMm) - EPSILON_MM &&
    point.yMm <= Math.max(first.yMm, second.yMm) + EPSILON_MM
  );
}
function signedArea(points: readonly Point2D[]) {
  return (
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.xMm * next.yMm - next.xMm * point.yMm;
    }, 0) / 2
  );
}
function segmentsIntersect(a: Point2D, b: Point2D, c: Point2D, d: Point2D) {
  const orient = (p: Point2D, q: Point2D, r: Point2D) =>
    (q.xMm - p.xMm) * (r.yMm - p.yMm) - (q.yMm - p.yMm) * (r.xMm - p.xMm);
  const ab = orient(a, b, c);
  const ab2 = orient(a, b, d);
  const cd = orient(c, d, a);
  const cd2 = orient(c, d, b);
  if (Math.abs(ab) <= EPSILON_MM && pointInBounds(c, a, b)) return true;
  if (Math.abs(ab2) <= EPSILON_MM && pointInBounds(d, a, b)) return true;
  if (Math.abs(cd) <= EPSILON_MM && pointInBounds(a, c, d)) return true;
  if (Math.abs(cd2) <= EPSILON_MM && pointInBounds(b, c, d)) return true;
  return ab > 0 !== ab2 > 0 && cd > 0 !== cd2 > 0;
}
function pointInTriangle(point: Point2D, a: Point2D, b: Point2D, c: Point2D) {
  const crossValue = (first: Point2D, second: Point2D, third: Point2D) =>
    (second.xMm - first.xMm) * (third.yMm - first.yMm) -
    (second.yMm - first.yMm) * (third.xMm - first.xMm);
  const first = crossValue(a, b, point);
  const second = crossValue(b, c, point);
  const third = crossValue(c, a, point);
  return (
    (first >= -EPSILON_MM && second >= -EPSILON_MM && third >= -EPSILON_MM) ||
    (first <= EPSILON_MM && second <= EPSILON_MM && third <= EPSILON_MM)
  );
}

/** Deterministically convert rectangles/marks into the immutable canonical net. */
export function foldNetFromRectangles(
  input: FoldNetRectangleInput,
): CanonicalFoldNet {
  if (!input.orientation)
    throw new Error(
      "foldNetFromRectangles requires an explicit orientation.",
    );
  const vertices: FoldNetVertex[] = [];
  const vertexByKey = new Map<string, FoldNetVertex>();
  const vertexForPoint = (point: Point2D) => {
    const key = pointKey(point);
    const existing = vertexByKey.get(key);
    if (existing) return existing;
    const created = {
      id: `v-${vertices.length + 1}`,
      xMm: point.xMm,
      yMm: point.yMm,
    };
    vertices.push(created);
    vertexByKey.set(key, created);
    return created;
  };
  const faces: FoldNetFace[] = [];
  const faceVertexIds = new Map<string, string[]>();
  input.rectangles.forEach((rectangle) => {
    const vertexIds = rectPoints(rectangle)
      .map(vertexForPoint)
      .map((vertex) => vertex.id);
    faceVertexIds.set(rectangle.id, vertexIds);
    faces.push({
      id: rectangle.id,
      sourceRectId: rectangle.id,
      role: rectangle.role,
      vertexIds,
    });
  });
  const vertexById = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const boundaries: Boundary[] = [];
  faces.forEach((face) =>
    face.vertexIds.forEach((fromId, index) => {
      const from = vertexById.get(fromId);
      const to = vertexById.get(
        face.vertexIds[(index + 1) % face.vertexIds.length],
      );
      if (from && to) boundaries.push({ faceId: face.id, from, to });
    }),
  );
  const candidate: Array<{
    a: string;
    b: string;
    fromVertexId: string;
    toVertexId: string;
    from: Point2D;
    to: Point2D;
    kind: FoldNetMarkKind;
  }> = [];
  const candidateKeys = new Set<string>();
  for (let firstIndex = 0; firstIndex < boundaries.length; firstIndex += 1)
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < boundaries.length;
      secondIndex += 1
    ) {
      const first = boundaries[firstIndex];
      const second = boundaries[secondIndex];
      if (first.faceId === second.faceId) continue;
      const overlap = collinearOverlap(first, second);
      if (!overlap) continue;
      const from = vertexForPoint(overlap.from);
      const to = vertexForPoint(overlap.to);
      vertexById.set(from.id, from);
      vertexById.set(to.id, to);
      insertPoint(
        faceVertexIds,
        first.faceId,
        overlap.from,
        from.id,
        vertexById,
      );
      insertPoint(faceVertexIds, first.faceId, overlap.to, to.id, vertexById);
      insertPoint(
        faceVertexIds,
        second.faceId,
        overlap.from,
        from.id,
        vertexById,
      );
      insertPoint(faceVertexIds, second.faceId, overlap.to, to.id, vertexById);
      const key = `${[first.faceId, second.faceId].sort().join("~")}:${[from.id, to.id].sort().join("~")}`;
      if (candidateKeys.has(key)) continue;
      candidateKeys.add(key);
      const kind = input.scores?.some((score) =>
        Boolean(segmentOverlap(overlap.from, overlap.to, score.from, score.to)),
      )
        ? "score"
        : "hinge";
      candidate.push({
        a: first.faceId,
        b: second.faceId,
        fromVertexId: from.id,
        toVertexId: to.id,
        from: overlap.from,
        to: overlap.to,
        kind,
      });
    }
  candidate.sort((left, right) =>
    `${[left.a, left.b].sort().join("~")}:${pointKey(left.from)}:${pointKey(left.to)}`.localeCompare(
      `${[right.a, right.b].sort().join("~")}:${pointKey(right.from)}:${pointKey(right.to)}`,
    ),
  );
  const seamEdgeForInput = (
    edge: SeamPointEdgeReference,
  ): FoldNetSeamEdgeReference => {
    const from = vertexForPoint(edge.from);
    const to = vertexForPoint(edge.to);
    vertexById.set(from.id, from);
    vertexById.set(to.id, to);
    insertPoint(faceVertexIds, edge.faceId, edge.from, from.id, vertexById);
    insertPoint(faceVertexIds, edge.faceId, edge.to, to.id, vertexById);
    return {
      faceId: edge.faceId,
      fromVertexId: from.id,
      toVertexId: to.id,
    };
  };
  const seams = (input.seams ?? []).map((seam): FoldNetSeam => ({
    id: seam.id,
    kind: seam.kind,
    matingEdges: [
      seamEdgeForInput(seam.matingEdges[0]),
      seamEdgeForInput(seam.matingEdges[1]),
    ],
    expectedGapMm: seam.expectedGapMm,
    toleranceMm: seam.toleranceMm,
  }));
  const finalizedFaces = faces.map((face) => ({
    ...face,
    vertexIds: [...(faceVertexIds.get(face.id) ?? face.vertexIds)],
  }));
  const faceById = new Map(finalizedFaces.map((face) => [face.id, face]));
  const byFace = new Map<string, typeof candidate>();
  candidate.forEach((item) =>
    [item.a, item.b].forEach((faceId) =>
      byFace.set(faceId, [...(byFace.get(faceId) ?? []), item]),
    ),
  );
  const rootFaceId = faceById.has("bottom")
    ? "bottom"
    : (finalizedFaces[0]?.id ?? "");
  const visited = new Set(rootFaceId ? [rootFaceId] : []);
  const queue = rootFaceId ? [rootFaceId] : [];
  const creases: FoldNetCrease[] = [];
  let sequence = 0;
  while (queue.length) {
    const parentFaceId = queue.shift()!;
    const parent = faceById.get(parentFaceId);
    if (!parent) continue;
    const adjacent = [...(byFace.get(parentFaceId) ?? [])].sort(
      (left, right) => {
        const leftId = left.a === parentFaceId ? left.b : left.a;
        const rightId = right.a === parentFaceId ? right.b : right.a;
        return (
          faceRoleRank(faceById.get(leftId)?.role ?? "TAB") -
            faceRoleRank(faceById.get(rightId)?.role ?? "TAB") ||
          leftId.localeCompare(rightId) ||
          pointKey(left.from).localeCompare(pointKey(right.from))
        );
      },
    );
    adjacent.forEach((item) => {
      const childFaceId = item.a === parentFaceId ? item.b : item.a;
      if (visited.has(childFaceId) || !faceById.has(childFaceId)) return;
      visited.add(childFaceId);
      queue.push(childFaceId);
      const centroid = polygonCentroid(faceById.get(childFaceId)!, vertexById);
      const edge = vector(
        item.to.xMm - item.from.xMm,
        item.to.yMm - item.from.yMm,
      );
      const side =
        edge.xMm * (centroid.yMm - item.from.yMm) -
        edge.yMm * (centroid.xMm - item.from.xMm);
      creases.push({
        id: `crease-${sequence + 1}`,
        fromVertexId: item.fromVertexId,
        toVertexId: item.toVertexId,
        parentFaceId,
        childFaceId,
        kind: item.kind,
        direction: side >= 0 ? 1 : -1,
        angleRad: HALF_PI,
        stepId: foldStepForFace(faceById.get(childFaceId)!),
        sequence,
      });
      sequence += 1;
    });
  }
  const makeMark = (item: LineInput): FoldNetScore => {
    const from = vertexForPoint(item.from);
    const to = vertexForPoint(item.to);
    return {
      id: item.id,
      kind: "score",
      fromVertexId: from.id,
      toVertexId: to.id,
    };
  };
  const scores = (input.scores ?? []).map((item) => makeMark(item));
  const cuts = (input.cuts ?? []).map((item) => {
    const from = vertexForPoint(item.from);
    const to = vertexForPoint(item.to);
    vertexById.set(from.id, from);
    vertexById.set(to.id, to);
    return {
      id: item.id,
      kind: item.kind ?? inferCutKind(item.id),
      fromVertexId: from.id,
      toVertexId: to.id,
    };
  });
  const facePoints = finalizedFaces.flatMap((face) =>
    face.vertexIds
      .map((id) => vertexById.get(id))
      .filter((point): point is FoldNetVertex => Boolean(point)),
  );
  const faceMinX = Math.min(...facePoints.map((point) => point.xMm));
  const faceMaxX = Math.max(...facePoints.map((point) => point.xMm));
  const faceMinY = Math.min(...facePoints.map((point) => point.yMm));
  const faceMaxY = Math.max(...facePoints.map((point) => point.yMm));
  const scraps = (input.scrapRegions ?? []).map((region) => {
    const points = region.points.map(vertexForPoint);
    const center = points.reduce(
      (sum, point) => ({
        xMm: sum.xMm + point.xMm / points.length,
        yMm: sum.yMm + point.yMm / points.length,
      }),
      { xMm: 0, yMm: 0 },
    );
    const derivedDirection: [number, number] = [
      center.xMm < faceMinX ? -1 : center.xMm > faceMaxX ? 1 : 0,
      center.yMm < faceMinY ? -1 : center.yMm > faceMaxY ? 1 : 0,
    ];
    const rawDirection = region.exitDirection ?? derivedDirection;
    const magnitude = Math.hypot(rawDirection[0], rawDirection[1]);
    const exitDirection: [number, number] =
      magnitude > EPSILON_MM
        ? [rawDirection[0] / magnitude, rawDirection[1] / magnitude]
        : [0, 0];
    return {
      id: region.id,
      vertexIds: points.map((point) => point.id),
      cutIds: cuts
        .filter((cut) => {
          const cutFrom = vertexById.get(cut.fromVertexId);
          const cutTo = vertexById.get(cut.toVertexId);
          if (!cutFrom || !cutTo) return false;
          return points.some((point, index) => {
            const next = points[(index + 1) % points.length];
            return Boolean(segmentOverlap(cutFrom, cutTo, point, next));
          });
        })
        .map((cut) => cut.id),
      points,
      exitDirection,
    };
  });
  const orientation = {
    id: input.orientation.id,
    packageDimensions: { ...input.orientation.packageDimensions },
    packageAxes: [...input.orientation.packageAxes],
    upright: input.orientation.upright,
  };
  const playbook = input.playbook
    ? [...input.playbook]
    : [
        {
          code: "VERIFY" as const,
          sequence: 0,
          label: "Verify the blank, grain, and dimensions.",
          faceIds: finalizedFaces.map((face) => face.id),
        },
        {
          code: "SCORE" as const,
          sequence: 1,
          label: "Score the marked fold lines.",
          scoreIds: scores.map((score) => score.id),
        },
        {
          code: "CUT" as const,
          sequence: 2,
          label: "Cut the marked cut lines.",
          cutIds: cuts.map((cut) => cut.id),
        },
        {
          code: "SCRAP" as const,
          sequence: 3,
          label: "Remove the marked scrap.",
          scrapIds: scraps.map((scrap) => scrap.id),
        },
        {
          code: "FOLD" as const,
          sequence: 4,
          label: "Fold the walls and flaps in order.",
          creaseIds: creases.map((crease) => crease.id),
        },
        {
          code: "SEAL" as const,
          sequence: 5,
          label: "Tape the generated mating seam.",
          seamIds: seams.map((seam) => seam.id),
        },
        {
          code: "REMEASURE" as const,
          sequence: 6,
          label: "Remeasure the finished inside.",
        },
      ];
  const metadata: FoldNetMetadata = {
    version: 1,
    coordinateSystem: "flat-sheet-mm",
    units: "mm",
    orientation,
  };
  return freeze({
    metadata,
    rootFaceId,
    vertices,
    faces: finalizedFaces,
    scores,
    cuts,
    scraps,
    seams,
    creases,
    steps: [...(input.steps ?? DEFAULT_FOLD_NET_STEPS)],
    playbook,
  });
}

type LegacyWrapPlanInput = Omit<FoldNetRectangleInput, "orientation"> & {
  orientation: FoldNetOrientation;
  packedEnvelope?: unknown;
  foldNet?: never;
};
/** Compatibility alias; existing canonical plans are returned unchanged. */
export function foldNetFromWrapPlan(
  plan: { readonly foldNet: FoldNet } | LegacyWrapPlanInput,
  steps: readonly FoldNetStep[] = DEFAULT_FOLD_NET_STEPS,
): FoldNet {
  if (plan.foldNet) return plan.foldNet;
  const packedOrientation =
    typeof plan.packedEnvelope === "object" &&
    plan.packedEnvelope !== null &&
    "orientation" in plan.packedEnvelope
      ? (plan.packedEnvelope as { orientation?: FoldNetOrientation })
          .orientation
      : undefined;
  const orientation = plan.orientation ?? packedOrientation;
  if (!orientation)
    throw new Error(
      "foldNetFromWrapPlan requires an explicit orientation for legacy rectangle input.",
    );
  return foldNetFromRectangles({
    rectangles: plan.rectangles,
    scores: plan.scores,
    cuts: plan.cuts,
    scrapRegions: plan.scrapRegions,
    seams: plan.seams,
    orientation,
    steps: steps ?? DEFAULT_FOLD_NET_STEPS,
  });
}

export function foldNetToRectangles(net: FoldNet): RectInput[] {
  const vertices = new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
  return net.faces.map((face) => {
    const points = face.vertexIds.map((id) => vertices.get(id));
    if (points.some((point) => !point) || points.length < 4)
      throw new Error(`FoldNet face ${face.id} cannot project to a rectangle.`);
    const defined = points as FoldNetVertex[];
    const corners = defined.filter((point, index) => {
      const previous = defined[(index + defined.length - 1) % defined.length];
      const next = defined[(index + 1) % defined.length];
      const first = {
        xMm: point.xMm - previous.xMm,
        yMm: point.yMm - previous.yMm,
      };
      const second = { xMm: next.xMm - point.xMm, yMm: next.yMm - point.yMm };
      return (
        Math.abs(first.xMm * second.yMm - first.yMm * second.xMm) > EPSILON_MM
      );
    });
    const xs = defined.map((point) => point.xMm);
    const ys = defined.map((point) => point.yMm);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const axisAligned = defined.every((point, index) => {
      const next = defined[(index + 1) % defined.length];
      return (
        Math.abs(point.xMm - next.xMm) <= EPSILON_MM ||
        Math.abs(point.yMm - next.yMm) <= EPSILON_MM
      );
    });
    const onBounds = defined.every(
      (point) =>
        Math.abs(point.xMm - minX) <= EPSILON_MM ||
        Math.abs(point.xMm - maxX) <= EPSILON_MM ||
        Math.abs(point.yMm - minY) <= EPSILON_MM ||
        Math.abs(point.yMm - maxY) <= EPSILON_MM,
    );
    if (
      !axisAligned ||
      !onBounds ||
      corners.length !== 4 ||
      Math.abs(
        Math.abs(faceArea(face, vertices)) - (maxX - minX) * (maxY - minY),
      ) > EPSILON_MM
    )
      throw new Error(
        `FoldNet face ${face.id} is not an axis-aligned rectangle.`,
      );
    return {
      id: face.sourceRectId ?? face.id,
      xMm: minX,
      yMm: minY,
      widthMm: maxX - minX,
      heightMm: maxY - minY,
      role: face.role,
    };
  });
}
export function foldNetToScores(
  net: FoldNet,
): Array<{ id: string; from: Point2D; to: Point2D }> {
  const vertices = new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
  return net.scores.map((mark) => {
    const from = vertices.get(mark.fromVertexId);
    const to = vertices.get(mark.toVertexId);
    if (!from || !to)
      throw new Error(`FoldNet score ${mark.id} references a missing vertex.`);
    return {
      id: mark.id,
      from: { xMm: from.xMm, yMm: from.yMm },
      to: { xMm: to.xMm, yMm: to.yMm },
    };
  });
}
export function foldNetToCuts(
  net: FoldNet,
): Array<{ id: string; from: Point2D; to: Point2D; kind: FoldNetCutKind }> {
  const vertices = new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
  return net.cuts.map((cut) => {
    const from = vertices.get(cut.fromVertexId);
    const to = vertices.get(cut.toVertexId);
    if (!from || !to)
      throw new Error(`FoldNet cut ${cut.id} references a missing vertex.`);
    return {
      id: cut.id,
      kind: cut.kind,
      from: { xMm: from.xMm, yMm: from.yMm },
      to: { xMm: to.xMm, yMm: to.yMm },
    };
  });
}
export function foldNetToScrapRegions(net: FoldNet): ScrapInput[] {
  const vertices = new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
  return net.scraps.map((scrap) => ({
    id: scrap.id,
    exitDirection: scrap.exitDirection,
    points: scrap.vertexIds.map((id) => {
      const vertex = vertices.get(id);
      if (!vertex)
        throw new Error(
          `FoldNet scrap ${scrap.id} references a missing vertex.`,
        );
      return { xMm: vertex.xMm, yMm: vertex.yMm };
    }),
  }));
}

function duplicateIds(items: readonly string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  items.forEach((id) => (seen.has(id) ? duplicates.add(id) : seen.add(id)));
  return [...duplicates].sort();
}
function faceArea(face: FoldNetFace, vertices: Map<string, FoldNetVertex>) {
  const points = face.vertexIds.map((id) => vertices.get(id));
  return points.some((point) => !point)
    ? 0
    : signedArea(points as FoldNetVertex[]);
}
function seamReferenceLiesOnFaceEdge(
  first: FoldNetVertex,
  second: FoldNetVertex,
  face: FoldNetFace,
  vertices: Map<string, FoldNetVertex>,
) {
  return face.vertexIds.some((fromId, index) => {
    const from = vertices.get(fromId);
    const to = vertices.get(face.vertexIds[(index + 1) % face.vertexIds.length]);
    if (!from || !to) return false;
    const edge = vector(to.xMm - from.xMm, to.yMm - from.yMm);
    const firstRelative = vector(first.xMm - from.xMm, first.yMm - from.yMm);
    const secondRelative = vector(second.xMm - from.xMm, second.yMm - from.yMm);
    return (
      Math.abs(cross(edge, firstRelative).zMm) <=
        EPSILON_MM * Math.max(1, length(edge)) &&
      Math.abs(cross(edge, secondRelative).zMm) <=
        EPSILON_MM * Math.max(1, length(edge)) &&
      pointInBounds(first, from, to) &&
      pointInBounds(second, from, to)
    );
  });
}
function graphValidation(net: FoldNetCandidate) {
  const faceIds = net.faces.map((face) => face.id);
  const vertexIds = net.vertices.map((vertex) => vertex.id);
  const faceSet = new Set(faceIds);
  const vertexSet = new Set(vertexIds);
  const missingVertexIds = new Set<string>();
  const missingFaceIds = new Set<string>();
  net.faces.forEach((face) =>
    face.vertexIds.forEach((id) => {
      if (!vertexSet.has(id)) missingVertexIds.add(id);
    }),
  );
  const missingCreaseEndpointIds = new Set<string>();
  const creaseEndpointNotOnFaceIds = new Set<string>();
  net.creases.forEach((crease) => {
    const missing =
      !vertexSet.has(crease.fromVertexId) ||
      !vertexSet.has(crease.toVertexId) ||
      !faceSet.has(crease.parentFaceId) ||
      !faceSet.has(crease.childFaceId);
    if (!vertexSet.has(crease.fromVertexId))
      missingVertexIds.add(crease.fromVertexId);
    if (!vertexSet.has(crease.toVertexId))
      missingVertexIds.add(crease.toVertexId);
    if (!faceSet.has(crease.parentFaceId))
      missingFaceIds.add(crease.parentFaceId);
    if (!faceSet.has(crease.childFaceId))
      missingFaceIds.add(crease.childFaceId);
    if (missing) missingCreaseEndpointIds.add(crease.id);
  });
  const marks = net.scores ?? [];
  const invalidScoreKindIds = new Set<string>();
  const missingMarkIds = new Set<string>();
  const zeroLengthMarkIds = new Set<string>();
  const missingCutIds = new Set<string>();
  const zeroLengthCutIds = new Set<string>();
  const missingScrapIds = new Set<string>();
  const invalidScrapIds = new Set<string>();
  const invalidScrapCutIds = new Set<string>();
  const missingSeamEndpointIds = new Set<string>();
  const seamEndpointNotOnFaceIds = new Set<string>();
  const invalidSeamIds = new Set<string>();
  const nonFiniteVertexIds = net.vertices
    .filter((vertex) => ![vertex.xMm, vertex.yMm].every(Number.isFinite))
    .map((vertex) => vertex.id);
  const nonSimpleFaceIds: string[] = [];
  const degenerateFaceIds: string[] = [];
  const vertices = new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
  marks.forEach((mark) => {
    if (mark.kind !== "score") invalidScoreKindIds.add(mark.id);
    if (!vertexSet.has(mark.fromVertexId) || !vertexSet.has(mark.toVertexId))
      missingMarkIds.add(mark.id);
    if (mark.fromVertexId === mark.toVertexId) zeroLengthMarkIds.add(mark.id);
  });
  const cuts = net.cuts ?? [];
  cuts.forEach((cut) => {
    if (!vertexSet.has(cut.fromVertexId) || !vertexSet.has(cut.toVertexId))
      missingCutIds.add(cut.id);
    if (cut.fromVertexId === cut.toVertexId) zeroLengthCutIds.add(cut.id);
  });
  (net.scraps ?? []).forEach((scrap) => {
    scrap.vertexIds.forEach((id) => {
      if (!vertexSet.has(id)) missingScrapIds.add(scrap.id);
    });
    const scrapPoints = scrap.vertexIds
      .map((id) => vertices.get(id))
      .filter((point): point is FoldNetVertex => Boolean(point));
    const points = scrap.points ?? [];
    const pointsMatch =
      points.length === scrap.vertexIds.length &&
      points.every(
        (point, index) =>
          point.id === scrap.vertexIds[index] &&
          vertices.get(point.id)?.xMm === point.xMm &&
          vertices.get(point.id)?.yMm === point.yMm,
      );
    const repeatedVertexIds =
      new Set(scrap.vertexIds).size !== scrap.vertexIds.length;
    const zeroLengthEdge = scrapPoints.some((point, index) => {
      const next = scrapPoints[(index + 1) % scrapPoints.length];
      return (
        next !== undefined && point.xMm === next.xMm && point.yMm === next.yMm
      );
    });
    let selfIntersecting = false;
    for (let i = 0; i < scrapPoints.length; i += 1)
      for (let j = i + 1; j < scrapPoints.length; j += 1) {
        if (j === i + 1 || (i === 0 && j === scrapPoints.length - 1)) continue;
        if (
          segmentsIntersect(
            scrapPoints[i],
            scrapPoints[(i + 1) % scrapPoints.length],
            scrapPoints[j],
            scrapPoints[(j + 1) % scrapPoints.length],
          )
        )
          selfIntersecting = true;
      }
    const direction = scrap.exitDirection;
    const actualCutIds = Array.isArray(scrap.cutIds) ? scrap.cutIds : [];
    const expectedCutIds = cuts
      .filter((cut) => {
        const cutFrom = vertices.get(cut.fromVertexId);
        const cutTo = vertices.get(cut.toVertexId);
        if (!cutFrom || !cutTo) return false;
        return scrapPoints.some((point, index) => {
          const next = scrapPoints[(index + 1) % scrapPoints.length];
          return Boolean(next && segmentOverlap(cutFrom, cutTo, point, next));
        });
      })
      .map((cut) => cut.id);
    if (
      !Array.isArray(scrap.cutIds) ||
      actualCutIds.length !== expectedCutIds.length ||
      actualCutIds.some((id, index) => id !== expectedCutIds[index])
    )
      invalidScrapCutIds.add(scrap.id);
    if (
      !pointsMatch ||
      scrap.vertexIds.length < 3 ||
      repeatedVertexIds ||
      zeroLengthEdge ||
      scrapPoints.length !== scrap.vertexIds.length ||
      Math.abs(signedArea(scrapPoints)) <= EPSILON_MM ||
      selfIntersecting ||
      !direction?.every(Number.isFinite) ||
      Math.hypot(direction?.[0] ?? 0, direction?.[1] ?? 0) <= EPSILON_MM
    )
      invalidScrapIds.add(scrap.id);
  });
  const seams = net.seams ?? [];
  seams.forEach((seam) => {
    const edges = Array.isArray(seam.matingEdges) ? seam.matingEdges : [];
    if (
      seam.kind !== "tape" ||
      edges.length !== 2 ||
      !Number.isFinite(seam.expectedGapMm) ||
      seam.expectedGapMm < 0 ||
      !Number.isFinite(seam.toleranceMm) ||
      seam.toleranceMm <= 0
    )
      invalidSeamIds.add(seam.id);
    if (
      edges.length === 2 &&
      edges[0] &&
      edges[1] &&
      edges[0].faceId === edges[1].faceId
    )
      invalidSeamIds.add(seam.id);
    edges.forEach((edge) => {
      if (
        !edge ||
        typeof edge.faceId !== "string" ||
        typeof edge.fromVertexId !== "string" ||
        typeof edge.toVertexId !== "string"
      ) {
        missingSeamEndpointIds.add(seam.id);
        invalidSeamIds.add(seam.id);
        return;
      }
      const face = net.faces.find((candidate) => candidate.id === edge.faceId);
      const from = vertices.get(edge.fromVertexId);
      const to = vertices.get(edge.toVertexId);
      if (!face || !from || !to) {
        missingSeamEndpointIds.add(seam.id);
        if (!face) missingFaceIds.add(edge.faceId);
        if (!from) missingVertexIds.add(edge.fromVertexId);
        if (!to) missingVertexIds.add(edge.toVertexId);
        return;
      }
      if (
        edge.fromVertexId === edge.toVertexId ||
        Math.hypot(to.xMm - from.xMm, to.yMm - from.yMm) <= EPSILON_MM
      )
        invalidSeamIds.add(seam.id);
      if (!seamReferenceLiesOnFaceEdge(from, to, face, vertices))
        seamEndpointNotOnFaceIds.add(seam.id);
    });
  });
  net.faces.forEach((face) => {
    const points = face.vertexIds
      .map((id) => vertices.get(id))
      .filter((point): point is FoldNetVertex => Boolean(point));
    const zeroEdge = points.some((point, index) => {
      const next = points[(index + 1) % points.length];
      return next && point.xMm === next.xMm && point.yMm === next.yMm;
    });
    if (
      face.vertexIds.length < 3 ||
      new Set(face.vertexIds).size !== face.vertexIds.length ||
      zeroEdge ||
      Math.abs(faceArea(face, vertices)) <= EPSILON_MM
    )
      degenerateFaceIds.push(face.id);
    for (let i = 0; i < points.length; i += 1)
      for (let j = i + 1; j < points.length; j += 1) {
        if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
        if (
          segmentsIntersect(
            points[i],
            points[(i + 1) % points.length],
            points[j],
            points[(j + 1) % points.length],
          )
        )
          nonSimpleFaceIds.push(face.id);
      }
  });
  net.creases.forEach((crease) => {
    const parent = net.faces.find((face) => face.id === crease.parentFaceId);
    const child = net.faces.find((face) => face.id === crease.childFaceId);
    const endpointsPresent =
      vertexSet.has(crease.fromVertexId) && vertexSet.has(crease.toVertexId);
    if (
      endpointsPresent &&
      parent &&
      (!parent.vertexIds.includes(crease.fromVertexId) ||
        !parent.vertexIds.includes(crease.toVertexId))
    )
      creaseEndpointNotOnFaceIds.add(crease.id);
    if (
      endpointsPresent &&
      child &&
      (!child.vertexIds.includes(crease.fromVertexId) ||
        !child.vertexIds.includes(crease.toVertexId))
    )
      creaseEndpointNotOnFaceIds.add(crease.id);
  });
  const uniqueNonSimple = [...new Set(nonSimpleFaceIds)].sort();
  const uniqueDegenerate = [...new Set(degenerateFaceIds)].sort();
  const allIds = [
    ...vertexIds,
    ...faceIds,
    ...marks.map((mark) => mark.id),
    ...(net.cuts ?? []).map((cut) => cut.id),
    ...(net.scraps ?? []).map((scrap) => scrap.id),
    ...seams.map((seam) => seam.id),
    ...net.creases.map((crease) => crease.id),
  ];
  const emptyIds = allIds.filter(
    (id) => typeof id !== "string" || id.trim().length === 0,
  );
  const duplicate = duplicateIds(allIds);
  const adjacency = new Map<string, Set<string>>();
  const directed = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  net.faces.forEach((face) => {
    adjacency.set(face.id, new Set());
    directed.set(face.id, []);
    incoming.set(face.id, 0);
  });
  net.creases.forEach((crease) => {
    adjacency.get(crease.parentFaceId)?.add(crease.childFaceId);
    adjacency.get(crease.childFaceId)?.add(crease.parentFaceId);
    directed.get(crease.parentFaceId)?.push(crease.childFaceId);
    incoming.set(
      crease.childFaceId,
      (incoming.get(crease.childFaceId) ?? 0) + 1,
    );
  });
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    directed.get(id)?.forEach(visit);
  };
  if (faceSet.has(net.rootFaceId)) visit(net.rootFaceId);
  const connected = seen.size === net.faces.length;
  const walked = new Set<string>();
  let acyclic =
    net.creases.length <= Math.max(0, net.faces.length - 1) &&
    [...incoming.values()].every((count) => count <= 1);
  const walk = (id: string, parent?: string) => {
    if (walked.has(id)) return;
    walked.add(id);
    adjacency.get(id)?.forEach((next) => {
      if (next === parent) return;
      if (walked.has(next)) {
        acyclic = false;
        return;
      }
      walk(next, id);
    });
  };
  if (faceSet.has(net.rootFaceId)) walk(net.rootFaceId);
  net.faces.forEach((face) => walk(face.id));
  const errors: string[] = [];
  if (emptyIds.length) errors.push("empty id");
  duplicate.forEach((id) => errors.push(`duplicate id: ${id}`));
  invalidScoreKindIds.forEach((id) => errors.push(`invalid score kind: ${id}`));
  nonFiniteVertexIds.forEach((id) => errors.push(`non-finite vertex: ${id}`));
  missingVertexIds.forEach((id) =>
    errors.push(`missing vertex or endpoint: ${id}`),
  );
  zeroLengthMarkIds.forEach((id) => errors.push(`zero-length mark: ${id}`));
  zeroLengthCutIds.forEach((id) => errors.push(`zero-length cut: ${id}`));
  missingCutIds.forEach((id) => errors.push(`missing cut endpoint: ${id}`));
  invalidScrapIds.forEach((id) => errors.push(`invalid scrap: ${id}`));
  invalidScrapCutIds.forEach((id) =>
    errors.push(`invalid scrap cut references: ${id}`),
  );
  missingSeamEndpointIds.forEach((id) =>
    errors.push(`missing seam endpoint: ${id}`),
  );
  seamEndpointNotOnFaceIds.forEach((id) =>
    errors.push(`seam endpoint not on declared face edge: ${id}`),
  );
  invalidSeamIds.forEach((id) => errors.push(`invalid seam: ${id}`));
  missingCreaseEndpointIds.forEach((id) =>
    errors.push(`missing crease endpoint: ${id}`),
  );
  creaseEndpointNotOnFaceIds.forEach((id) =>
    errors.push(`crease endpoint not on incident face: ${id}`),
  );
  const referenceIds = new Set([
    ...faceIds,
    ...vertexIds,
    ...marks.map((mark) => mark.id),
    ...(net.cuts ?? []).map((cut) => cut.id),
    ...(net.scraps ?? []).map((scrap) => scrap.id),
    ...seams.map((seam) => seam.id),
    ...net.creases.map((crease) => crease.id),
  ]);
  const expectedByCode: Record<FoldNetPlaybookCode, Set<string>> = {
    VERIFY: new Set(faceIds),
    SCORE: new Set(marks.map((mark) => mark.id)),
    CUT: new Set((net.cuts ?? []).map((cut) => cut.id)),
    SCRAP: new Set((net.scraps ?? []).map((scrap) => scrap.id)),
    FOLD: new Set(net.creases.map((crease) => crease.id)),
    SEAL: new Set(seams.map((seam) => seam.id)),
    REMEASURE: new Set(),
  };
  const playbook = net.playbook ?? [];
  const presentCodes = new Set(playbook.map((step) => step.code));
  (Object.keys(expectedByCode) as FoldNetPlaybookCode[]).forEach((code) => {
    if (!presentCodes.has(code)) errors.push(`playbook missing code: ${code}`);
    if (playbook.filter((step) => step.code === code).length > 1)
      errors.push(`playbook duplicate code: ${code}`);
  });
  playbook.forEach((step, index, ordered) => {
    if (typeof step.code !== "string" || !(step.code in expectedByCode)) {
      errors.push(`invalid playbook code: ${String(step.code)}`);
      return;
    }
    if (
      step.sequence !== index ||
      (index > 0 && step.sequence <= ordered[index - 1].sequence)
    )
      errors.push(`invalid playbook sequence: ${step.sequence}`);
    const fieldByCode: Record<
      FoldNetPlaybookCode,
      keyof FoldNetPlaybookStep | undefined
    > = {
      VERIFY: "faceIds",
      SCORE: "scoreIds",
      CUT: "cutIds",
      SCRAP: "scrapIds",
      FOLD: "creaseIds",
      SEAL: "seamIds",
      REMEASURE: undefined,
    };
    const field = fieldByCode[step.code];
    if (field && !Array.isArray(step[field]))
      errors.push(`playbook missing reference field: ${step.code}`);
    const refs = field
      ? [...((step[field] as readonly string[] | undefined) ?? [])]
      : [];
    const populatedOtherFields = (
      [
        "scoreIds",
        "cutIds",
        "scrapIds",
        "creaseIds",
        "faceIds",
        "seamIds",
      ] as const
    ).filter((candidate) => candidate !== field && step[candidate] !== undefined);
    if (populatedOtherFields.length)
      errors.push(`invalid playbook reference fields: ${step.code}`);
    const expected = expectedByCode[step.code] ?? new Set<string>();
    const uniqueRefs = new Set(refs);
    if (uniqueRefs.size !== refs.length)
      errors.push(`playbook duplicate reference: ${step.code}`);
    refs.forEach((id) => {
      if (!referenceIds.has(id) || !expected.has(id))
        errors.push(`invalid playbook reference: ${id}`);
    });
    expected.forEach((id) => {
      if (!uniqueRefs.has(id)) errors.push(`playbook missing reference: ${id}`);
    });
  });
  if (!faceSet.has(net.rootFaceId))
    errors.push(`missing root face: ${net.rootFaceId}`);
  if (!connected) errors.push("crease graph is disconnected");
  if (!acyclic) errors.push("crease graph contains a cycle");
  incoming.forEach((count, faceId) => {
    if (count > 1) errors.push(`face has multiple crease parents: ${faceId}`);
  });
  if ((incoming.get(net.rootFaceId) ?? 0) > 0)
    errors.push(`root face has a parent: ${net.rootFaceId}`);
  return {
    errors,
    duplicateIds: duplicate,
    missingVertexIds: [...missingVertexIds].sort(),
    missingFaceIds: [...missingFaceIds].sort(),
    nonFiniteVertexIds,
    nonSimpleFaceIds: uniqueNonSimple,
    degenerateFaceIds: uniqueDegenerate,
    invalidScoreKindIds: [...invalidScoreKindIds].sort(),
    missingMarkIds: [...missingMarkIds].sort(),
    zeroLengthMarkIds: [...zeroLengthMarkIds].sort(),
    missingCutIds: [...missingCutIds].sort(),
    zeroLengthCutIds: [...zeroLengthCutIds].sort(),
    missingScrapIds: [...missingScrapIds].sort(),
    invalidScrapIds: [...invalidScrapIds].sort(),
    invalidScrapCutIds: [...invalidScrapCutIds].sort(),
    missingSeamEndpointIds: [...missingSeamEndpointIds].sort(),
    seamEndpointNotOnFaceIds: [...seamEndpointNotOnFaceIds].sort(),
    invalidSeamIds: [...invalidSeamIds].sort(),
    missingCreaseEndpointIds: [...missingCreaseEndpointIds].sort(),
    creaseEndpointNotOnFaceIds: [...creaseEndpointNotOnFaceIds].sort(),
    connected,
    acyclic,
  };
}
export function validateFoldNet(net: FoldNetCandidate): FoldNetValidation {
  const result = graphValidation(net);
  const errors = [
    ...result.errors,
    ...result.nonSimpleFaceIds.map((id) => `non-simple face: ${id}`),
    ...result.degenerateFaceIds.map((id) => `degenerate face: ${id}`),
    ...result.missingFaceIds.map((id) => `missing face: ${id}`),
    ...result.missingMarkIds.map((id) => `missing mark endpoint: ${id}`),
    ...result.missingScrapIds.map((id) => `missing scrap endpoint: ${id}`),
  ];
  const codes = new Set<FoldNetDiagnosticCode>();
  if (!net.metadata) codes.add("MISSING_METADATA");
  if (net.metadata && net.metadata.version !== 1)
    codes.add("UNSUPPORTED_VERSION");
  if (
    net.metadata &&
    (net.metadata.coordinateSystem !== "flat-sheet-mm" ||
      net.metadata.units !== "mm")
  )
    codes.add("INVALID_COORDINATE_SYSTEM");
  const metadataOrientation = net.metadata?.orientation as
    | Partial<FoldNetOrientation>
    | undefined;
  const metadataDimensions = metadataOrientation?.packageDimensions;
  const metadataAxes = metadataOrientation?.packageAxes;
  const axisList = Array.isArray(metadataAxes) ? metadataAxes : [];
  const validAxisToken = (axis: unknown): axis is FoldNetSignedAxis =>
    axis === "+L" ||
    axis === "−L" ||
    axis === "+W" ||
    axis === "−W" ||
    axis === "+H" ||
    axis === "−H";
  const validAxisTokens =
    axisList.length === 3 && axisList.every(validAxisToken);
  const uniqueBaseAxes =
    validAxisTokens &&
    new Set(axisList.map((axis) => axis.slice(-1))).size === 3;
  const validOrientationId =
    typeof metadataOrientation?.id === "string" &&
    metadataOrientation.id.trim().length > 0;
  const validUpright = typeof metadataOrientation?.upright === "boolean";
  if (
    net.metadata &&
    (!validOrientationId ||
      !validUpright ||
      !metadataDimensions ||
      ![
        metadataDimensions.lengthMm,
        metadataDimensions.widthMm,
        metadataDimensions.heightMm,
      ].every(Number.isFinite) ||
      ![
        metadataDimensions.lengthMm,
        metadataDimensions.widthMm,
        metadataDimensions.heightMm,
      ].every((value) => value > 0) ||
      !validAxisTokens ||
      !uniqueBaseAxes)
  )
    codes.add("MISSING_METADATA");
  if (result.errors.some((error) => error === "empty id"))
    codes.add("EMPTY_ID");
  if (
    result.duplicateIds.length ||
    errors.some((error) => error.startsWith("conflicting score mark"))
  )
    codes.add("DUPLICATE_ID");
  if (result.missingVertexIds.length) codes.add("MISSING_VERTEX");
  if (result.nonFiniteVertexIds.length) codes.add("NONFINITE_VERTEX");
  if (result.nonSimpleFaceIds.length) codes.add("NON_SIMPLE_FACE");
  if (result.degenerateFaceIds.length) codes.add("DEGENERATE_FACE");
  if (result.invalidScoreKindIds.length) codes.add("INVALID_SCORE_KIND");
  if (result.missingMarkIds.length) codes.add("MISSING_MARK_ENDPOINT");
  if (result.zeroLengthMarkIds.length) codes.add("ZERO_LENGTH_MARK");
  if (result.missingCutIds.length) codes.add("MISSING_CUT_ENDPOINT");
  if (result.zeroLengthCutIds.length) codes.add("ZERO_LENGTH_CUT");
  if (result.missingScrapIds.length) codes.add("MISSING_SCRAP_ENDPOINT");
  if (result.invalidScrapIds.length) codes.add("INVALID_SCRAP");
  if (result.invalidScrapCutIds.length)
    codes.add("INVALID_SCRAP_CUT_REFERENCE");
  if (result.missingSeamEndpointIds.length)
    codes.add("MISSING_SEAM_ENDPOINT");
  if (result.seamEndpointNotOnFaceIds.length)
    codes.add("SEAM_ENDPOINT_NOT_ON_FACE");
  if (result.invalidSeamIds.length) codes.add("INVALID_SEAM");
  if (result.missingCreaseEndpointIds.length)
    codes.add("MISSING_CREASE_ENDPOINT");
  if (result.creaseEndpointNotOnFaceIds.length)
    codes.add("CREASE_ENDPOINT_NOT_ON_FACE");
  if (
    errors.some(
      (error) =>
        error.startsWith("invalid playbook") || error.startsWith("playbook "),
    )
  )
    codes.add("INVALID_PLAYBOOK_REFERENCE");
  if (!net.rootFaceId || !net.faces.some((face) => face.id === net.rootFaceId))
    codes.add("MISSING_ROOT");
  if (!result.connected) codes.add("DISCONNECTED");
  if (
    !result.acyclic ||
    errors.some(
      (error) =>
        error.includes("multiple crease parents") ||
        error.includes("root face has a parent"),
    )
  )
    codes.add("CYCLE");
  return {
    ...result,
    errors,
    diagnosticCodes: [...codes].sort(),
    valid: errors.length === 0 && codes.size === 0,
  };
}
export const validateFoldNetStatic = validateFoldNet;
export const isValidFoldNet = (net: FoldNet) => validateFoldNet(net).valid;

/** Stable ear-clipping triangulation for concave polygon faces. */
export function triangulateFoldNet(net: FoldNet): FoldNetTriangulation {
  const validation = validateFoldNet(net);
  if (!validation.valid)
    return freeze({
      triangles: [],
      diagnostics: {
        faceIds: validation.nonSimpleFaceIds.concat(
          validation.degenerateFaceIds,
        ),
        errors: validation.errors,
        codes: validation.diagnosticCodes,
      },
    });
  const vertices = new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
  const triangles: FoldNetTriangle[] = [];
  const bad: string[] = [];
  const errors: string[] = [];
  net.faces.forEach((face) => {
    const ids = [...face.vertexIds];
    let changed = true;
    while (changed && ids.length > 3) {
      changed = false;
      for (let index = 0; index < ids.length; index += 1) {
        const previous = vertices.get(
          ids[(index + ids.length - 1) % ids.length],
        );
        const current = vertices.get(ids[index]);
        const next = vertices.get(ids[(index + 1) % ids.length]);
        if (
          previous &&
          current &&
          next &&
          Math.abs(
            (current.xMm - previous.xMm) * (next.yMm - current.yMm) -
              (current.yMm - previous.yMm) * (next.xMm - current.xMm),
          ) <= EPSILON_MM
        ) {
          ids.splice(index, 1);
          changed = true;
          break;
        }
      }
    }
    const points = ids.map((id) => vertices.get(id));
    if (ids.length < 3 || points.some((point) => !point)) {
      bad.push(face.id);
      errors.push(`cannot triangulate face: ${face.id}`);
      return;
    }
    const winding = faceArea(face, vertices) >= 0 ? 1 : -1;
    const remaining = ids.map((_, index) => index);
    const faceTriangles: FoldNetTriangle[] = [];
    let guard = 0;
    while (remaining.length > 3 && guard++ < ids.length * ids.length) {
      let clipped = false;
      for (let order = 0; order < remaining.length; order += 1) {
        const prev =
          remaining[(order + remaining.length - 1) % remaining.length];
        const current = remaining[order];
        const next = remaining[(order + 1) % remaining.length];
        const a = points[prev]!;
        const b = points[current]!;
        const c = points[next]!;
        const turn =
          ((b.xMm - a.xMm) * (c.yMm - b.yMm) -
            (b.yMm - a.yMm) * (c.xMm - b.xMm)) *
          winding;
        if (turn <= EPSILON_MM) continue;
        if (
          remaining.some(
            (candidate) =>
              candidate !== prev &&
              candidate !== current &&
              candidate !== next &&
              pointInTriangle(points[candidate]!, a, b, c),
          )
        )
          continue;
        faceTriangles.push({
          faceId: face.id,
          vertexIds: [ids[prev], ids[current], ids[next]],
        });
        remaining.splice(order, 1);
        clipped = true;
        break;
      }
      if (!clipped) break;
    }
    if (remaining.length === 3)
      faceTriangles.push({
        faceId: face.id,
        vertexIds: [ids[remaining[0]], ids[remaining[1]], ids[remaining[2]]],
      });
    if (remaining.length !== 3) {
      bad.push(face.id);
      errors.push(`non-simple face: ${face.id}`);
      return;
    }
    triangles.push(...faceTriangles);
  });
  return freeze({
    triangles,
    diagnostics: {
      faceIds: bad,
      errors,
      codes: bad.length ? ["TRIANGULATION_FAILED"] : [],
    },
  });
}
export const triangulateFoldFaces = triangulateFoldNet;

function transformSnapshot(transform: MutableTransform): FoldNetTransform {
  return {
    origin: { ...transform.origin },
    xAxis: { ...transform.xAxis },
    yAxis: { ...transform.yAxis },
    zAxis: { ...transform.zAxis },
  };
}
function comparePoseVertex(a: FoldNetVector3, b: FoldNetVector3) {
  return Math.max(
    Math.abs(a.xMm - b.xMm),
    Math.abs(a.yMm - b.yMm),
    Math.abs(a.zMm - b.zMm),
  );
}
function transformDeterminant(transform: FoldNetTransform) {
  return dot(transform.xAxis, cross(transform.yAxis, transform.zAxis));
}

/** Fold all faces while retaining conservative structural diagnostics. */
export function foldNetAtProgress(net: FoldNet, progress: number): FoldNetPose {
  const normalized = clamp(progress);
  const vertices = new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
  const faces = new Map(net.faces.map((face) => [face.id, face]));
  const childrenByParent = new Map<string, FoldNetCrease[]>();
  net.creases.forEach((crease) =>
    childrenByParent.set(crease.parentFaceId, [
      ...(childrenByParent.get(crease.parentFaceId) ?? []),
      crease,
    ]),
  );
  childrenByParent.forEach((list) =>
    list.sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id)),
  );
  const transforms = new Map<string, MutableTransform>();
  const visit = (faceId: string, transform: MutableTransform) => {
    if (transforms.has(faceId)) return;
    transforms.set(faceId, transform);
    (childrenByParent.get(faceId) ?? []).forEach((crease) =>
      visit(
        crease.childFaceId,
        transformForChild(
          transform,
          crease,
          vertices,
          creaseAngle(net, crease, normalized),
        ),
      ),
    );
  };
  if (faces.has(net.rootFaceId)) visit(net.rootFaceId, identityTransform());
  const detachedFaceIds = net.faces
    .filter((face) => !transforms.has(face.id))
    .map((face) => face.id);
  detachedFaceIds.forEach((faceId) =>
    transforms.set(faceId, identityTransform()),
  );
  const missingVertexIds = new Set<string>();
  const posedFaces: FoldFacePose[] = net.faces.map((face) => {
    const transform = transforms.get(face.id) ?? identityTransform();
    return {
      faceId: face.id,
      transform: transformSnapshot(transform),
      vertices: face.vertexIds.map((vertexId) => {
        const source = vertices.get(vertexId);
        if (!source) {
          missingVertexIds.add(vertexId);
          return vector(Number.NaN, Number.NaN, Number.NaN);
        }
        return worldPointForVertex(transform, source);
      }),
    };
  });
  const posedByFace = new Map(posedFaces.map((face) => [face.faceId, face]));
  const posedVertex = (faceId: string, vertexId: string) => {
    const face = faces.get(faceId);
    const posed = posedByFace.get(faceId);
    if (!face || !posed) return undefined;
    const index = face.vertexIds.indexOf(vertexId);
    return index >= 0 ? posed.vertices[index] : undefined;
  };
  let maxHingeGapMm = 0;
  const creaseTearIds: string[] = [];
  net.creases.forEach((crease) => {
    const a = posedVertex(crease.parentFaceId, crease.fromVertexId);
    const b = posedVertex(crease.childFaceId, crease.fromVertexId);
    const c = posedVertex(crease.parentFaceId, crease.toVertexId);
    const d = posedVertex(crease.childFaceId, crease.toVertexId);
    if (!a || !b || !c || !d) {
      creaseTearIds.push(crease.id);
      return;
    }
    const firstGap = distance(a, b);
    const secondGap = distance(c, d);
    const gap =
      Number.isFinite(firstGap) && Number.isFinite(secondGap)
        ? Math.max(firstGap, secondGap)
        : Number.POSITIVE_INFINITY;
    maxHingeGapMm = Math.max(maxHingeGapMm, gap);
    if (gap > 0.01) creaseTearIds.push(crease.id);
  });
  let maxEdgeStretchMm = 0;
  let nonFiniteValues = false;
  const inversionFaceIds: string[] = [];
  net.faces.forEach((face) => {
    const pose = posedByFace.get(face.id);
    if (!pose) return;
    if (transformDeterminant(pose.transform) <= EPSILON_MM)
      inversionFaceIds.push(face.id);
    face.vertexIds.forEach((vertexId, index) => {
      const next = face.vertexIds[(index + 1) % face.vertexIds.length];
      const source = vertices.get(vertexId);
      const nextSource = vertices.get(next);
      const posed = pose.vertices[index];
      const nextPosed = pose.vertices[(index + 1) % pose.vertices.length];
      if (!source || !nextSource || !posed || !nextPosed) {
        missingVertexIds.add(vertexId);
        return;
      }
      const stretch = Math.abs(
        distance(
          vector(source.xMm, source.yMm),
          vector(nextSource.xMm, nextSource.yMm),
        ) - distance(posed, nextPosed),
      );
      maxEdgeStretchMm = Math.max(
        maxEdgeStretchMm,
        Number.isFinite(stretch) ? stretch : Number.POSITIVE_INFINITY,
      );
      if (![posed.xMm, posed.yMm, posed.zMm].every(Number.isFinite))
        nonFiniteValues = true;
    });
  });
  const sharedBoundary = new Set(
    net.creases.map((crease) =>
      [crease.parentFaceId, crease.childFaceId].sort().join("~"),
    ),
  );
  net.faces.forEach((first, firstIndex) =>
    net.faces.slice(firstIndex + 1).forEach((second) => {
      const shared = first.vertexIds.filter((id) =>
        second.vertexIds.includes(id),
      );
      if (shared.length >= 2)
        sharedBoundary.add([first.id, second.id].sort().join("~"));
    }),
  );
  const bounds = (face: FoldFacePose) => {
    const finite = face.vertices.filter((point) =>
      [point.xMm, point.yMm, point.zMm].every(Number.isFinite),
    );
    return finite.length
      ? {
          x: [
            Math.min(...finite.map((point) => point.xMm)),
            Math.max(...finite.map((point) => point.xMm)),
          ],
          y: [
            Math.min(...finite.map((point) => point.yMm)),
            Math.max(...finite.map((point) => point.yMm)),
          ],
          z: [
            Math.min(...finite.map((point) => point.zMm)),
            Math.max(...finite.map((point) => point.zMm)),
          ],
        }
      : undefined;
  };
  const posedBounds = posedFaces.map(bounds);
  const collisionPairs: string[] = [];
  for (let i = 0; i < posedFaces.length; i += 1)
    for (let j = i + 1; j < posedFaces.length; j += 1) {
      const first = posedFaces[i];
      const second = posedFaces[j];
      if (sharedBoundary.has([first.faceId, second.faceId].sort().join("~")))
        continue;
      const a = posedBounds[i];
      const b = posedBounds[j];
      if (!a || !b) continue;
      const positive = (axis: "x" | "y" | "z") =>
        Math.min(a[axis][1], b[axis][1]) - Math.max(a[axis][0], b[axis][0]) >
        EPSILON_MM;
      if (positive("x") && positive("y") && positive("z"))
        collisionPairs.push(`${first.faceId}~${second.faceId}`);
    }
  return {
    progress: normalized,
    faces: posedFaces,
    diagnostics: {
      connected: detachedFaceIds.length === 0,
      detachedFaceIds,
      maxHingeGapMm,
      maxEdgeStretchMm,
      nonFiniteValues:
        nonFiniteValues ||
        missingVertexIds.size > 0 ||
        net.vertices.some(
          (vertex) => ![vertex.xMm, vertex.yMm].every(Number.isFinite),
        ),
      missingVertexIds: [...missingVertexIds].sort(),
      creaseTearIds,
      inversionFaceIds,
      collisionPairs,
    },
  };
}
export function foldNetPoseDelta(first: FoldNetPose, second: FoldNetPose) {
  const byFace = new Map(second.faces.map((face) => [face.faceId, face]));
  return first.faces.reduce((maxDelta, face) => {
    const other = byFace.get(face.faceId);
    if (!other || other.vertices.length !== face.vertices.length)
      return Number.POSITIVE_INFINITY;
    return Math.max(
      maxDelta,
      ...face.vertices.map((vertex, index) =>
        comparePoseVertex(vertex, other.vertices[index]),
      ),
    );
  }, 0);
}
