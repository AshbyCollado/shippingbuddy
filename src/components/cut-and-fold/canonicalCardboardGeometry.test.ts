import * as THREE from "three";
import {afterEach, describe, expect, it, vi} from "vitest";
import {
  acquireCanonicalFaceGeometry,
  acquireCanonicalScrapGeometry,
  canonicalCardboardGeometryCacheSize,
  canonicalCardboardGeometryLiveReferenceCount,
  createCanonicalFaceGeometry,
  createCanonicalScrapGeometry,
  disposeCanonicalCardboardGeometryCache,
  resolveCutFaceIds,
  type CanonicalCardboardGeometryErrorCode,
  type CanonicalCardboardGeometryOptions,
} from "./canonicalCardboardGeometry";
import {
  enumerateOrientations,
  generateWrapPlan,
  packedEnvelope,
  PROTOTYPE_PROFILE,
  type ItemInput,
  type WrapPatternId,
} from "@/domain/geometry";
import {foldNetFromRectangles, type FoldNet} from "@/domain/foldnet";

const item: ItemInput = {
  dimensions: {lengthMm: 356, widthMm: 330, heightMm: 305},
  weightKg: 3.2,
  fragility: "MODERATE",
  cushioning: {leftMm: 0, rightMm: 0, frontMm: 0, backMm: 0, bottomMm: 0, topMm: 0},
  tolerance: {lengthTotalMm: 0, widthTotalMm: 0, heightTotalMm: 0},
  allowRotation: true,
  keepUpright: false,
};
const options: CanonicalCardboardGeometryOptions = {thicknessMm: 4, flutePitchMm: 12};

afterEach(() => disposeCanonicalCardboardGeometryCache());

function netFor(pattern: WrapPatternId = "WRAP_BOX_V1") {
  const envelope = packedEnvelope(item, enumerateOrientations(item)[0]);
  const result = generateWrapPlan(envelope, PROTOTYPE_PROFILE, pattern);
  if ("error" in result) throw new Error(result.error);
  return result.foldNet;
}

function errorCode(action: () => unknown) {
  try {
    action();
  } catch (error) {
    return (error as {code?: CanonicalCardboardGeometryErrorCode}).code;
  }
  return undefined;
}

function expectFiniteGeometry(geometry: THREE.BufferGeometry) {
  for (const name of ["position", "normal", "uv", "color"] as const) {
    const attribute = geometry.getAttribute(name);
    expect(attribute).toBeDefined();
    for (let index = 0; index < attribute.count; index += 1)
      expect(Array.from({length: attribute.itemSize}, (_, component) => attribute.getComponent(index, component)).every(Number.isFinite)).toBe(true);
  }
  expect(geometry.boundingBox).not.toBeNull();
  expect(geometry.boundingSphere).not.toBeNull();
  expect(geometry.groups.map(({materialIndex}) => materialIndex)).toEqual([0, 1]);
}

function polygonArea(points: readonly {xMm: number; yMm: number}[]) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.xMm * next.yMm - next.xMm * point.yMm;
  }, 0) / 2);
}

function concaveNet(): FoldNet {
  const orientation = {
    id: "test-orientation",
    packageDimensions: {lengthMm: 4, widthMm: 4, heightMm: 1},
    packageAxes: ["+L", "+W", "+H"] as const,
    upright: true,
  };
  const vertices = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]].map(([xMm, yMm], index) => ({id: `p${index}`, xMm, yMm}));
  return {
    metadata: {version: 1, coordinateSystem: "flat-sheet-mm", units: "mm", orientation},
    rootFaceId: "concave",
    vertices,
    faces: [{id: "concave", role: "PANEL", vertexIds: vertices.map(({id}) => id)}],
    scores: [], cuts: [], scraps: [], seams: [], creases: [], steps: [],
    playbook: [
      {code: "VERIFY", sequence: 0, label: "Verify", faceIds: ["concave"]},
      {code: "SCORE", sequence: 1, label: "Score", scoreIds: []},
      {code: "CUT", sequence: 2, label: "Cut", cutIds: []},
      {code: "SCRAP", sequence: 3, label: "Scrap", scrapIds: []},
      {code: "FOLD", sequence: 4, label: "Fold", creaseIds: []},
      {code: "SEAL", sequence: 5, label: "Seal", seamIds: []},
      {code: "REMEASURE", sequence: 6, label: "Remeasure"},
    ],
  };
}

describe("canonical cardboard cut ownership", () => {
  it("resolves every generated WRAP, MAILER, and TAB cut in canonical face order", () => {
    for (const pattern of ["WRAP_BOX_V1", "MAILER_BOX_V1", "TAB_INSERT_V1"] as const) {
      const net = netFor(pattern);
      net.cuts.forEach((cut) => {
        const ids = resolveCutFaceIds(net, cut.id);
        expect(ids.length).toBeGreaterThan(0);
        expect(ids).toEqual(net.faces.filter((face) => ids.includes(face.id)).map(({id}) => id));
      });
    }
    expect(resolveCutFaceIds(netFor("MAILER_BOX_V1"), "mailer-lock-cut")).toEqual(["back-wall"]);
    expect(resolveCutFaceIds(netFor("TAB_INSERT_V1"), "partition-relief-cut")).toEqual(["bottom"]);
  });
});

describe("canonical cardboard face and scrap geometry", () => {
  it("uses global canonical front-flap coordinates with two liners, finite attributes, and exact groups", () => {
    const net = netFor();
    const face = net.faces.find(({id}) => id === "front-flap")!;
    const geometry = createCanonicalFaceGeometry(net, face.id, options);
    const positions = geometry.getAttribute("position");
    const vertices = new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
    const polygon = face.vertexIds.map((id) => vertices.get(id)!);
    const linerVertexCount = geometry.userData.linerIndexCount as number;

    expect(geometry.type).toBe("BufferGeometry");
    expect(geometry).not.toBeInstanceOf(THREE.ShapeGeometry);
    expect(geometry.boundingBox).toMatchObject({min: {x: Math.min(...polygon.map(({xMm}) => xMm)), y: Math.min(...polygon.map(({yMm}) => yMm)), z: -2}, max: {x: Math.max(...polygon.map(({xMm}) => xMm)), y: Math.max(...polygon.map(({yMm}) => yMm)), z: 2}});
    expect(Array.from({length: linerVertexCount}, (_, index) => positions.getZ(index))).toEqual(expect.arrayContaining([2, -2]));
    expect(geometry.groups).toEqual([
      {start: 0, count: linerVertexCount, materialIndex: 0},
      {start: linerVertexCount, count: geometry.index!.count - linerVertexCount, materialIndex: 1},
    ]);
    expect(geometry.userData).toMatchObject({canonicalCardboardKind: "FACE", canonicalId: face.id, faceId: face.id, sourceVertexIds: face.vertexIds, thicknessMm: 4, flutePitchMm: 12});
    expect(geometry.userData.ownedCutIds).toEqual(net.cuts.filter((cut) => resolveCutFaceIds(net, cut.id).includes(face.id)).map(({id}) => id));
    expectFiniteGeometry(geometry);
    geometry.dispose();
  });

  it("adds core cells only on positive canonical-cut overlaps and none to a hinge-only shared edge", () => {
    const net = netFor();
    const face = net.faces.find(({id}) => id === "front-flap")!;
    const geometry = createCanonicalFaceGeometry(net, face.id, options);
    expect(geometry.userData.exposedCoreCellCount).toBeGreaterThan(0);
    expect((geometry.userData.cutEdgeIds as string[]).every((id) => net.cuts.some((cut) => cut.id === id))).toBe(true);
    geometry.dispose();

    const hingeNet = foldNetFromRectangles({
      rectangles: [
        {id: "root", xMm: 0, yMm: 0, widthMm: 10, heightMm: 10, role: "PANEL"},
        {id: "shared", xMm: 10, yMm: 0, widthMm: 10, heightMm: 10, role: "FLAP"},
      ],
      scores: [{id: "hinge", from: {xMm: 10, yMm: 0}, to: {xMm: 10, yMm: 10}}],
      cuts: [], scrapRegions: [], seams: [],
      orientation: {id: "hinge", packageDimensions: {lengthMm: 20, widthMm: 10, heightMm: 10}, packageAxes: ["+L", "+W", "+H"], upright: true},
    });
    const hingeGeometry = createCanonicalFaceGeometry(hingeNet, "shared", options);
    expect(hingeGeometry.userData).toMatchObject({exposedCoreCellCount: 0, cutEdgeIds: []});
    expect(hingeGeometry.groups[1].count).toBe(0);
    hingeGeometry.dispose();
  });

  it("fills split-edge and concave canonical polygons without ShapeGeometry authority", () => {
    const splitNet = netFor();
    const splitFace = splitNet.faces.find((face) => face.vertexIds.length > 4)!;
    const split = createCanonicalFaceGeometry(splitNet, splitFace.id, options);
    expect(split.userData.linerTriangleCount).toBeGreaterThan(0);
    const splitPositions = split.getAttribute("position");
    const splitIndex = split.index!;
    const splitTopArea = Array.from({length: split.userData.linerTriangleCount as number / 2}, (_, triangle) => {
      const ids = [splitIndex.getX(triangle * 3), splitIndex.getX(triangle * 3 + 1), splitIndex.getX(triangle * 3 + 2)];
      return Math.abs((splitPositions.getX(ids[1]) - splitPositions.getX(ids[0])) * (splitPositions.getY(ids[2]) - splitPositions.getY(ids[0])) - (splitPositions.getY(ids[1]) - splitPositions.getY(ids[0])) * (splitPositions.getX(ids[2]) - splitPositions.getX(ids[0]))) / 2;
    }).reduce((sum, area) => sum + area, 0);
    const splitVertices = new Map(splitNet.vertices.map((vertex) => [vertex.id, vertex]));
    expect(splitTopArea).toBeCloseTo(polygonArea(splitFace.vertexIds.map((id) => splitVertices.get(id)!)), 10);
    expect(split).not.toBeInstanceOf(THREE.ShapeGeometry);
    split.dispose();

    const net = concaveNet();
    const geometry = createCanonicalFaceGeometry(net, "concave", options);
    const index = geometry.index!;
    const position = geometry.getAttribute("position");
    const topArea = Array.from({length: index.count / 6}, (_, triangle) => {
      const ids = [index.getX(triangle * 3), index.getX(triangle * 3 + 1), index.getX(triangle * 3 + 2)];
      return Math.abs((position.getX(ids[1]) - position.getX(ids[0])) * (position.getY(ids[2]) - position.getY(ids[0])) - (position.getY(ids[1]) - position.getY(ids[0])) * (position.getX(ids[2]) - position.getX(ids[0]))) / 2;
    }).reduce((sum, area) => sum + area, 0);
    expect(topArea).toBeCloseTo(polygonArea(net.vertices), 10);
    expect(geometry.getAttribute("normal").getZ(0)).toBeGreaterThan(0);
    expect(geometry.userData).toMatchObject({linerTriangleCount: 8, exposedCoreCellCount: 0});
    geometry.dispose();
  });

  it("fills global scrap skins and exposes only its owned cut-edge core", () => {
    const net = netFor();
    const scrap = net.scraps.find(({id}) => id === "scrap-left")!;
    const geometry = createCanonicalScrapGeometry(net, scrap.id, options);
    const vertices = new Map(net.vertices.map((vertex) => [vertex.id, vertex]));
    const polygon = scrap.vertexIds.map((id) => vertices.get(id)!);

    expect(geometry.boundingBox).toMatchObject({min: {x: Math.min(...polygon.map(({xMm}) => xMm)), y: Math.min(...polygon.map(({yMm}) => yMm)), z: -2}, max: {x: Math.max(...polygon.map(({xMm}) => xMm)), y: Math.max(...polygon.map(({yMm}) => yMm)), z: 2}});
    expect(geometry.userData).toMatchObject({canonicalCardboardKind: "SCRAP", canonicalId: scrap.id, scrapId: scrap.id, ownedCutIds: scrap.cutIds, cutEdgeIds: scrap.cutIds});
    expect(geometry.userData.exposedCoreCellCount).toBeGreaterThan(0);
    expectFiniteGeometry(geometry);
    geometry.dispose();
  });
});

describe("canonical cardboard failures and cache", () => {
  it("returns stable failures for invalid inputs and missing canonical references without cache leaks", () => {
    const net = netFor();
    expect(errorCode(() => createCanonicalFaceGeometry(net, "front-flap", {...options, thicknessMm: 0}))).toBe("INVALID_OPTIONS");
    expect(errorCode(() => createCanonicalFaceGeometry({...net, vertices: []}, "front-flap", options))).toBe("INVALID_FOLD_NET");
    expect(errorCode(() => createCanonicalFaceGeometry(net, "missing-face", options))).toBe("MISSING_FACE");
    expect(errorCode(() => createCanonicalScrapGeometry(net, "missing-scrap", options))).toBe("MISSING_SCRAP");
    expect(errorCode(() => resolveCutFaceIds(net, "missing-cut"))).toBe("MISSING_CUT");
    expect(canonicalCardboardGeometryCacheSize()).toBe(0);
    expect(canonicalCardboardGeometryLiveReferenceCount()).toBe(0);
  });

  it("keys cache by kind, net, and options; shares and idempotently releases acquisitions", () => {
    const wrap = netFor();
    const mailer = netFor("MAILER_BOX_V1");
    const first = acquireCanonicalFaceGeometry(wrap, "front-flap", options);
    const second = acquireCanonicalFaceGeometry(wrap, "front-flap", {...options});
    const dispose = vi.spyOn(first.geometry, "dispose");
    const scrap = acquireCanonicalScrapGeometry(wrap, "scrap-left", options);
    const otherOptions = acquireCanonicalFaceGeometry(wrap, "front-flap", {...options, flutePitchMm: 10});
    const otherNet = acquireCanonicalFaceGeometry(mailer, "front-flap", options);

    expect(second.geometry).toBe(first.geometry);
    expect(canonicalCardboardGeometryCacheSize()).toBe(4);
    expect(canonicalCardboardGeometryLiveReferenceCount()).toBe(5);
    first.release();
    first.release();
    expect(canonicalCardboardGeometryLiveReferenceCount()).toBe(4);
    second.release();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(canonicalCardboardGeometryCacheSize()).toBe(3);
    scrap.release();
    otherOptions.release();
    otherNet.release();
    expect(canonicalCardboardGeometryCacheSize()).toBe(0);
    expect(canonicalCardboardGeometryLiveReferenceCount()).toBe(0);

    const live = acquireCanonicalFaceGeometry(wrap, "front-flap", options);
    disposeCanonicalCardboardGeometryCache();
    expect(canonicalCardboardGeometryCacheSize()).toBe(0);
    live.release();
    expect(canonicalCardboardGeometryLiveReferenceCount()).toBe(0);
  });
});
