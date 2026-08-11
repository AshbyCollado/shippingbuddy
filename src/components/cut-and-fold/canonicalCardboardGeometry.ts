import * as THREE from "three";
import {
  triangulateFoldNet,
  validateFoldNet,
  type FoldNet,
  type FoldNetCut,
  type FoldNetTriangulation,
  type FoldNetVertex,
} from "@/domain/foldnet";

const EPSILON_MM = 0.000001;
const CORE_COLOR = 0.55;

export interface CanonicalCardboardGeometryOptions {
  readonly thicknessMm: number;
  readonly flutePitchMm: number;
}

export type CanonicalCardboardGeometryErrorCode =
  | "INVALID_OPTIONS"
  | "INVALID_FOLD_NET"
  | "TRIANGULATION_FAILED"
  | "MISSING_FACE"
  | "MISSING_SCRAP"
  | "MISSING_CUT"
  | "INVALID_POLYGON";

export class CanonicalCardboardGeometryError extends Error {
  readonly code: CanonicalCardboardGeometryErrorCode;

  constructor(code: CanonicalCardboardGeometryErrorCode, message: string) {
    super(message);
    this.name = "CanonicalCardboardGeometryError";
    this.code = code;
  }
}

export interface CanonicalCardboardGeometryHandle {
  readonly geometry: THREE.BufferGeometry;
  readonly release: () => void;
}

type Point2 = {readonly xMm: number; readonly yMm: number};
type CacheEntry = {geometry: THREE.BufferGeometry; references: number};
type GeometryKind = "FACE" | "SCRAP";
type BoundaryPortion = {
  cutId: string;
  edgeIndex: number;
  from: Point2;
  to: Point2;
  phaseStartMm: number;
};

type GeometryBuilder = {
  positions: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
  linerIndexCount: number;
  coreCellCount: number;
};

const geometryCache = new Map<string, CacheEntry>();

function fail(code: CanonicalCardboardGeometryErrorCode, message: string): never {
  throw new CanonicalCardboardGeometryError(code, message);
}

function validatedOptions(options: CanonicalCardboardGeometryOptions) {
  if (
    !options ||
    !Number.isFinite(options.thicknessMm) ||
    options.thicknessMm <= 0 ||
    !Number.isFinite(options.flutePitchMm) ||
    options.flutePitchMm <= 0
  )
    fail(
      "INVALID_OPTIONS",
      "Canonical cardboard thicknessMm and flutePitchMm must be finite positive numbers.",
    );
  return options;
}

function assertCanonicalNet(net: FoldNet): FoldNetTriangulation {
  try {
    const validation = validateFoldNet(net);
    if (!validation.valid)
      fail(
        "INVALID_FOLD_NET",
        `Canonical cardboard requires a valid FoldNet [${validation.diagnosticCodes.join(",")}].`,
      );
    const triangulation = triangulateFoldNet(net);
    if (triangulation.diagnostics.errors.length)
      fail(
        "TRIANGULATION_FAILED",
        `Canonical FoldNet triangulation failed [${triangulation.diagnostics.codes.join(",")}].`,
      );
    return triangulation;
  } catch (error) {
    if (error instanceof CanonicalCardboardGeometryError) throw error;
    fail("INVALID_FOLD_NET", "Canonical cardboard could not validate the supplied FoldNet.");
  }
}

function vertexMap(net: FoldNet) {
  return new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
}

function cross2(first: Point2, second: Point2, third: Point2) {
  return (
    (second.xMm - first.xMm) * (third.yMm - first.yMm) -
    (second.yMm - first.yMm) * (third.xMm - first.xMm)
  );
}

function pointOnSegment(point: Point2, from: Point2, to: Point2) {
  const length = Math.hypot(to.xMm - from.xMm, to.yMm - from.yMm);
  return (
    Math.abs(cross2(from, to, point)) <= EPSILON_MM * Math.max(1, length) &&
    point.xMm >= Math.min(from.xMm, to.xMm) - EPSILON_MM &&
    point.xMm <= Math.max(from.xMm, to.xMm) + EPSILON_MM &&
    point.yMm >= Math.min(from.yMm, to.yMm) - EPSILON_MM &&
    point.yMm <= Math.max(from.yMm, to.yMm) + EPSILON_MM
  );
}

function pointStrictlyInsidePolygon(point: Point2, polygon: readonly Point2[]) {
  if (polygon.some((from, index) => pointOnSegment(point, from, polygon[(index + 1) % polygon.length])))
    return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crosses = currentPoint.yMm > point.yMm !== previousPoint.yMm > point.yMm;
    if (
      crosses &&
      point.xMm <
        ((previousPoint.xMm - currentPoint.xMm) *
          (point.yMm - currentPoint.yMm)) /
          (previousPoint.yMm - currentPoint.yMm) +
          currentPoint.xMm
    )
      inside = !inside;
  }
  return inside;
}

function positiveCollinearOverlap(
  boundaryFrom: Point2,
  boundaryTo: Point2,
  segmentFrom: Point2,
  segmentTo: Point2,
) {
  const dx = boundaryTo.xMm - boundaryFrom.xMm;
  const dy = boundaryTo.yMm - boundaryFrom.yMm;
  const lengthMm = Math.hypot(dx, dy);
  if (
    lengthMm <= EPSILON_MM ||
    Math.abs(cross2(boundaryFrom, boundaryTo, segmentFrom)) >
      EPSILON_MM * Math.max(1, lengthMm) ||
    Math.abs(cross2(boundaryFrom, boundaryTo, segmentTo)) >
      EPSILON_MM * Math.max(1, lengthMm)
  )
    return undefined;
  const denominator = dx * dx + dy * dy;
  const project = (point: Point2) =>
    ((point.xMm - boundaryFrom.xMm) * dx +
      (point.yMm - boundaryFrom.yMm) * dy) /
    denominator;
  const start = Math.max(0, Math.min(project(segmentFrom), project(segmentTo)));
  const end = Math.min(1, Math.max(project(segmentFrom), project(segmentTo)));
  if ((end - start) * lengthMm <= EPSILON_MM) return undefined;
  return {
    from: {xMm: boundaryFrom.xMm + dx * start, yMm: boundaryFrom.yMm + dy * start},
    to: {xMm: boundaryFrom.xMm + dx * end, yMm: boundaryFrom.yMm + dy * end},
    phaseStartMm: start * lengthMm,
  };
}

function polygonArea(points: readonly Point2[]) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.xMm * next.yMm - next.xMm * point.yMm;
  }, 0) / 2;
}

function cutPoints(cut: FoldNetCut, vertices: ReadonlyMap<string, FoldNetVertex>) {
  const from = vertices.get(cut.fromVertexId);
  const to = vertices.get(cut.toVertexId);
  if (!from || !to)
    fail("INVALID_FOLD_NET", `Canonical cut ${cut.id} references a missing vertex.`);
  return {from, to};
}

function boundaryPortions(
  polygon: readonly Point2[],
  cuts: readonly FoldNetCut[],
  vertices: ReadonlyMap<string, FoldNetVertex>,
): BoundaryPortion[] {
  const portions: BoundaryPortion[] = [];
  cuts.forEach((cut) => {
    const segment = cutPoints(cut, vertices);
    polygon.forEach((from, edgeIndex) => {
      const to = polygon[(edgeIndex + 1) % polygon.length];
      const overlap = positiveCollinearOverlap(from, to, segment.from, segment.to);
      if (overlap)
        portions.push({cutId: cut.id, edgeIndex, ...overlap});
    });
  });
  return portions;
}

function internalResolveCutFaceIds(
  net: FoldNet,
  cut: FoldNetCut,
  vertices: ReadonlyMap<string, FoldNetVertex>,
) {
  const segment = cutPoints(cut, vertices);
  const midpoint = {
    xMm: (segment.from.xMm + segment.to.xMm) / 2,
    yMm: (segment.from.yMm + segment.to.yMm) / 2,
  };
  return net.faces.flatMap((face) => {
    const polygon = face.vertexIds.map((id) => vertices.get(id)!);
    const overlapsBoundary = polygon.some((from, index) =>
      Boolean(
        positiveCollinearOverlap(
          from,
          polygon[(index + 1) % polygon.length],
          segment.from,
          segment.to,
        ),
      ),
    );
    // Shared cut endpoints often touch adjacent face boundaries. Interior
    // ownership follows the cut's strict midpoint so those contacts do not
    // leak ownership into faces the cut never traverses.
    const ownsInterior = pointStrictlyInsidePolygon(midpoint, polygon);
    return overlapsBoundary || ownsInterior ? [face.id] : [];
  });
}

/** Return cut ownership in the FoldNet's canonical face order. */
export function resolveCutFaceIds(net: FoldNet, cutId: string): readonly string[] {
  assertCanonicalNet(net);
  const cut = net.cuts.find((candidate) => candidate.id === cutId);
  if (!cut) fail("MISSING_CUT", `Canonical cut was not found: ${cutId}`);
  return Object.freeze(internalResolveCutFaceIds(net, cut, vertexMap(net)));
}

function createBuilder(): GeometryBuilder {
  return {positions: [], uvs: [], colors: [], indices: [], linerIndexCount: 0, coreCellCount: 0};
}

function addVertex(
  builder: GeometryBuilder,
  pointValue: Point2,
  zMm: number,
  uv: readonly [number, number],
  color: number,
) {
  const index = builder.positions.length / 3;
  builder.positions.push(pointValue.xMm, pointValue.yMm, zMm);
  builder.uvs.push(uv[0], uv[1]);
  builder.colors.push(color, color, color);
  return index;
}

function addLinerTriangle(
  builder: GeometryBuilder,
  triangle: readonly [Point2, Point2, Point2],
  thicknessMm: number,
  flutePitchMm: number,
) {
  const ccw = cross2(triangle[0], triangle[1], triangle[2]) > 0;
  const ordered = ccw
    ? triangle
    : ([triangle[0], triangle[2], triangle[1]] as const);
  const uv = (pointValue: Point2): readonly [number, number] =>
    [pointValue.xMm / flutePitchMm, pointValue.yMm / flutePitchMm];
  const top = ordered.map((pointValue) =>
    addVertex(builder, pointValue, thicknessMm / 2, uv(pointValue), 1),
  );
  const bottom = ordered.map((pointValue) =>
    addVertex(builder, pointValue, -thicknessMm / 2, uv(pointValue), 1),
  );
  builder.indices.push(top[0], top[1], top[2]);
  builder.indices.push(bottom[0], bottom[2], bottom[1]);
  builder.linerIndexCount += 6;
}

function addCutCells(
  builder: GeometryBuilder,
  portion: BoundaryPortion,
  polygonIsCcw: boolean,
  thicknessMm: number,
  flutePitchMm: number,
) {
  const dx = portion.to.xMm - portion.from.xMm;
  const dy = portion.to.yMm - portion.from.yMm;
  const lengthMm = Math.hypot(dx, dy);
  if (lengthMm <= EPSILON_MM) return;
  const sampleStepMm = flutePitchMm / 4;
  const segmentCount = Math.max(1, Math.ceil(lengthMm / sampleStepMm));
  const profile = (distanceMm: number) =>
    0.5 * thicknessMm * Math.sin((2 * Math.PI * distanceMm) / flutePitchMm);
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const local0 = (segment / segmentCount) * lengthMm;
    const local1 = ((segment + 1) / segmentCount) * lengthMm;
    const ratio0 = local0 / lengthMm;
    const ratio1 = local1 / lengthMm;
    const first = {
      xMm: portion.from.xMm + dx * ratio0,
      yMm: portion.from.yMm + dy * ratio0,
    };
    const second = {
      xMm: portion.from.xMm + dx * ratio1,
      yMm: portion.from.yMm + dy * ratio1,
    };
    const phase0 = portion.phaseStartMm + local0;
    const phase1 = portion.phaseStartMm + local1;
    const core0 = profile(phase0);
    const core1 = profile(phase1);
    const upper = profile((phase0 + phase1) / 2) >= 0;
    const z0: readonly [number, number] = upper
      ? [core0, thicknessMm / 2]
      : [-thicknessMm / 2, core0];
    const z1: readonly [number, number] = upper
      ? [core1, thicknessMm / 2]
      : [-thicknessMm / 2, core1];
    const base = builder.positions.length / 3;
    addVertex(builder, first, z0[0], [phase0 / flutePitchMm, 0], CORE_COLOR);
    addVertex(builder, first, z0[1], [phase0 / flutePitchMm, 1], CORE_COLOR);
    addVertex(builder, second, z1[0], [phase1 / flutePitchMm, 0], CORE_COLOR);
    addVertex(builder, second, z1[1], [phase1 / flutePitchMm, 1], CORE_COLOR);
    if (polygonIsCcw)
      builder.indices.push(base, base + 2, base + 3, base, base + 3, base + 1);
    else
      builder.indices.push(base, base + 3, base + 2, base, base + 1, base + 3);
    builder.coreCellCount += 1;
  }
}

function finishGeometry(
  builder: GeometryBuilder,
  userData: Record<string, unknown>,
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(builder.positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(builder.uvs, 2));
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(builder.colors, 3),
  );
  geometry.setIndex(builder.indices);
  geometry.clearGroups();
  geometry.addGroup(0, builder.linerIndexCount, 0);
  geometry.addGroup(
    builder.linerIndexCount,
    builder.indices.length - builder.linerIndexCount,
    1,
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    ...userData,
    linerIndexCount: builder.linerIndexCount,
    exposedCoreCellCount: builder.coreCellCount,
    vertexCount: builder.positions.length / 3,
    indexCount: builder.indices.length,
  };
  return geometry;
}

function createFaceGeometryInternal(
  net: FoldNet,
  faceId: string,
  options: CanonicalCardboardGeometryOptions,
  triangulation: FoldNetTriangulation,
) {
  const face = net.faces.find((candidate) => candidate.id === faceId);
  if (!face) fail("MISSING_FACE", `Canonical face was not found: ${faceId}`);
  const vertices = vertexMap(net);
  const polygon = face.vertexIds.map((id) => vertices.get(id)!);
  const triangles = triangulation.triangles.filter(
    (triangle) => triangle.faceId === faceId,
  );
  if (!triangles.length || polygon.length < 3)
    fail("INVALID_POLYGON", `Canonical face cannot form filled geometry: ${faceId}`);
  const builder = createBuilder();
  triangles.forEach((triangle) =>
    addLinerTriangle(
      builder,
      triangle.vertexIds.map((id) => vertices.get(id)!) as unknown as readonly [Point2, Point2, Point2],
      options.thicknessMm,
      options.flutePitchMm,
    ),
  );
  const portions = boundaryPortions(polygon, net.cuts, vertices);
  const isCcw = polygonArea(polygon) > 0;
  portions.forEach((portion) =>
    addCutCells(
      builder,
      portion,
      isCcw,
      options.thicknessMm,
      options.flutePitchMm,
    ),
  );
  const ownedCutIds = net.cuts.flatMap((cut) =>
    internalResolveCutFaceIds(net, cut, vertices).includes(faceId) ? [cut.id] : [],
  );
  return finishGeometry(builder, {
    canonicalCardboardKind: "FACE",
    canonicalId: faceId,
    faceId,
    ownedCutIds,
    cutEdgeIds: [...new Set(portions.map((portion) => portion.cutId))],
    sourceVertexIds: [...face.vertexIds],
    linerTriangleCount: triangles.length * 2,
    thicknessMm: options.thicknessMm,
    flutePitchMm: options.flutePitchMm,
  });
}

function triangulateScrap(points: readonly Point2[]) {
  const vectors = points.map((pointValue) =>
    new THREE.Vector2(pointValue.xMm, pointValue.yMm),
  );
  return THREE.ShapeUtils.triangulateShape(vectors, []);
}

function createScrapGeometryInternal(
  net: FoldNet,
  scrapId: string,
  options: CanonicalCardboardGeometryOptions,
) {
  const scrap = net.scraps.find((candidate) => candidate.id === scrapId);
  if (!scrap) fail("MISSING_SCRAP", `Canonical scrap was not found: ${scrapId}`);
  const vertices = vertexMap(net);
  const polygon = scrap.vertexIds.map((id) => vertices.get(id)!);
  const triangleIndices = triangulateScrap(polygon);
  if (!triangleIndices.length || polygon.length < 3)
    fail("INVALID_POLYGON", `Canonical scrap cannot form filled geometry: ${scrapId}`);
  const builder = createBuilder();
  triangleIndices.forEach((triangle) =>
    addLinerTriangle(
      builder,
      triangle.map((index) => polygon[index]) as unknown as readonly [Point2, Point2, Point2],
      options.thicknessMm,
      options.flutePitchMm,
    ),
  );
  const ownedCuts = scrap.cutIds.map((id) => net.cuts.find((cut) => cut.id === id)!);
  const portions = boundaryPortions(polygon, ownedCuts, vertices);
  const isCcw = polygonArea(polygon) > 0;
  portions.forEach((portion) =>
    addCutCells(
      builder,
      portion,
      isCcw,
      options.thicknessMm,
      options.flutePitchMm,
    ),
  );
  return finishGeometry(builder, {
    canonicalCardboardKind: "SCRAP",
    canonicalId: scrapId,
    scrapId,
    ownedCutIds: [...scrap.cutIds],
    cutEdgeIds: [...new Set(portions.map((portion) => portion.cutId))],
    sourceVertexIds: [...scrap.vertexIds],
    linerTriangleCount: triangleIndices.length * 2,
    thicknessMm: options.thicknessMm,
    flutePitchMm: options.flutePitchMm,
  });
}

export function createCanonicalFaceGeometry(
  net: FoldNet,
  faceId: string,
  options: CanonicalCardboardGeometryOptions,
) {
  const resolvedOptions = validatedOptions(options);
  const triangulation = assertCanonicalNet(net);
  return createFaceGeometryInternal(net, faceId, resolvedOptions, triangulation);
}

export function createCanonicalScrapGeometry(
  net: FoldNet,
  scrapId: string,
  options: CanonicalCardboardGeometryOptions,
) {
  const resolvedOptions = validatedOptions(options);
  assertCanonicalNet(net);
  return createScrapGeometryInternal(net, scrapId, resolvedOptions);
}

function netCacheIdentity(net: FoldNet) {
  const orientation = net.metadata.orientation;
  return JSON.stringify({
    version: net.metadata.version,
    orientation: {
      id: orientation.id,
      dimensions: orientation.packageDimensions,
      axes: orientation.packageAxes,
      upright: orientation.upright,
    },
    vertices: net.vertices.map(({id, xMm, yMm}) => [id, xMm, yMm]),
    faces: net.faces.map(({id, vertexIds}) => [id, ...vertexIds]),
    cuts: net.cuts.map(({id, kind, fromVertexId, toVertexId}) => [
      id,
      kind,
      fromVertexId,
      toVertexId,
    ]),
    scraps: net.scraps.map(({id, vertexIds, cutIds}) => [
      id,
      ...vertexIds,
      "cuts",
      ...cutIds,
    ]),
  });
}

function cacheKey(
  kind: GeometryKind,
  net: FoldNet,
  id: string,
  options: CanonicalCardboardGeometryOptions,
) {
  return `${kind}|${id}|${options.thicknessMm}|${options.flutePitchMm}|${netCacheIdentity(net)}`;
}

function acquireGeometry(
  kind: GeometryKind,
  net: FoldNet,
  id: string,
  options: CanonicalCardboardGeometryOptions,
): CanonicalCardboardGeometryHandle {
  const resolvedOptions = validatedOptions(options);
  const triangulation = assertCanonicalNet(net);
  const key = cacheKey(kind, net, id, resolvedOptions);
  let entry = geometryCache.get(key);
  if (!entry) {
    const geometry = kind === "FACE"
      ? createFaceGeometryInternal(net, id, resolvedOptions, triangulation)
      : createScrapGeometryInternal(net, id, resolvedOptions);
    entry = {geometry, references: 0};
    geometryCache.set(key, entry);
  }
  entry.references += 1;
  let released = false;
  return {
    geometry: entry.geometry,
    release: () => {
      if (released) return;
      released = true;
      const current = geometryCache.get(key);
      if (!current) return;
      current.references -= 1;
      if (current.references <= 0) {
        current.geometry.dispose();
        geometryCache.delete(key);
      }
    },
  };
}

export function acquireCanonicalFaceGeometry(
  net: FoldNet,
  faceId: string,
  options: CanonicalCardboardGeometryOptions,
) {
  return acquireGeometry("FACE", net, faceId, options);
}

export function acquireCanonicalScrapGeometry(
  net: FoldNet,
  scrapId: string,
  options: CanonicalCardboardGeometryOptions,
) {
  return acquireGeometry("SCRAP", net, scrapId, options);
}

export function canonicalCardboardGeometryCacheSize() {
  return geometryCache.size;
}

export function canonicalCardboardGeometryLiveReferenceCount() {
  return [...geometryCache.values()].reduce(
    (sum, entry) => sum + entry.references,
    0,
  );
}

export function disposeCanonicalCardboardGeometryCache() {
  geometryCache.forEach(({geometry}) => geometry.dispose());
  geometryCache.clear();
}
