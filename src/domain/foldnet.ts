import type {Rect2D, WrapPlan} from "./geometry";

/**
 * A small, renderer-independent representation of a folding net.
 *
 * Coordinates stay in the same millimetre coordinate system as WrapPlan.  The
 * scene adapter is responsible for converting these poses to Three.js
 * vectors; keeping this module free of Three makes the folding rules testable
 * in Node and avoids pulling browser-only code into the domain layer.
 */
export type FoldRole = Rect2D["role"];

export interface FoldNetVertex {
  readonly id: string;
  readonly xMm: number;
  readonly yMm: number;
}

export interface FoldNetFace {
  readonly id: string;
  readonly sourceRectId: string;
  readonly role: FoldRole;
  /** Vertex ids are ordered around the face perimeter. */
  readonly vertexIds: readonly string[];
}

export interface FoldNetScrap {
  readonly id: string;
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
  readonly kind: "score" | "hinge";
  readonly direction: 1 | -1;
  readonly angleRad: number;
  readonly stepId: FoldStepId;
  readonly sequence: number;
}

export interface FoldNet {
  readonly rootFaceId: string;
  readonly vertices: readonly FoldNetVertex[];
  readonly faces: readonly FoldNetFace[];
  /** Creases form a deterministic spanning tree rooted at rootFaceId. */
  readonly creases: readonly FoldNetCrease[];
  readonly steps: readonly FoldNetStep[];
  readonly scraps?: readonly FoldNetScrap[];
}

export interface FoldNetVector3 {
  readonly xMm: number;
  readonly yMm: number;
  readonly zMm: number;
}

export interface FoldNetTransform {
  readonly origin: FoldNetVector3;
  /** Basis vectors map the original x/y/z axes into world space. */
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
}

export interface FoldNetPose {
  readonly progress: number;
  readonly faces: readonly FoldFacePose[];
  readonly diagnostics: FoldNetDiagnostics;
}

export const DEFAULT_FOLD_NET_STEPS: readonly FoldNetStep[] = [
  {id: "tabs", sequence: 0, start: 0.44, end: 0.54, label: "Fold the joining tabs"},
  {id: "walls", sequence: 1, start: 0.54, end: 0.72, label: "Raise the side walls"},
  {id: "top", sequence: 2, start: 0.72, end: 0.9, label: "Close the top flaps"},
];

const EPSILON_MM = 0.000001;
const HALF_PI = Math.PI / 2;

interface Point2D {
  xMm: number;
  yMm: number;
}

interface BoundarySegment {
  faceId: string;
  from: FoldNetVertex;
  to: FoldNetVertex;
}

interface CandidateCrease {
  a: string;
  b: string;
  fromVertexId: string;
  toVertexId: string;
  from: Point2D;
  to: Point2D;
  kind: "score" | "hinge";
}

interface MutableTransform {
  origin: FoldNetVector3;
  xAxis: FoldNetVector3;
  yAxis: FoldNetVector3;
  zAxis: FoldNetVector3;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function pointKey(point: Point2D) {
  return `${point.xMm.toFixed(6)},${point.yMm.toFixed(6)}`;
}

function vector(xMm: number, yMm: number, zMm = 0): FoldNetVector3 {
  return {xMm, yMm, zMm};
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
  return vector(a.yMm * b.zMm - a.zMm * b.yMm, a.zMm * b.xMm - a.xMm * b.zMm, a.xMm * b.yMm - a.yMm * b.xMm);
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

function rotateAroundAxis(point: FoldNetVector3, axisOrigin: FoldNetVector3, axis: FoldNetVector3, angle: number): FoldNetVector3 {
  const relative = subtract(point, axisOrigin);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  // Rodrigues' rotation formula.  The axis is normalized by the caller.
  const rotated = add(add(scale(relative, cosine), scale(cross(axis, relative), sine)), scale(axis, dot(axis, relative) * (1 - cosine)));
  return add(axisOrigin, rotated);
}

function identityTransform(): MutableTransform {
  return {origin: vector(0, 0, 0), xAxis: vector(1, 0, 0), yAxis: vector(0, 1, 0), zAxis: vector(0, 0, 1)};
}

function applyTransform(transform: MutableTransform, point: FoldNetVector3): FoldNetVector3 {
  return add(transform.origin, add(add(scale(transform.xAxis, point.xMm), scale(transform.yAxis, point.yMm)), scale(transform.zAxis, point.zMm)));
}

function rotateTransform(transform: MutableTransform, axisOrigin: FoldNetVector3, axis: FoldNetVector3, angle: number): MutableTransform {
  return {
    origin: rotateAroundAxis(transform.origin, axisOrigin, axis, angle),
    xAxis: rotateAroundAxis(transform.xAxis, vector(0, 0, 0), axis, angle),
    yAxis: rotateAroundAxis(transform.yAxis, vector(0, 0, 0), axis, angle),
    zAxis: rotateAroundAxis(transform.zAxis, vector(0, 0, 0), axis, angle),
  };
}

function rectPoints(rectangle: Rect2D): Point2D[] {
  const x = Math.min(rectangle.xMm, rectangle.xMm + rectangle.widthMm);
  const y = Math.min(rectangle.yMm, rectangle.yMm + rectangle.heightMm);
  const width = Math.abs(rectangle.widthMm);
  const height = Math.abs(rectangle.heightMm);
  return [{xMm: x, yMm: y}, {xMm: x + width, yMm: y}, {xMm: x + width, yMm: y + height}, {xMm: x, yMm: y + height}];
}

function polygonCentroid(face: FoldNetFace, vertices: Map<string, FoldNetVertex>): Point2D {
  const points = face.vertexIds.map((id) => vertices.get(id)).filter((point): point is FoldNetVertex => Boolean(point));
  if (points.length === 0) return {xMm: 0, yMm: 0};
  return {xMm: points.reduce((sum, point) => sum + point.xMm, 0) / points.length, yMm: points.reduce((sum, point) => sum + point.yMm, 0) / points.length};
}

function collinearOverlap(first: BoundarySegment, second: BoundarySegment): {from: Point2D; to: Point2D} | undefined {
  const a = vector(first.from.xMm, first.from.yMm);
  const b = vector(first.to.xMm, first.to.yMm);
  const c = vector(second.from.xMm, second.from.yMm);
  const d = vector(second.to.xMm, second.to.yMm);
  const axis = subtract(b, a);
  const axisLength = length(axis);
  if (axisLength <= EPSILON_MM) return undefined;
  if (Math.abs(cross(axis, subtract(c, a)).zMm) > EPSILON_MM * Math.max(1, axisLength)) return undefined;
  if (Math.abs(cross(axis, subtract(d, a)).zMm) > EPSILON_MM * Math.max(1, axisLength)) return undefined;
  const denominator = dot(axis, axis);
  const t1 = dot(subtract(c, a), axis) / denominator;
  const t2 = dot(subtract(d, a), axis) / denominator;
  const start = Math.max(0, Math.min(t1, t2));
  const end = Math.min(1, Math.max(t1, t2));
  if (end - start <= EPSILON_MM / axisLength) return undefined;
  return {from: {xMm: a.xMm + axis.xMm * start, yMm: a.yMm + axis.yMm * start}, to: {xMm: a.xMm + axis.xMm * end, yMm: a.yMm + axis.yMm * end}};
}

function segmentOverlap(first: Point2D, second: Point2D, candidateFirst: Point2D, candidateSecond: Point2D) {
  const firstSegment: BoundarySegment = {faceId: "", from: {id: "", ...first}, to: {id: "", ...second}};
  const secondSegment: BoundarySegment = {faceId: "", from: {id: "", ...candidateFirst}, to: {id: "", ...candidateSecond}};
  return collinearOverlap(firstSegment, secondSegment);
}

function foldStepForFace(face: FoldNetFace): FoldStepId {
  if (face.role === "TAB") return "tabs";
  if (face.role === "FLAP") return "top";
  return "walls";
}

function faceRoleRank(role: FoldRole) {
  if (role === "PANEL") return 0;
  if (role === "FLAP") return 1;
  return 2;
}

function insertPointIntoFace(faceVertexIds: Map<string, string[]>, faceId: string, point: Point2D, vertexId: string, vertices: Map<string, FoldNetVertex>) {
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
    const onEdge = Math.abs(cross(edge, relative).zMm) <= EPSILON_MM * Math.max(1, length(edge));
    const alongEdge = dot(relative, edge) / edgeLengthSquared;
    if (onEdge && alongEdge > EPSILON_MM && alongEdge < 1 - EPSILON_MM) {
      ids.splice(index + 1, 0, vertexId);
      return;
    }
  }
}

function stepProgress(net: FoldNet, stepId: FoldStepId, progress: number) {
  const step = net.steps.find((candidate) => candidate.id === stepId);
  if (!step) return 0;
  const local = step.end <= step.start ? (progress >= step.end ? 1 : 0) : clamp((progress - step.start) / (step.end - step.start));
  // Smoothstep gives the hinges a calm start and end without a renderer tween.
  return local * local * (3 - 2 * local);
}

function creaseAngle(net: FoldNet, crease: FoldNetCrease, progress: number) {
  return crease.direction * crease.angleRad * stepProgress(net, crease.stepId, progress);
}

function worldPointForVertex(transform: MutableTransform, vertex: FoldNetVertex): FoldNetVector3 {
  return applyTransform(transform, vector(vertex.xMm, vertex.yMm, 0));
}

function transformForChild(parentTransform: MutableTransform, crease: FoldNetCrease, vertices: Map<string, FoldNetVertex>, angle: number): MutableTransform {
  const from = vertices.get(crease.fromVertexId);
  const to = vertices.get(crease.toVertexId);
  if (!from || !to) return parentTransform;
  const axisOrigin = worldPointForVertex(parentTransform, from);
  const axisEnd = worldPointForVertex(parentTransform, to);
  return rotateTransform(parentTransform, axisOrigin, normalize(subtract(axisEnd, axisOrigin)), angle);
}

/**
 * Convert the current rectangular wrap net into a stable face/hinge graph.
 *
 * The adapter intentionally builds a spanning tree from shared rectangle
 * boundaries.  The generated wrap pattern is a single connected sheet, while
 * a tree gives the renderer one unambiguous parent transform per face.  Future
 * patterns can construct FoldNet directly with concave polygon faces.
 */
export function foldNetFromWrapPlan(plan: Pick<WrapPlan, "rectangles" | "scores"> & Partial<Pick<WrapPlan, "scrapRegions">>, steps: readonly FoldNetStep[] = DEFAULT_FOLD_NET_STEPS): FoldNet {
  const vertices: FoldNetVertex[] = [];
  const vertexByKey = new Map<string, FoldNetVertex>();
  const faces: FoldNetFace[] = [];
  const faceVertexIds = new Map<string, string[]>();
  const vertexForPoint = (point: Point2D) => {
    const key = pointKey(point);
    const existing = vertexByKey.get(key);
    if (existing) return existing;
    const created: FoldNetVertex = {id: `v-${vertices.length + 1}`, xMm: point.xMm, yMm: point.yMm};
    vertices.push(created);
    vertexByKey.set(key, created);
    return created;
  };
  plan.rectangles.forEach((rectangle) => {
    const points = rectPoints(rectangle);
    const vertexIds = points.map(vertexForPoint).map((vertex) => vertex.id);
    faceVertexIds.set(rectangle.id, vertexIds);
    faces.push({id: rectangle.id, sourceRectId: rectangle.id, role: rectangle.role, vertexIds});
  });
  const vertexById = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const boundaries: BoundarySegment[] = [];
  faces.forEach((face) => {
    face.vertexIds.forEach((fromId, index) => {
      const toId = face.vertexIds[(index + 1) % face.vertexIds.length];
      const from = vertexById.get(fromId);
      const to = vertexById.get(toId);
      if (from && to) boundaries.push({faceId: face.id, from, to});
    });
  });
  const candidates: CandidateCrease[] = [];
  const candidateKeys = new Set<string>();
  for (let firstIndex = 0; firstIndex < boundaries.length; firstIndex += 1) {
    const first = boundaries[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < boundaries.length; secondIndex += 1) {
      const second = boundaries[secondIndex];
      if (first.faceId === second.faceId) continue;
      const overlap = collinearOverlap(first, second);
      if (!overlap) continue;
      const from = vertexForPoint(overlap.from);
      const to = vertexForPoint(overlap.to);
      // Shorter adjoining edges commonly terminate inside the longer edge.
      // Split both perimeter lists so every crease endpoint belongs to both
      // incident faces, keeping hinge diagnostics and future mesh adapters
      // unambiguous.
      insertPointIntoFace(faceVertexIds, first.faceId, overlap.from, from.id, vertexByKey);
      insertPointIntoFace(faceVertexIds, first.faceId, overlap.to, to.id, vertexByKey);
      insertPointIntoFace(faceVertexIds, second.faceId, overlap.from, from.id, vertexByKey);
      insertPointIntoFace(faceVertexIds, second.faceId, overlap.to, to.id, vertexByKey);
      const orderedFaces = [first.faceId, second.faceId].sort();
      const orderedPoints = [from.id, to.id].sort();
      const key = `${orderedFaces.join("~")}:${orderedPoints.join("~")}`;
      if (candidateKeys.has(key)) continue;
      candidateKeys.add(key);
      const scored = plan.scores.some((score) => Boolean(segmentOverlap(overlap.from, overlap.to, score.from, score.to)));
      candidates.push({a: first.faceId, b: second.faceId, fromVertexId: from.id, toVertexId: to.id, from: overlap.from, to: overlap.to, kind: scored ? "score" : "hinge"});
    }
  }
  // A stable order is important: it keeps pose output and screenshots stable
  // even when the input rectangle order changes.
  candidates.sort((left, right) => `${[left.a, left.b].sort().join("~")}:${pointKey(left.from)}:${pointKey(left.to)}`.localeCompare(`${[right.a, right.b].sort().join("~")}:${pointKey(right.from)}:${pointKey(right.to)}`));
  const finalizedFaces = faces.map((face) => ({...face, vertexIds: [...(faceVertexIds.get(face.id) ?? face.vertexIds)]}));
  const finalizedFaceById = new Map(finalizedFaces.map((face) => [face.id, face]));
  const candidatesByFace = new Map<string, CandidateCrease[]>();
  candidates.forEach((candidate) => {
    [candidate.a, candidate.b].forEach((faceId) => {
      const list = candidatesByFace.get(faceId) ?? [];
      list.push(candidate);
      candidatesByFace.set(faceId, list);
    });
  });
  const rootFaceId = finalizedFaceById.has("bottom") ? "bottom" : finalizedFaces[0]?.id ?? "";
  const visited = new Set<string>(rootFaceId ? [rootFaceId] : []);
  const queue = rootFaceId ? [rootFaceId] : [];
  const creases: FoldNetCrease[] = [];
  let sequence = 0;
  while (queue.length > 0) {
    const parentFaceId = queue.shift()!;
    const parentFace = finalizedFaceById.get(parentFaceId);
    if (!parentFace) continue;
    const adjacent = [...(candidatesByFace.get(parentFaceId) ?? [])].sort((left, right) => {
      const leftId = left.a === parentFaceId ? left.b : left.a;
      const rightId = right.a === parentFaceId ? right.b : right.a;
      const leftFace = finalizedFaceById.get(leftId);
      const rightFace = finalizedFaceById.get(rightId);
      return (faceRoleRank(leftFace?.role ?? "TAB") - faceRoleRank(rightFace?.role ?? "TAB")) || leftId.localeCompare(rightId) || pointKey(left.from).localeCompare(pointKey(right.from));
    });
    adjacent.forEach((candidate) => {
      const childFaceId = candidate.a === parentFaceId ? candidate.b : candidate.a;
      if (visited.has(childFaceId)) return;
      const childFace = finalizedFaceById.get(childFaceId);
      if (!childFace) return;
      visited.add(childFaceId);
      queue.push(childFaceId);
      const childCentroid = polygonCentroid(childFace, vertexById);
      const edge = vector(candidate.to.xMm - candidate.from.xMm, candidate.to.yMm - candidate.from.yMm);
      const childSide = edge.xMm * (childCentroid.yMm - candidate.from.yMm) - edge.yMm * (childCentroid.xMm - candidate.from.xMm);
      const direction: 1 | -1 = childSide >= 0 ? 1 : -1;
      creases.push({id: `crease-${sequence + 1}`, fromVertexId: candidate.fromVertexId, toVertexId: candidate.toVertexId, parentFaceId, childFaceId, kind: candidate.kind, direction, angleRad: HALF_PI, stepId: foldStepForFace(childFace), sequence});
      sequence += 1;
    });
  }
  const scraps: FoldNetScrap[] = (plan.scrapRegions ?? []).map((region) => ({
    id: region.id,
    points: region.points.map((point, index) => ({id: `scrap-${region.id}-${index}`, xMm: point.xMm, yMm: point.yMm})),
    exitDirection: [region.id.includes("left") ? -1 : region.id.includes("right") ? 1 : 0, region.id.includes("top") ? -1 : region.id.includes("bottom") ? 1 : 0] as [number, number],
  }));
  return {rootFaceId, vertices, faces: finalizedFaces, creases, steps: [...steps], scraps};
}

function transformSnapshot(transform: MutableTransform): FoldNetTransform {
  return {origin: {...transform.origin}, xAxis: {...transform.xAxis}, yAxis: {...transform.yAxis}, zAxis: {...transform.zAxis}};
}

function comparePoseVertex(a: FoldNetVector3, b: FoldNetVector3) {
  return Math.max(Math.abs(a.xMm - b.xMm), Math.abs(a.yMm - b.yMm), Math.abs(a.zMm - b.zMm));
}

/** Fold every face from the flat net to a deterministic pose at progress 0..1. */
export function foldNetAtProgress(net: FoldNet, progress: number): FoldNetPose {
  const normalized = clamp(progress);
  const vertices = new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
  const faces = new Map(net.faces.map((face) => [face.id, face]));
  const childrenByParent = new Map<string, FoldNetCrease[]>();
  net.creases.forEach((crease) => {
    const list = childrenByParent.get(crease.parentFaceId) ?? [];
    list.push(crease);
    childrenByParent.set(crease.parentFaceId, list);
  });
  childrenByParent.forEach((list) => list.sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id)));
  const transforms = new Map<string, MutableTransform>();
  const visit = (faceId: string, transform: MutableTransform) => {
    if (transforms.has(faceId)) return;
    transforms.set(faceId, transform);
    (childrenByParent.get(faceId) ?? []).forEach((crease) => {
      const childTransform = transformForChild(transform, crease, vertices, creaseAngle(net, crease, normalized));
      visit(crease.childFaceId, childTransform);
    });
  };
  if (faces.has(net.rootFaceId)) visit(net.rootFaceId, identityTransform());
  const detachedFaceIds = net.faces.filter((face) => !transforms.has(face.id)).map((face) => face.id);
  // Keep detached faces visible in the flat position, but report them so the
  // scene can warn instead of silently presenting a broken package.
  detachedFaceIds.forEach((faceId) => transforms.set(faceId, identityTransform()));
  const posedFaces: FoldFacePose[] = net.faces.map((face) => {
    const transform = transforms.get(face.id) ?? identityTransform();
    return {faceId: face.id, transform: transformSnapshot(transform), vertices: face.vertexIds.map((vertexId) => {
      const source = vertices.get(vertexId);
      return source ? worldPointForVertex(transform, source) : vector(Number.NaN, Number.NaN, Number.NaN);
    })};
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
  net.creases.forEach((crease) => {
    const parentFrom = posedVertex(crease.parentFaceId, crease.fromVertexId);
    const childFrom = posedVertex(crease.childFaceId, crease.fromVertexId);
    const parentTo = posedVertex(crease.parentFaceId, crease.toVertexId);
    const childTo = posedVertex(crease.childFaceId, crease.toVertexId);
    if (parentFrom && childFrom) maxHingeGapMm = Math.max(maxHingeGapMm, distance(parentFrom, childFrom));
    if (parentTo && childTo) maxHingeGapMm = Math.max(maxHingeGapMm, distance(parentTo, childTo));
  });
  let maxEdgeStretchMm = 0;
  let nonFiniteValues = false;
  net.faces.forEach((face) => {
    const pose = posedByFace.get(face.id);
    if (!pose) return;
    face.vertexIds.forEach((vertexId, index) => {
      const nextVertexId = face.vertexIds[(index + 1) % face.vertexIds.length];
      const source = vertices.get(vertexId);
      const nextSource = vertices.get(nextVertexId);
      const posed = pose.vertices[index];
      const nextPosed = pose.vertices[(index + 1) % pose.vertices.length];
      if (!source || !nextSource || !posed || !nextPosed) return;
      maxEdgeStretchMm = Math.max(maxEdgeStretchMm, Math.abs(distance(vector(source.xMm, source.yMm), vector(nextSource.xMm, nextSource.yMm)) - distance(posed, nextPosed)));
      nonFiniteValues = nonFiniteValues || ![posed.xMm, posed.yMm, posed.zMm].every(Number.isFinite);
    });
  });
  return {progress: normalized, faces: posedFaces, diagnostics: {connected: detachedFaceIds.length === 0, detachedFaceIds, maxHingeGapMm, maxEdgeStretchMm, nonFiniteValues}};
}

/** Compare two poses without depending on object identity or a renderer. */
export function foldNetPoseDelta(first: FoldNetPose, second: FoldNetPose) {
  const byFace = new Map(second.faces.map((face) => [face.faceId, face]));
  return first.faces.reduce((maxDelta, face) => {
    const other = byFace.get(face.faceId);
    if (!other || other.vertices.length !== face.vertices.length) return Number.POSITIVE_INFINITY;
    return Math.max(maxDelta, ...face.vertices.map((vertex, index) => comparePoseVertex(vertex, other.vertices[index])));
  }, 0);
}
